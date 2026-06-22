import { type Document, ObjectId } from "mongodb";

import { RECIPE_VECTOR_INDEX } from "@/infra/database/search-indexes.js";
import { RecipeModel } from "./recipe.model.js";
import type {
  Equipment,
  NutritionGoal,
  Recipe,
  RecipeIngredient,
  RecipeSearchHit,
  RecipeSource,
  RecipeStep,
} from "./recipe.types.js";

export interface DimensionWeights {
  semantic: number;
  i: number;
  e: number;
  t: number;
  n: number;
}

export interface HybridSearchParams {
  queryVector: number[];
  haveIds: string[]; // canonicalIds que o usuário tem (dimensão I)
  availableEquipment?: Equipment[]; // dimensão E
  maxPrepTimeMin?: number; // dimensão T
  goal?: NutritionGoal; // dimensão N
  baseIds?: string[]; // canonicalIds marcados como base (dimensão B)
  sources?: RecipeSource[];
  occasions?: string[]; // filtro duro por ocasião (ex: ["drinks"])
  weights?: Partial<DimensionWeights>;
  numCandidates?: number;
  limit?: number;
}

const CORE_WEIGHT = 3;
const NONCORE_WEIGHT = 1;

const DEFAULT_WEIGHTS: DimensionWeights = {
  semantic: 0.25,
  i: 0.45, // ingredientes são o sinal mais forte do match — pesam mais
  e: 0.1,
  t: 0.1,
  n: 0.1,
};

const DEFAULTS = {
  numCandidates: 200,
  limit: 20,
  sources: ["curated", "generated_validated", "variant", "user"] as RecipeSource[],
};

// Referências para o score N (heurístico — ajustável)
const SATIETY_CALORIES_REF = 700; // calorias que já "matam a fome"
const HIGH_PROTEIN_RATIO = 0.3; // 30% das calorias vindas de proteína = alta

/**
 * Busca híbrida num único pipeline, decompondo o match em 4 dimensões I/E/T/N
 * (as barrinhas do esboço) + relevância semântica, combinadas no matchScore.
 *
 *  - I: cobertura ponderada de ingredientes (core pesa mais; staples ignorados)
 *  - E: fração dos equipamentos exigidos que o usuário tem
 *  - T: aderência ao tempo disponível
 *  - N: aderência ao objetivo nutricional (saciedade vs macros)
 *
 * Dimensões sem input do usuário viram neutras (E/T=1, N=0.5) — a receita não
 * é penalizada por algo que o usuário não pediu.
 */
