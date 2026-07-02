import Fastify from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { TypeBoxValidatorCompiler } from "@fastify/type-provider-typebox";
import sensible from "@fastify/sensible";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Testa a rota PATCH /import/:jobId/recipe contra getImportJob/confirmImportedRecipe
// mockados (sem Mongo real) — mesmo estilo de mock de módulo do Phase 1
// (import-job.repository.test.ts / import.service.test.ts), mas exercitando a
// rota Fastify real via `inject` para cobrir a validação de schema
// (additionalProperties:false) e os status codes de verdade.
vi.mock("@/modules/auth/auth.guard.js", () => ({
  getUserId: vi.fn(() => "user_A"),
  requireAuth: vi.fn(async () => {}),
}));

vi.mock("./import-job.repository.js", () => ({
  getImportJob: vi.fn(),
  createImportJob: vi.fn(),
}));

vi.mock("./import.service.js", () => ({
  confirmImportedRecipe: vi.fn(),
  listMyImportedRecipes: vi.fn(),
  detectPlatform: vi.fn(),
  enqueueImportJob: vi.fn(),
  normalizeUrl: vi.fn(),
}));

const { getUserId } = await import("@/modules/auth/auth.guard.js");
const { getImportJob } = await import("./import-job.repository.js");
const { confirmImportedRecipe } = await import("./import.service.js");
const { importRoutes } = await import("./import.routes.js");

async function buildTestApp() {
  const app = Fastify().withTypeProvider<TypeBoxTypeProvider>();
  app.setValidatorCompiler(TypeBoxValidatorCompiler);
  await app.register(sensible);
  await app.register(importRoutes);
  await app.ready();
  return app;
}

const VALID_EDIT_BODY = {
  title: "Risoto de cogumelos",
  intro: "Um risoto cremoso.",
  ingredients: [{ name: "arroz arbóreo", quantity: 300, unit: "g" }],
  steps: [{ text: "Refogue o arroz na manteiga." }],
};

const READY_JOB = {
  _id: "job_1",
  userId: "user_A",
  status: "ready_for_review" as const,
  recipeId: "recipe_1",
};

describe("PATCH /import/:jobId/recipe", () => {
  beforeEach(() => {
    vi.mocked(getUserId).mockReturnValue("user_A");
    vi.mocked(getImportJob).mockReset();
    vi.mocked(confirmImportedRecipe).mockReset();
  });

  it("confirm applies edits", async () => {
    vi.mocked(getImportJob).mockResolvedValue(READY_JOB as never);
    vi.mocked(confirmImportedRecipe).mockResolvedValue({ alreadyConfirmed: false });

    const app = await buildTestApp();
    const res = await app.inject({
      method: "PATCH",
      url: "/import/job_1/recipe",
      payload: VALID_EDIT_BODY,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ recipeId: "recipe_1" });
    expect(confirmImportedRecipe).toHaveBeenCalledWith(
      "recipe_1",
      "user_A",
      VALID_EDIT_BODY,
    );
    await app.close();
  });

  it.each([
    "queued",
    "downloading",
    "transcribing",
    "extracting",
    "failed",
  ])("not ready — status=%s returns 409, no write", async (status) => {
    vi.mocked(getImportJob).mockResolvedValue({ ...READY_JOB, status } as never);

    const app = await buildTestApp();
    const res = await app.inject({
      method: "PATCH",
      url: "/import/job_1/recipe",
      payload: VALID_EDIT_BODY,
    });

    expect(res.statusCode).toBe(409);
    expect(confirmImportedRecipe).not.toHaveBeenCalled();
    await app.close();
  });

  it("idempotent — second confirm on an already-confirmed recipe does not silently apply different data", async () => {
    vi.mocked(getImportJob).mockResolvedValue(READY_JOB as never);
    vi.mocked(confirmImportedRecipe).mockResolvedValue({ alreadyConfirmed: true });

    const app = await buildTestApp();
    const res = await app.inject({
      method: "PATCH",
      url: "/import/job_1/recipe",
      payload: VALID_EDIT_BODY,
    });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: "already_confirmed" });
    await app.close();
  });

  it.each([
    { ...VALID_EDIT_BODY, grounding: { titleGrounding: "grounded" } },
    { ...VALID_EDIT_BODY, reviewRequired: false },
    { ...VALID_EDIT_BODY, confidenceScore: 1 },
    { ...VALID_EDIT_BODY, canonicalId: "abc" },
    { ...VALID_EDIT_BODY, recipeId: "attacker_supplied" },
  ])("rejects protected fields — body with extra field is rejected (400), never persisted", async (body) => {
    vi.mocked(getImportJob).mockResolvedValue(READY_JOB as never);

    const app = await buildTestApp();
    const res = await app.inject({
      method: "PATCH",
      url: "/import/job_1/recipe",
      payload: body,
    });

    expect(res.statusCode).toBe(400);
    expect(confirmImportedRecipe).not.toHaveBeenCalled();
    await app.close();
  });

  it("owner scope — PATCH on another user's jobId returns 404, never edits", async () => {
    // getImportJob(jobId, userId) escopado — não-dono resolve null, mesmo
    // "não existe" de um job inexistente (IDOR-safe, T-03-01).
    vi.mocked(getImportJob).mockResolvedValue(null);

    const app = await buildTestApp();
    const res = await app.inject({
      method: "PATCH",
      url: "/import/other_users_job/recipe",
      payload: VALID_EDIT_BODY,
    });

    expect(res.statusCode).toBe(404);
    expect(confirmImportedRecipe).not.toHaveBeenCalled();
    expect(getImportJob).toHaveBeenCalledWith("other_users_job", "user_A");
    await app.close();
  });
});
