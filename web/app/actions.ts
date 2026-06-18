"use server";

import { cookies } from "next/headers";

import {
  adaptRecipe,
  addFavorite,
  generateThumbnail,
  removeFavorite,
} from "@/lib/api";

/**
 * Server action da geração híbrida — roda no servidor do Next, chama o backend
 * (que mantém a chave da Anthropic), e devolve o id da receita adaptada.
 */
export async function adaptRecipeAction(
  id: string,
  haveIds: string[],
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const cookieStore = await cookies();
    const lang = (cookieStore.get("lang")?.value ?? "pt") as "pt" | "en";
    const recipe = await adaptRecipe(id, { haveIds, lang });
    return { ok: true, id: recipe._id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Falha na adaptação" };
  }
}

/** Geração lazy da thumbnail; null se imagens estão desabilitadas no backend. */
export async function generateThumbnailAction(
  id: string,
): Promise<string | null> {
  return generateThumbnail(id);
}

export async function addFavoriteAction(recipeId: string): Promise<void> {
  await addFavorite(recipeId);
}

export async function removeFavoriteAction(recipeId: string): Promise<void> {
  await removeFavorite(recipeId);
}