export async function hybridSearch(
  params: HybridSearchParams,
): Promise<RecipeSearchHit[]> {
  const w = { ...DEFAULT_WEIGHTS, ...params.weights };
  const limit = params.limit ?? DEFAULTS.limit;
  // pool de candidatos puxados do ANN p/ o re-rank (maior que o limit final)
  const poolSize = Math.max(limit * 3, 50);
  // regra do Atlas: o `limit` do $vectorSearch tem que ser <= numCandidates
  const numCandidates = Math.max(
    params.numCandidates ?? DEFAULTS.numCandidates,
    poolSize * 2,
  );
  const haveIds = params.haveIds;
  const equip = params.availableEquipment;
  const goal = params.goal;
  const maxPrep = params.maxPrepTimeMin;
  const baseIds = params.baseIds ?? [];
  const hasBase = baseIds.length > 0;
  const occasions = params.occasions ?? [];

  // Com ingrediente base presente, redistribui pesos: -0.10 de semantic, -0.10 de i, +0.30 de b
  const wSemantic = hasBase ? 0.15 : w.semantic;
  const wI        = hasBase ? 0.35 : w.i;
  const wB        = hasBase ? 0.30 : 0;

  // --- expressões dos sub-scores (construídas conforme os inputs presentes) ---

  // T: quanto mais a receita ultrapassa o tempo, menor; sem limite => 1
  const scoreT: Document =
    maxPrep !== undefined
      ? { $min: [1, { $divide: [maxPrep, { $max: ["$prepTimeMin", 1] }] }] }
      : { $literal: 1 };

  // E: cobertura dos equipamentos exigidos (ignora "none"); sem input => 1
  const scoreE: Document = equip
    ? {
        $let: {
          vars: {
            req: {
              $filter: {
                input: "$equipment",
                as: "eq",
                cond: { $ne: ["$$eq", "none"] },
              },
            },
          },
          in: {
            $cond: [
              { $eq: [{ $size: "$$req" }, 0] },
              1,
              {
                $divide: [
                  { $size: { $setIntersection: ["$$req", equip] } },
                  { $size: "$$req" },
                ],
              },
            ],
          },
        },
      }
    : { $literal: 1 };

  // N: depende do objetivo + nutrição; sem objetivo ou sem nutrição => 0.5
  let scoreN: Document = { $literal: 0.5 };
  if (goal === "satiety") {
    scoreN = {
      $cond: [
        { $ifNull: ["$nutrition", false] },
        { $min: [1, { $divide: ["$nutrition.calories", SATIETY_CALORIES_REF] }] },
        0.5,
      ],
    };
  } else if (goal === "macros") {
    scoreN = {
      $cond: [
        {
          $and: [
            { $ifNull: ["$nutrition", false] },
            { $gt: ["$nutrition.calories", 0] },
          ],
        },
        {
          $min: [
            1,
            {
              $divide: [
                {
                  $divide: [
                    { $multiply: ["$nutrition.protein", 4] },
                    "$nutrition.calories",
                  ],
                },
                HIGH_PROTEIN_RATIO,
              ],
            },
          ],
        },
        0.5,
      ],
    };
  }

  const pipeline: Document[] = [
    {
      $vectorSearch: {
        index: RECIPE_VECTOR_INDEX,
        path: "embedding",
        queryVector: params.queryVector,
        numCandidates,
        limit: poolSize,
        filter: {
          source: { $in: params.sources ?? DEFAULTS.sources },
          ...(occasions.length > 0 && { occasions: { $in: occasions } }),
        },
      },
    },
    { $addFields: { vectorScore: { $meta: "vectorSearchScore" } } },

    // --- dimensão I: cobertura ponderada de ingredientes ---
    {
      $addFields: {
        _weighted: {
          $map: {
            input: {
              $filter: {
                input: "$ingredients",
                as: "ing",
                cond: { $eq: ["$$ing.isStaple", false] },
              },
            },
            as: "ing",
            in: {
              canonicalId: "$$ing.canonicalId",
              name: "$$ing.name",
              core: "$$ing.core",
              have: { $in: ["$$ing.canonicalId", haveIds] },
              weight: { $cond: ["$$ing.core", CORE_WEIGHT, NONCORE_WEIGHT] },
            },
          },
        },
      },
    },
    {
      $addFields: {
        totalWeight: { $sum: "$_weighted.weight" },
        haveWeight: {
          $sum: {
            $map: {
              input: {
                $filter: { input: "$_weighted", as: "w", cond: "$$w.have" },
              },
              as: "w",
              in: "$$w.weight",
            },
          },
        },
        missing: {
          $map: {
            input: {
              $filter: {
                input: "$_weighted",
                as: "w",
                cond: { $not: ["$$w.have"] },
              },
            },
            as: "w",
            in: {
              canonicalId: "$$w.canonicalId",
              name: "$$w.name",
              core: "$$w.core",
            },
          },
        },
      },
    },

    // --- sub-scores das 4 dimensões ---
    {
      $addFields: {
        scoreI: {
          $cond: [
            { $eq: ["$totalWeight", 0] },
            1,
            { $divide: ["$haveWeight", "$totalWeight"] },
          ],
        },
        scoreE,
        scoreT,
        scoreN,
        // B: 1 se TODOS os ingredientes base estão na receita, 0 caso contrário
        ...(hasBase && {
          scoreB: {
            $cond: [
              {
                $eq: [
                  {
                    $size: {
                      $setIntersection: [
                        { $map: { input: "$ingredients", as: "ing", in: "$$ing.canonicalId" } },
                        baseIds,
                      ],
                    },
                  },
                  baseIds.length,
                ],
              },
              1,
              0,
            ],
          },
        }),
        missingCoreCount: {
          $size: { $filter: { input: "$missing", as: "m", cond: "$$m.core" } },
        },
      },
    },

    // --- combinação ponderada -> matchScore (0..100) ---
    {
      $addFields: {
        finalScore: {
          $add: [
            { $multiply: [wSemantic, "$vectorScore"] },
            { $multiply: [wI, "$scoreI"] },
            { $multiply: [w.e, "$scoreE"] },
            { $multiply: [w.t, "$scoreT"] },
            { $multiply: [w.n, "$scoreN"] },
            ...(hasBase ? [{ $multiply: [wB, "$scoreB"] }] : []),
          ],
        },
        cookableNow: { $eq: ["$missingCoreCount", 0] },
      },
    },
    { $sort: { finalScore: -1 } },
    { $limit: limit },
    {
      $project: {
        _id: 1,
        title: 1,
        intro: 1,
        country: 1,
        thumbnailUrl: 1,
        prepTimeMin: 1,
        servings: 1,
        source: 1,
        parentRecipeId: 1,
        createdBy: 1,
        matchScore: { $round: [{ $multiply: ["$finalScore", 100] }, 0] },
        scores: {
          i: "$scoreI",
          e: "$scoreE",
          t: "$scoreT",
          n: "$scoreN",
        },
        missing: 1,
        missingCoreCount: 1,
        cookableNow: 1,
        nutrition: 1,
      },
    },
  ];

  return RecipeModel.aggregate(pipeline) as Promise<RecipeSearchHit[]>;
}

