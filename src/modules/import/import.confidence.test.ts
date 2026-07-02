/**
 * Testes rápidos (função pura, sem mocks) para import.confidence.ts.
 * Cobre EXT-02 (score agregado) e EXT-05 (revisão obrigatória estrutural).
 */
import { describe, expect, it } from "vitest";

import type { ExtractedImportedRecipe } from "./import.extraction.js";
import { computeConfidence, REVIEW_SCORE_THRESHOLD } from "./import.confidence.js";

function cleanRecipeFixture(): ExtractedImportedRecipe {
  return {
    title: "Risoto de Carnaroli Cremoso",
    titleGrounding: "grounded",
    intro: "Um risoto cremoso e reconfortante, perfeito para o inverno.",
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
        raw: "parmesão ralado a gosto",
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
      {
        text: "Adicione o arroz e o caldo aos poucos, mexendo sempre.",
        minutes: 20,
        grounding: "grounded",
      },
    ],
    nutrition: {
      calories: 420,
      protein: 12,
      carbs: 55,
      fat: 14,
    },
    sourceDivergence: [],
  };
}

describe("computeConfidence", () => {
  it("clean, well-grounded recipe yields reviewRequired=false and score above threshold (EXT-02)", () => {
    const result = computeConfidence(cleanRecipeFixture(), {
      noSpeechDetected: false,
    });

    expect(result.reviewRequired).toBe(false);
    expect(result.score).toBeGreaterThan(REVIEW_SCORE_THRESHOLD);
    expect(result.reasons).toEqual([]);
  });

  it("title grounding 'inferred' forces reviewRequired=true regardless of an otherwise-high score (EXT-05)", () => {
    const recipe = cleanRecipeFixture();
    recipe.titleGrounding = "inferred";

    const result = computeConfidence(recipe, { noSpeechDetected: false });

    expect(result.reviewRequired).toBe(true);
    expect(result.reasons).toContain("critical field inferred");
  });

  it("a core ingredient with quantityGrounding 'inferred' forces reviewRequired=true (EXT-05)", () => {
    const recipe = cleanRecipeFixture();
    const coreIngredient = recipe.ingredients.find((i) => i.core);
    expect(coreIngredient).toBeDefined();
    if (coreIngredient) coreIngredient.quantityGrounding = "inferred";

    const result = computeConfidence(recipe, { noSpeechDetected: false });

    expect(result.reviewRequired).toBe(true);
    expect(result.reasons).toContain("critical field inferred");
  });

  it("a non-core ingredient inferred does NOT alone force reviewRequired via the critical-field path", () => {
    const recipe = cleanRecipeFixture();
    const nonCoreIngredient = recipe.ingredients.find((i) => !i.core);
    expect(nonCoreIngredient).toBeDefined();
    if (nonCoreIngredient) nonCoreIngredient.quantityGrounding = "inferred";

    const result = computeConfidence(recipe, { noSpeechDetected: false });

    expect(result.reasons).not.toContain("critical field inferred");
  });

  it("noSpeechDetected=true forces reviewRequired=true even on an otherwise clean recipe (Pitfall 5)", () => {
    const result = computeConfidence(cleanRecipeFixture(), {
      noSpeechDetected: true,
    });

    expect(result.reviewRequired).toBe(true);
    expect(result.reasons).toContain("no speech in source");
  });

  it("non-empty sourceDivergence forces reviewRequired=true (D-08)", () => {
    const recipe = cleanRecipeFixture();
    recipe.sourceDivergence = [
      "quantidade de ovos: transcrição diz 2, legenda diz 3",
    ];

    const result = computeConfidence(recipe, { noSpeechDetected: false });

    expect(result.reviewRequired).toBe(true);
    expect(result.reasons).toContain("source divergence");
  });

  it("aggregate score reflects a known grounded/inferred/ambiguous mix within tolerance (EXT-02)", () => {
    // title: grounded, weight 2 -> 2*1=2
    // ingredient core: inferred, weight 2 -> 2*0=0
    // ingredient non-core: ambiguous, weight 1 -> 1*0.5=0.5
    // step: grounded, weight 1 -> 1*1=1
    // total weight = 2+2+1+1 = 6; weighted sum = 2+0+0.5+1 = 3.5
    // expected score = 3.5/6 = 0.58333...
    const recipe: ExtractedImportedRecipe = {
      title: "Bolo Simples",
      titleGrounding: "grounded",
      intro: "Um bolo simples de fazer.",
      country: "BR",
      occasions: ["dessert"],
      equipment: ["oven"],
      ingredients: [
        {
          raw: "2 xícaras de farinha",
          name: "farinha de trigo",
          quantity: 2,
          unit: "xícara",
          core: true,
          quantityGrounding: "inferred",
        },
        {
          raw: "canela a gosto",
          name: "canela",
          quantity: null,
          unit: "a gosto",
          core: false,
          quantityGrounding: "ambiguous",
        },
      ],
      steps: [
        {
          text: "Misture os ingredientes secos.",
          minutes: 5,
          grounding: "grounded",
        },
      ],
      nutrition: null,
      sourceDivergence: [],
    };

    const result = computeConfidence(recipe, { noSpeechDetected: false });

    expect(result.score).toBeCloseTo(3.5 / 6, 5);
    // score (0.5833) is below REVIEW_SCORE_THRESHOLD (0.6), and the core
    // ingredient is inferred, so both reasons should fire.
    expect(result.reviewRequired).toBe(true);
    expect(result.reasons).toContain("critical field inferred");
    expect(result.reasons).toContain("low aggregate confidence");
  });
});
