/**
 * Orquestração por-job do pipeline de import (PIPE-01..05, PIPE-07). Compõe
 * todos os adapters das Plans 01-03 (download, VAD, transcrição, keyframe,
 * breaker) numa única sequência: download → VAD → transcrever/pular →
 * extracting (extração real + confiança + persistência, Fase 2 Plano 05) →
 * keyframe → S3 → cleanup, escrevendo o status do ImportJob em cada
 * fronteira de etapa.
 *
 * Camada 1 de limpeza garantida (PIPE-05, D-09): TODO o corpo download→
 * keyframe roda dentro de um try/finally que remove o diretório temporário
 * mkdtemp'd do job incondicionalmente — vídeo/áudio brutos NUNCA persistem
 * além do job, e NUNCA são enviados ao S3 (só o keyframe é, D-10). A camada
 * 2 (sweep no boot do worker, sobrevive a SIGKILL) vive em import-worker.ts.
 *
 * EXT-05 (Plano 05) — `ready_for_review` é o ÚNICO terminal de sucesso: não
 * existe caminho de código daqui até um status público/publicado. Qualquer
 * erro na camada de extração (zod, LLM sem parsed_output, mapping) ou na
 * persistência mapeia para `failed`/`extraction_failed`, nunca-retryable
 * (uma re-tentativa de uma falha determinística de extração falharia de
 * novo) — `persistExtractedRecipe` é atômico (insere tudo ou lança, nunca
 * meia-receita), então a falha nunca deixa um recipeId pendurado no job.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { updateImportJobStatus } from "@/modules/import/import-job.repository.js";
import type { ImportFailureReason, ImportJob } from "@/modules/import/import-job.types.js";
import { extractImportedRecipe } from "@/modules/import/import.extraction.js";
import { computeConfidence } from "@/modules/import/import.confidence.js";
import { mapExtractedToRecipe } from "@/modules/import/import.recipe-mapping.js";
import { persistExtractedRecipe } from "@/modules/recipes/recipe.ingestion.js";
import { DownloadError, downloadVideo, type DownloadFailureReason } from "./ytdlp.downloader.js";
import { extractAudio } from "./ffmpeg.exec.js";
import { detectSilenceRatio, NO_SPEECH_RATIO_THRESHOLD } from "./vad.js";
import { extractNormalizedKeyframe } from "./keyframe.js";
import { transcribe, TranscriptionError } from "./transcription.port.js";
import { isOpen, recordOutcome } from "./platform-breaker.js";
import { putImage } from "@/infra/images/s3.image-store.js";

/** Razões de download que NÃO devem disparar retry imediato via SQS — o
 * breaker (cooldown), não a redelivery por mensagem, governa a próxima
 * tentativa (RESEARCH Pattern 2/Pitfall 1, D-02). */
const NO_RETRY_DOWNLOAD_REASONS: ReadonlySet<DownloadFailureReason> = new Set([
  "anti_bot_blocked",
  "rate_limited",
]);

/** Mapeia DownloadFailureReason (ytdlp.downloader.ts) para ImportFailureReason
 * (o union persistido no ImportJob) — os dois unions divergem de propósito:
 * o primeiro é o vocabulário de classificação de erro do yt-dlp, o segundo é
 * o vocabulário de estado do job. */
function toImportFailureReason(reason: DownloadFailureReason): ImportFailureReason {
  switch (reason) {
    case "anti_bot_blocked":
      return "anti_bot_blocked";
    case "rate_limited":
      return "rate_limited";
    case "unavailable":
      return "video_unavailable";
    case "network":
      return "download_timeout";
    case "duration_exceeded":
    case "unknown":
    default:
      return "unknown_error";
  }
}

/** Mensagem segura para exibir ao usuário por failureReason — nunca stderr bruto. */
const USER_SAFE_MESSAGES: Record<ImportFailureReason, string> = {
  unsupported_platform: "Plataforma não suportada.",
  invalid_url: "URL inválida.",
  anti_bot_blocked: "A plataforma bloqueou o download no momento. Tentaremos novamente mais tarde.",
  rate_limited: "A plataforma limitou as requisições no momento. Tentaremos novamente mais tarde.",
  video_unavailable: "O vídeo não está mais disponível (removido, privado ou indisponível na região).",
  no_speech_detected: "Não detectamos fala no vídeo.",
  transcription_failed: "Não foi possível transcrever o áudio do vídeo.",
  download_timeout: "O download do vídeo expirou. Tentaremos novamente.",
  extraction_failed: "Não foi possível estruturar a receita a partir do vídeo.",
  unknown_error: "Ocorreu um erro inesperado ao processar o vídeo.",
};

