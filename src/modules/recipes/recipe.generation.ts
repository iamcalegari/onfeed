import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

import {
  anthropic,
  effortOption,
  EXTRACTION_MODEL,
} from "@/infra/llm/anthropic.client.js";
import { ExtractedRecipeSchema } from "./recipe.extraction.js";
import { persistExtractedRecipe } from "./recipe.ingestion.js";
import { getRecipeById } from "./recipe.repository.js";
import type {
  Equipment,
  NutritionGoal,
  Recipe,
} from "./recipe.types.js";

/** A receita adaptada tem a mesma forma da extração + um título próprio. */
const AdaptedRecipeSchema = ExtractedRecipeSchema.extend({
  title: z.string().describe("título da variação, deixando clara a adaptação"),
});

export interface AdaptConstraints {
  haveIds: string[]; // canonicalIds que o usuário tem
  availableEquipment?: Equipment[];
  maxPrepTimeMin?: number;
  goal?: NutritionGoal;
  note?: string;
  lang?: "pt" | "en";
  /** Quem disparou a adaptação — salvo nos créditos da variante. */
  creator?: { userId: string; username: string };
}

function buildSystemPrompt(lang: "pt" | "en"): string {
  if (lang === "en") {
    return `You adapt an EXISTING recipe to what the person has at home.
Rules:
- Keep a coherent, real dish — do not invent strange combinations.
- Sensibly substitute or omit missing ingredients.
- Respect the available equipment, time limit, and nutritional goal when provided.
- Rewrite the steps in English with estimated time per step.
- The title must make clear it is a variation.
- Do NOT use ingredients beyond what the person has, except basic pantry staples.
- For quantity and unit of each ingredient:
  * Convert fractions to decimal (1/2 → 0.5; 1 1/4 → 1.25; 3/4 → 0.75).
  * Use English units: "cup", "tablespoon", "teaspoon", "g", "kg", "ml", "l",
    "pinch", "clove", "slice", "sprig", "leaf", "unit", "can", "packet".
  * For "to taste": unit="to taste", quantity=null.
  * For plain counts (e.g. "2 eggs"): quantity=N, unit=null.`;
  }

  return `Você adapta uma receita EXISTENTE para o que a pessoa tem em casa.
Regras:
- Mantenha um prato coerente e de verdade — não invente combinações estranhas.
- Substitua ou omita de forma sensata os ingredientes que faltam.
- Respeite os equipamentos, o tempo e o objetivo informados, quando houver.
- Reescreva os passos em pt-BR com tempo estimado por passo.
- O título deve deixar claro que é uma variação.
- NÃO use ingredientes além dos que a pessoa tem, salvo itens básicos de despensa.
- Para quantity e unit de cada ingrediente:
  * Converta frações para decimal (1/2 → 0.5; 1 1/4 → 1.25; 3/4 → 0.75).
  * Use sempre unidades em pt-BR: "xícara", "colher de sopa", "colher de chá",
    "copo", "g", "kg", "ml", "l", "pitada", "dente", "fatia", "ramo", "folha",
    "unidade", "lata", "sachê".
  * Para "a gosto": unit="a gosto", quantity=null.
  * Para contagem sem unidade (ex: "2 ovos"): quantity=N, unit=null.`;
}

const GOAL_LABEL: Record<NutritionGoal, string> = {
  satiety: "matar a fome (priorizar saciedade)",
  macros: "respeitar macros (priorizar proteína, menos açúcar/gordura)",
};

function buildUserPrompt(anchor: Recipe, c: AdaptConstraints): string {
  const have = new Set(c.haveIds);
  const missing = anchor.ingredients
    .filter((i) => !i.isStaple && !have.has(i.canonicalId))
    .map((i) => i.name);

  const lines = [
    `Receita base: ${anchor.title}`,
    `Ingredientes da base:`,
    ...anchor.ingredients.map(
      (i) => `- ${i.name}${i.quantity ? ` (${i.quantity} ${i.unit ?? ""})` : ""}`,
    ),
    ``,
    `Modo de preparo da base:`,
    ...anchor.steps.map((s, i) => `${i + 1}. ${s.text}`),
    ``,
    missing.length > 0
      ? `A pessoa NÃO tem: ${missing.join(", ")}. Adapte em torno disso.`
      : `A pessoa tem todos os ingredientes principais — foque em ajustar às outras condições.`,
  ];

  if (c.availableEquipment?.length) {
    lines.push(`Equipamentos disponíveis: ${c.availableEquipment.join(", ")}.`);
  }
  if (c.maxPrepTimeMin) lines.push(`Tempo máximo: ${c.maxPrepTimeMin} minutos.`);
  if (c.goal) lines.push(`Objetivo: ${GOAL_LABEL[c.goal]}.`);
  if (c.note) lines.push(`Observação: ${c.note}`);
  lines.push(``, `Gere a receita adaptada.`);

  return lines.join("\n");
}

/**
 * Geração híbrida: adapta uma receita encontrada para o que o usuário tem.
 * A geração é ANCORADA na receita real (grounding) — reduz alucinação e mantém
 * qualidade. O resultado entra como `generated_pending` (quarentena), passando
 * pela mesma pipeline de persistência (canonicalizar → embeddar → inserir),
 * pronto pra virar candidato futuro no catálogo se for validado.
 *
 * Retorna null se a receita base não existir.
 */
export async function adaptRecipe(
  anchorId: string,
  constraints: AdaptConstraints,
): Promise<Recipe | null> {
  const anchor = await getRecipeById(anchorId);
  if (!anchor) return null;

  const res = await anthropic.messages.parse({
    model: EXTRACTION_MODEL,
    max_tokens: 4000,
    output_config: {
      format: zodOutputFormat(AdaptedRecipeSchema),
      ...effortOption("medium"),
    },
    system: buildSystemPrompt(constraints.lang ?? "pt"),
    messages: [{ role: "user", content: buildUserPrompt(anchor, constraints) }],
  });

  if (!res.parsed_output) {
    throw new Error(
      `Adaptação falhou (stop_reason=${res.stop_reason}) para "${anchor.title}"`,
    );
  }

  const adapted = res.parsed_output;
  return persistExtractedRecipe(
    {
      title: adapted.title,
      rawIngredients: [],
      steps: [],
      thumbnailUrl: "",
      servings: anchor.servings,
    },
    adapted,
    {
      source: "generated_pending",
      ...(anchor._id && { parentRecipeId: anchor._id }),
      ...(constraints.creator && { createdBy: [constraints.creator] }),
    },
  );
}
