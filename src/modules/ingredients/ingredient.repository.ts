import type { Document } from "mongodb";

import { INGREDIENT_VECTOR_INDEX } from "@/infra/database/search-indexes.js";
import { IngredientModel } from "./ingredient.model.js";
import type { CanonicalIngredient } from "./ingredient.types.js";

export interface NearestIngredient {
  _id: string;
  isStaple: boolean;
  score: number;
}

/** Ingrediente canônico mais próximo de um vetor (match semântico de termo novo). */
export async function findNearestIngredient(
  queryVector: number[],
): Promise<NearestIngredient | null> {
  const pipeline: Document[] = [
    {
      $vectorSearch: {
        index: INGREDIENT_VECTOR_INDEX,
        path: "embedding",
        queryVector,
        numCandidates: 50,
        limit: 1,
      },
    },
    {
      $project: {
        _id: 1,
        isStaple: 1,
        score: { $meta: "vectorSearchScore" },
      },
    },
  ];

  const [hit] = (await IngredientModel.aggregate(pipeline)) as NearestIngredient[];
  return hit ?? null;
}

/** Gera um slug estável a partir de um nome (sem acentos, snake_case). */
function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove diacríticos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

/**
 * Cria um ingrediente canônico em quarentena (pending) a partir de um termo
 * desconhecido, já guardando o embedding do termo para futuros matches.
 * Garante _id único anexando sufixo se o slug colidir.
 */
export async function createPendingIngredient(
  name: string,
  embedding: number[],
): Promise<CanonicalIngredient> {
  const norm = name.trim().toLowerCase();
  const base = slugify(name) || "ingredient";

  let id = base;
  for (let i = 0; i < 5; i++) {
    const exists = await IngredientModel.findById(id);
    if (!exists) break;
    id = `${base}_${Math.random().toString(36).slice(2, 6)}`;
  }

  return IngredientModel.insert({
    _id: id,
    displayName: name,
    synonyms: [norm],
    category: "unknown",
    isStaple: false,
    pending: true,
    embedding,
    insertedAt: new Date(),
    updatedAt: new Date(),
  }) as unknown as CanonicalIngredient;
}