/** Receita completa para a tela de detalhe (sem o embedding pesado). */
export async function getRecipeById(id: string): Promise<Recipe | null> {
  const recipe = await RecipeModel.findById(id, {
    projection: { embedding: 0, embeddingText: 0 },
  });
  return recipe as Recipe | null;
}

/** Persiste a URL da thumbnail (geração lazy / upload). */
export async function setThumbnail(id: string, url: string): Promise<void> {
  await RecipeModel.update(
    { _id: new ObjectId(id) } as never,
    { $set: { thumbnailUrl: url, updatedAt: new Date() } },
  );
}

/** Retorna todas as variantes diretas de uma receita (filhos imediatos). */
export async function getVariantsByParentId(parentId: string): Promise<Recipe[]> {
  const docs = await RecipeModel.findMany(
    { parentRecipeId: new ObjectId(parentId) } as never,
    { projection: { embedding: 0, embeddingText: 0 } },
  );
  return (docs ?? []) as Recipe[];
}

/** Contagem de variantes diretas — para o badge na receita original. */
export async function getVariantCount(recipeId: string): Promise<number> {
  return RecipeModel.total({ parentRecipeId: new ObjectId(recipeId) } as never);
}

/** Promove generated_pending → variant. */
export async function promoteToVariant(recipeId: string): Promise<void> {
  await RecipeModel.update(
    { _id: new ObjectId(recipeId), source: "generated_pending" } as never,
    { $set: { source: "variant", updatedAt: new Date() } },
  );
}

/** Admin rejeita a variante. */
export async function rejectVariant(recipeId: string): Promise<void> {
  await RecipeModel.update(
    { _id: new ObjectId(recipeId) } as never,
    { $set: { source: "rejected", updatedAt: new Date() } },
  );
}

/**
 * Adiciona um criador à lista da variante (deduplicação: se o userId já existe,
 * não duplica). Usado quando dois usuários adaptaram a mesma receita.
 */
export async function addCreatorToVariant(
  recipeId: string,
  creator: { userId: string; username: string },
): Promise<void> {
  await RecipeModel.update(
    { _id: new ObjectId(recipeId) } as never,
    {
      $addToSet: { createdBy: creator } as never,
      $set: { updatedAt: new Date() },
    },
  );
}

/** Persiste a tradução inglês gerada lazily (introEn + textEn em steps + nameEn em ingredients). */
export async function setTranslation(
  id: string,
  introEn: string,
  steps: RecipeStep[],
  ingredients: RecipeIngredient[],
): Promise<void> {
  await RecipeModel.update(
    { _id: new ObjectId(id) } as never,
    { $set: { introEn, steps, ingredients, updatedAt: new Date() } },
  );
}
