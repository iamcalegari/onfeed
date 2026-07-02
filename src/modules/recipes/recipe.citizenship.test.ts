import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Fase 5, Plano 06 — testes de REGRESSÃO que PROVAM (não reconstroem)
 * cidadania plena de receitas importadas (D-11):
 *
 *  (a) RCP-01: adaptRecipe aceita uma receita base source:"imported" e
 *      produz um filho generated_pending ancorado nela, SEM nenhum
 *      branch/rejeição por source (mesmo caminho de uma receita curated).
 *  (b) SOC-01: o mapeamento de import persiste visibility:"private"
 *      (nasce privada) — verificado, não assumido.
 *  (c) SOC-05: promoteImportToPublic (Plano 02) só toca visibility/updatedAt
 *      no $set — source, createdBy[] e sourceMeta NUNCA são tocados, logo
 *      sobrevivem estruturalmente à promoção (D-05/D-09).
 *
 * Mantido puro/mockado (sem Mongo real), mesmo idioma de
 * recipe.ingestion.test.ts / import-job.repository.test.ts.
 */

// env.ts valida MONGODB_URI/etc via required() no module-load — mock evita
// arrastar essa validação para a suite rápida (mesma decisão de
// recipe.ingestion.test.ts / import.service.test.ts).
vi.mock("@/config/env.js", () => ({
  env: {
    voyage: { model: "voyage-3" },
    anthropic: { apiKey: "test-key", model: "claude-haiku-4-5-20251001" },
  },
}));

// recipe.repository.ts (importado por recipe.generation.ts via getRecipeById)
// importa search-indexes.ts -> connection.ts, que conecta ao Mongo real no
// module-load — mockado direto (mesma decisão de recipe.repository.test.ts).
vi.mock("@/infra/database/search-indexes.js", () => ({
  RECIPE_VECTOR_INDEX: "recipe_vector_index",
}));

// getRecipeById tem um fallback de ownership para imports privados via
// importJobId -> ImportJob.userId — não exercido pelo caller trusted
// (1-arg) que adaptRecipe usa, mas o módulo precisa existir para import.
vi.mock("@/modules/import/import-job.repository.js", () => ({
  getImportJob: vi.fn(),
}));

// Canonicalização de ingredientes: espiona, sem tocar Mongo/matching real.
const resolveCanonicalForIngestion = vi.fn();
vi.mock("@/modules/ingredients/ingredient.service.js", () => ({
  resolveCanonicalForIngestion: (...args: unknown[]) =>
    resolveCanonicalForIngestion(...args),
}));

// Voyage: nunca chama a API real.
const embedDocuments = vi.fn();
vi.mock("@/infra/embeddings/voyage.client.js", () => ({
  embeddings: { embedDocuments: (...args: unknown[]) => embedDocuments(...args) },
}));

// RecipeModel: captura findById (getRecipeById) e insert (persistExtractedRecipe).
const findById = vi.fn();
const insert = vi.fn();
const update = vi.fn();
vi.mock("./recipe.model.js", () => ({
  RecipeModel: {
    findById: (...args: unknown[]) => findById(...args),
    insert: (...args: unknown[]) => insert(...args),
    update: (...args: unknown[]) => update(...args),
  },
}));

// anthropic.messages.parse: nunca chama a API real — devolve uma receita
// adaptada mínima e válida contra AdaptedRecipeSchema.
const parse = vi.fn();
vi.mock("@/infra/llm/anthropic.client.js", () => ({
  anthropic: { messages: { parse: (...args: unknown[]) => parse(...args) } },
  EXTRACTION_MODEL: "claude-haiku-4-5-20251001",
  effortOption: () => ({}),
}));

const { adaptRecipe } = await import("./recipe.generation.js");
const { promoteImportToPublic } = await import("./recipe.repository.js");

