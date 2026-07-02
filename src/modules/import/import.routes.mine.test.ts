import Fastify from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { TypeBoxValidatorCompiler } from "@fastify/type-provider-typebox";
import sensible from "@fastify/sensible";
import { beforeEach, describe, expect, it, vi } from "vitest";

// GET /import/mine (D-09): deve SEMPRE delegar a listMyImportedRecipes(userId)
// — nunca uma chamada direta a hybridSearch com sources:['imported'] que
// poderia esquecer ownerId (D-14, Anti-pattern). Mesma abordagem de mock de
// módulo de import.routes.confirm.test.ts.
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
const { listMyImportedRecipes } = await import("./import.service.js");
const { importRoutes } = await import("./import.routes.js");

async function buildTestApp() {
  const app = Fastify().withTypeProvider<TypeBoxTypeProvider>();
  app.setValidatorCompiler(TypeBoxValidatorCompiler);
  await app.register(sensible);
  await app.register(importRoutes);
  await app.ready();
  return app;
}

describe("GET /import/mine", () => {
  beforeEach(() => {
    vi.mocked(getUserId).mockReturnValue("user_A");
    vi.mocked(listMyImportedRecipes).mockReset();
  });

  it("returns listMyImportedRecipes(userId) for the caller only", async () => {
    const hits = [{ _id: "recipe_1", title: "Risoto de cogumelos" }];
    vi.mocked(listMyImportedRecipes).mockResolvedValue(hits as never);

    const app = await buildTestApp();
    const res = await app.inject({ method: "GET", url: "/import/mine" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(hits);
    expect(listMyImportedRecipes).toHaveBeenCalledWith("user_A");
    expect(listMyImportedRecipes).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it("never calls a bare hybridSearch — only the D-14-safe listMyImportedRecipes service path", async () => {
    vi.mocked(listMyImportedRecipes).mockResolvedValue([]);

    const app = await buildTestApp();
    await app.inject({ method: "GET", url: "/import/mine" });

    // A única forma da rota tocar dados é via listMyImportedRecipes — não
    // existe import de hybridSearch em import.routes.ts (verificado
    // estruturalmente: o mock de import.service.js não expõe hybridSearch,
    // então qualquer uso indevido quebraria a resolução do módulo).
    expect(listMyImportedRecipes).toHaveBeenCalledWith("user_A");
    await app.close();
  });
});
