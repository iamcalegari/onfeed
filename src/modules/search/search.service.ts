import { embeddings } from "@/infra/embeddings/voyage.client.js";
import { resolveUserIngredients } from "@/modules/ingredients/ingredient.service.js";
import { hybridSearch } from "@/modules/recipes/recipe.repository.js";
import type { RecipeSearchHit } from "@/modules/recipes/recipe.types.js";
import type { SearchRequest } from "./search.dto.js";

export interface SearchOutcome {
  results: RecipeSearchHit[];
  unresolvedIngredients: string[];
  haveIds: string[];
}

/**
 * Monta a frase de query para embeddar. Deve espelhar a "forma" do
 * embeddingText da ingestão (mesma estrutura, mesmo modelo Voyage).
 * Ocasião e objetivo entram aqui como sinal semântico (além de virarem
 * filtros/scores adiante).
 */
function buildQueryText(req: SearchRequest): string {
  const parts: string[] = [];
  if (req.ingredients.length) {
    parts.push(`Ingredientes disponíveis: ${req.ingredients.join(", ")}.`);
  }
  if (req.occasions?.length) parts.push(`Ocasião: ${req.occasions.join(", ")}.`);
  if (req.equipment?.length) {
    parts.push(`Equipamentos: ${req.equipment.join(", ")}.`);
  }
  if (req.maxPrepTimeMin) parts.push(`Até ${req.maxPrepTimeMin} minutos.`);
  if (req.goal === "satiety") parts.push("Objetivo: matar a fome.");
  if (req.goal === "macros") parts.push("Objetivo: respeitar macros.");
  if (req.note) parts.push(req.note);
  return parts.join(" ");
}

export async function searchRecipes(req: SearchRequest): Promise<SearchOutcome> {
  // Sem nenhum critério não há o que embeddar/buscar — e a Voyage rejeita input
  // vazio (400). Retorna vazio em vez de estourar; o front trata results=[].
  const queryText = buildQueryText(req);
  if (!queryText.trim()) {
    return { results: [], unresolvedIngredients: [], haveIds: [] };
  }

  // I — canonicaliza os ingredientes do usuário
  const { haveIds, unresolved } = await resolveUserIngredients(req.ingredients);

  // query semântica (input_type=query)
  const queryVector = await embeddings.embedQuery(queryText);

  const results = await hybridSearch({
    queryVector,
    haveIds,
    ...(req.equipment !== undefined && { availableEquipment: req.equipment }),
    ...(req.maxPrepTimeMin !== undefined && {
      maxPrepTimeMin: req.maxPrepTimeMin,
    }),
    ...(req.goal !== undefined && { goal: req.goal }),
    ...(req.limit !== undefined && { limit: req.limit }),
  });

  return { results, unresolvedIngredients: unresolved, haveIds };
}