function jobId(job: ImportJob): string {
  const id = job._id;
  if (!id) throw new Error("processImportJob: job._id ausente");
  return id;
}

/** Telemetria estruturada por outcome (PIPE-07) — observabilidade de taxa de sucesso por plataforma. */
function logOutcome(entry: {
  platform: string;
  outcome: "success" | "failure";
  failureReason?: ImportFailureReason;
  durationMs: number;
}): void {
  console.log("[pipeline] outcome", JSON.stringify(entry));
}

/**
 * Marca o job como failed com um failureReason classificado + mensagem
 * segura ao usuário. Não lança — quem chama decide se deve rethrow (retry
 * transiente) ou retornar (falha explícita, sem retry imediato).
 */
async function failJob(job: ImportJob, reason: ImportFailureReason, rawDetail?: string): Promise<void> {
  if (rawDetail !== undefined) {
    console.error(`[pipeline] job ${jobId(job)} failed: ${reason} — ${rawDetail}`);
  }
  await updateImportJobStatus(jobId(job), {
    status: "failed",
    failedStep: job.status,
    failureReason: reason,
    errorMessage: USER_SAFE_MESSAGES[reason],
  });
}

/**
 * Orquestra o pipeline completo de um ImportJob: download (breaker-aware) →
 * VAD → transcrever/pular → extracting (stub) → keyframe → S3 → cleanup.
 * O diretório temp do job é sempre removido no finally (PIPE-05 camada 1).
 *
 * anti_bot_blocked/rate_limited: falha o job explicitamente SEM relançar —
 * o circuit breaker (cooldown), não a redelivery SQS, governa a próxima
 * tentativa. Razões transientes (network/download_timeout/unknown) relançam
 * para que sqs-consumer deixe a mensagem para redrive.
 */
