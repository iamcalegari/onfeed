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

export interface SearchHit {
  _id: string;
  title: string;
  intro: string;
  country: string;
  thumbnailUrl: string;
  prepTimeMin: number;
  servings: number;
  matchScore: number;
  scores: DimensionScores;
  missing: MissingIngredient[];
  missingCoreCount: number;
  cookableNow: boolean;
}

export interface SearchResponse {
  results: SearchHit[];
  unresolvedIngredients: string[];
  haveIds: string[];
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
}
