/**
 * Smoke test LOCAL do pipeline de import (Fase 1). Dois modos:
 *
 *   Modo direto (padrão) — roda os adapters reais (download → VAD →
 *   transcrição → keyframe) SEM Mongo/S3/SQS, salvando o keyframe em arquivo.
 *   Valida o pipeline puro.
 *
 *   Modo persistência (--persist) — roda o fluxo REAL do worker
 *   (`processImportJob`), pulando só a fila SQS: cria um ImportJob no Mongo,
 *   processa, grava o status no banco e sobe o keyframe no S3. É o mais perto
 *   de "de verdade" antes da UI (Fase 3) e do deploy (Plano 01-06).
 *
 * Uso:
 *   npm run import:test -- "https://www.youtube.com/watch?v=..."
 *   npm run import:test -- --persist "https://www.youtube.com/watch?v=..."
 *
 * Requisitos:
 *   - yt-dlp no sistema (YOUTUBE_DL_DIR — o npm script já usa /usr/bin) + ffmpeg
 *   - .env com GROQ_API_KEY (e/ou OPENAI_API_KEY) + as vars que o env.ts exige
 *   - --persist adicionalmente precisa de: MONGODB_* acessível e S3
 *     (IMAGES_S3_BUCKET/AWS_* — real ou MinIO via `npm run s3:up`)
 */
// Ordem de import crítica (gotcha "Database not found" do mongoat): o Database
// singleton e o registro de models via @/modules/index.js vêm antes de
// qualquer uso de model — mesma disciplina de src/workers/import-worker.ts.
import { connectDatabase, disconnectDatabase } from "@/infra/database/connection.js";
import "@/modules/index.js";

import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { detectPlatform, normalizeUrl } from "@/modules/import/import.service.js";
import { createImportJob, getImportJob } from "@/modules/import/import-job.repository.js";
import { getRecipeById } from "@/modules/recipes/recipe.repository.js";
import { processImportJob } from "@/infra/video/pipeline.js";
import { downloadVideo, DownloadError } from "@/infra/video/ytdlp.downloader.js";
import { extractAudio } from "@/infra/video/ffmpeg.exec.js";
import { detectSilenceRatio, NO_SPEECH_RATIO_THRESHOLD } from "@/infra/video/vad.js";
import { transcribe, TranscriptionError } from "@/infra/video/transcription.port.js";
import { extractNormalizedKeyframe } from "@/infra/video/keyframe.js";

const LOCAL_TEST_USER = "local-test-user";

function log(step: string, detail = "") {
  console.log(`\n\x1b[36m▶ ${step}\x1b[0m ${detail}`);
}

