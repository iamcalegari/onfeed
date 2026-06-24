import { Model, METHODS } from "@iamcalegari/mongoat";
import type { ModelValidationSchema } from "@iamcalegari/mongoat";

/**
 * plan_usage — quota MENSAL de geração de plano (espelha adapt_usage, mas a
 * janela é o mês: gerar um plano da semana inteira é caro o suficiente para não
 * fazer sentido limitar por dia).
 */
export interface PlanUsage {
  _id?: string;
  userId: string;
  month: string; // YYYY-MM (UTC)
  count: number;
  insertedAt: Date;
  updatedAt: Date;
}

const planUsageSchema: ModelValidationSchema = {
  bsonType: "object",
  required: ["userId", "month", "count", "insertedAt", "updatedAt"],
  properties: {
    userId: { bsonType: "string" },
    month: { bsonType: "string" },
    count: { bsonType: "number" },
    insertedAt: { bsonType: "date" },
    updatedAt: { bsonType: "date" },
  },
};

export const PlanUsageModel = new Model<PlanUsage>({
  collectionName: "plan_usage",
  schema: planUsageSchema,
  allowedMethods: [METHODS.UPDATE, METHODS.FIND],
  documentDefaults: {
    count: 0,
    insertedAt: new Date(),
    updatedAt: new Date(),
  } as never,
  indexes: [
    { key: { userId: 1, month: 1 }, name: "user_month_unique", unique: true },
  ],
});

/**
 * meal_plans — o plano corrente do usuário (1 por userId, upsert). O front
 * hidrata o localStorage a partir disto; persistir habilita sync multi-device.
 * Estrutura do plano guardada como subdocumentos livres (validação leve).
 */
export interface MealPlanDoc {
  _id?: string;
  userId: string;
  days: unknown[];
  shoppingList: unknown[];
  summary: Record<string, unknown>;
  insertedAt: Date;
  updatedAt: Date;
}

const mealPlanSchema: ModelValidationSchema = {
  bsonType: "object",
  required: ["userId", "insertedAt", "updatedAt"],
  properties: {
    userId: { bsonType: "string" },
    days: { bsonType: "array" },
    shoppingList: { bsonType: "array" },
    // O mongoat injeta additionalProperties:false em todo objeto, então as
    // chaves do summary precisam ser declaradas explicitamente.
    summary: {
      bsonType: "object",
      properties: {
        avgDailyCalories: { bsonType: "number" },
        targetCalories: { bsonType: "number" },
        fitsGoal: { bsonType: "bool" },
      },
    },
    insertedAt: { bsonType: "date" },
    updatedAt: { bsonType: "date" },
  },
};

export const MealPlanModel = new Model<MealPlanDoc>({
  collectionName: "meal_plans",
  schema: mealPlanSchema,
  allowedMethods: [METHODS.UPDATE, METHODS.FIND],
  documentDefaults: {
    insertedAt: new Date(),
    updatedAt: new Date(),
  } as never,
  indexes: [{ key: { userId: 1 }, name: "user_unique", unique: true }],
});
