export type RecipeSource =
  | "curated" // dataset público normalizado
  | "generated_pending" // gerada por LLM, em quarentena
  | "generated_validated" // gerada e aprovada/avaliada bem
  | "user"; // submetida por usuário

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
  core: boolean;
  isStaple: boolean;
  quantity?: number;
  unit?: string;
}

/** Passo com tempo estimado — alimenta o timer por passo no Recipe Details. */
export interface RecipeStep {
  text: string;
  minutes?: number;
}

/** Nutrição por porção. Opcional: nem todo dataset traz (ver dimensão N). */
export interface Nutrition {
  calories: number;
  protein: number; // g
  carbs: number; // g
  fat: number; // g
}

export interface Recipe {
  _id?: string;
  title: string;
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
  /** 0..100 — o "Match Score" do círculo */
  matchScore: number;
  scores: DimensionScores;
  /** ingredientes que o usuário não tem (já excluídos os staples) */
  missing: { canonicalId: string; name: string; core: boolean }[];
  missingCoreCount: number;
  cookableNow: boolean;
}
