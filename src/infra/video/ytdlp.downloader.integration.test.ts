/**
 * Teste manual-gated (integration): baixa um vídeo público real e extrai
 * metadados de verdade via yt-dlp/youtube-dl-exec. Excluído da suite rápida
 * (`npm run test`), roda só em `npm run test:all` — requer o binário yt-dlp
 * presente (ver YOUTUBE_DL_SKIP_DOWNLOAD/Dockerfile do worker, Plan 06) e
 * acesso de rede real.
 *
 * Vídeo de teste: um clipe curto e estável do YouTube (baixa probabilidade
 * de remoção/anti-bot). Trocar por um fixture próprio se este for removido.
 *
 * NOTA (Open Question 1 / RESEARCH.md): os fixtures de stderr usados no
 * classificador (ytdlp.downloader.test.ts) foram semeados a partir de
 * padrões documentados, não de saída real capturada nesta sessão — rodar
 * este teste manualmente contra os 3 domínios (YouTube/TikTok/Instagram)
 * ainda é necessário para confirmar/capturar os stderr reais antes do
 * fechamento da fase (D-08).
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { downloadVideo, fetchMetadata } from "./ytdlp.downloader.js";

const TEST_URL = "https://www.youtube.com/watch?v=jNQXAC9IVRw"; // "Me at the zoo" — primeiro vídeo do YouTube, estável há anos

describe("ytdlp.downloader (integration, real network + yt-dlp binary)", () => {
  it("fetchMetadata returns real metadata for a public YouTube video", async () => {
    const meta = await fetchMetadata(TEST_URL);

    expect(meta.sourceUrl).toContain("youtube.com");
    expect(meta.authorHandle).toBeTruthy();
    expect(typeof meta.durationSec).toBe("number");
  });

  it("downloadVideo produces a real video file with populated metadata", async () => {
    const jobDir = await mkdtemp(path.join(tmpdir(), "ytdlp-it-"));
    const outputPath = path.join(jobDir, "video.mp4");

    try {
      const result = await downloadVideo(TEST_URL, outputPath);

      expect(result.videoPath).toBe(outputPath);
      expect(result.meta.sourceUrl).toContain("youtube.com");
      expect(result.meta.caption ?? result.meta.authorHandle).toBeTruthy();
    } finally {
      await rm(jobDir, { recursive: true, force: true });
    }
  });
});
