import { ObjectId } from "mongodb";

import { RecipeModel } from "@/modules/recipes/recipe.model.js";
import { FavoriteModel } from "./favorite.model.js";

/** Receita favoritada, só com o necessário pra renderizar um card. */
export interface FavoriteRecipe {
  _id: string;
  title: string;
  country: string;
  thumbnailUrl: string;
  intro: string;
  prepTimeMin: number;
}

export async function addFavorite(
  userId: string,
  recipeId: string,
): Promise<void> {
  const existing = await FavoriteModel.find({ userId, recipeId });
  if (existing) return; // idempotente
  await FavoriteModel.insert({
    userId,
    recipeId,
    insertedAt: new Date(),
    updatedAt: new Date(),
  });
}

export async function removeFavorite(
  userId: string,
  recipeId: string,
): Promise<void> {
  await FavoriteModel.deleteMany({ userId, recipeId });
}

export async function listFavoriteRecipeIds(userId: string): Promise<string[]> {
  const favs = await FavoriteModel.findMany(
    { userId },
    { projection: { recipeId: 1 } },
  );
  return favs.map((f) => f.recipeId);
}

export async function listFavoriteRecipes(
  userId: string,
): Promise<FavoriteRecipe[]> {
  const favs = await FavoriteModel.findMany(
    { userId },
    { sort: { insertedAt: -1 } },
  );
  const ids = favs.map((f) => f.recipeId);
  if (ids.length === 0) return [];

  const recipes = await RecipeModel.findMany(
    { _id: { $in: ids.map((id) => new ObjectId(id)) } } as never,
    { projection: { title: 1, country: 1, thumbnailUrl: 1, intro: 1, prepTimeMin: 1 } },
  );

  // reordena na ordem em que foram favoritadas (mais recente primeiro)
  const byId = new Map(recipes.map((r) => [String(r._id), r]));
  return ids
    .map((id) => byId.get(id))
    .filter((r): r is NonNullable<typeof r> => Boolean(r))
    .map((r) => ({
      _id: String(r._id),
      title: r.title,
      country: r.country,
      thumbnailUrl: r.thumbnailUrl,
      intro: r.intro,
      prepTimeMin: r.prepTimeMin,
    }));
}
