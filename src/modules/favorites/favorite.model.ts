import { Model, METHODS } from "@iamcalegari/mongoat";
import type { ModelValidationSchema } from "@iamcalegari/mongoat";

export interface Favorite {
  _id?: string;
  userId: string; // Clerk userId
  recipeId: string; // hex do _id da receita
  insertedAt: Date;
  updatedAt: Date;
}

const schema: ModelValidationSchema = {
  bsonType: "object",
  required: ["userId", "recipeId", "insertedAt", "updatedAt"],
  properties: {
    userId: { bsonType: "string" },
    recipeId: { bsonType: "string" },
    insertedAt: { bsonType: "date" },
    updatedAt: { bsonType: "date" },
  },
};

export const FavoriteModel = new Model<Favorite>({
  collectionName: "favorites",
  schema,
  allowedMethods: [
    METHODS.FIND,
    METHODS.FIND_MANY,
    METHODS.INSERT,
    METHODS.DELETE_MANY,
    METHODS.TOTAL,
  ],
  documentDefaults: {
    insertedAt: new Date(),
    updatedAt: new Date(),
  } as never,
  indexes: [
    // um favorito por (usuário, receita)
    { key: { userId: 1, recipeId: 1 }, name: "user_recipe_unique", unique: true },
  ],
});
