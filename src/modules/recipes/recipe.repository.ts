import { type Document, ObjectId } from "mongodb";

import { RECIPE_VECTOR_INDEX } from "@/infra/database/search-indexes.js";
import { getImportJob } from "@/modules/import/import-job.repository.js";
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
  dietaryTags?: string[]; // filtro duro de restrições alimentares (ex: ["gluten_free"])
  weights?: Partial<DimensionWeights>;
  numCandidates?: number;
  limit?: number;
  /**
   * D-14 (segurança): quando informado, restringe o resultado a receitas
   * não-privadas OU privadas cujo dono seja `ownerId`. Necessário para
   * receitas `source: "imported"` (sempre `visibility: "private"` até
   * promoção — Fase 5) aparecerem na busca só para quem importou.
   * NUNCA adicionar 'imported' a DEFAULTS.sources sem também passar ownerId
   * (T-02-06 / Pitfall 2) — callers que querem imports passam sources
   * explicitamente junto com ownerId (ver listMyImportedRecipes).
   */
  ownerId?: string;
}

const CORE_WEIGHT = 3;
const NONCORE_WEIGHT = 1;

// wRating=0.05 é deslocado do peso semântico para manter soma=1 no caso base.
const wRating = 0.05;

const DEFAULT_WEIGHTS: DimensionWeights = {
  semantic: 0.20, // reduzido de 0.25 para acomodar wRating
  i: 0.45,
  e: 0.1,
  t: 0.1,
  n: 0.1,
};

const DEFAULTS = {
  numCandidates: 200,
  limit: 20,
  sources: ["curated", "generated_validated", "variant", "user"] as RecipeSource[],
};

/**
 * Sources padrão do catálogo público — exportado para composição por callers
 * owner-scoped (ex: listMyImportedRecipes em import.service.ts) que precisam
 * somar 'imported' ao conjunto SEM alterar este array global (D-14 / T-02-06:
 * 'imported' nunca entra aqui, só em sources passados explicitamente junto
 * com ownerId).
 */
export const DEFAULT_SEARCH_SOURCES = DEFAULTS.sources;

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
  // regra do Atlas: o `limit` do $vectorSearch tem que ser <= numCandidates.
  // Quanto mais candidatos o ANN avalia, melhor o recall do re-rank — folga
  // generosa (5× o pool) sem custo proibitivo.
  const numCandidates = Math.max(
    params.numCandidates ?? DEFAULTS.numCandidates,
    poolSize * 5,
  );
  const haveIds = params.haveIds;
  const equip = params.availableEquipment;
  const goal = params.goal;
  const maxPrep = params.maxPrepTimeMin;
  const baseIds = params.baseIds ?? [];
  const hasBase = baseIds.length > 0;
  const occasions = params.occasions ?? [];
  const dietaryTags = params.dietaryTags ?? [];
  // "drinks" é categoria realmente distinta (bebida × comida) → continua filtro
  // DURO. As demais ocasiões viram sinal SOFT (boost no score) pra não zerar o
  // recall quando o tagueamento da receita diverge do filtro do usuário.
  const isDrinks = occasions.includes("drinks");
  const softOccasions = occasions.filter((o) => o !== "drinks");
  const hasOcc = softOccasions.length > 0;

  // Com ingrediente base presente, redistribui pesos: -0.10 de semantic, -0.10 de i, +0.30 de b
  let wSemantic   = hasBase ? 0.15 : w.semantic;
  const wI        = hasBase ? 0.35 : w.i;
  const wB        = hasBase ? 0.30 : 0;
  // Ocasião (soft) entra como dimensão leve, deslocada do peso semântico.
  const wOcc      = hasOcc ? 0.10 : 0;
  wSemantic = Math.max(0.05, wSemantic - wOcc);

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

  // R: boost para receitas bem avaliadas. Receitas com < 3 avaliações ficam neutras (0.5)
  // para não penalizar receitas novas antes de acumular feedback.
  const scoreRating: Document = {
    $cond: [
      { $and: [{ $ifNull: ["$avgRating", false] }, { $gte: ["$ratingCount", 3] }] },
      { $divide: ["$avgRating", 5] },
      0.5,
    ],
  };

  // Ocasião (soft): 1 se a receita cobre QUALQUER ocasião pedida, senão 0.
  const scoreOccasion: Document = hasOcc
    ? {
        $cond: [
          {
            $gt: [
              { $size: { $setIntersection: ["$occasions", softOccasions] } },
              0,
            ],
          },
          1,
          0,
        ],
      }
    : { $literal: 0 };

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
          ...(isDrinks && { occasions: "drinks" }),
          // D-14: receitas privadas (imports não promovidos) só entram no
          // resultado se params.ownerId for o dono — nunca globalmente.
          ...(params.ownerId && {
            $or: [
              { visibility: { $ne: "private" } },
              { visibility: "private", "createdBy.userId": params.ownerId },
            ],
          }),
        },
      },
    },
    { $addFields: { vectorScore: { $meta: "vectorSearchScore" } } },
    // Filtro duro de restrições dietéticas — só ativo quando o usuário informou tags.
    // Receitas sem dietaryTags são excluídas quando o filtro está ativo.
    ...(dietaryTags.length > 0
      ? [{ $match: { dietaryTags: { $all: dietaryTags } } }]
      : []),

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
        scoreRating,
        ...(hasOcc && { scoreOccasion }),
        // B: fração dos ingredientes base presentes na receita (proporcional —
        // antes era tudo-ou-nada e zerava receitas com cobertura parcial)
        ...(hasBase && {
          scoreB: {
            $divide: [
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
            { $multiply: [wRating, "$scoreRating"] },
            ...(hasBase ? [{ $multiply: [wB, "$scoreB"] }] : []),
            ...(hasOcc ? [{ $multiply: [wOcc, "$scoreOccasion"] }] : []),
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
        avgRating: 1,
        ratingCount: 1,
        // reviewRequired/confirmedAt: projetados para que GET /import/mine (Fase 3)
        // consiga renderizar o status ("Em revisão"/"Confirmada") sem uma query
        // extra — inofensivo para os demais chamadores de hybridSearch (campos
        // ausentes em receitas não-importadas, undefined no hit).
        reviewRequired: 1,
        confirmedAt: 1,
      },
    },
  ];

  return RecipeModel.aggregate(pipeline) as Promise<RecipeSearchHit[]>;
}

