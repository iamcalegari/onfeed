import { IngredientModel } from "@/modules/ingredients/ingredient.model.js";
import { PantryModel } from "./pantry.model.js";

export interface PantryIngredient {
  ingredientId: string;
  displayName: string;
  category: string;
}

export async function getPantryItems(userId: string): Promise<PantryIngredient[]> {
  const items = await PantryModel.findMany({ userId });
  if (items.length === 0) return [];

  const ingredientIds = items.map((i) => i.ingredientId);
  const ingredients = await IngredientModel.findMany(
    { _id: { $in: ingredientIds } } as never,
    { projection: { displayName: 1, category: 1 } },
  );

  const byId = new Map(ingredients.map((i) => [i._id as string, i]));
  return ingredientIds
    .map((id) => {
      const ing = byId.get(id);
      if (!ing) return null;
      return { ingredientId: id, displayName: ing.displayName, category: ing.category };
    })
    .filter((i): i is PantryIngredient => i !== null);
}

export async function getPantryIngredientIds(userId: string): Promise<string[]> {
  const items = await PantryModel.findMany(
    { userId },
    { projection: { ingredientId: 1 } },
  );
  return items.map((i) => i.ingredientId);
}

export async function addToPantry(userId: string, ingredientId: string): Promise<void> {
  const existing = await PantryModel.find({ userId, ingredientId });
  if (existing) return;
  await PantryModel.insert({
    userId,
    ingredientId,
    insertedAt: new Date(),
    updatedAt: new Date(),
  });
}

export async function removeFromPantry(userId: string, ingredientId: string): Promise<void> {
  await PantryModel.deleteMany({ userId, ingredientId });
}
