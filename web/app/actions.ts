"use server";

import { cookies } from "next/headers";

import {
  adaptRecipe,
  addFavorite,
  getThumbnailUrl,
  removeFavorite,
  triggerThumbnail,
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

/** Dispara geração em background (retorna imediatamente). */
export async function triggerThumbnailAction(id: string): Promise<void> {
  await triggerThumbnail(id);
}

/** Lê a URL atual — null se ainda gerando. */
export async function getThumbnailUrlAction(
  id: string,
): Promise<{ thumbnailUrl: string | null; generating: boolean }> {
  return getThumbnailUrl(id);
}

export async function addFavoriteAction(recipeId: string): Promise<void> {
  await addFavorite(recipeId);
}

export async function removeFavoriteAction(recipeId: string): Promise<void> {
  await removeFavorite(recipeId);
}
