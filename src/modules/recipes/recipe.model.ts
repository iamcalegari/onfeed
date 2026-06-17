import { Model, METHODS } from "@iamcalegari/mongoat";
import type { ModelValidationSchema } from "@iamcalegari/mongoat";

import { env } from "@/config/env.js";
import type { Recipe } from "./recipe.types.js";

const ingredientSchema: ModelValidationSchema = {
  bsonType: "object",
  required: ["raw", "canonicalId", "name", "core", "isStaple"],
  properties: {
    raw: { bsonType: "string" },
    canonicalId: { bsonType: "string" },
    name: { bsonType: "string" },
    core: { bsonType: "bool" },
    isStaple: { bsonType: "bool" },
    // "number" cobre int e double — um número JS vira BSON double e "int" o rejeitaria
    quantity: { bsonType: "number" },
    unit: { bsonType: "string" },
  },
};

const stepSchema: ModelValidationSchema = {
  bsonType: "object",
  required: ["text"],
  properties: {
    text: { bsonType: "string" },
    minutes: { bsonType: "number" },
  },
};

const nutritionSchema: ModelValidationSchema = {
  bsonType: "object",
  required: ["calories", "protein", "carbs", "fat"],
  properties: {
    calories: { bsonType: "number" },
    protein: { bsonType: "number" },
    carbs: { bsonType: "number" },
    fat: { bsonType: "number" },
  },
};

const schema: ModelValidationSchema = {
  bsonType: "object",
  required: [
    "title",
    "intro",
    "country",
    "thumbnailUrl",
    "prepTimeMin",
    "servings",
    "occasions",
    "equipment",
    "ingredients",
    "steps",
    "source",
    "embeddingText",
    "embedding",
    "embeddingModel",
    "insertedAt",
    "updatedAt",
  ],
  properties: {
    title: { bsonType: "string" },
    intro: { bsonType: "string" },
    country: { bsonType: "string", description: "ISO 3166-1 alpha-2" },
    thumbnailUrl: { bsonType: "string" },
    prepTimeMin: { bsonType: "number" },
    servings: { bsonType: "number" },
    occasions: { bsonType: "array", items: { bsonType: "string" } },
    equipment: {
      bsonType: "array",
      items: {
        bsonType: "string",
        enum: ["stovetop", "oven", "microwave", "blender", "none"],
      },
    },
    ingredients: { bsonType: "array", items: ingredientSchema },
    steps: { bsonType: "array", items: stepSchema },
    // opcional (não em required): nem todo dataset traz nutrição
    nutrition: nutritionSchema,
    source: {
      bsonType: "string",
      enum: ["curated", "generated_pending", "generated_validated", "user"],
    },
    embeddingText: { bsonType: "string" },
    embedding: { bsonType: "array", items: { bsonType: "number" } },
    embeddingModel: { bsonType: "string" },
    insertedAt: { bsonType: "date" },
    updatedAt: { bsonType: "date" },
  },
};

export const RecipeModel = new Model<Recipe>({
  collectionName: "recipes",
  schema,
  allowedMethods: [
    METHODS.AGGREGATE, // necessário p/ o $vectorSearch
    METHODS.FIND,
    METHODS.FIND_MANY,
    METHODS.FIND_BY_ID,
    METHODS.INSERT,
    METHODS.INSERT_MANY,
    METHODS.UPDATE,
    METHODS.TOTAL,
    METHODS.BULK_WRITE,
  ],
  documentDefaults: {
    embeddingModel: env.voyage.model,
    insertedAt: new Date(),
    updatedAt: new Date(),
  } as Partial<Recipe> as never,
  indexes: [
    { key: { source: 1 }, name: "source_lookup" },
    { key: { "ingredients.canonicalId": 1 }, name: "ingredient_lookup" },
  ],
});
