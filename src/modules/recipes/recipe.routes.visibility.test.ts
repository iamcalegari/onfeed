import Fastify from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { TypeBoxValidatorCompiler } from "@fastify/type-provider-typebox";
import sensible from "@fastify/sensible";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Testa GET /recipes/:id (guard de visibilidade, T-03-05/T-03-06) contra
// getUserId/getRecipeById mockados (sem Mongo real), exercitando a rota
// Fastify real via `inject` — mesmo estilo HTTP-level de
// import.routes.confirm.test.ts. Todo o restante do módulo recipe.routes.ts
// (Anthropic SDK, fila SQS, billing, usage, tradução) é mockado só para não
// arrastar infra real para a suite rápida — nenhuma dessas rotas é exercida
// aqui.
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
  getVariantCount: vi.fn(),
  getVariantsByParentId: vi.fn(),
  rejectVariant: vi.fn(),
  setThumbnail: vi.fn(),
  setTranslation: vi.fn(),
}));

const { getUserId } = await import("@/modules/auth/auth.guard.js");
const { getRecipeById } = await import("./recipe.repository.js");
const { recipeRoutes } = await import("./recipe.routes.js");

async function buildTestApp() {
  const app = Fastify().withTypeProvider<TypeBoxTypeProvider>();
  app.setValidatorCompiler(TypeBoxValidatorCompiler);
  await app.register(sensible);
  await app.register(recipeRoutes);
  await app.ready();
  return app;
}

const PUBLIC_RECIPE = {
  _id: "recipe_public",
  title: "Bolo de cenoura",
  visibility: "catalog",
  intro: "Um bolo clássico.",
  steps: [{ text: "Asse por 40 minutos." }],
  ingredients: [{ name: "cenoura" }],
};

describe("GET /recipes/:id — visibility guard (T-03-05/T-03-06)", () => {
  beforeEach(() => {
    vi.mocked(getUserId).mockReset();
    vi.mocked(getRecipeById).mockReset();
  });

  it("anonymous GET on a public recipe returns 200 (no login regression)", async () => {
    vi.mocked(getUserId).mockReturnValue(null);
    vi.mocked(getRecipeById).mockResolvedValue(PUBLIC_RECIPE as never);

    const app = await buildTestApp();
    const res = await app.inject({ method: "GET", url: "/recipes/recipe_public" });

    expect(res.statusCode).toBe(200);
    expect(getRecipeById).toHaveBeenCalledWith("recipe_public", null);
    await app.close();
  });

  it("anonymous GET on a private import returns 404 (no existence leak)", async () => {
    vi.mocked(getUserId).mockReturnValue(null);
    // getRecipeById já resolve null internamente para caller anônimo numa
    // receita privada — o mock aqui simula esse retorno.
    vi.mocked(getRecipeById).mockResolvedValue(null);

    const app = await buildTestApp();
    const res = await app.inject({ method: "GET", url: "/recipes/recipe_private" });

    expect(res.statusCode).toBe(404);
    expect(getRecipeById).toHaveBeenCalledWith("recipe_private", null);
    await app.close();
  });

  it("owner GET on their own private import returns 200", async () => {
    vi.mocked(getUserId).mockReturnValue("user_A");
    vi.mocked(getRecipeById).mockResolvedValue({
      _id: "recipe_private",
      title: "Risoto (a revisar)",
      visibility: "private",
      importJobId: "job_1",
      intro: "Risoto extraído do vídeo.",
      steps: [{ text: "Refogue o arroz." }],
      ingredients: [{ name: "arroz arbóreo" }],
    } as never);

    const app = await buildTestApp();
    const res = await app.inject({ method: "GET", url: "/recipes/recipe_private" });

    expect(res.statusCode).toBe(200);
    expect(getRecipeById).toHaveBeenCalledWith("recipe_private", "user_A");
    await app.close();
  });

  it("other-user GET on someone else's private import returns 404 (same shape as anonymous)", async () => {
    vi.mocked(getUserId).mockReturnValue("user_B");
    // getRecipeById já resolve null para não-dono (ownership via
    // importJobId → ImportJob.userId não bate) — o mock simula o retorno.
    vi.mocked(getRecipeById).mockResolvedValue(null);

    const app = await buildTestApp();
    const res = await app.inject({ method: "GET", url: "/recipes/recipe_private" });

    expect(res.statusCode).toBe(404);
    expect(getRecipeById).toHaveBeenCalledWith("recipe_private", "user_B");
    await app.close();
  });

  it("lang=en overlay still applies for a public recipe with an existing translation", async () => {
    vi.mocked(getUserId).mockReturnValue(null);
    vi.mocked(getRecipeById).mockResolvedValue({
      ...PUBLIC_RECIPE,
      introEn: "A classic carrot cake.",
      steps: [{ text: "Asse por 40 minutos.", textEn: "Bake for 40 minutes." }],
      ingredients: [{ name: "cenoura", nameEn: "carrot" }],
    } as never);

    const app = await buildTestApp();
    const res = await app.inject({
      method: "GET",
      url: "/recipes/recipe_public?lang=en",
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().intro).toBe("A classic carrot cake.");
    expect(res.json().ingredients[0].name).toBe("carrot");
    await app.close();
  });
});
