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
    nameEn: { bsonType: "string" },
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
    textEn: { bsonType: "string" },
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

const creatorSchema: ModelValidationSchema = {
  bsonType: "object",
  required: ["userId", "username"],
  properties: {
    userId: { bsonType: "string" },
    username: { bsonType: "string" },
  },
};

// Grounding por campo (Fase 2 — onFeed Import). Só presente em source: "imported".
const groundingSchema: ModelValidationSchema = {
  bsonType: "object",
  required: ["titleGrounding", "quantityGrounding", "stepGrounding", "nutrition", "sourceDivergence"],
  properties: {
    titleGrounding: { bsonType: "string", enum: ["grounded", "inferred", "ambiguous"] },
    quantityGrounding: { bsonType: "array", items: { bsonType: "string", enum: ["grounded", "inferred", "ambiguous"] } },
    stepGrounding: { bsonType: "array", items: { bsonType: "string", enum: ["grounded", "inferred", "ambiguous"] } },
    nutrition: { bsonType: "string", enum: ["inferred"] },
    sourceDivergence: { bsonType: "array", items: { bsonType: "string" } },
  },
};

// Metadados desnormalizados do post/vídeo de origem (Fase 2 — onFeed Import).
const sourceMetaSchema: ModelValidationSchema = {
  bsonType: "object",
  required: ["platform", "sourceUrl"],
  properties: {
    platform: { bsonType: "string" },
    authorHandle: { bsonType: "string" },
    authorUrl: { bsonType: "string" },
    sourceUrl: { bsonType: "string" },
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
    externalId: { bsonType: "string" },
    parentRecipeId: { bsonType: "objectId" },
    createdBy: { bsonType: "array", items: creatorSchema },
    title: { bsonType: "string" },
    introEn: { bsonType: "string" },
    intro: { bsonType: "string" },
    country: { bsonType: "string", description: "ISO 3166-1 alpha-2" },
    thumbnailUrl: { bsonType: "string" },
    prepTimeMin: { bsonType: "number" },
    servings: { bsonType: "number" },
    occasions: { bsonType: "array", items: { bsonType: "string" } },
    dietaryTags: { bsonType: "array", items: { bsonType: "string" } },
    avgRating:   { bsonType: "number" },
    ratingCount: { bsonType: "number" },
    // Fase 2 (onFeed Import) — intencionalmente OPTIONAL aqui: docs de catálogo
    // existentes não têm visibility; default 'public' é aplicado na camada de
    // app (persistExtractedRecipe), não no schema (mongoat valida todo insert).
    visibility: { bsonType: "string", enum: ["private", "public"] },
    grounding: groundingSchema,
    importJobId: { bsonType: "string" },
    sourceMeta: sourceMetaSchema,
    reviewRequired: { bsonType: "bool" },
    confidenceScore: { bsonType: "number" },
    // Fase 3 (Capture/Review UI) — setado apenas por confirmImportedRecipe
    // no PATCH de confirmação explícita do usuário (REV-04). Optional: nenhum
    // doc pré-existente (catálogo ou import ainda não confirmado) o possui.
    confirmedAt: { bsonType: "date" },
    // Fase 5 (Publish/Promotion) — token secreto do link público. Optional:
    // só existe a partir de confirmImportedRecipe (D-03/D-04); NUNCA required.
    shareSlug: { bsonType: "string" },
    equipment: {
      bsonType: "array",
      items: {
        bsonType: "string",
        enum: ["stovetop", "oven", "microwave", "blender", "none"],
      },
    },
    ingredients: { bsonType: "array", items: ingredientSchema },
    steps: { bsonType: "array", items: stepSchema },
    nutrition: nutritionSchema,
    source: {
      bsonType: "string",
      enum: ["curated", "generated_pending", "generated_validated", "variant", "rejected", "user", "imported"],
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
    { key: { externalId: 1 }, name: "external_id_unique", unique: true, sparse: true },
    // sparse: receitas sem parentRecipeId (base/user) não entram no índice
    { key: { parentRecipeId: 1 }, name: "parent_recipe_lookup", sparse: true },
    { key: { dietaryTags: 1 }, name: "dietary_tags_lookup", sparse: true },
    // sparse: só receitas importadas (source: "imported") têm importJobId.
    { key: { importJobId: 1 }, name: "import_job_lookup", sparse: true },
    // unique: colisão de token entre duas receitas é impossível; sparse: só
    // receitas confirmadas (Fase 5) têm shareSlug — pré-Fase-5 fica isenta.
    { key: { shareSlug: 1 }, name: "share_slug_lookup", unique: true, sparse: true },
  ],
});