/** Modo direto: adapters isolados, sem Mongo/S3. */
async function runDirect(rawUrl: string) {
  const platform = detectPlatform(rawUrl);
  if (!platform) {
    console.error(`\x1b[31m✗ URL não é de plataforma suportada: ${rawUrl}\x1b[0m`);
    process.exit(1);
  }
  const url = normalizeUrl(rawUrl);
  log("Plataforma detectada", `${platform}  (normalizada: ${url})`);

  const workDir = await mkdtemp(path.join(tmpdir(), "import-smoke-"));
  const outDir = path.resolve("import-test-output");
  await mkdir(outDir, { recursive: true });

  try {
    log("Baixando vídeo (yt-dlp)…");
    const videoPath = path.join(workDir, "video.mp4");
    const { meta } = await downloadVideo(url, videoPath);
    console.log(`   autor:    ${meta.authorHandle ?? "—"}  (${meta.authorUrl ?? "—"})`);
    console.log(`   duração:  ${meta.durationSec ?? "—"}s`);
    console.log(
      `   caption:  ${(meta.caption ?? "").slice(0, 140).replace(/\n/g, " ")}${
        (meta.caption ?? "").length > 140 ? "…" : ""
      }`,
    );

    log("Extraindo áudio (ffmpeg)…");
    const audioPath = path.join(workDir, "audio.mp3");
    await extractAudio(videoPath, audioPath);

    log("VAD (silencedetect)…");
    const silenceRatio = await detectSilenceRatio(audioPath, meta.durationSec ?? 60);
    const noSpeech = silenceRatio >= NO_SPEECH_RATIO_THRESHOLD;
    console.log(
      `   razão de silêncio: ${silenceRatio.toFixed(2)} (limite ${NO_SPEECH_RATIO_THRESHOLD}) → ${
        noSpeech ? "SEM FALA — pularia a transcrição" : "tem fala"
      }`,
    );

    if (!noSpeech) {
      log("Transcrevendo (Groq → OpenAI fallback)…");
      const { text, source } = await transcribe(audioPath);
      console.log(`   provider: ${source}`);
      console.log(`   transcript (${text.length} chars):`);
      console.log(`   \x1b[90m${text.slice(0, 600)}${text.length > 600 ? "…" : ""}\x1b[0m`);
    }

    log("Extraindo keyframe…");
    const keyframeBuf = await extractNormalizedKeyframe(
      videoPath,
      path.join(workDir, "keyframe-raw.jpg"),
      meta.durationSec,
    );
    const keyframeOut = path.join(outDir, "keyframe.jpg");
    await writeFile(keyframeOut, keyframeBuf);
    console.log(`   keyframe salvo: ${keyframeOut} (${keyframeBuf.length} bytes, JPEG 512²)`);

    log("\x1b[32m✓ Pipeline concluído (modo direto)\x1b[0m", `— saída em ${outDir}/`);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

/** Modo persistência: fluxo real do worker (Mongo + S3), pulando só a fila SQS. */
async function runPersist(rawUrl: string) {
  const platform = detectPlatform(rawUrl);
  if (!platform) {
    console.error(`\x1b[31m✗ URL não é de plataforma suportada: ${rawUrl}\x1b[0m`);
    process.exit(1);
  }
  const url = normalizeUrl(rawUrl);
  log("Plataforma detectada", `${platform}  (normalizada: ${url})`);

  log("Conectando ao Mongo…");
  await connectDatabase();

  try {
    log("Criando ImportJob (Mongo)…");
    const job = await createImportJob(LOCAL_TEST_USER, rawUrl, url, platform);
    console.log(`   jobId: ${job._id}  status: ${job.status}`);

    log("Rodando processImportJob (download → VAD → transcrição → keyframe → S3)…");
    await processImportJob(job);

    const final = await getImportJob(String(job._id));
    log("\x1b[32m✓ Job persistido\x1b[0m");
    if (!final) {
      console.error("   (não encontrado após processar — inesperado)");
      return;
    }
    console.log(`   status:        ${final.status}`);
    console.log(`   failureReason: ${final.failureReason ?? "—"}`);
    console.log(`   autor:         ${final.sourceMeta?.authorHandle ?? "—"}`);
    console.log(`   noSpeech:      ${final.noSpeechDetected ?? false}`);
    console.log(`   transcript:    ${final.transcriptSource ?? "—"} (${(final.transcript ?? "").length} chars)`);
    console.log(`   keyframeUrl:   ${final.keyframeUrl ?? "—"}`);
    console.log(`   recipeId:      ${final.recipeId ?? "—"}`);
    console.log(`   confidence:    ${final.confidenceScore?.toFixed(2) ?? "—"}  reviewRequired: ${final.reviewRequired ?? "—"}`);

    // Receita estruturada extraída (Fase 2) + grounding por campo
    if (final.recipeId) {
      const recipe = await getRecipeById(String(final.recipeId));
      if (recipe) {
        const g = (recipe as { grounding?: {
          titleGrounding?: string;
          quantityGrounding?: Record<string, string>;
          stepGrounding?: Record<string, string>;
          sourceDivergence?: string[];
        } }).grounding;
        log("\x1b[35m🍳 Receita estruturada extraída\x1b[0m");
        console.log(`   título:     ${recipe.title}  \x1b[90m[${g?.titleGrounding ?? "?"}]\x1b[0m`);
        console.log(`   ingredientes (${recipe.ingredients.length}):`);
        recipe.ingredients.forEach((ing, i) => {
          const qty = [ing.quantity, ing.unit].filter(Boolean).join(" ") || "—";
          const gr = g?.quantityGrounding?.[String(i)] ?? "?";
          console.log(`     • ${ing.name}: ${qty}  \x1b[90m[${gr}]\x1b[0m`);
        });
        console.log(`   passos:     ${recipe.steps.length}`);
        if (recipe.nutrition) {
          console.log(
            `   nutrição:   ${recipe.nutrition.calories}kcal · P${recipe.nutrition.protein} C${recipe.nutrition.carbs} G${recipe.nutrition.fat}  \x1b[90m[inferred]\x1b[0m`,
          );
        }
        if (g?.sourceDivergence?.length) {
          console.log(`   divergências entre fontes: ${g.sourceDivergence.join("; ")}`);
        }
      }
    }
  } finally {
    await disconnectDatabase();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const persist = args.includes("--persist");
  const rawUrl = args.find((a) => !a.startsWith("--"));
  if (!rawUrl) {
    console.error('Uso: npm run import:test -- [--persist] "<url do vídeo>"');
    process.exit(1);
  }

  try {
    if (persist) {
      await runPersist(rawUrl);
    } else {
      await runDirect(rawUrl);
    }
  } catch (err) {
    if (err instanceof DownloadError) {
      console.error(`\n\x1b[31m✗ Download falhou (${err.reason})\x1b[0m\n${err.cause}`);
    } else if (err instanceof TranscriptionError) {
      console.error(
        `\n\x1b[31m✗ Transcrição falhou (Groq e OpenAI esgotados)\x1b[0m\n  Groq:   ${String(
          err.groqError,
        )}\n  OpenAI: ${String(err.openaiError)}`,
      );
    } else {
      console.error("\n\x1b[31m✗ Erro inesperado\x1b[0m", err);
    }
    process.exitCode = 1;
  }
}

void main();
