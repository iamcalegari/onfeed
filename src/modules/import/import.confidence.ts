import type { ExtractedImportedRecipe } from "./import.extraction.js";

/**
 * Gate puro de confiança/revisão (Fase 2, Plano 04) — EXT-02/EXT-05.
 *
 * Transforma o grounding por-campo produzido por `import.extraction.ts`
 * (Plano 02) num `confidenceScore` agregado + um `reviewRequired` booleano.
 * É estruturalmente impossível uma extração de baixa confiança (ou insegura)
 * pular a revisão (EXT-05): mesmo que o modelo se autoavalie "grounded" em
 * tudo, os overrides abaixo (campo crítico inferred, sem fala detectada,
 * score baixo, divergência de fontes) forçam `reviewRequired=true` de forma
 * independente do autograding do LLM (T-04-01/T-04-02 do threat_model).
 *
 * Função PURA: sem I/O, sem chamada a LLM, sem DB — só matemática sobre o
 * shape já validado por `ImportedRecipeSchema`.
 *
 * Nutrição (D-10) NÃO entra na lista de campos ponderados: ela é sempre
 * estimada pelo modelo (nunca tem grounding próprio no schema), então
 * tratá-la como "inferred" não adicionaria sinal — apenas puxaria o score
 * para baixo de forma previsível em toda extração. Ela não gate por si só.
 */

type GroundingLevel = "grounded" | "inferred" | "ambiguous";

export interface ConfidenceResult {
  score: number;
  reviewRequired: boolean;
  reasons: string[];
}

const GROUNDING_WEIGHT: Record<GroundingLevel, number> = {
  grounded: 1,
  ambiguous: 0.5,
  inferred: 0,
};

const CRITICAL_FIELD_WEIGHT = 2;
const NORMAL_FIELD_WEIGHT = 1;

/** Abaixo deste score agregado, a extração é roteada para revisão (D-03). */
export const REVIEW_SCORE_THRESHOLD = 0.6;

interface WeightedField {
  grounding: GroundingLevel;
  weight: number;
}

export function computeConfidence(
  recipe: ExtractedImportedRecipe,
  opts: { noSpeechDetected: boolean },
): ConfidenceResult {
  const fields: WeightedField[] = [
    { grounding: recipe.titleGrounding, weight: CRITICAL_FIELD_WEIGHT },
    ...recipe.ingredients.map((ingredient) => ({
      grounding: ingredient.quantityGrounding,
      weight: ingredient.core ? CRITICAL_FIELD_WEIGHT : NORMAL_FIELD_WEIGHT,
    })),
    ...recipe.steps.map((step) => ({
      grounding: step.grounding,
      weight: NORMAL_FIELD_WEIGHT,
    })),
  ];

  const totalWeight = fields.reduce((sum, field) => sum + field.weight, 0);
  const weightedSum = fields.reduce(
    (sum, field) => sum + field.weight * GROUNDING_WEIGHT[field.grounding],
    0,
  );
  const score = totalWeight > 0 ? weightedSum / totalWeight : 0;

  const criticalInferred =
    recipe.titleGrounding === "inferred" ||
    recipe.ingredients.some(
      (ingredient) =>
        ingredient.core && ingredient.quantityGrounding === "inferred",
    );

  const hasSourceDivergence = (recipe.sourceDivergence?.length ?? 0) > 0;

  const reasons: string[] = [];
  if (criticalInferred) reasons.push("critical field inferred");
  if (opts.noSpeechDetected) reasons.push("no speech in source");
  if (score < REVIEW_SCORE_THRESHOLD) reasons.push("low aggregate confidence");
  if (hasSourceDivergence) reasons.push("source divergence");

  const reviewRequired =
    criticalInferred ||
    opts.noSpeechDetected ||
    score < REVIEW_SCORE_THRESHOLD ||
    hasSourceDivergence;

  return { score, reviewRequired, reasons };
}
