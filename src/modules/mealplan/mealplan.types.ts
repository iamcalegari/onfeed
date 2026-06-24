import type { Nutrition } from "@/modules/recipes/recipe.types.js";

export const MEAL_SLOTS = ["breakfast", "lunch", "snack", "dinner"] as const;
export type MealSlot = (typeof MEAL_SLOTS)[number];

export interface MealPlanGoals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

/** Entrada da geração (já com userId resolvido pela rota). */
export interface GeneratePlanParams {
  userId: string;
  days: number; // 1..7
  slots: MealSlot[];
  goals: MealPlanGoals;
  usePantry?: boolean;
  dietaryTags?: string[];
  maxPrepTimeMin?: number;
  note?: string;
}

export interface PlanMealItem {
  slot: MealSlot;
  recipe: {
    _id: string;
    title: string;
    thumbnailUrl: string;
    prepTimeMin: number;
    country: string;
    /** Já escalada pelas porções (servings). */
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

export interface ShoppingListItem {
  name: string;
  haveInPantry: boolean;
}

export interface GeneratedMealPlan {
  days: PlanDay[];
  shoppingList: ShoppingListItem[];
  summary: {
    avgDailyCalories: number;
    targetCalories: number;
    fitsGoal: boolean;
  };
}
