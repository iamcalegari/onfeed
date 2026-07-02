import { SendMessageCommand } from "@aws-sdk/client-sqs";
import { ObjectId } from "mongodb";

import { env } from "@/config/env.js";
import { sqsClient } from "@/infra/queue/sqs.client.js";
import { RecipeModel } from "@/modules/recipes/recipe.model.js";
import {
  DEFAULT_SEARCH_SOURCES,
  getRecipeById,
  hybridSearch,
  type HybridSearchParams,
} from "@/modules/recipes/recipe.repository.js";
import type { RecipeIngredient, RecipeSearchHit, RecipeStep } from "@/modules/recipes/recipe.types.js";
import type { ImportJobMessage } from "./import-job.types.js";
import type { ImportRecipeEditPatch } from "./import.routes.js";

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

/**
 * Confirma uma receita importada (REV-04): aplica as edições de conteúdo do
 * usuário, seta reviewRequired:false e confirmedAt numa ÚNICA
 * RecipeModel.update — este é o ÚNICO código-caminho que escreve
 * confirmedAt / flip reviewRequired:false (nenhuma outra rota faz isso).
 *
 * Idempotência (Pitfall 3): se a receita já está confirmada
 * (confirmedAt já setado), a função é um no-op seguro — nunca reaplica um
 * segundo conjunto de edições por cima de uma receita já confirmada.
 *
 * NÃO re-roda resolveCanonicalForIngestion ao editar ingredients[].name
 * (Open Q1 resolvida): mantém o PATCH síncrono/rápido sem chamada Voyage no
 * caminho da request. canonicalId/core/isStaple/raw dos ingredientes
 * existentes são preservados; só name/quantity/unit são sobrescritos pelo
 * patch do usuário. A função nunca toca grounding, confidenceScore,
 * canonicalId ou embedding.
 *
 * `userId` é threaded por auditoria/consistência — o ownership real já foi
 * garantido pela rota via o job owner-scoped (getImportJob(jobId, userId));
 * esta função não repete um segundo guard de Mongo por userId.
 */
export async function confirmImportedRecipe(
  recipeId: string,
  _userId: string,
  patch: ImportRecipeEditPatch,
): Promise<{ alreadyConfirmed: true } | { alreadyConfirmed: false }> {
  const recipe = await getRecipeById(recipeId);
  if (!recipe) {
    throw new Error("recipe_not_found");
  }

  // Idempotente: já confirmada anteriormente — no-op seguro, não reaplica
  // um novo patch por cima (Pitfall 3).
  if (recipe.confirmedAt) {
    return { alreadyConfirmed: true };
  }

  const existingIngredients = recipe.ingredients;
  const ingredients: RecipeIngredient[] = patch.ingredients.map((edited, index) => {
    const existing = existingIngredients[index];
    return {
      // Preserva proveniência/canonicalização — só name/quantity/unit são
      // editáveis pelo usuário (Open Q1: sem re-canonicalização síncrona).
      raw: existing?.raw ?? edited.name,
      canonicalId: existing?.canonicalId ?? "",
      core: existing?.core ?? false,
      isStaple: existing?.isStaple ?? false,
      ...(existing?.nameEn !== undefined && { nameEn: existing.nameEn }),
      name: edited.name,
      ...(edited.quantity !== undefined && { quantity: edited.quantity }),
      ...(edited.unit !== undefined && { unit: edited.unit }),
    };
  });

  const steps: RecipeStep[] = patch.steps.map((edited, index) => {
    const existing = recipe.steps[index];
    return {
      text: edited.text,
      ...(existing?.textEn !== undefined && { textEn: existing.textEn }),
      ...(existing?.minutes !== undefined && { minutes: existing.minutes }),
    };
  });

  await RecipeModel.update(
    { _id: new ObjectId(recipeId) } as never,
    {
      $set: {
        title: patch.title,
        intro: patch.intro,
        ingredients,
        steps,
        reviewRequired: false,
        confirmedAt: new Date(),
        updatedAt: new Date(),
      },
    },
  );

  return { alreadyConfirmed: false };
}
