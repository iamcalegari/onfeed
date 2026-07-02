/**
 * Smoke test LOCAL do pipeline de import (Fase 1) — SEM SQS, Mongo ou S3.
 *
 * Roda os adapters reais na mesma ordem do worker (`processImportJob`), mas
 * chamando-os diretamente e salvando o keyframe em arquivo local, para você
 * validar download → VAD → transcrição → keyframe com uma URL de verdade
 * antes do deploy na Render (Plano 01-06).
 *
 * Uso:
 *   npm run import:test -- "https://www.youtube.com/watch?v=..."
 *   npm run import:test -- "https://www.tiktok.com/@user/video/..."
 *
 * Requisitos:
 *   - yt-dlp no sistema (aponte via YOUTUBE_DL_DIR — o npm script já usa /usr/bin)
 *   - ffmpeg no PATH
 *   - .env com GROQ_API_KEY (e/ou OPENAI_API_KEY para o fallback) + as vars
 *     que o src/config/env.ts exige (MONGODB_URI etc — o mesmo .env do dev)
 *
 * NÃO persiste nada: não cria ImportJob no Mongo nem sobe o keyframe ao S3.
 */
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { detectPlatform, normalizeUrl } from "@/modules/import/import.service.js";
import { downloadVideo, DownloadError } from "@/infra/video/ytdlp.downloader.js";
import { extractAudio } from "@/infra/video/ffmpeg.exec.js";
import { detectSilenceRatio, NO_SPEECH_RATIO_THRESHOLD } from "@/infra/video/vad.js";
import { transcribe, TranscriptionError } from "@/infra/video/transcription.port.js";
import { extractNormalizedKeyframe } from "@/infra/video/keyframe.js";

function log(step: string, detail = "") {
  console.log(`\n\x1b[36m▶ ${step}\x1b[0m ${detail}`);
}

async function main() {
  const rawUrl = process.argv[2];
  if (!rawUrl) {
    console.error("Uso: npm run import:test -- \"<url do vídeo>\"");
    process.exit(1);
  }

  // Fronteira anti-SSRF (CAP-02): só IG/TikTok/YouTube passam.
  const platform = detectPlatform(rawUrl);
  if (!platform) {
    console.error(
      `\x1b[31m✗ URL não é de uma plataforma suportada (instagram/tiktok/youtube): ${rawUrl}\x1b[0m`,
    );
    process.exit(1);
  }
  const url = normalizeUrl(rawUrl);
  log("Plataforma detectada", `${platform}  (normalizada: ${url})`);

  const workDir = await mkdtemp(path.join(tmpdir(), "import-smoke-"));
  const outDir = path.resolve("import-test-output");
  await mkdir(outDir, { recursive: true });

  try {
    // 1. Download (yt-dlp) + metadados de origem
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

    // 2. Extrai áudio (ffmpeg)
    log("Extraindo áudio (ffmpeg)…");
    const audioPath = path.join(workDir, "audio.mp3");
    await extractAudio(videoPath, audioPath);

    // 3. VAD (silencedetect) — decide se vale pagar a transcrição (D-06)
    log("VAD (silencedetect)…");
    const silenceRatio = await detectSilenceRatio(audioPath, meta.durationSec ?? 60);
    const noSpeech = silenceRatio >= NO_SPEECH_RATIO_THRESHOLD;
    console.log(
      `   razão de silêncio: ${silenceRatio.toFixed(2)} (limite ${NO_SPEECH_RATIO_THRESHOLD}) → ${
        noSpeech ? "SEM FALA — pularia a transcrição" : "tem fala"
      }`,
    );

    // 4. Transcrição (Groq → OpenAI fallback), só se houver fala
    if (!noSpeech) {
      log("Transcrevendo (Groq → OpenAI fallback)…");
      const { text, source } = await transcribe(audioPath);
      console.log(`   provider: ${source}`);
      console.log(`   transcript (${text.length} chars):`);
      console.log(`   \x1b[90m${text.slice(0, 600)}${text.length > 600 ? "…" : ""}\x1b[0m`);
    }

    // 5. Keyframe representativo (ffmpeg scene-score → JPEG 512²)
    log("Extraindo keyframe…");
    const keyframeBuf = await extractNormalizedKeyframe(
      videoPath,
      path.join(workDir, "keyframe-raw.jpg"),
      meta.durationSec,
    );
    const keyframeOut = path.join(outDir, "keyframe.jpg");
    await writeFile(keyframeOut, keyframeBuf);
    console.log(`   keyframe salvo: ${keyframeOut} (${keyframeBuf.length} bytes, JPEG 512²)`);

    log("\x1b[32m✓ Pipeline concluído\x1b[0m", `— saída em ${outDir}/`);
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
  } finally {
    // Mesma garantia de limpeza do worker (PIPE-05): apaga a mídia bruta.
    await rm(workDir, { recursive: true, force: true });
  }
}

void main();
