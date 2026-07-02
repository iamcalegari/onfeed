import { beforeEach, describe, expect, it, vi } from "vitest";

// env.ts valida MONGODB_URI/etc via required() no module-load — mock evita
// arrastar essa validação para a suite rápida (mesma decisão de
// ytdlp.downloader.test.ts / import-job.repository.test.ts). voyage.model
// é necessário desde a Fase 3 (Task 3): import.service.ts agora importa
// RecipeModel (recipe.model.ts), cujo documentDefaults lê env.voyage.model
// no module-load.
vi.mock("@/config/env.js", () => ({
  env: {
    sqs: { importQueueUrl: "https://sqs.example.com/import-queue" },
    voyage: { model: "voyage-3" },
  },
}));

const sendMock = vi.fn().mockResolvedValue({});
vi.mock("@/infra/queue/sqs.client.js", () => ({
  sqsClient: { send: (...args: unknown[]) => sendMock(...args) },
}));

// RecipeModel: mockado para que import.service.ts (que agora o importa para
// confirmImportedRecipe, Fase 3 Task 3) não registre a coleção real do mongoat.
vi.mock("@/modules/recipes/recipe.model.js", () => ({
  RecipeModel: { update: vi.fn() },
}));

// hybridSearch: espiona os params compostos por listMyImportedRecipes sem
// tocar Mongo/Atlas real (D-14 — provar o invariante ownerId-sempre-junto-com-
// 'imported' em sources). getRecipeById: usado por confirmImportedRecipe.
const hybridSearchMock = vi.fn().mockResolvedValue([]);
vi.mock("@/modules/recipes/recipe.repository.js", () => ({
  DEFAULT_SEARCH_SOURCES: ["curated", "generated_validated", "variant", "user"],
  hybridSearch: (...args: unknown[]) => hybridSearchMock(...args),
  getRecipeById: vi.fn(),
}));

const { detectPlatform, normalizeUrl, enqueueImportJob, listMyImportedRecipes } = await import(
  "./import.service.js"
);

describe("detectPlatform (CAP-02 / SSRF boundary)", () => {
  it.each([
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "youtube"],
    ["https://youtube.com/watch?v=dQw4w9WgXcQ", "youtube"],
    ["https://youtu.be/dQw4w9WgXcQ", "youtube"],
    ["https://www.youtube.com/shorts/abc123", "youtube"],
    ["https://www.tiktok.com/@user/video/123456789", "tiktok"],
    ["https://vm.tiktok.com/ZMabc123/", "tiktok"],
    ["https://www.instagram.com/reel/Cabc123/", "instagram"],
    ["https://instagram.com/p/Cabc123/", "instagram"],
  ])("classifies %s as %s", (url, expected) => {
    expect(detectPlatform(url)).toBe(expected);
  });

  it("returns null for a malformed/non-URL string", () => {
    expect(detectPlatform("not a url")).toBeNull();
  });

  it("returns null for a non-http(s) protocol", () => {
    expect(detectPlatform("file:///etc/passwd")).toBeNull();
    expect(detectPlatform("javascript:alert(1)")).toBeNull();
  });

  it("returns null for a non-allowlisted domain (SSRF boundary — internal IP)", () => {
    expect(detectPlatform("http://169.254.169.254/latest/meta-data/")).toBeNull();
  });

  it("returns null for a non-allowlisted domain (arbitrary external host)", () => {
    expect(detectPlatform("https://example.com/video/123")).toBeNull();
  });

  it("returns null for an internal hostname disguised as a plausible link", () => {
    expect(detectPlatform("http://internal-service.local/video")).toBeNull();
  });
});

describe("normalizeUrl", () => {
  it("strips tracking params while preserving the canonical video path", () => {
    const withTracking =
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ&utm_source=ig&utm_medium=story";
    const withoutTracking = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
    expect(normalizeUrl(withTracking)).toBe(normalizeUrl(withoutTracking));
  });

  it("is idempotent across links differing only by tracking params (igshid, si)", () => {
    const a = "https://www.instagram.com/reel/Cabc123/?igshid=xyz";
    const b = "https://www.instagram.com/reel/Cabc123/";
    expect(normalizeUrl(a)).toBe(normalizeUrl(b));
  });

  it("strips the youtu.be 'si' share param without altering the video id", () => {
    const withSi = "https://youtu.be/dQw4w9WgXcQ?si=abcDEF123";
    const withoutSi = "https://youtu.be/dQw4w9WgXcQ";
    expect(normalizeUrl(withSi)).toBe(normalizeUrl(withoutSi));
  });
});

describe("enqueueImportJob", () => {
  beforeEach(() => {
    sendMock.mockClear();
  });

  it("sends { jobId } to env.sqs.importQueueUrl via the existing sqsClient", async () => {
    await enqueueImportJob("507f1f77bcf86cd799439011");

    expect(sendMock).toHaveBeenCalledTimes(1);
    const [command] = sendMock.mock.calls[0]!;
    expect(command.input.QueueUrl).toBe("https://sqs.example.com/import-queue");
    expect(JSON.parse(command.input.MessageBody)).toEqual({
      jobId: "507f1f77bcf86cd799439011",
    });
  });
});

describe("listMyImportedRecipes (EXT-04 concrete calling path / D-14 invariant)", () => {
  beforeEach(() => {
    hybridSearchMock.mockClear();
  });

  it("always calls hybridSearch with ownerId === the passed userId AND a sources array containing 'imported'", async () => {
    await listMyImportedRecipes("user_A");

    expect(hybridSearchMock).toHaveBeenCalledTimes(1);
    const [calledParams] = hybridSearchMock.mock.calls[0] as [Record<string, unknown>];
    expect(calledParams.ownerId).toBe("user_A");
    expect(calledParams.sources).toContain("imported");
  });

  it("layers 'imported' on top of the standard DEFAULT_SEARCH_SOURCES set when no sources override is passed", async () => {
    await listMyImportedRecipes("user_A");

    const [calledParams] = hybridSearchMock.mock.calls[0] as [Record<string, unknown>];
    expect(calledParams.sources).toEqual([
      "curated",
      "generated_validated",
      "variant",
      "user",
      "imported",
    ]);
  });

  it("there is no code path that includes 'imported' in sources without also setting ownerId", async () => {
    // Varre todas as invocações feitas neste describe block: sempre que
    // 'imported' aparece em sources, ownerId tem que estar presente.
    await listMyImportedRecipes("user_B", { sources: ["curated"] });

    for (const call of hybridSearchMock.mock.calls) {
      const calledParams = call[0] as Record<string, unknown>;
      const sources = calledParams.sources as string[];
      if (sources.includes("imported")) {
        expect(calledParams.ownerId).toBeTruthy();
      }
    }
  });

  it("passes ownerId through even when the caller overrides other params (e.g. a custom sources list)", async () => {
    await listMyImportedRecipes("user_C", { sources: ["curated"], limit: 5 });

    const [calledParams] = hybridSearchMock.mock.calls[0] as [Record<string, unknown>];
    expect(calledParams.ownerId).toBe("user_C");
    expect(calledParams.sources).toEqual(["curated", "imported"]);
    expect(calledParams.limit).toBe(5);
  });
});
