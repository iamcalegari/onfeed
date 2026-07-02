import Fastify from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { TypeBoxValidatorCompiler } from "@fastify/type-provider-typebox";
import sensible from "@fastify/sensible";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Testa GET /recipes/share/:token (Fase 5, D-01/D-03, T-05-09/T-05-10) contra
// getRecipeByShareSlug/getUserId/getLikeCount/getUserLiked mockados (sem Mongo
// real), exercitando a rota Fastify real via `inject` — mesmo estilo HTTP-level
// de recipe.routes.visibility.test.ts / import.routes.confirm.test.ts. Todo o
// restante do módulo recipe.routes.ts (Anthropic SDK, fila SQS, billing, usage,
// tradução) é mockado só para não arrastar infra real para a suite rápida —
// nenhuma dessas rotas é exercida aqui.
vi.mock("@/config/env.js", () => ({
  env: { sqs: { enabled: false } },
}));

vi.mock("@/infra/images/image.service.js", () => ({
  createUploadUrl: vi.fn(),
  ensureThumbnail: vi.fn(),
}));

vi.mock("@/infra/queue/ingest-queue.js", () => ({
  enqueueIngestJob: vi.fn(),
}));

vi.mock("@/modules/auth/auth.guard.js", () => ({
  getUserId: vi.fn(() => null),
  requireAuth: vi.fn(async () => {}),
}));

vi.mock("@/modules/billing/entitlement.repository.js", () => ({
  isProUser: vi.fn(),
}));

vi.mock("@/modules/likes/like.repository.js", () => ({
  getLikeCount: vi.fn(),
  getUserLiked: vi.fn(),
}));

vi.mock("@/modules/usage/usage.repository.js", () => ({
  consumeDailyAdaptQuota: vi.fn(),
}));

vi.mock("./recipe.generation.js", () => ({
  adaptRecipe: vi.fn(),
}));

vi.mock("./recipe.translation.js", () => ({
  translateRecipeToEnglish: vi.fn(),
}));

vi.mock("./recipe.repository.js", () => ({
  getRecipeById: vi.fn(),
  getRecipeByShareSlug: vi.fn(),
  getVariantCount: vi.fn(),
  getVariantsByParentId: vi.fn(),
  rejectVariant: vi.fn(),
  setThumbnail: vi.fn(),
  setTranslation: vi.fn(),
}));

const { getUserId } = await import("@/modules/auth/auth.guard.js");
const { getLikeCount, getUserLiked } = await import("@/modules/likes/like.repository.js");
const { getRecipeByShareSlug } = await import("./recipe.repository.js");
const { recipeRoutes } = await import("./recipe.routes.js");

async function buildTestApp() {
  const app = Fastify().withTypeProvider<TypeBoxTypeProvider>();
  app.setValidatorCompiler(TypeBoxValidatorCompiler);
  await app.register(sensible);
  await app.register(recipeRoutes);
  await app.ready();
  return app;
}

const SHARED_RECIPE = {
  _id: "recipe_shared",
  title: "Risoto de cogumelos",
  visibility: "private",
  shareSlug: "abc123XYZ_-token",
  intro: "Um risoto cremoso.",
  steps: [{ text: "Refogue o arroz." }],
  ingredients: [{ name: "arroz arbóreo" }],
};

