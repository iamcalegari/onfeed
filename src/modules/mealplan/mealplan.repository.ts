import { MealPlanModel, PlanUsageModel } from "./mealplan.model.js";
import type { GeneratedMealPlan } from "./mealplan.types.js";

export interface QuotaResult {
  allowed: boolean;
  count: number;
  limit: number;
}

/** Incrementa (atômico, via upsert) o contador mensal de planos do usuário. */
export async function consumeMonthlyPlanQuota(
  userId: string,
  limit: number,
): Promise<QuotaResult> {
  const month = new Date().toISOString().slice(0, 7);
  const doc = (await PlanUsageModel.update(
    { userId, month },
    {
      $inc: { count: 1 },
      $setOnInsert: { insertedAt: new Date() },
      $set: { updatedAt: new Date() },
    },
    { upsert: true },
  )) as { count?: number } | null;

  const count = doc?.count ?? 1;
  return { allowed: count <= limit, count, limit };
}

/** Salva (upsert por userId) o plano corrente do usuário. */
export async function saveCurrentPlan(
  userId: string,
  plan: GeneratedMealPlan,
): Promise<void> {
  await MealPlanModel.update(
    { userId },
    {
      $set: {
        days: plan.days,
        shoppingList: plan.shoppingList,
        summary: plan.summary,
        updatedAt: new Date(),
      },
      $setOnInsert: { insertedAt: new Date() },
    },
    { upsert: true },
  );
}
