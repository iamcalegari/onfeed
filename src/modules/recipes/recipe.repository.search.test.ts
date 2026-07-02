import type { Document } from "mongodb";
import { beforeAll, describe, expect, it, vi } from "vitest";

// Testa hybridSearch mockando RecipeModel (sem Mongo/Atlas real) — captura o
// pipeline $vectorSearch construído e asserta na FORMA do filtro, não no
// resultado de um $vectorSearch real (que exige um índice Atlas vivo). Este
// é o teste de regressão de isolamento de busca exigido pela Fase 5
// (D-10/D-14): garante que a inclusão de "imported" em DEFAULTS.sources
// nunca vaza um import privado para outro usuário ou para o público.
vi.mock("./recipe.model.js", () => ({
  RecipeModel: {
    aggregate: vi.fn().mockResolvedValue([]),
  },
}));

// recipe.repository.ts importa RECIPE_VECTOR_INDEX de
// @/infra/database/search-indexes.js, que importa @/config/env.js
// diretamente — env.ts usa required() e lança no import se as env vars
// obrigatórias estiverem ausentes. Mesmo stub-antes-do-import-dinâmico usado
// em recipe.model.test.ts (primeiro teste do repo a esbarrar nisso).
let hybridSearch: typeof import("./recipe.repository.js").hybridSearch;
let RecipeModel: typeof import("./recipe.model.js").RecipeModel;

beforeAll(async () => {
  process.env.MONGODB_URI ??= "mongodb://stub";
  process.env.MONGODB_USERNAME ??= "stub";
  process.env.MONGODB_PASSWORD ??= "stub";
  process.env.MONGODB_DB_NAME ??= "stub";
  process.env.VOYAGE_API_KEY ??= "stub";
  process.env.ANTHROPIC_API_KEY ??= "stub";
  ({ hybridSearch } = await import("./recipe.repository.js"));
  ({ RecipeModel } = await import("./recipe.model.js"));
});

function capturedFilter(): Document {
  const pipeline = vi.mocked(RecipeModel.aggregate).mock.calls.at(-1)?.[0] as Document[];
  const vectorSearchStage = pipeline[0] as { $vectorSearch: { filter: Document } };
  return vectorSearchStage.$vectorSearch.filter;
}

const baseParams = {
  queryVector: new Array(1024).fill(0),
  haveIds: [] as string[],
};

describe("hybridSearch — search isolation (Fase 5, D-10/D-14)", () => {
  it("busca pública (sem ownerId) exclui visibility:private E inclui 'imported' no source set", async () => {
    await hybridSearch({ ...baseParams });

    const filter = capturedFilter();

    // "imported" precisa estar no source set público para imports promovidos
    // (visibility:"public") surgirem no catálogo geral.
    expect(filter.source).toEqual({ $in: expect.arrayContaining(["imported"]) });

    // Sem ownerId, o guard de visibilidade precisa EXCLUIR private
    // incondicionalmente — nenhum $or condicional a ownerId aqui.
    expect(filter.visibility).toEqual({ $ne: "private" });
    expect(filter.$or).toBeUndefined();
  });

  it("busca com ownerId === 'A' admite o próprio privado de A (createdBy.userId === 'A') + tudo não-privado", async () => {
    await hybridSearch({ ...baseParams, ownerId: "A" });

    const filter = capturedFilter();

    expect(filter.$or).toEqual([
      { visibility: { $ne: "private" } },
      { visibility: "private", "createdBy.userId": "A" },
    ]);
    // O guard incondicional de "visibility != private" isolado NÃO deve
    // aparecer quando ownerId está presente — o $or já cobre esse caso.
    expect(filter.visibility).toBeUndefined();
  });

  it("um import privado de A (createdBy.userId: 'A') NUNCA satisfaz o $or de uma busca com ownerId === 'B'", async () => {
    await hybridSearch({ ...baseParams, ownerId: "B" });

    const filter = capturedFilter();
    const orClauses = filter.$or as Document[];

    // O único braço "privado" do $or de B exige createdBy.userId === "B" —
    // um documento de A (createdBy.userId: "A", visibility: "private") não
    // casa com { visibility: {$ne:"private"} } (é private) nem com
    // { visibility:"private", "createdBy.userId":"B" } (dono é A, não B).
    const privateClause = orClauses.find((c) => c.visibility === "private");
    expect(privateClause).toEqual({ visibility: "private", "createdBy.userId": "B" });
    expect(privateClause?.["createdBy.userId"]).not.toBe("A");

    const nonPrivateClause = orClauses.find((c) => c.visibility !== "private");
    expect(nonPrivateClause).toEqual({ visibility: { $ne: "private" } });
  });
});
