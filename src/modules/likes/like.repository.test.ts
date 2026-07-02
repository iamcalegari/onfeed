import { beforeEach, describe, expect, it, vi } from "vitest";

// env.ts valida MONGODB_URI/etc via required() no module-load — mock evita
// arrastar essa validação para a suite rápida (mesma decisão de
// import.service.test.ts / import-job.repository.test.ts). Os dois
// thresholds testados aqui: variants.promoteThreshold (D-07, reusa o bar de
// likes) e import.promoteConfidence (D-06, bar de confiança dedicado).
vi.mock("@/config/env.js", () => ({
  env: {
    variants: { promoteThreshold: 5 },
    import: { promoteConfidence: 0.7 },
  },
}));

// getRecipeById: maybePromote (via toggleLike) usa o overload de 1 argumento
// (caller trusted/interno) — retorna a receita completa sem filtro de
// visibility. promoteToVariant/promoteImportToPublic: espionados para provar
// QUAL mutação foi chamada (ou não) em cada branch/gate.
const getRecipeByIdMock = vi.fn();
const promoteToVariantMock = vi.fn().mockResolvedValue(undefined);
const promoteImportToPublicMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@/modules/recipes/recipe.repository.js", () => ({
  getRecipeById: (...args: unknown[]) => getRecipeByIdMock(...args),
  promoteToVariant: (...args: unknown[]) => promoteToVariantMock(...args),
  promoteImportToPublic: (...args: unknown[]) => promoteImportToPublicMock(...args),
}));

// LikeModel: find/insert/deleteMany/total mockados — toggleLike é o entry
// point público que dispara maybePromote (função não-exportada) no insert.
const findMock = vi.fn();
const insertMock = vi.fn().mockResolvedValue(undefined);
const deleteManyMock = vi.fn().mockResolvedValue(undefined);
const totalMock = vi.fn();
vi.mock("./like.model.js", () => ({
  LikeModel: {
    find: (...args: unknown[]) => findMock(...args),
    insert: (...args: unknown[]) => insertMock(...args),
    deleteMany: (...args: unknown[]) => deleteManyMock(...args),
    total: (...args: unknown[]) => totalMock(...args),
  },
}));

const { toggleLike } = await import("./like.repository.js");

const OWNER_ID = "owner_user_1";
const LIKER_ID = "liker_user_1";
const RECIPE_ID = "507f1f77bcf86cd799439011";

function importedRecipe(overrides: Record<string, unknown> = {}) {
  return {
    _id: RECIPE_ID,
    source: "imported",
    visibility: "private",
    confidenceScore: 0.8,
    confirmedAt: new Date("2026-06-01"),
    createdBy: [{ userId: OWNER_ID, username: OWNER_ID }],
    ...overrides,
  };
}

beforeEach(() => {
  findMock.mockReset().mockResolvedValue(null); // toggleLike: nenhum like existente -> insere
  insertMock.mockClear();
  deleteManyMock.mockClear();
  totalMock.mockReset().mockResolvedValue(0);
  getRecipeByIdMock.mockReset();
  promoteToVariantMock.mockClear();
  promoteImportToPublicMock.mockClear();
});

describe("maybePromote (via toggleLike) — receita imported (D-05..D-08)", () => {
  it("promove (promoteImportToPublic) quando confiança >= promoteConfidence, confirmedAt setado, e likes de terceiros >= threshold", async () => {
    getRecipeByIdMock.mockResolvedValue(importedRecipe());
    totalMock.mockResolvedValue(5); // >= threshold (5)

    await toggleLike(LIKER_ID, RECIPE_ID);

    expect(promoteImportToPublicMock).toHaveBeenCalledWith(RECIPE_ID);
    expect(promoteToVariantMock).not.toHaveBeenCalled();
  });

  it("NÃO promove quando confidenceScore < promoteConfidence, mesmo com likes >= threshold (D-06)", async () => {
    getRecipeByIdMock.mockResolvedValue(importedRecipe({ confidenceScore: 0.5 }));
    totalMock.mockResolvedValue(5);

    await toggleLike(LIKER_ID, RECIPE_ID);

    expect(promoteImportToPublicMock).not.toHaveBeenCalled();
  });

  it("NÃO promove quando confirmedAt é null, mesmo com likes >= threshold (D-06)", async () => {
    getRecipeByIdMock.mockResolvedValue(importedRecipe({ confirmedAt: null }));
    totalMock.mockResolvedValue(5);

    await toggleLike(LIKER_ID, RECIPE_ID);

    expect(promoteImportToPublicMock).not.toHaveBeenCalled();
  });

  it("exclui o próprio like do dono do count (D-08): contagem sem terceiros fica em threshold-1 -> NÃO promove", async () => {
    getRecipeByIdMock.mockResolvedValue(importedRecipe());
    // LikeModel.total é chamado com { recipeId, userId: { $ne: ownerId } } —
    // simula o resultado que o Mongo real retornaria: com o dono excluído do
    // filtro, restam apenas threshold-1 likes de terceiros.
    totalMock.mockImplementation((filter: { userId?: { $ne: string } }) => {
      if (filter?.userId?.$ne === OWNER_ID) return Promise.resolve(4); // threshold - 1
      return Promise.resolve(5); // contagem bruta (incluindo o dono) já bateria o threshold
    });

    await toggleLike(LIKER_ID, RECIPE_ID);

    expect(promoteImportToPublicMock).not.toHaveBeenCalled();
    const [filterArg] = totalMock.mock.calls[0]!;
    expect((filterArg as { userId?: { $ne: string } }).userId).toEqual({ $ne: OWNER_ID });
  });

  it("com um like de terceiro a mais (excluindo o dono, chega no threshold) -> promove (D-08)", async () => {
    getRecipeByIdMock.mockResolvedValue(importedRecipe());
    totalMock.mockImplementation((filter: { userId?: { $ne: string } }) => {
      if (filter?.userId?.$ne === OWNER_ID) return Promise.resolve(5); // agora bate o threshold
      return Promise.resolve(6);
    });

    await toggleLike(LIKER_ID, RECIPE_ID);

    expect(promoteImportToPublicMock).toHaveBeenCalledWith(RECIPE_ID);
  });
});

describe("maybePromote (via toggleLike) — receita generated_pending (regressão, inalterado)", () => {
  it("promove via promoteToVariant quando likes >= threshold — caminho existente intacto", async () => {
    getRecipeByIdMock.mockResolvedValue({
      _id: RECIPE_ID,
      source: "generated_pending",
    });
    totalMock.mockResolvedValue(5);

    await toggleLike(LIKER_ID, RECIPE_ID);

    expect(promoteToVariantMock).toHaveBeenCalledWith(RECIPE_ID);
    expect(promoteImportToPublicMock).not.toHaveBeenCalled();
  });

  it("NÃO promove generated_pending abaixo do threshold", async () => {
    getRecipeByIdMock.mockResolvedValue({
      _id: RECIPE_ID,
      source: "generated_pending",
    });
    totalMock.mockResolvedValue(4);

    await toggleLike(LIKER_ID, RECIPE_ID);

    expect(promoteToVariantMock).not.toHaveBeenCalled();
  });
});
