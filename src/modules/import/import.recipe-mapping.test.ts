/**
 * Testes de shape (função pura, sem I/O) para import.recipe-mapping.ts.
 * Cobre EXT-01/EXT-03/EXT-04: mapExtractedToRecipe deve produzir o input
 * EXATO que persistExtractedRecipe espera, sem persistir nada.
 */
import { describe, expect, it } from "vitest";

import type { ConfidenceResult } from "./import.confidence.js";
import type { ExtractedImportedRecipe } from "./import.extraction.js";
import type { ImportJob } from "./import-job.types.js";
import { mapExtractedToRecipe } from "./import.recipe-mapping.js";

function extractedFixture(): ExtractedImportedRecipe {
  return {
    title: "Risoto de Carnaroli Cremoso",
    titleGrounding: "grounded",
    intro: "Um risoto cremoso e reconfortante.",
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
      {
        raw: "parmesão a gosto",
        name: "parmesão ralado",
        quantity: null,
        unit: "a gosto",
        core: false,
        quantityGrounding: "ambiguous",
      },
    ],
    steps: [
      {
        text: "Refogue a cebola no azeite até ficar transparente.",
        minutes: 5,
        grounding: "grounded",
      },
    ],
    nutrition: {
      calories: 450,
      protein: 12,
      carbs: 60,
      fat: 15,
    },
    sourceDivergence: [],
  };
}

function jobFixture(overrides: Partial<ImportJob> = {}): ImportJob {
  return {
    _id: "job1",
    userId: "user_1",
    sourceUrl: "https://www.youtube.com/watch?v=abc123",
    normalizedUrl: "https://www.youtube.com/watch?v=abc123",
    platform: "youtube",
    status: "extracting",
    keyframeUrl: "https://cdn.example.com/imports/job1/keyframe.jpg",
    sourceMeta: {
      authorHandle: "@chef",
      authorUrl: "https://www.youtube.com/@chef",
      durationSec: 60,
    },
    retryCount: 0,
    insertedAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function confidenceFixture(overrides: Partial<ConfidenceResult> = {}): ConfidenceResult {
  return {
    score: 0.85,
    reviewRequired: false,
    reasons: [],
    ...overrides,
  };
}

describe("mapExtractedToRecipe", () => {
  it("returns options with visibility private, importJobId, sourceMeta with platform, and grounding with nutrition inferred", () => {
    const { options } = mapExtractedToRecipe(
      extractedFixture(),
      jobFixture(),
      confidenceFixture(),
    );

    expect(options.source).toBe("imported");
    expect(options.visibility).toBe("private");
    expect(options.importJobId).toBe("job1");
    expect(options.sourceMeta).toEqual({
      platform: "youtube",
      authorHandle: "@chef",
      authorUrl: "https://www.youtube.com/@chef",
      sourceUrl: "https://www.youtube.com/watch?v=abc123",
    });
    expect(options.grounding?.nutrition).toBe("inferred");
    expect(options.grounding?.titleGrounding).toBe("grounded");
    expect(options.grounding?.sourceDivergence).toEqual([]);
  });

  it("carries confidenceScore and reviewRequired from the ConfidenceResult", () => {
    const { options } = mapExtractedToRecipe(
      extractedFixture(),
      jobFixture(),
      confidenceFixture({ score: 0.42, reviewRequired: true }),
    );

    expect(options.confidenceScore).toBe(0.42);
    expect(options.reviewRequired).toBe(true);
  });

  it("preserves an ambiguous (null-quantity) ingredient as-extracted", () => {
    const { extracted } = mapExtractedToRecipe(
      extractedFixture(),
      jobFixture(),
      confidenceFixture(),
    );

    const parmesao = extracted.ingredients.find((i) => i.name === "parmesão ralado");
    expect(parmesao).toBeDefined();
    expect(parmesao?.quantity).toBeNull();
    expect(parmesao?.unit).toBe("a gosto");
  });

  it("preserves raw/name/quantity/unit/core for every ingredient (EXT-03 — same shape the canonicalization loop consumes)", () => {
    const { extracted } = mapExtractedToRecipe(
      extractedFixture(),
      jobFixture(),
      confidenceFixture(),
    );

    expect(extracted.ingredients).toEqual([
      {
        raw: "2 xícaras de arroz carnaroli",
        name: "arroz carnaroli",
        quantity: 2,
        unit: "xícara",
        core: true,
      },
      {
        raw: "parmesão a gosto",
        name: "parmesão ralado",
        quantity: null,
        unit: "a gosto",
        core: false,
      },
    ]);
  });

  it("returns an IngestRecipeInput with the proposed title and keyframeUrl as thumbnailUrl", () => {
    const { input } = mapExtractedToRecipe(
      extractedFixture(),
      jobFixture(),
      confidenceFixture(),
    );

    expect(input.title).toBe("Risoto de Carnaroli Cremoso");
    expect(input.thumbnailUrl).toBe("https://cdn.example.com/imports/job1/keyframe.jpg");
  });

  it("omits sourceMeta authorHandle/authorUrl when absent on the job (no explicit undefined)", () => {
    const { options } = mapExtractedToRecipe(
      extractedFixture(),
      jobFixture({ sourceMeta: { durationSec: 60 } }),
      confidenceFixture(),
    );

    expect(options.sourceMeta).toEqual({
      platform: "youtube",
      sourceUrl: "https://www.youtube.com/watch?v=abc123",
    });
    expect(options.sourceMeta).not.toHaveProperty("authorHandle");
    expect(options.sourceMeta).not.toHaveProperty("authorUrl");
  });
});
