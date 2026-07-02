import { env } from "@/config/env.js";
import {
  getRecipeById,
  promoteImportToPublic,
  promoteToVariant,
} from "@/modules/recipes/recipe.repository.js";
import { LikeModel } from "./like.model.js";

export async function getLikeCount(recipeId: string): Promise<number> {
  return LikeModel.total({ recipeId });
}

export async function getUserLiked(userId: string, recipeId: string): Promise<boolean> {
  const doc = await LikeModel.find({ userId, recipeId });
  return doc !== null;
}

export async function toggleLike(
  userId: string,
  recipeId: string,
): Promise<{ liked: boolean; count: number }> {
  const existing = await LikeModel.find({ userId, recipeId });

  if (existing) {
    await LikeModel.deleteMany({ userId, recipeId });
  } else {
    await LikeModel.insert({ userId, recipeId, insertedAt: new Date(), updatedAt: new Date() });
    await maybePromote(recipeId);
  }

  const count = await LikeModel.total({ recipeId });
  return { liked: !existing, count };
}

/**
 * Dispara a promoção de uma receita ao atingir o threshold de likes.
 *
 * Dois branches paralelos por `source`:
 * - `generated_pending` → `variant` (inalterado, comportamento pré-existente).
 * - `imported` → `public` (Fase 5, D-05..D-08): gate de três partes — likes
 *   de terceiros >= threshold E confiança >= promoteConfidence E
 *   confirmedAt setado. Likes por popularidade sozinhos NUNCA promovem um
 *   import de baixa confiança (D-06); o dono nunca conta o próprio like
 *   (D-08, anti self-promoção).
 */
async function maybePromote(recipeId: string): Promise<void> {
  const recipe = await getRecipeById(recipeId);
  if (!recipe) return;

  if (recipe.source === "generated_pending") {
    const count = await LikeModel.total({ recipeId });
    if (count >= env.variants.promoteThreshold) {
      await promoteToVariant(recipeId);
    }
    return;
  }

  if (recipe.source === "imported") {
    // Dono/importador (createdBy[0].userId, populado no persist de imports —
    // import.recipe-mapping.ts:76). O próprio like do dono NUNCA conta pro
    // threshold (D-08) — exclui via $ne direto no filtro, já que
    // LikeModel.total() repassa o filtro para collection.countDocuments()
    // (mongoat), que aceita operadores Mongo normalmente. Não precisa de
    // fetch-then-count client-side.
    const ownerId = recipe.createdBy?.[0]?.userId;
    const thirdPartyCount = await LikeModel.total({
      recipeId,
      ...(ownerId && { userId: { $ne: ownerId } }),
    } as never);

    const confidenceOk = (recipe.confidenceScore ?? 0) >= env.import.promoteConfidence;
    const confirmedOk = recipe.confirmedAt != null;

    if (thirdPartyCount >= env.variants.promoteThreshold && confidenceOk && confirmedOk) {
      await promoteImportToPublic(recipeId);
    }
  }
}