describe("GET /recipes/share/:token (Fase 5, D-01/D-03) — rota pública por token", () => {
  beforeEach(() => {
    vi.mocked(getUserId).mockReset().mockReturnValue(null);
    vi.mocked(getRecipeByShareSlug).mockReset();
    vi.mocked(getLikeCount).mockReset().mockResolvedValue(0);
    vi.mocked(getUserLiked).mockReset().mockResolvedValue(false);
  });

  it("anônimo (sem sessão) resolve o token e recebe 200 — rota NÃO exige requireAuth (D-01)", async () => {
    vi.mocked(getRecipeByShareSlug).mockResolvedValue(SHARED_RECIPE as never);

    const app = await buildTestApp();
    const res = await app.inject({
      method: "GET",
      url: "/recipes/share/abc123XYZ_-token",
    });

    expect(res.statusCode).toBe(200);
    expect(getRecipeByShareSlug).toHaveBeenCalledWith("abc123XYZ_-token");
    expect(res.json().recipe).toMatchObject({ _id: "recipe_shared", shareSlug: "abc123XYZ_-token" });
    // visibility exposta para o front aplicar o redirect canônico (D-12).
    expect(res.json().recipe.visibility).toBe("private");
    await app.close();
  });

  it("token desconhecido retorna 404 (T-05-09, no existence leak)", async () => {
    vi.mocked(getRecipeByShareSlug).mockResolvedValue(null);

    const app = await buildTestApp();
    const res = await app.inject({
      method: "GET",
      url: "/recipes/share/token-que-nao-existe",
    });

    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it("token de uma receita já deletada resolve null e também 404 — indistinguível de um token nunca existente (T-05-09)", async () => {
    vi.mocked(getRecipeByShareSlug).mockResolvedValue(null);

    const appMissing = await buildTestApp();
    const resMissing = await appMissing.inject({
      method: "GET",
      url: "/recipes/share/token-nunca-existiu",
    });
    await appMissing.close();

    const appDeleted = await buildTestApp();
    const resDeleted = await appDeleted.inject({
      method: "GET",
      url: "/recipes/share/token-de-receita-deletada",
    });
    await appDeleted.close();

    expect(resMissing.statusCode).toBe(resDeleted.statusCode);
    expect(resMissing.json()).toEqual(resDeleted.json());
  });

  it("um _id de receita privada NÃO-compartilhada usado como :token nunca resolve (IDOR-safety, T-05-10) — a rota jamais busca por objectId", async () => {
    // Simula o comportamento real: getRecipeByShareSlug SEMPRE filtra por
    // shareSlug, nunca por _id — um objectId tentado como token não bate
    // com nenhum shareSlug real, então resolve null (via o mock, como o
    // Mongo real faria).
    vi.mocked(getRecipeByShareSlug).mockResolvedValue(null);

    const app = await buildTestApp();
    const res = await app.inject({
      method: "GET",
      url: "/recipes/share/507f1f77bcf86cd799439011",
    });

    expect(res.statusCode).toBe(404);
    expect(getRecipeByShareSlug).toHaveBeenCalledWith("507f1f77bcf86cd799439011");
    await app.close();
  });

  it("com sessão presente, inclui like state (liked=true) sem exigir requireAuth para a leitura", async () => {
    vi.mocked(getUserId).mockReturnValue("user_A");
    vi.mocked(getRecipeByShareSlug).mockResolvedValue(SHARED_RECIPE as never);
    vi.mocked(getLikeCount).mockResolvedValue(7);
    vi.mocked(getUserLiked).mockResolvedValue(true);

    const app = await buildTestApp();
    const res = await app.inject({
      method: "GET",
      url: "/recipes/share/abc123XYZ_-token",
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().likes).toEqual({ count: 7, liked: true });
    expect(getUserLiked).toHaveBeenCalledWith("user_A", "recipe_shared");
    await app.close();
  });

  it("sem sessão, like state vem com liked=false e getUserLiked não é chamado", async () => {
    vi.mocked(getUserId).mockReturnValue(null);
    vi.mocked(getRecipeByShareSlug).mockResolvedValue(SHARED_RECIPE as never);
    vi.mocked(getLikeCount).mockResolvedValue(3);

    const app = await buildTestApp();
    const res = await app.inject({
      method: "GET",
      url: "/recipes/share/abc123XYZ_-token",
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().likes).toEqual({ count: 3, liked: false });
    expect(getUserLiked).not.toHaveBeenCalled();
    await app.close();
  });
});
