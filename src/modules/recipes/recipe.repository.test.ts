import { beforeEach, describe, expect, it, vi } from "vitest";

// recipe.repository.ts importa RECIPE_VECTOR_INDEX de search-indexes.ts, que
// por sua vez importa connection.ts (conecta ao Mongo real via env.mongo.uri
// no module-load) — mockado direto para não arrastar nenhuma validação de
// env/infra real para a suite rápida (mesma decisão de recipe.ingestion.test.ts).
vi.mock("@/infra/database/search-indexes.js", () => ({
  RECIPE_VECTOR_INDEX: "recipe_vector_index",
}));

const aggregate = vi.fn();
const find = vi.fn();
const findById = vi.fn();
const findMany = vi.fn();
vi.mock("./recipe.model.js", () => ({
  RecipeModel: {
    aggregate: (...args: unknown[]) => aggregate(...args),
    find: (...args: unknown[]) => find(...args),
    findById: (...args: unknown[]) => findById(...args),
    findMany: (...args: unknown[]) => findMany(...args),
  },
}));

// getRecipeById (T-03-05/T-03-06) importa getImportJob para resolver
// ownership de imports privados (createdBy[] vazio) via importJobId →
// ImportJob.userId — mockado para não arrastar import-job.model.ts (que
// conecta ao Mongo real no module-load, mesmo gotcha do comentário acima).
const getImportJob = vi.fn();
vi.mock("@/modules/import/import-job.repository.js", () => ({
  getImportJob: (...args: unknown[]) => getImportJob(...args),
}));

const { hybridSearch, getRecipeById, DEFAULT_SEARCH_SOURCES, listImportedRecipesByOwner } =
  await import("./recipe.repository.js");

function minimalParams(overrides: Partial<Parameters<typeof hybridSearch>[0]> = {}) {
  return {
    queryVector: [0.1, 0.2, 0.3],
    haveIds: [],
    ...overrides,
  };
}

describe("hybridSearch — owner-scoped $vectorSearch filter (D-14 / T-02-06)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    aggregate.mockResolvedValue([]);
  });

  it("adds the visibility/createdBy.userId $or clause to the $vectorSearch filter when ownerId is present", async () => {
    await hybridSearch(minimalParams({ ownerId: "user_A", sources: [...DEFAULT_SEARCH_SOURCES, "imported"] }));

    expect(aggregate).toHaveBeenCalledTimes(1);
    const [pipeline] = aggregate.mock.calls[0] as [Array<Record<string, unknown>>];
    const vectorStage = pipeline[0] as { $vectorSearch: { filter: Record<string, unknown> } };
    expect(vectorStage.$vectorSearch.filter).toEqual(
      expect.objectContaining({
        $or: [
          { visibility: { $ne: "private" } },
          { visibility: "private", "createdBy.userId": "user_A" },
        ],
      }),
    );
  });

  it("does NOT add an owner clause when ownerId is absent (catalog behavior preserved)", async () => {
    await hybridSearch(minimalParams());

    const [pipeline] = aggregate.mock.calls[0] as [Array<Record<string, unknown>>];
    const vectorStage = pipeline[0] as { $vectorSearch: { filter: Record<string, unknown> } };
    expect(vectorStage.$vectorSearch.filter.$or).toBeUndefined();
  });

  it("DEFAULTS.sources (exported as DEFAULT_SEARCH_SOURCES) does not contain 'imported'", () => {
    expect(DEFAULT_SEARCH_SOURCES).toEqual(["curated", "generated_validated", "variant", "user"]);
    expect(DEFAULT_SEARCH_SOURCES).not.toContain("imported");
  });

  it("cross-user isolation: user A's private imported recipe filter matches only createdBy.userId === A, never B", async () => {
    await hybridSearch(minimalParams({ ownerId: "user_B", sources: [...DEFAULT_SEARCH_SOURCES, "imported"] }));

    const [pipeline] = aggregate.mock.calls[0] as [Array<Record<string, unknown>>];
    const vectorStage = pipeline[0] as { $vectorSearch: { filter: Record<string, unknown> } };
    const orClause = vectorStage.$vectorSearch.filter.$or as Array<Record<string, unknown>>;
    const ownerBranch = orClause[1] as Record<string, unknown>;
    expect(ownerBranch["createdBy.userId"]).toBe("user_B");
    expect(ownerBranch["createdBy.userId"]).not.toBe("user_A");
  });
});

