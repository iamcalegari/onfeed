import { beforeAll, describe, expect, it } from "vitest";

import { REVIEW_SCORE_THRESHOLD } from "@/modules/import/import.confidence.js";
import type { Recipe } from "./recipe.types.js";
import type { env as EnvType } from "@/config/env.js";

// env.ts usa required() para MONGODB_URI/VOYAGE_API_KEY/ANTHROPIC_API_KEY e
// lança no import se ausentes — nenhum outro *.test.ts importa @/config/env
// diretamente hoje. Stub das obrigatórias antes do import dinâmico mantém
// este teste puro (sem Mongo, sem rede) e sem depender do .env do shell.
let env: typeof EnvType;

beforeAll(async () => {
  process.env.MONGODB_URI ??= "mongodb://stub";
  process.env.MONGODB_USERNAME ??= "stub";
  process.env.MONGODB_PASSWORD ??= "stub";
  process.env.MONGODB_DB_NAME ??= "stub";
  process.env.VOYAGE_API_KEY ??= "stub";
  process.env.ANTHROPIC_API_KEY ??= "stub";
  ({ env } = await import("@/config/env.js"));
});

// Guarda de shape (tipo), não de validator: o $jsonSchema BSON só pode ser
// exercitado contra um Mongo real (setup:db, USER GATE — ver 05-01-SUMMARY.md).
// Mesma convenção de "mocka o model, não o Mongo" usada em
// import-job.repository.test.ts.
describe("Recipe.shareSlug (Fase 5, D-03/D-04)", () => {
  const baseRecipe: Recipe = {
    visibility: "public",
    title: "Bolo de cenoura",
    intro: "Um clássico.",
    country: "BR",
    thumbnailUrl: "https://cdn.example.com/bolo.jpg",
    prepTimeMin: 40,
    servings: 8,
    occasions: ["lanche"],
    equipment: ["oven"],
    ingredients: [],
    steps: [],
    source: "imported",
    embeddingText: "bolo de cenoura",
    embedding: [],
    embeddingModel: "voyage-3",
    insertedAt: new Date(),
    updatedAt: new Date(),
  };

  it("aceita shareSlug como string e lê o valor de volta", () => {
    const recipe: Recipe = { ...baseRecipe, shareSlug: "a1b2c3d4e5f6" };

    expect(recipe.shareSlug).toBe("a1b2c3d4e5f6");
    expect(typeof recipe.shareSlug).toBe("string");
  });

  it("lê shareSlug ausente como undefined via optional access, sem lançar (receitas pré-Fase-5)", () => {
    const recipe: Recipe = { ...baseRecipe };

    expect(() => recipe.shareSlug?.length).not.toThrow();
    expect(recipe.shareSlug).toBeUndefined();
  });

  it("env.import.promoteConfidence é um número finito estritamente maior que o threshold de revisão (0.6, D-06)", () => {
    expect(Number.isFinite(env.import.promoteConfidence)).toBe(true);
    expect(env.import.promoteConfidence).toBeGreaterThan(REVIEW_SCORE_THRESHOLD);
    expect(REVIEW_SCORE_THRESHOLD).toBe(0.6);
  });
});
