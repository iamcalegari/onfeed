import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock do módulo youtube-dl-exec ANTES do import do adapter, para não
// depender do binário real nem de rede na suite rápida (classificador +
// mapper são lógica pura de parsing, não precisam de yt-dlp de verdade).
const youtubedlMock = vi.fn();
vi.mock("youtube-dl-exec", () => ({
  default: (...args: unknown[]) => youtubedlMock(...args),
  youtubeDl: (...args: unknown[]) => youtubedlMock(...args),
}));

// env.ts valida MONGODB_URI/etc com required() no module-load (falha rápido
// no boot da app real) — mas este é um teste de lógica pura de infra/video,
// sem Mongo. Mock do env evita arrastar essa validação para a suite rápida,
// espelhando a mesma decisão já tomada em import-job.repository.test.ts
// (mockar a dependência em vez de exigir Mongo real/env completo).
vi.mock("@/config/env.js", () => ({
  env: { import: { maxDurationSec: 600 } },
}));

const { classifyYtdlpError, fetchMetadata, downloadVideo, DownloadError } = await import(
  "./ytdlp.downloader.js"
);

// Fixtures de stderr — padrões documentados em 01-RESEARCH.md Architecture
// Pattern 1 / Pitfall 1 (GitHub issue #7143 etc). Confiança MEDIUM: ainda
// pendentes de confirmação contra saída real do yt-dlp (Open Question 1),
// a validar durante o gate manual de integração (01-06 E2E).
describe("classifyYtdlpError", () => {
  it("classifies anti-bot 'sign in to confirm' as anti_bot_blocked", () => {
    expect(classifyYtdlpError("ERROR: [youtube] Sign in to confirm you're not a bot")).toBe(
      "anti_bot_blocked",
    );
  });

  it("classifies 403/forbidden as anti_bot_blocked", () => {
    expect(classifyYtdlpError("HTTP Error 403: Forbidden")).toBe("anti_bot_blocked");
  });

  it("classifies HTTP 429 as rate_limited", () => {
    expect(classifyYtdlpError("HTTP Error 429: Too Many Requests")).toBe("rate_limited");
  });

  it("classifies 'too many requests' text as rate_limited", () => {
    expect(classifyYtdlpError("ERROR: too many requests, slow down")).toBe("rate_limited");
  });

  it("classifies private/unavailable video as unavailable", () => {
    expect(classifyYtdlpError("ERROR: Private video. Sign in if you've been granted access")).toBe(
      "unavailable",
    );
    expect(classifyYtdlpError("ERROR: [youtube] abc123: Video unavailable")).toBe("unavailable");
    expect(classifyYtdlpError("ERROR: This video has been removed by the uploader")).toBe(
      "unavailable",
    );
  });

  it("classifies network errors (timeout/ECONNRESET/ENOTFOUND) as network", () => {
    expect(classifyYtdlpError("ERROR: [youtube] Connection timed out")).toBe("network");
    expect(classifyYtdlpError("Error: read ECONNRESET")).toBe("network");
    expect(classifyYtdlpError("Error: getaddrinfo ENOTFOUND example.com")).toBe("network");
  });

  it("classifies unrecognized stderr as unknown", () => {
    expect(classifyYtdlpError("ERROR: some completely novel yt-dlp error message")).toBe(
      "unknown",
    );
  });

  it("is case-insensitive", () => {
    expect(classifyYtdlpError("SIGN IN TO CONFIRM YOU'RE NOT A BOT")).toBe("anti_bot_blocked");
    expect(classifyYtdlpError("http error 429")).toBe("rate_limited");
  });
});

