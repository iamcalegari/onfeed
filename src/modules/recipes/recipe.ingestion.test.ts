import { beforeEach, describe, expect, it, vi } from "vitest";

// env.ts valida MONGODB_URI/etc via required() no module-load — mock evita
// arrastar essa validação para a suite rápida (mesma decisão de
// import-worker.test.ts / import.service.test.ts).
vi.mock("@/config/env.js", () => ({
  env: {
    voyage: { model: "voyage-3" },
    // recipe.ingestion.ts importa recipe.extraction.ts -> anthropic.client.ts,
    // que lê env.anthropic.apiKey/model no module-load.
    anthropic: { apiKey: "test-key", model: "claude-haiku-4-5-20251001" },
  },
}));

// Canonicalização de ingredientes: espiona a contagem de chamadas por nome
// único (EXT-03) sem tocar Mongo/matching semântico real.
const resolveCanonicalForIngestion = vi.fn();
vi.mock("@/modules/ingredients/ingredient.service.js", () => ({
  resolveCanonicalForIngestion: (...args: unknown[]) =>
    resolveCanonicalForIngestion(...args),
}));

// Voyage: espiona o texto embeddado (mesma forma usada pelo catálogo, EXT-04).
const embedDocuments = vi.fn();
vi.mock("@/infra/embeddings/voyage.client.js", () => ({
  embeddings: { embedDocuments: (...args: unknown[]) => embedDocuments(...args) },
}));

// RecipeModel.insert: captura o doc inserido sem tocar Mongo real.
const insert = vi.fn();
vi.mock("./recipe.model.js", () => ({
  RecipeModel: { insert: (...args: unknown[]) => insert(...args) },
}));

const { persistExtractedRecipe } = await import("./recipe.ingestion.js");

describe("persistExtractedRecipe (EXT-03/EXT-04 — canonicalização + embedding reuse)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveCanonicalForIngestion.mockImplementation(async (name: string) => ({
      canonicalId: `canon:${name}`,
      isStaple: false,
    }));
    embedDocuments.mockResolvedValue([[0.1, 0.2, 0.3]]);
    insert.mockImplementation(async (doc: Record<string, unknown>) => ({
      _id: "recipe-id-1",
      ...doc,
    }));
  });

  const input = {
    title: "Risoto de Carnaroli",
    rawIngredients: ["2 xícaras de arroz carnaroli", "1 litro de caldo de legumes"],
    steps: ["Refogue o arroz", "Adicione o caldo aos poucos"],
    thumbnailUrl: "https://cdn.example.com/thumb.png",
    servings: 4,
  };

  const extracted = {
    intro: "Um risoto cremoso.",
    country: "IT",
    occasions: ["comfort_food"],
    equipment: ["stovetop" as const],
    ingredients: [
      { raw: "2 xícaras de arroz carnaroli", name: "arroz carnaroli", quantity: 2, unit: "xícara", core: true },
      { raw: "1 litro de caldo de legumes", name: "caldo de legumes", quantity: 1, unit: "l", core: true },
      // nome repetido (variação de raw) — deve canonicalizar 1x só (dedupe por nome único)
      { raw: "mais caldo se precisar", name: "caldo de legumes", quantity: null, unit: null, core: false },
    ],
    steps: [
      { text: "Refogue o arroz", minutes: 5 },
      { text: "Adicione o caldo aos poucos", minutes: 20 },
    ],
    nutrition: { calories: 400, protein: 10, carbs: 60, fat: 8 },
  };

  it("calls resolveCanonicalForIngestion once per ingredient entry (sequential canonicalization loop, EXT-03)", async () => {
    await persistExtractedRecipe(input, extracted, {
      source: "imported",
      visibility: "private",
    });

    // O loop de persistExtractedRecipe (não o batch) itera cada item do
    // array extraído — 3 ingredientes na fixture, incluindo o nome repetido.
    expect(resolveCanonicalForIngestion).toHaveBeenCalledTimes(3);
    expect(resolveCanonicalForIngestion).toHaveBeenNthCalledWith(1, "arroz carnaroli");
    expect(resolveCanonicalForIngestion).toHaveBeenNthCalledWith(2, "caldo de legumes");
    expect(resolveCanonicalForIngestion).toHaveBeenNthCalledWith(3, "caldo de legumes");
  });

  it("embeds using the same buildEmbeddingText shape used for catalog recipes (EXT-04)", async () => {
    await persistExtractedRecipe(input, extracted, {
      source: "imported",
      visibility: "private",
    });

    expect(embedDocuments).toHaveBeenCalledTimes(1);
    const [texts] = embedDocuments.mock.calls[0] as [string[]];
    expect(texts).toHaveLength(1);
    const text = texts[0]!;
    expect(text).toContain("Risoto de Carnaroli");
    expect(text).toContain("Cozinha: IT");
    expect(text).toContain("Ocasiões: comfort_food");
    expect(text).toContain("Ingredientes: arroz carnaroli, caldo de legumes, caldo de legumes");
    expect(text).toContain("Um risoto cremoso.");
  });

  it("inserts a doc carrying source 'imported' and visibility 'private' when opts request it", async () => {
    await persistExtractedRecipe(input, extracted, {
      source: "imported",
      visibility: "private",
      importJobId: "job-123",
      sourceMeta: { platform: "instagram", sourceUrl: "https://instagram.com/reel/abc" },
    });

    expect(insert).toHaveBeenCalledTimes(1);
    const [doc] = insert.mock.calls[0] as [Record<string, unknown>];
    expect(doc.source).toBe("imported");
    expect(doc.visibility).toBe("private");
    expect(doc.importJobId).toBe("job-123");
    expect(doc.sourceMeta).toEqual({
      platform: "instagram",
      sourceUrl: "https://instagram.com/reel/abc",
    });
  });

  it("defaults visibility to 'public' for existing callers that do not pass it (catalog/adapt/batch unchanged)", async () => {
    await persistExtractedRecipe(input, extracted, { source: "curated" });

    const [doc] = insert.mock.calls[0] as [Record<string, unknown>];
    expect(doc.visibility).toBe("public");
    expect(doc.importJobId).toBeUndefined();
    expect(doc.sourceMeta).toBeUndefined();
    expect(doc.grounding).toBeUndefined();
  });

  it("threads grounding through conditionally, without altering canonicalization/embedding calls", async () => {
    const grounding = {
      titleGrounding: "grounded" as const,
      quantityGrounding: ["grounded" as const],
      stepGrounding: ["grounded" as const],
      nutrition: "inferred" as const,
      sourceDivergence: [],
    };

    await persistExtractedRecipe(input, extracted, {
      source: "imported",
      visibility: "private",
      grounding,
    });

    const [doc] = insert.mock.calls[0] as [Record<string, unknown>];
    expect(doc.grounding).toEqual(grounding);
    expect(resolveCanonicalForIngestion).toHaveBeenCalledTimes(3);
    expect(embedDocuments).toHaveBeenCalledTimes(1);
  });
});
