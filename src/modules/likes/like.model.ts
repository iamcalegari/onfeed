import { Model, METHODS } from "@iamcalegari/mongoat";
import type { ModelValidationSchema } from "@iamcalegari/mongoat";

export interface Like {
  _id?: string;
  userId: string;
  recipeId: string;
  insertedAt: Date;
  updatedAt: Date;
}

const schema: ModelValidationSchema = {
  bsonType: "object",
  required: ["userId", "recipeId", "insertedAt", "updatedAt"],
  properties: {
    userId:     { bsonType: "string" },
    recipeId:   { bsonType: "string" },
    insertedAt: { bsonType: "date" },
    updatedAt:  { bsonType: "date" },
  },
};

export const LikeModel = new Model<Like>({
  collectionName: "likes",
  schema,
  allowedMethods: [METHODS.FIND, METHODS.INSERT, METHODS.DELETE_MANY, METHODS.TOTAL],
  documentDefaults: {
    insertedAt: new Date(),
    updatedAt:  new Date(),
  } as never,
  indexes: [
    { key: { userId: 1, recipeId: 1 }, name: "user_recipe_unique", unique: true },
    { key: { recipeId: 1 }, name: "recipe_likes" },
  ],
});
