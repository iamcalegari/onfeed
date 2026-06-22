import { env } from "@/config/env.js";
import { getRecipeById, promoteToVariant } from "@/modules/recipes/recipe.repository.js";
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

/** Promove generated_pending → variant se atingiu o threshold de likes. */
async function maybePromote(recipeId: string): Promise<void> {
  const recipe = await getRecipeById(recipeId);
  if (!recipe || recipe.source !== "generated_pending") return;

  const count = await LikeModel.total({ recipeId });
  if (count >= env.variants.promoteThreshold) {
    await promoteToVariant(recipeId);
  }
}
