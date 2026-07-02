// Espelha os contratos da API (backend Fastify). Mantido manualmente já que o
// front é um app separado.

export type Equipment = "stovetop" | "oven" | "microwave" | "blender" | "none";
export type NutritionGoal = "satiety" | "macros";

export interface SearchRequest {
  ingredients: string[];
  equipment?: Equipment[];
  maxPrepTimeMin?: number;
  goal?: NutritionGoal;
  occasions?: string[];
  note?: string;
  limit?: number;
  lang?: "pt" | "en";
  baseIngredients?: string[];
  titleSearch?: string;
  dietaryTags?: string[];
}

export interface DimensionScores {
  i: number;
  e: number;
  t: number;
  n: number;
}

export interface MissingIngredient {
  canonicalId: string;
  name: string;
  core: boolean;
}

export type RecipeSource =
  | "curated"
  | "generated_pending"
  | "generated_validated"
  | "variant"
  | "rejected"
  | "user"
  | "imported";

export interface RecipeCreator {
  userId: string;
  username: string;
}

export interface SearchHit {
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
  matchScore: number;
  scores: DimensionScores;
  missing: MissingIngredient[];
  missingCoreCount: number;
  cookableNow: boolean;
  nutrition?: Nutrition;
  avgRating?: number;
  ratingCount?: number;
}

export interface SearchResponse {
  results: SearchHit[];
  unresolvedIngredients: string[];
  haveIds: string[];
}

export interface RatingStats {
  /** média 0..5 (0 = sem avaliações) */
  avg: number;
  count: number;
  /** nota do usuário atual, ou null se não avaliou / anônimo */
  mine: number | null;
}

export interface RecipeIngredient {
  raw: string;
  canonicalId: string;
  name: string;
  core: boolean;
  isStaple: boolean;
  quantity?: number;
  unit?: string;
}

export interface RecipeStep {
  text: string;
  minutes?: number;
}

export interface Nutrition {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface PantryIngredient {
  ingredientId: string;
  displayName: string;
  category: string;
}

export interface FavoriteRecipe {
  _id: string;
  title: string;
  country: string;
  thumbnailUrl: string;
  intro: string;
  prepTimeMin: number;
  ingredientNames: string[];
}

export interface Recipe {
  _id: string;
  title: string;
  intro: string;
  country: string;
  thumbnailUrl: string;
  prepTimeMin: number;
  servings: number;
  occasions: string[];
  equipment: Equipment[];
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
  nutrition?: Nutrition;
  source: RecipeSource;
  parentRecipeId?: string;
  createdBy?: RecipeCreator[];
  /** Grounding por campo — só presente em receitas source: "imported" (Fase 2/3). */
  grounding?: RecipeGrounding;
  /** true quando a extração ficou abaixo do limiar de confiança (Fase 2/3). */
  reviewRequired?: boolean;
  /** Setado apenas após o PATCH de confirmação explícita do usuário (REV-04). */
  confirmedAt?: string;
}

/* ── Plano alimentar (CheffIA) ─────────────────────────────── */

export type MealSlot = "breakfast" | "lunch" | "snack" | "dinner";

export interface PlanMealItem {
  slot: MealSlot;
  recipe: {
    _id: string;
    title: string;
    thumbnailUrl: string;
    prepTimeMin: number;
    country: string;
    nutrition: Nutrition;
  };
  servings: number;
  why?: string;
}

export interface PlanDay {
  dayIndex: number;
  slots: PlanMealItem[];
  totals: Nutrition;
}

export interface GeneratedPlan {
  days: PlanDay[];
  shoppingList: { name: string; haveInPantry: boolean }[];
  summary: { avgDailyCalories: number; targetCalories: number; fitsGoal: boolean };
}

export interface GeneratePlanRequest {
  days: number;
  slots: MealSlot[];
  goals: { calories: number; protein: number; carbs: number; fat: number };
  usePantry?: boolean;
  dietaryTags?: string[];
  maxPrepTimeMin?: number;
  note?: string;
}

/* ── onFeed Import (Fase 3 — captura + revisão obrigatória) ──────────── */

export type ImportJobStatus =
  | "queued"
  | "downloading"
  | "transcribing"
  | "extracting"
  | "ready_for_review"
  | "failed";

export type ImportFailureReason =
  | "unsupported_platform"
  | "invalid_url"
  | "anti_bot_blocked"
  | "rate_limited"
  | "video_unavailable"
  | "no_speech_detected"
  | "transcription_failed"
  | "download_timeout"
  | "extraction_failed"
  | "unknown_error";

export interface ImportJob {
  _id: string;
  status: ImportJobStatus;
  failureReason?: ImportFailureReason;
  errorMessage?: string;
  recipeId?: string;
  reviewRequired?: boolean;
  confidenceScore?: number;
  platform: "instagram" | "tiktok" | "youtube";
  sourceMeta?: {
    authorHandle?: string;
    authorUrl?: string;
    durationSec?: number;
  };
}

/** Nível de confiança de um campo extraído (só existe em source: "imported"). */
export type GroundingLevel = "grounded" | "inferred" | "ambiguous";

export interface RecipeGrounding {
  titleGrounding: GroundingLevel;
  quantityGrounding: GroundingLevel[];
  stepGrounding: GroundingLevel[];
  nutrition: "inferred";
  sourceDivergence: string[];
}

/** Corpo do PATCH /import/:jobId/recipe — mirrora ImportRecipeEditSchema (content-only). */
export interface ImportRecipeEditPatch {
  title: string;
  intro: string;
  ingredients: { name: string; quantity?: number; unit?: string }[];
  steps: { text: string }[];
}

/** Item retornado por GET /import/mine — RecipeSearchHit + status de revisão. */
export interface ImportedRecipeListItem extends SearchHit {
  reviewRequired?: boolean;
  confirmedAt?: string;
}
