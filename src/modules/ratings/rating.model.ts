import { Model, METHODS } from "@iamcalegari/mongoat";
import type { ModelValidationSchema } from "@iamcalegari/mongoat";

/**
 * Avaliação pós-cozinha (1–5). Diferente do "like" (curtir antes de fazer):
 * o rating é dado DEPOIS de cozinhar, no fim do modo cozinha. O ato de avaliar
 * também sinaliza que o usuário de fato fez a receita.
 *
 * Um rating por usuário por receita (índice único); reavaliar faz upsert.
 */
export interface Rating {
  _id?: string;
  userId: string;
  recipeId: string;
  rating: number; // 1..5
  insertedAt: Date;
  updatedAt: Date;
}

const schema: ModelValidationSchema = {
  bsonType: "object",
  required: ["userId", "recipeId", "rating", "insertedAt", "updatedAt"],
  properties: {
    userId:     { bsonType: "string" },
    recipeId:   { bsonType: "string" },
    rating:     { bsonType: "number", minimum: 1, maximum: 5 },
    insertedAt: { bsonType: "date" },
    updatedAt:  { bsonType: "date" },
  },
};

export const RatingModel = new Model<Rating>({
  collectionName: "ratings",
  schema,
  allowedMethods: [
    METHODS.FIND,
    METHODS.INSERT,
    METHODS.UPDATE,
    METHODS.TOTAL,
    METHODS.AGGREGATE,
  ],
  documentDefaults: {
    insertedAt: new Date(),
    updatedAt:  new Date(),
  } as never,
  indexes: [
    { key: { userId: 1, recipeId: 1 }, name: "user_recipe_rating_unique", unique: true },
    { key: { recipeId: 1 }, name: "recipe_ratings" },
  ],
});
