import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

// pipeline.ts importa @/config/env.js (transitivamente via ytdlp.downloader.ts/
// transcription.port.ts) — mockar evita arrastar a validação required(MONGODB_URI)
// para a suite rápida, mesma decisão já aplicada em ytdlp.downloader.test.ts /
// transcription.test.ts (Plan 03).
vi.mock("@/config/env.js", () => ({
  env: {
    import: { maxDurationSec: 600 },
    groq: { apiKey: "", model: "whisper-large-v3-turbo", enabled: false },
    openaiTranscription: { apiKey: "", enabled: false },
    images: { bucket: "test-bucket", region: "us-east-1", cdnDomain: "", s3Endpoint: "" },
    sqs: { importQueueUrl: "https://sqs.us-east-1.amazonaws.com/000/import-queue" },
    aws: { region: "us-east-1" },
  },
}));

// import-worker.ts importa @/modules/index.js (registro de models Mongoat) e
// @/infra/database/connection.js (conecta ao Mongo) — nenhum dos dois deve
// tocar infraestrutura real numa suite de unidade rápida.
vi.mock("@/infra/database/connection.js", () => ({
  connectDatabase: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/modules/index.js", () => ({}));
vi.mock("@/infra/queue/sqs.client.js", () => ({ sqsClient: {} }));

// Repositório: captura toda escrita de status sem tocar Mongo real.
const updateImportJobStatus = vi.fn().mockResolvedValue(undefined);
const getImportJob = vi.fn();
vi.mock("@/modules/import/import-job.repository.js", () => ({
  updateImportJobStatus: (...args: unknown[]) => updateImportJobStatus(...args),
  getImportJob: (...args: unknown[]) => getImportJob(...args),
}));

// Downloader (Plan 03) — mockado por padrão em modo sucesso; cada teste
// sobrescreve o comportamento necessário.
const downloadVideo = vi.fn();
vi.mock("@/infra/video/ytdlp.downloader.js", async () => {
  const actual = await vi.importActual<typeof import("@/infra/video/ytdlp.downloader.js")>(
    "@/infra/video/ytdlp.downloader.js",
  );
  return {
    ...actual,
    downloadVideo: (...args: unknown[]) => downloadVideo(...args),
  };
});

// ffmpeg (Plan 02) — extractAudio é um no-op mockado (não precisa do binário real).
const extractAudio = vi.fn().mockResolvedValue(undefined);
vi.mock("@/infra/video/ffmpeg.exec.js", () => ({
  extractAudio: (...args: unknown[]) => extractAudio(...args),
}));

// VAD (Plan 02) — controla o ratio de silêncio por teste.
const detectSilenceRatio = vi.fn().mockResolvedValue(0.1);
vi.mock("@/infra/video/vad.js", () => ({
  detectSilenceRatio: (...args: unknown[]) => detectSilenceRatio(...args),
  NO_SPEECH_RATIO_THRESHOLD: 0.8,
}));

// Keyframe (Plan 02) — retorna um buffer fake, nunca toca ffmpeg/sharp real.
const extractNormalizedKeyframe = vi.fn().mockResolvedValue(Buffer.from("fake-jpeg"));
vi.mock("@/infra/video/keyframe.js", () => ({
  extractNormalizedKeyframe: (...args: unknown[]) => extractNormalizedKeyframe(...args),
}));

// Transcrição (Plan 03) — sucesso por padrão.
const transcribe = vi.fn().mockResolvedValue({ text: "modo de preparo...", source: "groq" });
vi.mock("@/infra/video/transcription.port.js", async () => {
  const actual = await vi.importActual<typeof import("@/infra/video/transcription.port.js")>(
    "@/infra/video/transcription.port.js",
  );
  return {
    ...actual,
    transcribe: (...args: unknown[]) => transcribe(...args),
  };
});

// Circuit breaker (Plan 02) — fechado por padrão.
const isOpen = vi.fn().mockReturnValue(false);
const recordOutcome = vi.fn();
vi.mock("@/infra/video/platform-breaker.js", () => ({
  isOpen: (...args: unknown[]) => isOpen(...args),
  recordOutcome: (...args: unknown[]) => recordOutcome(...args),
}));

// S3 (existing infra) — putImage mockado, nunca toca AWS real.
const putImage = vi.fn().mockResolvedValue("https://cdn.example.com/imports/job1/keyframe.jpg");
vi.mock("@/infra/images/s3.image-store.js", () => ({
  putImage: (...args: unknown[]) => putImage(...args),
}));

const { processImportJob } = await import("@/infra/video/pipeline.js");
const { DownloadError } = await import("@/infra/video/ytdlp.downloader.js");
const { handleImportMessage, sweepStaleTempDirs } = await import("./import-worker.js");

function baseJob(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    _id: "job1",
    userId: "user_1",
    sourceUrl: "https://www.youtube.com/watch?v=abc123",
    normalizedUrl: "https://www.youtube.com/watch?v=abc123",
    platform: "youtube" as const,
    status: "queued" as const,
    retryCount: 0,
    insertedAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/** Encontra diretórios import-job1-* remanescentes em tmpdir(), se houver. */
async function findLeftoverJobDirs(jobId: string): Promise<string[]> {
  const entries = await readdir(tmpdir());
  return entries.filter((e) => e.startsWith(`import-${jobId}-`));
}

describe("processImportJob — cleanup guarantee (PIPE-05)", () => {
  afterEach(() => {
    vi.clearAllMocks();
    downloadVideo.mockReset();
    detectSilenceRatio.mockReset().mockResolvedValue(0.1);
    transcribe.mockReset().mockResolvedValue({ text: "modo de preparo...", source: "groq" });
    isOpen.mockReset().mockReturnValue(false);
    extractNormalizedKeyframe.mockReset().mockResolvedValue(Buffer.from("fake-jpeg"));
    putImage.mockReset().mockResolvedValue("https://cdn.example.com/imports/job1/keyframe.jpg");
    extractAudio.mockReset().mockResolvedValue(undefined);
  });

  it("removes the job temp dir after a successful run", async () => {
    downloadVideo.mockResolvedValue({
      videoPath: "/tmp/fake/video.mp4",
      meta: { sourceUrl: "https://www.youtube.com/watch?v=abc123", durationSec: 60 },
    });

    await processImportJob(baseJob() as never);

    const leftovers = await findLeftoverJobDirs("job1");
    expect(leftovers).toEqual([]);
    expect(updateImportJobStatus).toHaveBeenCalledWith(
      "job1",
      expect.objectContaining({ status: "ready_for_review" }),
    );
  });

  it("removes the job temp dir even when a stage throws mid-pipeline (transient failure)", async () => {
    downloadVideo.mockRejectedValue(new Error("boom mid-pipeline"));

    await expect(processImportJob(baseJob() as never)).rejects.toThrow("boom mid-pipeline");

    const leftovers = await findLeftoverJobDirs("job1");
    expect(leftovers).toEqual([]);
  });
});

describe("processImportJob — no-speech skip (PIPE-02, D-06)", () => {
  afterEach(() => {
    vi.clearAllMocks();
    downloadVideo.mockReset();
    detectSilenceRatio.mockReset().mockResolvedValue(0.1);
    transcribe.mockReset().mockResolvedValue({ text: "modo de preparo...", source: "groq" });
    isOpen.mockReset().mockReturnValue(false);
    extractNormalizedKeyframe.mockReset().mockResolvedValue(Buffer.from("fake-jpeg"));
    putImage.mockReset().mockResolvedValue("https://cdn.example.com/imports/job1/keyframe.jpg");
  });

  it("does NOT call transcribe and sets noSpeechDetected when the silence ratio exceeds the threshold", async () => {
    downloadVideo.mockResolvedValue({
      videoPath: "/tmp/fake/video.mp4",
      meta: { sourceUrl: "https://www.youtube.com/watch?v=abc123", durationSec: 60 },
    });
    detectSilenceRatio.mockResolvedValue(0.95); // acima de NO_SPEECH_RATIO_THRESHOLD (0.8)

    await processImportJob(baseJob() as never);

    expect(transcribe).not.toHaveBeenCalled();
    expect(updateImportJobStatus).toHaveBeenCalledWith(
      "job1",
      expect.objectContaining({ noSpeechDetected: true, transcriptSource: null }),
    );
  });
});

describe("processImportJob — anti_bot_blocked failure (PIPE-07)", () => {
  afterEach(() => {
    vi.clearAllMocks();
    downloadVideo.mockReset();
    isOpen.mockReset().mockReturnValue(false);
  });

  it("sets status failed with anti_bot_blocked and does NOT rethrow (no immediate SQS retry)", async () => {
    downloadVideo.mockRejectedValue(
      new DownloadError("anti_bot_blocked", "Sign in to confirm you're not a bot"),
    );

    await expect(processImportJob(baseJob() as never)).resolves.toBeUndefined();

    expect(updateImportJobStatus).toHaveBeenCalledWith(
      "job1",
      expect.objectContaining({ status: "failed", failureReason: "anti_bot_blocked" }),
    );
    expect(recordOutcome).toHaveBeenCalledWith("youtube", false);
  });

  it("fails fast via the circuit breaker (isOpen) without attempting download", async () => {
    isOpen.mockReturnValue(true);

    await expect(processImportJob(baseJob() as never)).resolves.toBeUndefined();

    expect(downloadVideo).not.toHaveBeenCalled();
    expect(updateImportJobStatus).toHaveBeenCalledWith(
      "job1",
      expect.objectContaining({ status: "failed", failureReason: "anti_bot_blocked" }),
    );
  });

  it("cleans up the temp dir even on the anti_bot_blocked no-rethrow path", async () => {
    downloadVideo.mockRejectedValue(new DownloadError("rate_limited", "429 Too Many Requests"));

    await processImportJob(baseJob() as never);

    const leftovers = await findLeftoverJobDirs("job1");
    expect(leftovers).toEqual([]);
    expect(existsSync(path.join(tmpdir(), "import-job1-"))).toBe(false);
  });
});

describe("handleImportMessage — idempotency (PIPE-06)", () => {
  afterEach(() => {
    vi.clearAllMocks();
    getImportJob.mockReset();
    downloadVideo.mockReset();
    detectSilenceRatio.mockReset().mockResolvedValue(0.1);
    transcribe.mockReset().mockResolvedValue({ text: "modo de preparo...", source: "groq" });
    isOpen.mockReset().mockReturnValue(false);
    extractNormalizedKeyframe.mockReset().mockResolvedValue(Buffer.from("fake-jpeg"));
    putImage.mockReset().mockResolvedValue("https://cdn.example.com/imports/job1/keyframe.jpg");
  });

  it("is a no-op (does not call downloadVideo/process the pipeline) for a job already in ready_for_review", async () => {
    getImportJob.mockResolvedValue(baseJob({ status: "ready_for_review" }));

    await handleImportMessage(JSON.stringify({ jobId: "job1" }));

    expect(getImportJob).toHaveBeenCalledWith("job1");
    expect(downloadVideo).not.toHaveBeenCalled();
    expect(updateImportJobStatus).not.toHaveBeenCalled();
  });

  it("is a no-op for a job already in failed", async () => {
    getImportJob.mockResolvedValue(baseJob({ status: "failed" }));

    await handleImportMessage(JSON.stringify({ jobId: "job1" }));

    expect(downloadVideo).not.toHaveBeenCalled();
  });

  it("processes the pipeline for a queued job (not a no-op)", async () => {
    getImportJob.mockResolvedValue(baseJob({ status: "queued" }));
    downloadVideo.mockResolvedValue({
      videoPath: "/tmp/fake/video.mp4",
      meta: { sourceUrl: "https://www.youtube.com/watch?v=abc123", durationSec: 60 },
    });

    await handleImportMessage(JSON.stringify({ jobId: "job1" }));

    expect(downloadVideo).toHaveBeenCalled();
    expect(updateImportJobStatus).toHaveBeenCalledWith(
      "job1",
      expect.objectContaining({ status: "ready_for_review" }),
    );
  });

  it("is defensively a no-op when the job is not found (redelivered message for a deleted/nonexistent job)", async () => {
    getImportJob.mockResolvedValue(null);

    await expect(handleImportMessage(JSON.stringify({ jobId: "ghost" }))).resolves.toBeUndefined();
    expect(downloadVideo).not.toHaveBeenCalled();
  });
});

describe("sweepStaleTempDirs — startup crash-recovery sweep (PIPE-05 layer 2)", () => {
  it("removes leftover import-* temp dirs from a prior crashed instance", async () => {
    const { mkdtemp } = await import("node:fs/promises");
    const staleDir = await mkdtemp(path.join(tmpdir(), "import-stale-job-"));
    expect(existsSync(staleDir)).toBe(true);

    await sweepStaleTempDirs();

    expect(existsSync(staleDir)).toBe(false);
  });

  it("does not touch unrelated tmpdir entries", async () => {
    const { mkdtemp, rm } = await import("node:fs/promises");
    const unrelatedDir = await mkdtemp(path.join(tmpdir(), "not-import-related-"));
    try {
      await sweepStaleTempDirs();
      expect(existsSync(unrelatedDir)).toBe(true);
    } finally {
      await rm(unrelatedDir, { recursive: true, force: true });
    }
  });
});
