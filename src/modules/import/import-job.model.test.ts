import { describe, expect, it } from "vitest";

import type { ImportJob } from "./import-job.types.js";

// Guarda de shape/tipo (não exercita o validator BSON — isso requer Mongo real,
// coberto pela confirmação manual de `npm run setup:db` documentada no SUMMARY).
// Objetivo: (a) o shape nested completo de costCents é atribuível a ImportJob;
// (b) costCents ausente (docs anteriores à Fase 4) nunca derruba uma leitura —
// todo acesso é optional-chained.
describe("import-job.model — shape de costCents (COST-02)", () => {
  const baseJob: Omit<ImportJob, "costCents"> = {
    userId: "user_1",
    sourceUrl: "https://www.instagram.com/reel/abc123/",
    normalizedUrl: "https://www.instagram.com/reel/abc123/",
    platform: "instagram",
    status: "ready_for_review",
    retryCount: 0,
    insertedAt: new Date(),
    updatedAt: new Date(),
  };

  it("aceita o shape nested completo de costCents (download/transcription/extraction/embedding/totalCents)", () => {
    const job: ImportJob = {
      ...baseJob,
      costCents: {
        download: { bytes: 5_242_880, cents: 2 },
        transcription: { minutes: 1.5, cents: 3 },
        extraction: { inputTokens: 1200, outputTokens: 400, cents: 8 },
        embedding: { tokens: 300, cents: 1 },
        totalCents: 14,
      },
    };

    expect(job.costCents?.download?.bytes).toBe(5_242_880);
    expect(job.costCents?.download?.cents).toBe(2);
    expect(job.costCents?.transcription?.minutes).toBe(1.5);
    expect(job.costCents?.extraction?.inputTokens).toBe(1200);
    expect(job.costCents?.extraction?.outputTokens).toBe(400);
    expect(job.costCents?.embedding?.tokens).toBe(300);
    expect(job.costCents?.totalCents).toBe(14);
  });

  it("lê costCents ausente (docs pré-Fase-4) como undefined via optional chaining, sem lançar erro", () => {
    const job: ImportJob = { ...baseJob };

    expect(() => job.costCents?.download?.cents).not.toThrow();
    expect(job.costCents?.download?.cents).toBeUndefined();
    expect(job.costCents?.transcription?.minutes).toBeUndefined();
    expect(job.costCents?.extraction?.inputTokens).toBeUndefined();
    expect(job.costCents?.embedding?.tokens).toBeUndefined();
    expect(job.costCents?.totalCents).toBeUndefined();
  });
});
