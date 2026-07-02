export type RecipeSource =
  | "curated"            // dataset público normalizado
  | "generated_pending"  // gerada por LLM, aguardando likes/moderação
  | "generated_validated"// (legado) gerada e aprovada
  | "variant"            // promovida de pending após threshold de likes
  | "rejected"           // rejeitada pelo admin
  | "user"               // submetida diretamente por usuário
  | "imported";          // extraída de vídeo (onFeed Import — Fase 2)

/** Visibilidade da receita. Import sempre nasce 'private'; promoção pública é Fase 5. */
export type RecipeVisibility = "private" | "public";

/** Nível de confiança de um campo extraído (Fase 2 — onFeed Import). */
export type GroundingLevel = "grounded" | "inferred" | "ambiguous";

/**
 * Grounding por campo de uma receita importada — honestidade explícita sobre
 * o que veio literal do transcript/caption vs o que o LLM inferiu/estimou.
 * Só existe em receitas `source: "imported"`; alimenta o gate de revisão
 * (D-01..D-03) e a tela de revisão (Fase 3).
 */
export interface RecipeGrounding {
  titleGrounding: GroundingLevel;
  /** grounding da quantidade por ingrediente — índice paralelo a `ingredients[]` (array, não Record: o mongoat injeta additionalProperties:false, então chaves dinâmicas de object são rejeitadas) */
  quantityGrounding: GroundingLevel[];
  /** grounding por passo — índice paralelo a `steps[]` */
  stepGrounding: GroundingLevel[];
  /** nutrição é sempre estimada pelo mecanismo do catálogo (D-10) — nunca perguntada ao modelo */
  nutrition: "inferred";
  /** campos onde transcript e caption divergem explicitamente (D-08) */
  sourceDivergence: string[];
}

/** Crédito de quem gerou uma receita variante. */
export interface RecipeCreator {
  userId: string;
  username: string;
}

/** Equipamentos canônicos (dimensão E do I/E/T/N). */
export type Equipment =
  | "stovetop" // fogão
  | "oven" // forno
  | "microwave" // microondas
  | "blender" // liquidificador/processador
  | "none"; // não precisa de equipamento (cru/montagem)

export const EQUIPMENT_VALUES: Equipment[] = [
  "stovetop",
  "oven",
  "microwave",
  "blender",
  "none",
];

/** Objetivo nutricional (dimensão N). */
export type NutritionGoal = "satiety" | "macros";

export interface RecipeIngredient {
  raw: string;
  canonicalId: string;
  name: string;
  nameEn?: string;
  core: boolean;
  isStaple: boolean;
  quantity?: number;
  unit?: string;
}

/** Passo com tempo estimado — alimenta o timer por passo no Recipe Details. */
export interface RecipeStep {
  text: string;
  textEn?: string;
  minutes?: number;
}

/** Nutrição por porção. Opcional: nem todo dataset traz (ver dimensão N). */
export interface Nutrition {
  calories: number;
  protein: number; // g
  carbs: number; // g
  fat: number; // g
}

export const DIETARY_TAGS = [
  "vegetarian",
  "vegan",
  "gluten_free",
  "lactose_free",
  "sugar_free",
  "low_carb",
] as const;

export type DietaryTag = (typeof DIETARY_TAGS)[number];

export interface Recipe {
  _id?: string;
  /** ID original do dataset de origem (ex: food.com recipe id). Sparse unique. */
  externalId?: string;
  /** Aponta para o pai imediato (pode ser base ou outra variante). */
  parentRecipeId?: string;
  /** Quem gerou esta receita (variantes podem ter múltiplos criadores). */
  createdBy?: RecipeCreator[];
  /** Tags dietéticas inferidas na ingestão: filtra hard na busca. */
  dietaryTags?: DietaryTag[];
  /** Média de avaliações pós-cozinha (1–5). Desnormalizado do collection ratings. */
  avgRating?: number;
  /** Total de avaliações. */
  ratingCount?: number;
  /** Visibilidade — receitas importadas nascem 'private'; catálogo é 'public'. */
  visibility: RecipeVisibility;
  /** Grounding por campo — só presente em receitas source: "imported" (Fase 2). */
  grounding?: RecipeGrounding;
  /** Back-reference ao ImportJob que originou esta receita (Fase 2). */
  importJobId?: string;
  /** Metadados do post/vídeo de origem, desnormalizados (Fase 2). */
  sourceMeta?: {
    platform: string;
    authorHandle?: string;
    authorUrl?: string;
    sourceUrl: string;
  };
  /** true quando a extração ficou abaixo do limiar de confiança (Fase 2/3). */
  reviewRequired?: boolean;
  /** score agregado de confiança 0..1 (Fase 2/3). */
  confidenceScore?: number;
  /** Setado apenas por confirmImportedRecipe no PATCH de confirmação explícita do usuário (REV-04, Fase 3). */
  confirmedAt?: Date;
  title: string;
  /** Tradução lazy do intro para inglês (gerada sob demanda na primeira request lang=en). */
  introEn?: string;
  intro: string;
  country: string; // ISO 3166-1 alpha-2
  thumbnailUrl: string;
  prepTimeMin: number;
  servings: number;
  occasions: string[];
  equipment: Equipment[];
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
  nutrition?: Nutrition;
  source: RecipeSource;
  embeddingText: string;
  embedding: number[];
  embeddingModel: string;
  insertedAt: Date;
  updatedAt: Date;
}

/** Sub-scores por dimensão (0..1), renderizados como as barras I/E/T/N. */
export interface DimensionScores {
  i: number; // cobertura de ingredientes
  e: number; // compatibilidade de equipamento
  t: number; // aderência ao tempo
  n: number; // aderência ao objetivo nutricional
}

/** Item da Result List (sem o embedding pesado e sem os passos). */
export interface RecipeSearchHit {
  _id: string;
  title: string;
  intro: string;
  country: string;
  thumbnailUrl: string;
  prepTimeMin: number;
  servings: number;
  source: RecipeSource;
  parentRecipeId?: string;
  createdBy?: RecipeCreator[];
  /** 0..100 — o "Match Score" do círculo */
  matchScore: number;
  scores: DimensionScores;
  /** ingredientes que o usuário não tem (já excluídos os staples) */
  missing: { canonicalId: string; name: string; core: boolean }[];
  missingCoreCount: number;
  cookableNow: boolean;
  nutrition?: Nutrition;
  avgRating?: number;
  ratingCount?: number;
}
