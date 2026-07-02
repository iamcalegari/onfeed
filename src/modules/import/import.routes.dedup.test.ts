import Fastify from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { TypeBoxValidatorCompiler } from "@fastify/type-provider-typebox";
import sensible from "@fastify/sensible";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Testa o guard de dedup (CAP-03, D-07) de POST /import contra
// findExistingSuccessfulImport mockado — mesmo estilo de mock de módulo +
// `inject` de import.routes.confirm.test.ts. Foco: um HIT nunca enfileira e
// nunca consome cota (D-07); um MISS segue o fluxo normal até o enqueue.
vi.mock("@/config/env.js", () => ({
  env: { import: { dailyLimitFree: 3, dailyLimitPro: 50 } },
}));

vi.mock("@/modules/auth/auth.guard.js", () => ({
  getUserId: vi.fn(() => "user_A"),
  requireAuth: vi.fn(async () => {}),
}));

vi.mock("@/modules/billing/entitlement.repository.js", () => ({
  isProUser: vi.fn(async () => false),
}));

vi.mock("@/modules/usage/usage.repository.js", () => ({
  consumeDailyImportQuota: vi.fn(async () => ({ allowed: true, count: 1, limit: 3 })),
}));

vi.mock("./import-job.repository.js", () => ({
  createImportJob: vi.fn(),
  findExistingSuccessfulImport: vi.fn(),
  getImportJob: vi.fn(),
}));

vi.mock("./import.service.js", () => ({
  confirmImportedRecipe: vi.fn(),
  listMyImportedRecipes: vi.fn(),
  detectPlatform: vi.fn(() => "instagram"),
  enqueueImportJob: vi.fn(),
  normalizeUrl: vi.fn((url: string) => url),
}));

const { findExistingSuccessfulImport, createImportJob } = await import(
  "./import-job.repository.js"
);
const { enqueueImportJob } = await import("./import.service.js");
const { consumeDailyImportQuota } = await import("@/modules/usage/usage.repository.js");
const { importRoutes } = await import("./import.routes.js");

async function buildTestApp() {
  const app = Fastify().withTypeProvider<TypeBoxTypeProvider>();
  app.setValidatorCompiler(TypeBoxValidatorCompiler);
  await app.register(sensible);
  await app.register(importRoutes);
  await app.ready();
  return app;
}

const SOURCE_URL = "https://www.instagram.com/reel/abc123/";

describe("POST /import — dedup guard (CAP-03, D-07)", () => {
  beforeEach(() => {
    vi.mocked(findExistingSuccessfulImport).mockReset();
    vi.mocked(createImportJob).mockReset();
    vi.mocked(enqueueImportJob).mockReset();
    vi.mocked(consumeDailyImportQuota).mockReset();
    vi.mocked(consumeDailyImportQuota).mockResolvedValue({
      allowed: true,
      count: 1,
      limit: 3,
    });
  });

  it("HIT — dedup returns 200 { recipeId, deduped: true }, no enqueue, no quota consume", async () => {
    vi.mocked(findExistingSuccessfulImport).mockResolvedValue({
      recipeId: "r1",
    } as never);

    const app = await buildTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/import",
      payload: { url: SOURCE_URL },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ recipeId: "r1", deduped: true });
    expect(enqueueImportJob).not.toHaveBeenCalled();
    expect(createImportJob).not.toHaveBeenCalled();
    expect(consumeDailyImportQuota).not.toHaveBeenCalled();
    await app.close();
  });

  it("HIT — findExistingSuccessfulImport is called with userId + normalizedUrl (IDOR-safe idiom)", async () => {
    vi.mocked(findExistingSuccessfulImport).mockResolvedValue({
      recipeId: "r1",
    } as never);

    const app = await buildTestApp();
    await app.inject({
      method: "POST",
      url: "/import",
      payload: { url: SOURCE_URL },
    });

    expect(findExistingSuccessfulImport).toHaveBeenCalledWith("user_A", SOURCE_URL);
    await app.close();
  });

  it("MISS — falls through to enqueue (202 { jobId })", async () => {
    vi.mocked(findExistingSuccessfulImport).mockResolvedValue(null);
    vi.mocked(createImportJob).mockResolvedValue({ _id: "job_1" } as never);

    const app = await buildTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/import",
      payload: { url: SOURCE_URL },
    });

    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ jobId: "job_1" });
    expect(enqueueImportJob).toHaveBeenCalledWith("job_1");
    await app.close();
  });
});
