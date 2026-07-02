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

// listImportedRecipesByOwner: espiona a delegação de listMyImportedRecipes sem
// tocar Mongo/Atlas real. "Minhas importações" (D-09) é FILTRO PURO owner-scoped
// (não hybridSearch/$vectorSearch — um queryVector vazio dava 500 no Atlas).
// getRecipeById: usado por confirmImportedRecipe.
const listImportedRecipesByOwnerMock = vi.fn().mockResolvedValue([]);
vi.mock("@/modules/recipes/recipe.repository.js", () => ({
  listImportedRecipesByOwner: (...args: unknown[]) => listImportedRecipesByOwnerMock(...args),
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
    ["https://vt.tiktok.com/ZSabc123/", "tiktok"],
    ["https://m.tiktok.com/v/123456789.html", "tiktok"],
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

  it("returns null for a lookalike do domínio curto do TikTok (allowlist estrita)", () => {
    expect(detectPlatform("https://vt-tiktok.com/ZSabc123/")).toBeNull();
    expect(detectPlatform("https://vt.tiktok.com.evil.com/ZSabc123/")).toBeNull();
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

describe("listMyImportedRecipes (D-09 'Minhas importações' — filtro puro owner-scoped)", () => {
  beforeEach(() => {
    listImportedRecipesByOwnerMock.mockClear();
  });

  it("delega a listImportedRecipesByOwner com o userId do caller (owner-scoped, sem hybridSearch)", async () => {
    await listMyImportedRecipes("user_A");

    expect(listImportedRecipesByOwnerMock).toHaveBeenCalledTimes(1);
    const [calledUserId] = listImportedRecipesByOwnerMock.mock.calls[0] as [string, number?];
    expect(calledUserId).toBe("user_A");
  });

  it("nunca passa o userId de outro caller — o escopo de dono é o único argumento de identidade", async () => {
    await listMyImportedRecipes("user_B");

    for (const call of listImportedRecipesByOwnerMock.mock.calls) {
      expect(call[0]).toBe("user_B");
    }
  });

  it("repassa o limit opcional quando fornecido", async () => {
    await listMyImportedRecipes("user_C", { limit: 5 });

    const [calledUserId, calledLimit] = listImportedRecipesByOwnerMock.mock.calls[0] as [
      string,
      number?,
    ];
    expect(calledUserId).toBe("user_C");
    expect(calledLimit).toBe(5);
  });

  it("retorna exatamente o que o repositório devolve (wrapper fino)", async () => {
    const hits = [{ _id: "r1", title: "Risoto" }];
    listImportedRecipesByOwnerMock.mockResolvedValueOnce(hits);

    await expect(listMyImportedRecipes("user_D")).resolves.toBe(hits);
  });
});