/**
 * Busca receitas pelo título via regex case-insensitive.
 * Usado no modo "já sei o que fazer" — não calcula scores I/E/T/N.
 * Retorna hits com matchScore=100 e missing=[] (o usuário já escolheu a receita).
 */
export async function searchByTitle(
  query: string,
  limit = 20,
): Promise<RecipeSearchHit[]> {
  const docs = (await RecipeModel.findMany(
    { title: { $regex: query.trim(), $options: "i" } } as never,
    {
      limit,
      projection: {
        embedding: 0,
        embeddingText: 0,
        ingredients: 0,
      },
    },
  )) as (Recipe & { _id: { toString(): string } })[];

  return (docs ?? []).map((r) => ({
    _id:            String(r._id),
    title:          r.title,
    intro:          r.intro ?? "",
    country:        r.country ?? "",
    thumbnailUrl:   r.thumbnailUrl ?? "",
    prepTimeMin:    r.prepTimeMin ?? 0,
    servings:       r.servings ?? 1,
    source:         r.source,
    matchScore:     100,
    scores:         { i: 1, e: 1, t: 1, n: 1 },
    missing:        [],
    missingCoreCount: 0,
    cookableNow:    false,
    ...(r.nutrition !== undefined && { nutrition: r.nutrition }),
  }));
}

/**
 * Lista as receitas importadas de um usuário para a tela "Minhas importações"
 * (D-09, Fase 3). É FILTRO PURO por dono + `source: "imported"` — NÃO passa por
 * `$vectorSearch`: não há query semântica aqui, e o `hybridSearch` exige um
 * queryVector de 1024 dims; um vetor vazio faz o Atlas devolver 500 ("vector
 * field is indexed with 1024 dimensions but queried with 0"). Owner-scoped por
 * construção (`createdBy.userId === userId`), então nunca vaza imports de outro
 * usuário nem despeja o catálogo público. Inclui `reviewRequired`/`confirmedAt`
 * para alimentar o status "Em revisão" / "Confirmada".
 */
