import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

import {
  anthropic,
  effortOption,
  EXTRACTION_MODEL,
} from "@/infra/llm/anthropic.client.js";

/**
 * Extração estruturada de uma receita em texto livre.
 *
 * Princípio: o LLM NÃO conhece o catálogo canônico, então não inventa
 * `canonicalId`. Ele só estrutura e normaliza para uma forma genérica em
 * pt-BR; a resolução para o ID canônico é determinística (ingredient.service).
 */
export const ExtractedRecipeSchema = z.object({
  intro: z.string().describe("introdução curta (1-2 frases) em pt-BR"),
  country: z.string().describe("país de origem em ISO 3166-1 alpha-2, ex: IT"),
  occasions: z
    .array(z.string())
    .describe(
      "ocasiões adequadas, vocabulário fixo: weeknight, romantic_dinner, " +
        "party, comfort_food, healthy, breakfast, dessert, quick",
    ),
  equipment: z
    .array(z.enum(["stovetop", "oven", "microwave", "blender", "none"]))
    .describe("equipamentos necessários, inferidos do modo de preparo"),
  ingredients: z.array(
    z.object({
      raw: z.string().describe("a linha de ingrediente original, literal"),
      name: z
        .string()
        .describe(
          "nome genérico, singular, em pt-BR (ex: 'azeite extra-virgem' -> 'azeite de oliva')",
        ),
      quantity: z.number().nullable(),
      unit: z.string().nullable(),
      core: z
        .boolean()
        .describe("true se essencial à receita; false se guarnição/opcional"),
    }),
  ),
  steps: z
    .array(
      z.object({
        text: z.string().describe("o passo reescrito de forma clara em pt-BR"),
        minutes: z
          .number()
          .nullable()
          .describe("tempo estimado do passo em minutos, ou null"),
      }),
    )
    .describe("modo de preparo passo a passo, com tempo estimado por passo"),
});

export type ExtractedRecipe = z.infer<typeof ExtractedRecipeSchema>;

export interface RawRecipeInput {
  title: string;
  rawIngredients: string[];
  steps: string[];
}

export const EXTRACTION_SYSTEM_PROMPT = `Você extrai dados estruturados de receitas culinárias.
Regras:
- Normalize cada ingrediente para um nome genérico e singular em pt-BR.
- NÃO invente ingredientes que não estejam na lista fornecida.
- Marque como core os ingredientes essenciais; guarnições e opcionais são não-core.
- Infira occasions só a partir do vocabulário permitido.
- Infira equipment a partir do modo de preparo (ex: "leve ao forno" -> oven;
  "refogue na panela" -> stovetop). Use "none" se for montagem/preparo cru.
- Reescreva cada passo de forma clara em pt-BR e estime o tempo de cada um.
- A introdução deve ser apetitosa, curta e em pt-BR.`;

/** Formato de saída compartilhado entre a chamada única e o batch. */
export const EXTRACTION_FORMAT = zodOutputFormat(ExtractedRecipeSchema);

export function buildExtractionUserContent(input: RawRecipeInput): string {
  return [
    `Título: ${input.title}`,
    ``,
    `Ingredientes:`,
    ...input.rawIngredients.map((l) => `- ${l}`),
    ``,
    `Modo de preparo:`,
    ...input.steps.map((s, i) => `${i + 1}. ${s}`),
  ].join("\n");
}

/** Params do Messages API reutilizados em extractRecipe() e no batch runner. */
export function buildExtractionParams(input: RawRecipeInput) {
  return {
    model: EXTRACTION_MODEL,
    max_tokens: 4000,
    // effort baixo onde suportado (omitido no Haiku, que não aceita)
    output_config: { format: EXTRACTION_FORMAT, ...effortOption("low") },
    system: EXTRACTION_SYSTEM_PROMPT,
    messages: [
      { role: "user" as const, content: buildExtractionUserContent(input) },
    ],
  };
}

export async function extractRecipe(
  input: RawRecipeInput,
): Promise<ExtractedRecipe> {
  const res = await anthropic.messages.parse(buildExtractionParams(input));

  if (!res.parsed_output) {
    throw new Error(
      `Extração falhou (stop_reason=${res.stop_reason}) para "${input.title}"`,
    );
  }
  return res.parsed_output;
}
