import Anthropic from "@anthropic-ai/sdk";

import { env } from "@/config/env.js";

export const anthropic = new Anthropic({ apiKey: env.anthropic.apiKey });

export const EXTRACTION_MODEL = env.anthropic.model;

/** Modelo dedicado à extração de receitas importadas (Fase 2, D-15 — Sonnet). */
export const IMPORT_EXTRACTION_MODEL =
  env.anthropic.importModel ?? env.anthropic.model;

type Effort = "low" | "medium" | "high";

/**
 * `effort` retorna 400 em Haiku 4.5 e Sonnet 4.5 — então só inclui o parâmetro
 * nos modelos que suportam (Opus 4.5+, Sonnet 4.6+). Spread no output_config.
 * Aceita um `model` opcional (default EXTRACTION_MODEL) para que chamadores
 * com um modelo diferente (ex: IMPORT_EXTRACTION_MODEL) testem o regex contra
 * o modelo que efetivamente vão usar, não o do catálogo.
 */
export function effortOption(
  level: Effort,
  model: string = EXTRACTION_MODEL,
): { effort: Effort } | Record<string, never> {
  return /haiku|sonnet-4-5/.test(model) ? {} : { effort: level };
}
