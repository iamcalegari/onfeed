"use server";

import { adaptRecipe, generateThumbnail } from "@/lib/api";

/**
 * Server action da geração híbrida — roda no servidor do Next, chama o backend
 * (que mantém a chave da Anthropic), e devolve o id da receita adaptada.
 */
export async function adaptRecipeAction(
  id: string,
  haveIds: string[],
): Promise<{ id: string }> {
  const recipe = await adaptRecipe(id, { haveIds });
  return { id: recipe._id };
}

/** Geração lazy da thumbnail; null se imagens estão desabilitadas no backend. */
export async function generateThumbnailAction(
  id: string,
): Promise<string | null> {
  return generateThumbnail(id);
}
