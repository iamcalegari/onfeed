import Anthropic from "@anthropic-ai/sdk";

import { env } from "@/config/env.js";

export const anthropic = new Anthropic({ apiKey: env.anthropic.apiKey });

export const EXTRACTION_MODEL = env.anthropic.model;
