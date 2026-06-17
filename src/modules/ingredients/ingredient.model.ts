import { Model, METHODS } from "@iamcalegari/mongoat";
import type { ModelValidationSchema } from "@iamcalegari/mongoat";

import type { CanonicalIngredient } from "./ingredient.types.js";

const schema: ModelValidationSchema = {
  bsonType: "object",
  // _id é adicionado automaticamente ao `required` pelo mongoat — não duplicar aqui.
  required: [
    "displayName",
    "synonyms",
    "category",
    "isStaple",
    "pending",
    "insertedAt",
    "updatedAt",
  ],
  properties: {
    // _id é string (slug), não ObjectId — sobrescreve o default do mongoat.
    _id: { bsonType: "string", description: "slug canônico, ex: olive_oil" },
    displayName: { bsonType: "string" },
    synonyms: { bsonType: "array", items: { bsonType: "string" } },
    category: { bsonType: "string" },
    isStaple: { bsonType: "bool" },
    pending: { bsonType: "bool" },
    // opcional (não em `required`): só presente após embeddar
    embedding: { bsonType: "array", items: { bsonType: "number" } },
    insertedAt: { bsonType: "date" },
    updatedAt: { bsonType: "date" },
  },
};

export const IngredientModel = new Model<CanonicalIngredient>({
  collectionName: "ingredients",
  schema,
  allowedMethods: [
    METHODS.FIND,
    METHODS.FIND_MANY,
    METHODS.INSERT,
    METHODS.UPDATE,
    METHODS.BULK_WRITE,
    METHODS.AGGREGATE,
  ],
  documentDefaults: {
    pending: false,
    synonyms: [],
    insertedAt: new Date(),
    updatedAt: new Date(),
  } as Partial<CanonicalIngredient> as never,
  indexes: [
    // match exato de termo: o caminho rápido da canonicalização
    { key: { synonyms: 1 }, name: "synonyms_lookup" },
    { key: { isStaple: 1 }, name: "staple_lookup" },
  ],
});
