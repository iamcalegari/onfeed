import Fastify from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { TypeBoxValidatorCompiler } from "@fastify/type-provider-typebox";
import sensible from "@fastify/sensible";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Testa o gate de quota (COST-01, COST-03, D-07) de POST /import contra
// isProUser/consumeDailyImportQuota mockados. Foco: reserva-na-submissão
// (antes do enqueue), o bloqueio espelha reply.tooManyRequests do gate de
// adapt (D-04) com upsell PRO para free / mensagem genérica para PRO, e um
// HIT de dedup nunca consome cota (D-07).
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
  consumeDailyImportQuota: vi.fn(),
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
const { isProUser } = await import("@/modules/billing/entitlement.repository.js");
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

describe("POST /import — quota gate (COST-01/COST-03, D-07)", () => {
  beforeEach(() => {
    vi.mocked(findExistingSuccessfulImport).mockReset();
    vi.mocked(findExistingSuccessfulImport).mockResolvedValue(null);
    vi.mocked(createImportJob).mockReset();
    vi.mocked(createImportJob).mockResolvedValue({ _id: "job_1" } as never);
    vi.mocked(enqueueImportJob).mockReset();
    vi.mocked(isProUser).mockReset();
    vi.mocked(consumeDailyImportQuota).mockReset();
  });

  it("reserve-at-submission — on a dedup MISS, consumeDailyImportQuota is called BEFORE enqueueImportJob", async () => {
    vi.mocked(isProUser).mockResolvedValue(false);
    const callOrder: string[] = [];
    vi.mocked(consumeDailyImportQuota).mockImplementation(async () => {
      callOrder.push("quota");
      return { allowed: true, count: 1, limit: 3 };
    });
    vi.mocked(enqueueImportJob).mockImplementation(async () => {
      callOrder.push("enqueue");
    });

    const app = await buildTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/import",
      payload: { url: SOURCE_URL },
    });

    expect(res.statusCode).toBe(202);
    expect(callOrder).toEqual(["quota", "enqueue"]);
    await app.close();
  });

  it.each([
    {
      label: "free user over limit gets 429 with PRO upsell",
      pro: false,
      quota: { allowed: false, count: 4, limit: 3 },
      expectedSnippet: "onFeed Pro",
    },
    {
      label: "PRO user over the PRO ceiling gets the generic daily-limit message",
      pro: true,
      quota: { allowed: false, count: 51, limit: 50 },
      expectedSnippet: "Tente amanhã",
    },
  ])("$label", async ({ pro, quota, expectedSnippet }) => {
    vi.mocked(isProUser).mockResolvedValue(pro);
    vi.mocked(consumeDailyImportQuota).mockResolvedValue(quota);

    const app = await buildTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/import",
      payload: { url: SOURCE_URL },
    });

    expect(res.statusCode).toBe(429);
    expect(res.json().message).toContain(expectedSnippet);
    expect(enqueueImportJob).not.toHaveBeenCalled();
    expect(createImportJob).not.toHaveBeenCalled();
    await app.close();
  });

  it("dedup HIT does NOT call consumeDailyImportQuota (D-07)", async () => {
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
    expect(consumeDailyImportQuota).not.toHaveBeenCalled();
    expect(isProUser).not.toHaveBeenCalled();
    await app.close();
  });
});
