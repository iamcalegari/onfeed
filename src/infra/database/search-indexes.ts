import type { SearchIndexDescription } from "mongodb";

import { env } from "@/config/env.js";
import { database } from "./connection.js";

/**
 * Atlas Vector Search usa "search indexes", criados via `collection.createSearchIndex`
 * do driver nativo — o mongoat (setupCollections) só gerencia índices comuns e o
 * $jsonSchema validator. Por isso pegamos a Collection nativa direto do Database.
 *
 * Idempotente: lista os índices existentes e só cria o que falta.
 */

export const RECIPE_VECTOR_INDEX = "recipe_vector_index";
export const INGREDIENT_VECTOR_INDEX = "ingredient_vector_index";

const recipeVectorIndexDefinition = {
  name: RECIPE_VECTOR_INDEX,
  type: "vectorSearch",
  definition: {
    fields: [
      {
        type: "vector",
        path: "embedding",
        numDimensions: env.voyage.dimensions,
        similarity: "cosine",
      },
      // Campos de pré-filtro: precisam estar declarados aqui para serem usados
      // no `filter` do estágio $vectorSearch.
      { type: "filter", path: "prepTimeMin" },
      { type: "filter", path: "servings" },
      { type: "filter", path: "occasions" },
      { type: "filter", path: "source" },
      // D-14 (segurança): filtro por dono de receitas privadas importadas — um
      // path de filtro não declarado aqui é silenciosamente ignorado pelo
      // $vectorSearch, o que vazaria imports privados. Ver hybridSearch
      // (recipe.repository.ts) para o uso do $or visibility/createdBy.userId.
      { type: "filter", path: "visibility" },
      { type: "filter", path: "createdBy.userId" },
    ],
  },
} as const;

// Usado no fallback semântico da canonicalização: termos desconhecidos
// ("EVOO") são resolvidos pelo ingrediente canônico mais próximo.
const ingredientVectorIndexDefinition = {
  name: INGREDIENT_VECTOR_INDEX,
  type: "vectorSearch",
  definition: {
    fields: [
      {
        type: "vector",
        path: "embedding",
        numDimensions: env.voyage.dimensions,
        similarity: "cosine",
      },
    ],
  },
} as const;

async function ensureSearchIndex(
  collectionName: string,
  index: SearchIndexDescription,
): Promise<void> {
  const collection = database.getCollection(collectionName);
  if (!collection) {
    throw new Error(`Coleção não encontrada: ${collectionName}`);
  }

  const existing = await collection.listSearchIndexes().toArray();
  if (existing.some((i) => i.name === index.name)) {
    console.log(`[search-index] '${index.name}' já existe, pulando.`);
    return;
  }

  await collection.createSearchIndex(index);
  console.log(
    `[search-index] '${index.name}' criado em '${collectionName}'. ` +
      `A construção é assíncrona no Atlas (status 'queryable' leva ~minutos).`,
  );
}

export async function setupSearchIndexes(): Promise<void> {
  await ensureSearchIndex("recipes", recipeVectorIndexDefinition);
  await ensureSearchIndex("ingredients", ingredientVectorIndexDefinition);
}

/**
 * Espera um search index ficar `queryable` (a construção no Atlas é assíncrona).
 * Crucial antes da ingestão: o fallback semântico da canonicalização depende do
 * índice de ingredientes — se ainda estiver "building", todo termo novo vira um
 * `pending` duplicado em vez de casar com o canônico existente.
 */
export async function waitForSearchIndexQueryable(
  collectionName: string,
  indexName: string,
  { timeoutMs = 180_000, intervalMs = 5_000 }: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<void> {
  const collection = database.getCollection(collectionName);
  if (!collection) throw new Error(`Coleção não encontrada: ${collectionName}`);

  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const indexes = (await collection.listSearchIndexes().toArray()) as {
      name: string;
      status?: string;
      queryable?: boolean;
    }[];
    const idx = indexes.find((i) => i.name === indexName);
    if (idx?.queryable) return;
    if (!idx) throw new Error(`Search index '${indexName}' não existe — rode setup:db.`);
    if (Date.now() >= deadline) {
      throw new Error(
        `Search index '${indexName}' não ficou queryable em ${timeoutMs / 1000}s (status=${idx.status}).`,
      );
    }
    console.log(`[search-index] aguardando '${indexName}' ficar queryable (status=${idx.status})...`);
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
