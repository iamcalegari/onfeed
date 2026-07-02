import { SendMessageCommand } from "@aws-sdk/client-sqs";

import { env } from "@/config/env.js";
import { sqsClient } from "@/infra/queue/sqs.client.js";
import {
  DEFAULT_SEARCH_SOURCES,
  hybridSearch,
  type HybridSearchParams,
} from "@/modules/recipes/recipe.repository.js";
import type { RecipeSearchHit } from "@/modules/recipes/recipe.types.js";
import type { ImportJobMessage } from "./import-job.types.js";

/**
 * Plataformas suportadas pelo pipeline de import (D-07 — motor único yt-dlp).
 */
export type SupportedPlatform = "instagram" | "tiktok" | "youtube";

/**
 * Allowlist de domínio por plataforma — ESTA é a fronteira de segurança
 * contra SSRF (CAP-02, T-04-01). Uma URL que não bate em nenhum destes
 * padrões é rejeitada ANTES de o worker sequer receber o jobId — o yt-dlp
 * nunca vê a URL. Não adicionar "domínio parecido o suficiente" (soft-pass);
 * manter a allowlist estrita.
 */
const PLATFORM_PATTERNS: Array<[SupportedPlatform, RegExp]> = [
  ["youtube", /^https?:\/\/(www\.)?(youtube\.com\/(watch\?v=|shorts\/)|youtu\.be\/)/i],
  ["tiktok", /^https?:\/\/(www\.|vm\.)?tiktok\.com\//i],
  ["instagram", /^https?:\/\/(www\.)?instagram\.com\/(reel|p)\//i],
];

/**
 * Classifica a URL submetida em uma das 3 plataformas suportadas, ou null se
 * for malformada, não-http(s), ou não bater em nenhum domínio da allowlist
 * (SSRF boundary — ver PLATFORM_PATTERNS acima).
 */
export function detectPlatform(url: string): SupportedPlatform | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null; // string malformada / não é URL
  }
  if (!["http:", "https:"].includes(parsed.protocol)) return null;

  for (const [platform, pattern] of PLATFORM_PATTERNS) {
    if (pattern.test(url)) return platform;
  }
  return null;
}

// Parâmetros de tracking removidos na normalização — não alteram a referência
// canônica do vídeo, só ruído de campanha/analytics.
const TRACKING_PARAMS = ["utm_source", "utm_medium", "utm_campaign", "igshid", "si"];

/**
 * Normaliza a URL removendo parâmetros de tracking, preservando o caminho/id
 * canônico do vídeo. Idempotente — duas URLs que só diferem por esses
 * parâmetros normalizam para a mesma string (groundwork para dedup CAP-03).
 */
export function normalizeUrl(url: string): string {
  const parsed = new URL(url);
  for (const param of TRACKING_PARAMS) {
    parsed.searchParams.delete(param);
  }
  return parsed.toString();
}

/**
 * Envia o _id do ImportJob já criado (fonte da verdade em Mongo) para a fila
 * dedicada de import — nunca gera um UUID novo, e nunca usa a fila de
 * ingest de dataset. O worker relê o doc autoritativo pelo jobId (PIPE-06).
 */
export async function enqueueImportJob(jobId: string): Promise<void> {
  const message: ImportJobMessage = { jobId };

  await sqsClient.send(
    new SendMessageCommand({
      QueueUrl: env.sqs.importQueueUrl,
      MessageBody: JSON.stringify(message),
    }),
  );
}

/**
 * Busca híbrida I/E/T/N escopada ao usuário importador, incluindo suas
 * próprias receitas privadas `source: "imported"` (EXT-04). Único caminho de
 * chamada concreto que materializa a promessa do filtro owner-scoped de
 * hybridSearch (Task 2) — a Fase 3 (UI de revisão) chama este método, nunca
 * hybridSearch diretamente com 'imported' em sources.
 *
 * D-14 (segurança): ownerId e a source 'imported' são SEMPRE passados juntos
 * — nunca existe um caminho aqui que inclua 'imported' em sources sem também
 * setar ownerId (isso vazaria imports privados de outros usuários).
 */
export async function listMyImportedRecipes(
  userId: string,
  params?: Partial<HybridSearchParams>,
): Promise<RecipeSearchHit[]> {
  return hybridSearch({
    queryVector: [],
    haveIds: [],
    ...params,
    ownerId: userId,
    sources: [...(params?.sources ?? DEFAULT_SEARCH_SOURCES), "imported"],
  });
}
