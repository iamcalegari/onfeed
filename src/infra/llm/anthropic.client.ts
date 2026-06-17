import Anthropic from "@anthropic-ai/sdk";

import { env } from "@/config/env.js";

export const anthropic = new Anthropic({ apiKey: env.anthropic.apiKey });

export const EXTRACTION_MODEL = env.anthropic.model;

type Effort = "low" | "medium" | "high";

/**
 * `effort` retorna 400 em Haiku 4.5 e Sonnet 4.5 — então só inclui o parâmetro
 * nos modelos que suportam (Opus 4.5+, Sonnet 4.6+). Spread no output_config.
 */
export function effortOption(
  level: Effort,
): { effort: Effort } | Record<string, never> {
  return /haiku|sonnet-4-5/.test(EXTRACTION_MODEL) ? {} : { effort: level };
}