describe("Citizenship — receita importada (D-11, SOC-01, SOC-05, RCP-01)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveCanonicalForIngestion.mockImplementation(async (name: string) => ({
      canonicalId: `canon:${name}`,
      isStaple: false,
    }));
    embedDocuments.mockResolvedValue([[0.1, 0.2, 0.3]]);
    insert.mockImplementation(async (doc: Record<string, unknown>) => ({
      _id: "adapted-recipe-1",
      ...doc,
    }));
  });

  describe("RCP-01 — adaptRecipe trata uma base 'imported' identicamente a uma curated", () => {
    const adaptedPayload = {
      title: "Risoto adaptado",
      intro: "Versão adaptada.",
      country: "IT",
      occasions: ["comfort_food"],
      equipment: ["stovetop"],
      ingredients: [
        { raw: "2 xícaras de arroz", name: "arroz", quantity: 2, unit: "xícara", core: true },
      ],
      steps: [{ text: "Refogue o arroz", minutes: 5 }],
      nutrition: null,
    };

    beforeEach(() => {
      parse.mockResolvedValue({ stop_reason: "end_turn", parsed_output: adaptedPayload });
    });

    it("resolve a base via getRecipeById (trusted, 1-arg) e produz um filho generated_pending ancorado — mesmo caminho para source:'imported' e source:'curated'", async () => {
      const importedAnchor = {
        _id: "recipe-imported-1",
        title: "Receita importada original",
        source: "imported" as const,
        visibility: "private" as const,
        servings: 4,
        ingredients: [
          { raw: "2 xícaras de arroz", canonicalId: "canon:arroz", name: "arroz", core: true, isStaple: false, quantity: 2, unit: "xícara" },
        ],
        steps: [{ text: "Refogue o arroz" }],
      };
      findById.mockResolvedValue(importedAnchor);

      const result = await adaptRecipe("recipe-imported-1", {
        haveIds: ["canon:arroz"],
        creator: { userId: "user_1", username: "user_1" },
      });

      // getRecipeById é chamado no idioma trusted (1 arg só) — nenhum
      // segundo argumento de userId/visibility é passado por adaptRecipe.
      expect(findById).toHaveBeenCalledWith("recipe-imported-1", expect.anything());
      expect(findById.mock.calls[0]).toHaveLength(2); // (id, { projection }) — sem userId

      expect(result).not.toBeNull();
      expect(insert).toHaveBeenCalledTimes(1);
      const [insertedDoc] = insert.mock.calls[0] as [Record<string, unknown>];
      // Filho é sempre generated_pending, ancorado via parentRecipeId — sem
      // NENHUM branch/campo condicionado a anchor.source === "imported".
      expect(insertedDoc.source).toBe("generated_pending");
      expect(insertedDoc.parentRecipeId).toBe("recipe-imported-1");
      expect(insertedDoc.createdBy).toEqual([{ userId: "user_1", username: "user_1" }]);
    });

    it("produz o MESMO shape de insert (source generated_pending + parentRecipeId) quando a base é source:'curated' — prova que não há special-casing por source", async () => {
      const curatedAnchor = {
        _id: "recipe-curated-1",
        title: "Receita curated original",
        source: "curated" as const,
        visibility: "public" as const,
        servings: 4,
        ingredients: [
          { raw: "2 xícaras de arroz", canonicalId: "canon:arroz", name: "arroz", core: true, isStaple: false, quantity: 2, unit: "xícara" },
        ],
        steps: [{ text: "Refogue o arroz" }],
      };
      findById.mockResolvedValue(curatedAnchor);

      await adaptRecipe("recipe-curated-1", {
        haveIds: ["canon:arroz"],
        creator: { userId: "user_1", username: "user_1" },
      });

      const [insertedDocCurated] = insert.mock.calls[0] as [Record<string, unknown>];

      vi.clearAllMocks();
      resolveCanonicalForIngestion.mockImplementation(async (name: string) => ({
        canonicalId: `canon:${name}`,
        isStaple: false,
      }));
      embedDocuments.mockResolvedValue([[0.1, 0.2, 0.3]]);
      insert.mockImplementation(async (doc: Record<string, unknown>) => ({
        _id: "adapted-recipe-2",
        ...doc,
      }));
      parse.mockResolvedValue({ stop_reason: "end_turn", parsed_output: adaptedPayload });
      findById.mockResolvedValue({
        ...curatedAnchor,
        _id: "recipe-imported-2",
        source: "imported" as const,
        visibility: "private" as const,
      });

      await adaptRecipe("recipe-imported-2", {
        haveIds: ["canon:arroz"],
        creator: { userId: "user_1", username: "user_1" },
      });
      const [insertedDocImported] = insert.mock.calls[0] as [Record<string, unknown>];

      // Ambos os filhos são idênticos em source/estrutura — nenhum campo
      // extra ou diferente aparece por a base ser "imported".
      expect(insertedDocImported.source).toBe(insertedDocCurated.source);
      expect(insertedDocImported.source).toBe("generated_pending");
    });

    it("nunca rejeita/lança ao adaptar uma base 'imported' — resolve normalmente (sem erro de source não suportado)", async () => {
      findById.mockResolvedValue({
        _id: "recipe-imported-3",
        title: "Outra receita importada",
        source: "imported" as const,
        visibility: "private" as const,
        servings: 2,
        ingredients: [
          { raw: "1 litro de caldo", canonicalId: "canon:caldo", name: "caldo", core: true, isStaple: false, quantity: 1, unit: "l" },
        ],
        steps: [{ text: "Ferva o caldo" }],
      });

      await expect(
        adaptRecipe("recipe-imported-3", { haveIds: [] }),
      ).resolves.not.toBeNull();
    });
  });

  describe("SOC-01 — receita importada nasce privada (born private)", () => {
    it("mapExtractedToRecipe seta visibility:'private' e createdBy[0] com o userId do importador (substrato de SOC-05)", async () => {
      const { mapExtractedToRecipe } = await import(
        "@/modules/import/import.recipe-mapping.js"
      );

      const extracted = {
        title: "Bolo de fubá",
        titleGrounding: "grounded" as const,
        intro: "Bolo simples.",
        country: "BR",
        occasions: ["merenda"],
        equipment: ["oven" as const],
        ingredients: [
          {
            raw: "2 xícaras de fubá",
            name: "fubá",
            quantity: 2,
            unit: "xícara",
            core: true,
            quantityGrounding: "grounded" as const,
          },
        ],
        steps: [{ text: "Misture tudo", minutes: 5, grounding: "grounded" as const }],
        nutrition: null,
        sourceDivergence: [],
      };

      const job = {
        _id: "job-1",
        userId: "user_importer_1",
        platform: "instagram" as const,
        sourceUrl: "https://instagram.com/reel/abc",
        normalizedUrl: "https://instagram.com/reel/abc",
        status: "extracting" as const,
        retryCount: 0,
        insertedAt: new Date(),
        updatedAt: new Date(),
        sourceMeta: { authorHandle: "chef_original" },
      };

      const confidence = { score: 0.9, reviewRequired: false, reasons: [] };

      const { options } = mapExtractedToRecipe(
        extracted as never,
        job as never,
        confidence as never,
      );

      // SOC-01: nasce privada — não assumido, verificado contra o mapeamento real.
      expect(options.visibility).toBe("private");
      expect(options.source).toBe("imported");
      // Substrato de SOC-05: createdBy[0] populado com o importador +
      // sourceMeta com o creator externo (@handle).
      expect(options.createdBy).toEqual([
        { userId: "user_importer_1", username: "user_importer_1" },
      ]);
      expect(options.sourceMeta?.authorHandle).toBe("chef_original");
    });
  });

  describe("SOC-05 — createdBy[]/sourceMeta sobrevivem à promoção (créditos nunca somem)", () => {
    it("promoteImportToPublic só toca visibility/updatedAt no $set — source, createdBy e sourceMeta NUNCA aparecem no update", async () => {
      update.mockResolvedValue(undefined);

      await promoteImportToPublic("507f1f77bcf86cd799439011");

      expect(update).toHaveBeenCalledTimes(1);
      const [filter, updateDoc] = update.mock.calls[0] as [
        Record<string, unknown>,
        { $set: Record<string, unknown> },
      ];

      // Guard de idempotência: só promove um import ainda privado.
      expect(filter).toMatchObject({ source: "imported", visibility: "private" });

      // O $set é a prova de SOC-05: visibility muda, mas source/createdBy/
      // sourceMeta NÃO fazem parte do update — logo, se a receita entrou com
      // source:"imported" + createdBy[]/sourceMeta preenchidos (SOC-01,
      // acima), esses campos permanecem intocados/estruturalmente retidos
      // depois da promoção (D-05/D-09 — nunca vira "variant").
      expect(updateDoc.$set.visibility).toBe("public");
      expect(updateDoc.$set).not.toHaveProperty("source");
      expect(updateDoc.$set).not.toHaveProperty("createdBy");
      expect(updateDoc.$set).not.toHaveProperty("sourceMeta");
    });

    it("o filtro de idempotência exige source:'imported' — nunca promove (nem flipa por engano) uma receita de outro source", async () => {
      update.mockResolvedValue(undefined);

      await promoteImportToPublic("507f1f77bcf86cd799439099");

      const [filter] = update.mock.calls[0] as [Record<string, unknown>];
      expect(filter.source).toBe("imported");
      expect(filter.source).not.toBe("variant");
      expect(filter.source).not.toBe("generated_pending");
    });
  });
});