describe("getRecipeById — IDOR-safe owner overload (D-14 / T-02-07)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("without userId, keeps the existing findById-by-id behavior unchanged", async () => {
    findById.mockResolvedValue({ _id: "recipe1", title: "Bolo" });

    const result = await getRecipeById("recipe1");

    expect(findById).toHaveBeenCalledWith("recipe1", {
      projection: { embedding: 0, embeddingText: 0 },
    });
    expect(find).not.toHaveBeenCalled();
    expect(result).toEqual({ _id: "recipe1", title: "Bolo" });
  });

  it("with userId, folds ownership into a single Mongo filter (never fetch-then-compare)", async () => {
    find.mockResolvedValue({ _id: "recipe1", title: "Bolo", visibility: "private" });

    await getRecipeById("507f1f77bcf86cd799439011", "user_A");

    expect(findById).not.toHaveBeenCalled();
    expect(find).toHaveBeenCalledTimes(1);
    const [filter] = find.mock.calls[0] as [Record<string, unknown>];
    expect(filter.$or).toEqual([
      { visibility: { $ne: "private" } },
      { visibility: "private", "createdBy.userId": "user_A" },
    ]);
  });

  it("resolves null for a non-owner requesting another user's private recipe (no leak via existence check)", async () => {
    // O driver Mongo real não retornaria o doc porque o filtro combinado
    // ($or) já exclui o caso "private + não é o dono" — aqui simulamos
    // exatamente esse retorno vazio do banco. Como o candidato de fallback
    // (findById) não é mockado aqui, resolve undefined → null (mesmo path
    // de "não existe").
    find.mockResolvedValue(null);

    const result = await getRecipeById("507f1f77bcf86cd799439011", "user_B");

    expect(result).toBeNull();
  });

  it("resolves ownership of a private IMPORT (empty createdBy[]) via importJobId → ImportJob.userId for the owner (T-03-05/T-03-06)", async () => {
    // Fast-path $or não encontra (createdBy[] vazio no import) → fallback
    // via findById + getImportJob.
    find.mockResolvedValue(null);
    findById.mockResolvedValue({
      _id: "recipe1",
      title: "Risoto",
      visibility: "private",
      importJobId: "job_1",
    });
    getImportJob.mockResolvedValue({ _id: "job_1", userId: "user_A" });

    const result = await getRecipeById("507f1f77bcf86cd799439011", "user_A");

    expect(getImportJob).toHaveBeenCalledWith("job_1");
    expect(result).toEqual({
      _id: "recipe1",
      title: "Risoto",
      visibility: "private",
      importJobId: "job_1",
    });
  });

  it("resolves null for a different user requesting a private import (owner mismatch via importJobId)", async () => {
    find.mockResolvedValue(null);
    findById.mockResolvedValue({
      _id: "recipe1",
      title: "Risoto",
      visibility: "private",
      importJobId: "job_1",
    });
    getImportJob.mockResolvedValue({ _id: "job_1", userId: "user_A" });

    const result = await getRecipeById("507f1f77bcf86cd799439011", "user_B");

    expect(result).toBeNull();
  });

  it("resolves null for an anonymous caller (no userId) requesting a private import", async () => {
    findById.mockResolvedValue({
      _id: "recipe1",
      title: "Risoto",
      visibility: "private",
      importJobId: "job_1",
    });

    const result = await getRecipeById("507f1f77bcf86cd799439011");

    // Sem userId, getRecipeById nem tenta o fast-path $or (early branch),
    // vai direto ao findById cru — mas o caller (a rota) é quem decide
    // 404; aqui validamos só o retorno bruto do repository sem userId
    // (comportamento inalterado, não filtra por visibility nesse ramo).
    expect(getImportJob).not.toHaveBeenCalled();
    expect(result).toEqual({
      _id: "recipe1",
      title: "Risoto",
      visibility: "private",
      importJobId: "job_1",
    });
  });
});

describe("listImportedRecipesByOwner (D-09 'Minhas importações' — filtro puro, sem $vectorSearch)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("filtra por source:'imported' + createdBy.userId do dono via findMany — NUNCA aggregate/$vectorSearch (regressão do 500 'queried with 0')", async () => {
    findMany.mockResolvedValueOnce([]);

    await listImportedRecipesByOwner("user_A");

    // O bug era passar queryVector:[] ao hybridSearch → $vectorSearch (aggregate)
    // → Atlas 500. A listagem tem que ser find puro, jamais aggregate.
    expect(aggregate).not.toHaveBeenCalled();
    expect(findMany).toHaveBeenCalledTimes(1);
    const [filter, options] = findMany.mock.calls[0] as [
      Record<string, unknown>,
      Record<string, unknown>,
    ];
    expect(filter).toEqual({ source: "imported", "createdBy.userId": "user_A" });
    expect(options.sort).toEqual({ insertedAt: -1 });
    // embedding pesado nunca projetado.
    expect((options.projection as Record<string, number>).embedding).toBe(0);
  });

  it("mapeia os docs para hits incluindo reviewRequired/confirmedAt (status 'Em revisão'/'Confirmada')", async () => {
    const confirmedAt = new Date("2026-07-02T00:00:00Z");
    findMany.mockResolvedValueOnce([
      {
        _id: { toString: () => "r_em_revisao" },
        title: "Risoto (em revisão)",
        source: "imported",
        reviewRequired: true,
      },
      {
        _id: { toString: () => "r_confirmada" },
        title: "Risoto (confirmada)",
        source: "imported",
        reviewRequired: false,
        confirmedAt,
      },
    ]);

    const hits = await listImportedRecipesByOwner("user_A");

    expect(hits).toHaveLength(2);
    const [emRevisao, confirmada] = hits as [
      (typeof hits)[number],
      (typeof hits)[number],
    ];
    expect(emRevisao).toMatchObject({ _id: "r_em_revisao", reviewRequired: true });
    expect(emRevisao.confirmedAt).toBeUndefined();
    expect(confirmada).toMatchObject({ _id: "r_confirmada", reviewRequired: false, confirmedAt });
  });

  it("repassa o limit fornecido", async () => {
    findMany.mockResolvedValueOnce([]);

    await listImportedRecipesByOwner("user_B", 5);

    const [, options] = findMany.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(options.limit).toBe(5);
  });
});