export async function listImportedRecipesByOwner(
  userId: string,
  limit = 50,
): Promise<RecipeSearchHit[]> {
  const docs = (await RecipeModel.findMany(
    { source: "imported", "createdBy.userId": userId } as never,
    {
      limit,
      sort: { insertedAt: -1 }, // import mais recente primeiro
      projection: { embedding: 0, embeddingText: 0, ingredients: 0 },
    },
  )) as (Recipe & { _id: { toString(): string } })[];

  return (docs ?? []).map((r) => ({
    _id:            String(r._id),
    title:          r.title,
    intro:          r.intro ?? "",
    country:        r.country ?? "",
    thumbnailUrl:   r.thumbnailUrl ?? "",
    prepTimeMin:    r.prepTimeMin ?? 0,
    servings:       r.servings ?? 1,
    source:         r.source,
    ...(r.createdBy !== undefined && { createdBy: r.createdBy }),
    // Listagem, não busca: scores neutros (o usuário já é dono, não há ranking).
    matchScore:     100,
    scores:         { i: 1, e: 1, t: 1, n: 1 },
    missing:        [],
    missingCoreCount: 0,
    cookableNow:    false,
    ...(r.nutrition !== undefined && { nutrition: r.nutrition }),
    ...(r.reviewRequired !== undefined && { reviewRequired: r.reviewRequired }),
    ...(r.confirmedAt !== undefined && { confirmedAt: r.confirmedAt }),
  }));
}

/**
 * Receita completa para a tela de detalhe (sem o embedding pesado).
 *
 * Assinatura de 3 estados no 2º argumento — distingue caller TRUSTED
 * (interno) de caller UNTRUSTED (rota pública), o mesmo idioma de
 * `getImportJob(jobId, userId?)`:
 * - Argumento OMITIDO: chamada interna/trusted (adaptação, likes, confirm
 *   flow — ownership já resolvida a montante por quem chamou) — retorna a
 *   receita independente de visibility, comportamento pré-existente
 *   inalterado.
 * - `null`: caller UNTRUSTED sem sessão (rota pública, requisição
 *   anônima) — aplica o guard de visibilidade; privado nunca é retornado.
 * - `string`: caller UNTRUSTED com sessão — aplica o guard de
 *   visibilidade com ownership check (dono vê o próprio privado).
 *
 * Para os dois últimos casos, a checagem de ownership é dobrada NO MESMO
 * filtro Mongo (idioma de getImportJob) — nunca busca-e-compara depois. Uma
 * receita privada de outro dono resolve `null`, o mesmo "não existe" de um
 * id inexistente (IDOR-safe, D-14 / T-02-07 / T-03-05).
 *
 * IMPORTS (T-03-05/T-03-06): receitas `source:"imported"` são persistidas
 * com `visibility:"private"` + `importJobId`, mas SEM `createdBy[]`
 * (import.recipe-mapping.ts não popula esse campo) — então o `$or` do
 * fast-path sozinho nunca autoriza o dono de um import (createdBy.userId é
 * vazio). Quando o filtro combinado não encontra nada, refazemos uma
 * segunda leitura SEM filtro de ownership; se o doc existir, for privado e
 * tiver `importJobId`, resolvemos o dono via `ImportJob.userId`
 * (getImportJob sem passar userId — resolução interna de ownership, não
 * uma request). Sem match (dono errado ou anônimo), o resultado final
 * continua `null` — sem vazar a existência do import (no existence leak).
 */
export async function getRecipeById(id: string): Promise<Recipe | null>;
export async function getRecipeById(
  id: string,
  userId: string | null,
): Promise<Recipe | null>;
export async function getRecipeById(
  id: string,
  ...rest: [userId: string | null] | []
): Promise<Recipe | null> {
  const projection = { embedding: 0, embeddingText: 0 };

  // Argumento omitido: caller trusted/interno — comportamento pré-existente,
  // inalterado (retorna qualquer receita, sem filtro de visibility).
  if (rest.length === 0) {
    const recipe = await RecipeModel.findById(id, { projection });
    return recipe as Recipe | null;
  }
  const [userId] = rest;

  // Caller untrusted (rota pública) — userId é `string` (autenticado) ou
  // `null` (anônimo); ambos passam pelo guard de visibilidade abaixo.
  const recipe = (await RecipeModel.find(
    {
      _id: new ObjectId(id),
      $or: [
        { visibility: { $ne: "private" } },
        ...(userId ? [{ visibility: "private", "createdBy.userId": userId }] : []),
      ],
    } as never,
    { projection },
  )) as Recipe | null;
  if (recipe) return recipe;
  if (!userId) return null; // anônimo nunca resolve um privado pelo fallback de import

  // Fast-path não encontrou (pode ser: não existe, ou é um import privado
  // cujo dono só é resolvível via importJobId → ImportJob.userId).
  const candidate = (await RecipeModel.findById(id, { projection })) as Recipe | null;
  if (!candidate || candidate.visibility !== "private" || !candidate.importJobId) {
    return null;
  }
  const job = await getImportJob(candidate.importJobId);
  if (job?.userId === userId) return candidate;
  return null;
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
