import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

import {
  anthropic,
  effortOption,
  EXTRACTION_MODEL,
} from "@/infra/llm/anthropic.client.js";
import type { Recipe, RecipeIngredient, RecipeStep } from "./recipe.types.js";

const TranslationSchema = z.object({
  intro: z.string(),
  steps: z.array(z.object({ text: z.string() })),
  ingredients: z.array(z.object({ name: z.string() })),
});

const TRANSLATION_FORMAT = zodOutputFormat(TranslationSchema);

const TRANSLATION_SYSTEM = `Translate the given recipe fields from Brazilian Portuguese to English.
Rules:
- Preserve the EXACT same order and count for steps and ingredients arrays.
- Ingredient names must use standard English culinary terms (singular, generic).
- Steps should be clear and natural in English.
- Intro should be appetizing and concise.`;

/**
 * Traduz intro, passos e nomes de ingredientes de uma receita para inglês.
 * Retorna os arrays com os campos *En preenchidos, prontos para `$set` no DB.
 */
export async function translateRecipeToEnglish(recipe: Recipe): Promise<{
  introEn: string;
  steps: RecipeStep[];
  ingredients: RecipeIngredient[];
}> {
  const input = JSON.stringify({
    intro: recipe.intro,
    steps: recipe.steps.map((s) => ({ text: s.text })),
    ingredients: recipe.ingredients.map((i) => ({ name: i.name })),
  });

  const res = await anthropic.messages.parse({
    model: EXTRACTION_MODEL,
    max_tokens: 2000,
    output_config: { format: TRANSLATION_FORMAT, ...effortOption("low") },
    system: TRANSLATION_SYSTEM,
    messages: [{ role: "user", content: input }],
  });

  if (!res.parsed_output) {
    throw new Error(`Tradução falhou para "${recipe.title}"`);
  }

  const out = res.parsed_output;

  const steps: RecipeStep[] = recipe.steps.map((s, i) => ({
    ...s,
    textEn: out.steps[i]?.text ?? s.text,
  }));

  const ingredients: RecipeIngredient[] = recipe.ingredients.map((ing, i) => ({
    ...ing,
    nameEn: out.ingredients[i]?.name ?? ing.name,
  }));

  return { introEn: out.intro, steps, ingredients };
}