export async function processImportJob(job: ImportJob): Promise<void> {
  const id = jobId(job);
  const startedAt = Date.now();
  const jobDir = await mkdtemp(path.join(tmpdir(), `import-${id}-`));

  try {
    // 1. Circuit breaker check — falha rápido sem tentar download.
    if (isOpen(job.platform)) {
      await failJob(job, "anti_bot_blocked", "circuit breaker open");
      logOutcome({ platform: job.platform, outcome: "failure", failureReason: "anti_bot_blocked", durationMs: Date.now() - startedAt });
      return;
    }

    // 2. Download (yt-dlp) — status: downloading.
    await updateImportJobStatus(id, { status: "downloading" });
    const videoPath = path.join(jobDir, "video.mp4");
    let downloadResult: Awaited<ReturnType<typeof downloadVideo>>;
    try {
      downloadResult = await downloadVideo(job.sourceUrl, videoPath);
      recordOutcome(job.platform, true);
    } catch (err) {
      recordOutcome(job.platform, false);
      const downloadReason: DownloadFailureReason =
        err instanceof DownloadError ? err.reason : "unknown";
      const importReason = toImportFailureReason(downloadReason);
      const detail = err instanceof DownloadError ? String(err.cause) : String(err);

      logOutcome({ platform: job.platform, outcome: "failure", failureReason: importReason, durationMs: Date.now() - startedAt });

      if (NO_RETRY_DOWNLOAD_REASONS.has(downloadReason)) {
        // Falha explícita — NÃO relança, o breaker cooldown governa a
        // próxima tentativa, não a redelivery imediata da SQS.
        await failJob(job, importReason, detail);
        return;
      }
      // unavailable/duration_exceeded: falha explícita mas não circuit-breaker-relevante.
      if (downloadReason === "unavailable" || downloadReason === "duration_exceeded") {
        await failJob(job, importReason, detail);
        return;
      }
      // network / unknown: transiente — relança para SQS redrive.
      await failJob(job, importReason, detail);
      throw err;
    }

    // 3. Áudio + VAD + transcrição — status: transcribing.
    await updateImportJobStatus(id, { status: "transcribing" });
    const audioPath = path.join(jobDir, "audio.mp3");
    await extractAudio(downloadResult.videoPath, audioPath);

    const durationSec = downloadResult.meta.durationSec ?? 0;
    const silenceRatio = await detectSilenceRatio(audioPath, durationSec);

    let transcript: string | undefined;
    let transcriptSource: "groq" | "openai" | null = null;
    let noSpeechDetected = false;

    if (silenceRatio > NO_SPEECH_RATIO_THRESHOLD) {
      // D-06/PIPE-02: clipe majoritariamente silencioso/música — pula a
      // chamada paga de ASR em vez de arriscar transcrição alucinada.
      noSpeechDetected = true;
    } else {
      try {
        const result = await transcribe(audioPath);
        transcript = result.text;
        transcriptSource = result.source;
      } catch (err) {
        if (err instanceof TranscriptionError) {
          await failJob(job, "transcription_failed", String(err));
          logOutcome({ platform: job.platform, outcome: "failure", failureReason: "transcription_failed", durationMs: Date.now() - startedAt });
          return;
        }
        throw err;
      }
    }

    await updateImportJobStatus(id, {
      ...(transcript !== undefined && { transcript }),
      transcriptSource,
      noSpeechDetected,
      ...(downloadResult.meta.caption !== undefined && { caption: downloadResult.meta.caption }),
      sourceMeta: {
        ...(downloadResult.meta.authorHandle !== undefined && { authorHandle: downloadResult.meta.authorHandle }),
        ...(downloadResult.meta.authorUrl !== undefined && { authorUrl: downloadResult.meta.authorUrl }),
        ...(downloadResult.meta.durationSec !== undefined && { durationSec: downloadResult.meta.durationSec }),
      },
    });

    // 4. Extracting — extração LLM real → confiança → mapeamento → persistência
    // (Fase 2 Plano 05). Falha aqui NUNCA é retryable (determinística) e NUNCA
    // deixa um recipeId pendurado — persistExtractedRecipe é atômico.
    await updateImportJobStatus(id, { status: "extracting" });
    let recipeId: string;
    let reviewRequired: boolean;
    let confidenceScore: number;
    try {
      const extracted = await extractImportedRecipe({
        ...(transcript !== undefined && { transcript }),
        ...(downloadResult.meta.caption !== undefined && { caption: downloadResult.meta.caption }),
        noSpeechDetected,
      });
      const confidence = computeConfidence(extracted, { noSpeechDetected });
      const { input, extracted: mappedExtracted, options } = mapExtractedToRecipe(
        extracted,
        {
          ...job,
          ...(transcript !== undefined && { transcript }),
          ...(downloadResult.meta.caption !== undefined && { caption: downloadResult.meta.caption }),
          noSpeechDetected,
        },
        confidence,
      );
      const created = await persistExtractedRecipe(input, mappedExtracted, options);
      recipeId = String(created._id);
      reviewRequired = confidence.reviewRequired;
      confidenceScore = confidence.score;
    } catch (err) {
      // Nunca loga o transcript/payload do LLM completo (CONCERNS.md).
      await failJob(job, "extraction_failed", err instanceof Error ? err.message : String(err));
      logOutcome({ platform: job.platform, outcome: "failure", failureReason: "extraction_failed", durationMs: Date.now() - startedAt });
      return;
    }

    // 5. Keyframe → normalize → S3 (única coisa que sobe ao S3; mídia bruta nunca é enviada — D-09).
    const keyframeTmpPath = path.join(jobDir, "keyframe.jpg");
    const keyframeBuffer = await extractNormalizedKeyframe(
      downloadResult.videoPath,
      keyframeTmpPath,
      downloadResult.meta.durationSec,
    );
    const keyframeUrl = await putImage(`imports/${id}/keyframe.jpg`, keyframeBuffer, "image/jpeg");

    // 6. ready_for_review — o ÚNICO terminal de sucesso (EXT-05); nunca um
    // status público/publicado a partir daqui.
    await updateImportJobStatus(id, {
      status: "ready_for_review",
      keyframeUrl,
      recipeId,
      reviewRequired,
      confidenceScore,
    });

    logOutcome({ platform: job.platform, outcome: "success", durationMs: Date.now() - startedAt });
  } finally {
    // PIPE-05 camada 1: garantido mesmo em throw. Erro de limpeza é logado,
    // nunca mascara a falha real do pipeline.
    await rm(jobDir, { recursive: true, force: true }).catch((e: unknown) => {
      console.error(`[pipeline] falha ao limpar ${jobDir}`, e);
    });
  }
}
