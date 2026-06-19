import { Model, METHODS } from "@iamcalegari/mongoat";
import type { ModelValidationSchema } from "@iamcalegari/mongoat";

export interface PantryItem {
  _id?: unknown;
  userId: string;
  ingredientId: string;
  insertedAt: Date;
  updatedAt: Date;
}

const schema: ModelValidationSchema = {
  bsonType: "object",
  required: ["userId", "ingredientId", "insertedAt", "updatedAt"],
  properties: {
    userId: { bsonType: "string" },
    ingredientId: { bsonType: "string" },
    insertedAt: { bsonType: "date" },
    updatedAt: { bsonType: "date" },
  },
};

export const PantryModel = new Model<PantryItem>({
  collectionName: "pantry",
  schema,
  allowedMethods: [
    METHODS.FIND,
    METHODS.FIND_MANY,
    METHODS.INSERT,
    METHODS.DELETE_MANY,
  ],
  documentDefaults: {
    insertedAt: new Date(),
    updatedAt: new Date(),
  } as never,
  indexes: [
    { key: { userId: 1, ingredientId: 1 }, name: "user_ingredient_unique", unique: true },
  ],
});
