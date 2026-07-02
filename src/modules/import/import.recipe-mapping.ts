import type { ConfidenceResult } from "./import.confidence.js";
import type { ExtractedImportedRecipe } from "./import.extraction.js";
import type { ImportJob } from "./import-job.types.js";
import type {
  IngestOptions,
  IngestRecipeInput,
} from "@/modules/recipes/recipe.ingestion.js";
import type { ExtractedRecipe } from "@/modules/recipes/recipe.extraction.js";
import type { RecipeGrounding } from "@/modules/recipes/recipe.types.js";

/**
 * Mapeia uma extração de import (Plano 02) + o gate de confiança (Plano 04)
 * para o input EXATO que `persistExtractedRecipe` (Plano 01, em
 * recipe.ingestion.ts) espera — sem persistir nada aqui.
 *
 * NÃO reimplementa canonicalização/embedding (EXT-03) — o `recipe` retornado
 * é estruturalmente idêntico ao que `recipe.extraction.ts` produz para o
 * catálogo, então entra no MESMO loop de `resolveCanonicalForIngestion` +
 * `embedDocuments` já existente em `persistExtractedRecipe`, sem lógica
 * paralela.
 */
export function mapExtractedToRecipe(
  extracted: ExtractedImportedRecipe,
  job: ImportJob,
  confidence: ConfidenceResult,
): { input: IngestRecipeInput; extracted: ExtractedRecipe; options: IngestOptions } {
  // Recipe "extraída" no formato do catálogo (ExtractedRecipe) — mesmos
  // campos, sem title/titleGrounding/quantityGrounding/grounding por passo
  // (esses vivem em `input.title` e no blob `grounding` de IngestOptions).
  const recipeExtracted: ExtractedRecipe = {
    intro: extracted.intro,
    country: extracted.country,
    occasions: extracted.occasions,
    equipment: extracted.equipment,
    ingredients: extracted.ingredients.map((ing) => ({
      raw: ing.raw,
      name: ing.name,
      quantity: ing.quantity,
      unit: ing.unit,
      core: ing.core,
    })),
    steps: extracted.steps.map((s) => ({ text: s.text, minutes: s.minutes })),
    nutrition: extracted.nutrition,
  };

  const input: IngestRecipeInput = {
    title: extracted.title,
    rawIngredients: extracted.ingredients.map((ing) => ing.raw),
    steps: extracted.steps.map((s) => s.text),
    thumbnailUrl: job.keyframeUrl ?? "",
    servings: 1,
  };

  // Grounding como arrays paralelos aos ingredients[]/steps[] (não Record: o
  // mongoat injeta additionalProperties:false, rejeitando chaves dinâmicas).
  const grounding: RecipeGrounding = {
    titleGrounding: extracted.titleGrounding,
    quantityGrounding: extracted.ingredients.map((ing) => ing.quantityGrounding),
    stepGrounding: extracted.steps.map((step) => step.grounding),
    nutrition: "inferred", // D-10 — nunca autorrelatado pelo modelo
    sourceDivergence: extracted.sourceDivergence,
  };

  const options: IngestOptions = {
    source: "imported",
    visibility: "private",
    ...(job._id && { importJobId: String(job._id) }),
    sourceMeta: {
      platform: job.platform,
      ...(job.sourceMeta?.authorHandle !== undefined && {
        authorHandle: job.sourceMeta.authorHandle,
      }),
      ...(job.sourceMeta?.authorUrl !== undefined && {
        authorUrl: job.sourceMeta.authorUrl,
      }),
      sourceUrl: job.normalizedUrl,
    },
    grounding,
    confidenceScore: confidence.score,
    reviewRequired: confidence.reviewRequired,
  };

  return { input, extracted: recipeExtracted, options };
}