describe("fetchMetadata", () => {
  beforeEach(() => {
    youtubedlMock.mockReset();
  });

  it("maps a full --dump-json payload to VideoMetadata", async () => {
    youtubedlMock.mockResolvedValue({
      webpage_url: "https://www.youtube.com/watch?v=abc123",
      uploader: "Chef Ana",
      uploader_id: "chefana",
      uploader_url: "https://www.youtube.com/@chefana",
      channel_url: "https://www.youtube.com/channel/UC123",
      description: "Receita de brigadeiro gourmet",
      duration: 180,
      thumbnail: "https://i.ytimg.com/vi/abc123/hqdefault.jpg",
    });

    const meta = await fetchMetadata("https://www.youtube.com/watch?v=abc123");

    expect(meta).toEqual({
      sourceUrl: "https://www.youtube.com/watch?v=abc123",
      authorHandle: "Chef Ana",
      authorUrl: "https://www.youtube.com/@chefana",
      caption: "Receita de brigadeiro gourmet",
      durationSec: 180,
      thumbnailUrl: "https://i.ytimg.com/vi/abc123/hqdefault.jpg",
    });
  });

  it("does not throw when optional fields (e.g. uploader_url) are absent", async () => {
    youtubedlMock.mockResolvedValue({
      webpage_url: "https://vm.tiktok.com/xyz789",
      uploader: "chefzeze",
      // uploader_url, channel_url, description, duration, thumbnail ausentes
      // (comum no TikTok/Instagram per RESEARCH field-map table)
    });

    const meta = await fetchMetadata("https://vm.tiktok.com/xyz789");

    expect(meta.sourceUrl).toBe("https://vm.tiktok.com/xyz789");
    expect(meta.authorHandle).toBe("chefzeze");
    expect(meta.authorUrl).toBeUndefined();
    expect(meta.durationSec).toBeUndefined();
  });

  it("falls back to uploader_id when uploader is absent", async () => {
    youtubedlMock.mockResolvedValue({
      webpage_url: "https://www.instagram.com/reel/abc/",
      uploader_id: "chef.zeze",
    });

    const meta = await fetchMetadata("https://www.instagram.com/reel/abc/");
    expect(meta.authorHandle).toBe("chef.zeze");
  });

  it("throws a classified DownloadError when yt-dlp rejects", async () => {
    youtubedlMock.mockRejectedValue(
      Object.assign(new Error("Sign in to confirm you're not a bot"), {
        stderr: "ERROR: Sign in to confirm you're not a bot",
      }),
    );

    await expect(fetchMetadata("https://www.youtube.com/watch?v=blocked")).rejects.toMatchObject({
      reason: "anti_bot_blocked",
    });
  });
});

describe("downloadVideo", () => {
  beforeEach(() => {
    youtubedlMock.mockReset();
  });

  it("rejects with duration_exceeded before attempting the actual download when duration exceeds the cap", async () => {
    // fetchMetadata call resolves with an over-cap duration; the second
    // youtubedl call (actual download) must never happen.
    youtubedlMock.mockResolvedValueOnce({
      webpage_url: "https://www.youtube.com/watch?v=toolong",
      duration: 100_000, // far beyond env.import.maxDurationSec default (600s)
    });

    await expect(downloadVideo("https://www.youtube.com/watch?v=toolong", "/tmp/out.mp4")).rejects.toMatchObject(
      { reason: "duration_exceeded" },
    );

    // Only the metadata call happened — download was never attempted.
    expect(youtubedlMock).toHaveBeenCalledTimes(1);
  });

  it("throws DownloadError carrying both the classified reason and raw stderr on download failure", async () => {
    youtubedlMock
      .mockResolvedValueOnce({
        webpage_url: "https://www.youtube.com/watch?v=abc123",
        duration: 60,
      })
      .mockRejectedValueOnce(
        Object.assign(new Error("HTTP Error 429: Too Many Requests"), {
          stderr: "ERROR: HTTP Error 429: Too Many Requests",
        }),
      );

    let caught: unknown;
    try {
      await downloadVideo("https://www.youtube.com/watch?v=abc123", "/tmp/out.mp4");
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(DownloadError);
    expect((caught as InstanceType<typeof DownloadError>).reason).toBe("rate_limited");
    expect((caught as InstanceType<typeof DownloadError>).cause).toBe(
      "ERROR: HTTP Error 429: Too Many Requests",
    );
  });

  it("returns videoPath and meta on success", async () => {
    youtubedlMock
      .mockResolvedValueOnce({
        webpage_url: "https://www.youtube.com/watch?v=abc123",
        uploader: "Chef Ana",
        duration: 60,
      })
      .mockResolvedValueOnce(undefined);

    const result = await downloadVideo("https://www.youtube.com/watch?v=abc123", "/tmp/out.mp4");

    expect(result.videoPath).toBe("/tmp/out.mp4");
    expect(result.meta.sourceUrl).toBe("https://www.youtube.com/watch?v=abc123");
    expect(result.meta.authorHandle).toBe("Chef Ana");
  });
});
