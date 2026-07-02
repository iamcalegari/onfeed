import { existsSync } from "node:fs";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

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
    // pipeline.ts (Plano 05) importa import.extraction.ts/recipe.ingestion.ts
    // transitivamente -> anthropic.client.ts/voyage.client.ts leem env no
    // module-load (mesma decisão de recipe.ingestion.test.ts).
    anthropic: { apiKey: "test-key", model: "claude-haiku-4-5-20251001", importModel: "claude-sonnet-4-5" },
    voyage: { model: "voyage-3" },
  },
}));

// Extração de import (Plano 02) — mockada por padrão em modo sucesso; cada
// teste sobrescreve fixture/erro conforme o cenário.
const extractImportedRecipe = vi.fn().mockResolvedValue(undefined);
vi.mock("@/modules/import/import.extraction.js", () => ({
  extractImportedRecipe: (...args: unknown[]) => extractImportedRecipe(...args),
}));

// Persistência (Plano 01, recipe.ingestion.ts) — mockada para não tocar
// canonicalização/embedding/Mongo real nesta suite.
const persistExtractedRecipe = vi.fn().mockResolvedValue({ _id: "recipe1" });
vi.mock("@/modules/recipes/recipe.ingestion.js", () => ({
  persistExtractedRecipe: (...args: unknown[]) => persistExtractedRecipe(...args),
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

// Quota de import (Plano 01/06) — refundDailyImportQuota é mockado para não
// tocar o Model real do mongoat (evita o gotcha "Database not found" —
// import-usage.model.ts registra o Model no module-load); cada teste de
// refund verifica a chamada via este spy.
const refundDailyImportQuota = vi.fn().mockResolvedValue(undefined);
vi.mock("@/modules/usage/usage.repository.js", () => ({
  refundDailyImportQuota: (...args: unknown[]) => refundDailyImportQuota(...args),
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

/** Fixture mínima e bem-grounded — usada como retorno padrão de extractImportedRecipe. */
function extractedFixture(overrides: Record<string, unknown> = {}) {
  return {
    title: "Risoto de Carnaroli",
    titleGrounding: "grounded",
    intro: "Um risoto cremoso.",
    country: "IT",
    occasions: ["comfort_food"],
    equipment: ["stovetop"],
    ingredients: [
      {
        raw: "2 xícaras de arroz carnaroli",
        name: "arroz carnaroli",
        quantity: 2,
        unit: "xícara",
        core: true,
        quantityGrounding: "grounded",
      },
    ],
    steps: [{ text: "Refogue o arroz.", minutes: 5, grounding: "grounded" }],
    nutrition: { calories: 450, protein: 12, carbs: 60, fat: 15 },
    sourceDivergence: [],
    ...overrides,
  };
}

/** Shape de retorno de extractImportedRecipe (Plano 06) — { recipe, usage } —
 * usage alimenta a telemetria de custo (COST-02). */
function extractionResultFixture(overrides: Record<string, unknown> = {}) {
  return {
    recipe: extractedFixture(overrides),
    usage: { inputTokens: 1200, outputTokens: 400 },
  };
}

extractImportedRecipe.mockResolvedValue(extractionResultFixture());

/** Caminho fake de vídeo baixado, compartilhado pelos mocks de downloadVideo
 * — precisa existir de fato em disco porque o pipeline (Plano 06) faz
 * stat(videoPath) para medir bytes baixados (COST-02). */
const FAKE_VIDEO_PATH = path.join(tmpdir(), "import-worker-test-fake-video.mp4");

beforeAll(async () => {
  await mkdir(path.dirname(FAKE_VIDEO_PATH), { recursive: true });
  await writeFile(FAKE_VIDEO_PATH, Buffer.from("fake-video-bytes"));
});

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
    extractImportedRecipe.mockReset().mockResolvedValue(extractionResultFixture());
    persistExtractedRecipe.mockReset().mockResolvedValue({ _id: "recipe1" });
  });

  it("removes the job temp dir after a successful run", async () => {
    downloadVideo.mockResolvedValue({
      videoPath: FAKE_VIDEO_PATH,
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
    extractImportedRecipe.mockReset().mockResolvedValue(extractionResultFixture());
    persistExtractedRecipe.mockReset().mockResolvedValue({ _id: "recipe1" });
  });

  it("does NOT call transcribe and sets noSpeechDetected when the silence ratio exceeds the threshold", async () => {
    downloadVideo.mockResolvedValue({
      videoPath: FAKE_VIDEO_PATH,
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

  it("still reaches ready_for_review with reviewRequired true when no speech was detected (D-06 override integration)", async () => {
    downloadVideo.mockResolvedValue({
      videoPath: FAKE_VIDEO_PATH,
      meta: { sourceUrl: "https://www.youtube.com/watch?v=abc123", durationSec: 60 },
    });
    detectSilenceRatio.mockResolvedValue(0.95); // acima de NO_SPEECH_RATIO_THRESHOLD (0.8)

    await processImportJob(baseJob() as never);

    expect(extractImportedRecipe).toHaveBeenCalledWith(
      expect.objectContaining({ noSpeechDetected: true }),
    );
    expect(updateImportJobStatus).toHaveBeenCalledWith(
      "job1",
      expect.objectContaining({ status: "ready_for_review", reviewRequired: true }),
    );
    const calls = updateImportJobStatus.mock.calls as [string, Record<string, unknown>][];
    for (const [, patch] of calls) {
      expect(patch.status).not.toBe("public");
      expect(patch.status).not.toBe("published");
    }
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

describe("failJob — refund da cota reservada (COST-01/D-07)", () => {
  afterEach(() => {
    vi.clearAllMocks();
    getImportJob.mockReset();
    downloadVideo.mockReset();
    isOpen.mockReset().mockReturnValue(false);
    refundDailyImportQuota.mockReset().mockResolvedValue(undefined);
  });

  it("refunda exatamente uma vez, com userId e o dia RESERVADO (job.insertedAt), quando o job falha", async () => {
    const insertedAt = new Date("2026-07-01T23:50:00.000Z"); // véspera da virada UTC
    downloadVideo.mockRejectedValue(
      new DownloadError("anti_bot_blocked", "Sign in to confirm you're not a bot"),
    );

    await processImportJob(baseJob({ insertedAt }) as never);

    expect(refundDailyImportQuota).toHaveBeenCalledTimes(1);
    expect(refundDailyImportQuota).toHaveBeenCalledWith("user_1", "2026-07-01");
  });

  it("NÃO refunda duas vezes quando a mesma mensagem SQS é redelivered para um job já failed (no-op via TERMINAL_STATUSES)", async () => {
    downloadVideo.mockRejectedValue(
      new DownloadError("anti_bot_blocked", "Sign in to confirm you're not a bot"),
    );
    getImportJob.mockResolvedValue(baseJob({ status: "queued" }));

    // 1ª entrega: processa e falha -> refund único.
    await handleImportMessage(JSON.stringify({ jobId: "job1" }));
    expect(refundDailyImportQuota).toHaveBeenCalledTimes(1);

    // Redelivery: o doc já está failed (fonte da verdade é o Mongo, não o
    // payload SQS) -> handleImportMessage faz no-op via TERMINAL_STATUSES,
    // processImportJob/failJob NUNCA rodam de novo.
    getImportJob.mockResolvedValue(baseJob({ status: "failed" }));
    await handleImportMessage(JSON.stringify({ jobId: "job1" }));

    expect(refundDailyImportQuota).toHaveBeenCalledTimes(1);
    expect(downloadVideo).toHaveBeenCalledTimes(1);
  });

  it("chave do refund é o dia de insertedAt, não a data atual (RESEARCH Pattern 2 anti-pattern)", async () => {
    const insertedAt = new Date("2020-01-15T10:00:00.000Z");
    downloadVideo.mockRejectedValue(new DownloadError("rate_limited", "429 Too Many Requests"));

    await processImportJob(baseJob({ insertedAt }) as never);

    expect(refundDailyImportQuota).toHaveBeenCalledWith("user_1", "2020-01-15");
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
    extractImportedRecipe.mockReset().mockResolvedValue(extractionResultFixture());
    persistExtractedRecipe.mockReset().mockResolvedValue({ _id: "recipe1" });
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
      videoPath: FAKE_VIDEO_PATH,
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

describe("processImportJob — extracting stage (Fase 2 Plano 05, EXT-05 ready_for_review guarantee)", () => {
  afterEach(() => {
    vi.clearAllMocks();
    downloadVideo.mockReset();
    detectSilenceRatio.mockReset().mockResolvedValue(0.1);
    transcribe.mockReset().mockResolvedValue({ text: "modo de preparo...", source: "groq" });
    isOpen.mockReset().mockReturnValue(false);
    extractNormalizedKeyframe.mockReset().mockResolvedValue(Buffer.from("fake-jpeg"));
    putImage.mockReset().mockResolvedValue("https://cdn.example.com/imports/job1/keyframe.jpg");
    extractAudio.mockReset().mockResolvedValue(undefined);
    extractImportedRecipe.mockReset().mockResolvedValue(extractionResultFixture());
    persistExtractedRecipe.mockReset().mockResolvedValue({ _id: "recipe1" });
  });

  it("happy path: lands ready_for_review with recipeId/reviewRequired/confidenceScore, and NEVER writes a public/published status", async () => {
    downloadVideo.mockResolvedValue({
      videoPath: FAKE_VIDEO_PATH,
      meta: { sourceUrl: "https://www.youtube.com/watch?v=abc123", durationSec: 60 },
    });

    await processImportJob(baseJob() as never);

    expect(extractImportedRecipe).toHaveBeenCalledTimes(1);
    expect(persistExtractedRecipe).toHaveBeenCalledTimes(1);
    expect(updateImportJobStatus).toHaveBeenCalledWith(
      "job1",
      expect.objectContaining({
        status: "ready_for_review",
        recipeId: "recipe1",
        reviewRequired: expect.any(Boolean),
        confidenceScore: expect.any(Number),
      }),
    );

    const calls = updateImportJobStatus.mock.calls as [string, Record<string, unknown>][];
    for (const [, patch] of calls) {
      expect(patch.status).not.toBe("public");
      expect(patch.status).not.toBe("published");
    }
  });

  it("passes the persist options with source imported and visibility private (never a public status path)", async () => {
    downloadVideo.mockResolvedValue({
      videoPath: FAKE_VIDEO_PATH,
      meta: { sourceUrl: "https://www.youtube.com/watch?v=abc123", durationSec: 60 },
    });

    await processImportJob(baseJob() as never);

    const [, , options] = persistExtractedRecipe.mock.calls[0] as [unknown, unknown, Record<string, unknown>];
    expect(options.source).toBe("imported");
    expect(options.visibility).toBe("private");
  });

  it("extraction throw -> status failed, failureReason extraction_failed, no recipeId linked", async () => {
    downloadVideo.mockResolvedValue({
      videoPath: FAKE_VIDEO_PATH,
      meta: { sourceUrl: "https://www.youtube.com/watch?v=abc123", durationSec: 60 },
    });
    extractImportedRecipe.mockRejectedValue(
      new Error("Extração de import falhou (stop_reason=max_tokens)"),
    );

    await expect(processImportJob(baseJob() as never)).resolves.toBeUndefined();

    expect(persistExtractedRecipe).not.toHaveBeenCalled();
    expect(updateImportJobStatus).toHaveBeenCalledWith(
      "job1",
      expect.objectContaining({ status: "failed", failureReason: "extraction_failed" }),
    );
    const calls = updateImportJobStatus.mock.calls as [string, Record<string, unknown>][];
    for (const [, patch] of calls) {
      expect(patch).not.toHaveProperty("recipeId");
    }
  });

  it("persistExtractedRecipe throw -> status failed, failureReason extraction_failed (atomic — no half-written recipe)", async () => {
    downloadVideo.mockResolvedValue({
      videoPath: FAKE_VIDEO_PATH,
      meta: { sourceUrl: "https://www.youtube.com/watch?v=abc123", durationSec: 60 },
    });
    persistExtractedRecipe.mockRejectedValue(new Error("Voyage não retornou embedding"));

    await expect(processImportJob(baseJob() as never)).resolves.toBeUndefined();

    expect(updateImportJobStatus).toHaveBeenCalledWith(
      "job1",
      expect.objectContaining({ status: "failed", failureReason: "extraction_failed" }),
    );
  });

  it("does not retry (no rethrow) on an extraction failure — SQS message is not left for immediate redrive", async () => {
    downloadVideo.mockResolvedValue({
      videoPath: FAKE_VIDEO_PATH,
      meta: { sourceUrl: "https://www.youtube.com/watch?v=abc123", durationSec: 60 },
    });
    extractImportedRecipe.mockRejectedValue(new Error("boom"));

    await expect(processImportJob(baseJob() as never)).resolves.toBeUndefined();
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
