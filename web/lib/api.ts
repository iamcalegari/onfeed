import "server-only";

import { auth } from "@clerk/nextjs/server";

import type {
  Equipment,
  FavoriteRecipe,
  NutritionGoal,
  PantryIngredient,
  Recipe,
  SearchRequest,
  SearchResponse,
} from "./types";

const API_BASE = process.env.API_BASE_URL ?? "http://localhost:3000";

/**
 * Encaminha o token do Clerk pro backend (Authorization: Bearer). Roda no
 * servidor (server components / actions). Se o Clerk não estiver configurado
 * ou não houver sessão, segue sem header (a API trata como anônimo).
 */
async function authHeaders(): Promise<Record<string, string>> {
  try {
    const { getToken } = await auth();
    const token = await getToken();
    return token ? { authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

export async function searchRecipes(
  req: SearchRequest,
): Promise<SearchResponse> {
  const res = await fetch(`${API_BASE}/api/v1/search`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify(req),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Busca falhou: ${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<SearchResponse>;
}

/** Retorna null em 404 para a página de detalhe chamar notFound(). */
export async function getRecipe(id: string): Promise<Recipe | null> {
  const res = await fetch(
    `${API_BASE}/api/v1/recipes/${encodeURIComponent(id)}`,
    { cache: "no-store", headers: { ...(await authHeaders()) } },
  );
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Detalhe falhou: ${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<Recipe>;
}

export interface AdaptBody {
  haveIds: string[];
  equipment?: Equipment[];
  maxPrepTimeMin?: number;
  goal?: NutritionGoal;
  note?: string;
  lang?: "pt" | "en";
}

/** Dispara geração em background (retorna imediatamente com 202). */
export async function triggerThumbnail(id: string): Promise<void> {
  await fetch(`${API_BASE}/api/v1/recipes/${encodeURIComponent(id)}/thumbnail`, {
    method: "POST",
    cache: "no-store",
    headers: { ...(await authHeaders()) },
  });
}

/** Lê a URL atual do DB — null se ainda gerando. */
export async function getThumbnailUrl(
  id: string,
): Promise<{ thumbnailUrl: string | null; generating: boolean }> {
  const res = await fetch(
    `${API_BASE}/api/v1/recipes/${encodeURIComponent(id)}/thumbnail`,
    { cache: "no-store", headers: { ...(await authHeaders()) } },
  );
  if (!res.ok) return { thumbnailUrl: null, generating: false };
  return res.json() as Promise<{ thumbnailUrl: string | null; generating: boolean }>;
}

// --- favoritos (exigem login; sem sessão o backend responde 401) ---

export async function getFavoriteIds(): Promise<string[]> {
  const res = await fetch(`${API_BASE}/api/v1/favorites/ids`, {
    cache: "no-store",
    headers: { ...(await authHeaders()) },
  });
  if (res.status === 401) return [];
  if (!res.ok) throw new Error(`Favoritos falhou: ${res.status}`);
  return ((await res.json()) as { ids: string[] }).ids;
}

export async function getFavorites(): Promise<FavoriteRecipe[]> {
  const res = await fetch(`${API_BASE}/api/v1/favorites`, {
    cache: "no-store",
    headers: { ...(await authHeaders()) },
  });
  if (res.status === 401) return [];
  if (!res.ok) throw new Error(`Favoritos falhou: ${res.status}`);
  return ((await res.json()) as { recipes: FavoriteRecipe[] }).recipes;
}

export async function addFavorite(recipeId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/favorites`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ recipeId }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Favoritar falhou: ${res.status}`);
}

export async function removeFavorite(recipeId: string): Promise<void> {
  const res = await fetch(
    `${API_BASE}/api/v1/favorites/${encodeURIComponent(recipeId)}`,
    { method: "DELETE", cache: "no-store", headers: { ...(await authHeaders()) } },
  );
  if (!res.ok) throw new Error(`Desfavoritar falhou: ${res.status}`);
}

// --- despensa (exige login) ---

export async function getPantry(): Promise<PantryIngredient[]> {
  const res = await fetch(`${API_BASE}/api/v1/pantry`, {
    cache: "no-store",
    headers: { ...(await authHeaders()) },
  });
  if (res.status === 401) return [];
  if (!res.ok) throw new Error(`Despensa falhou: ${res.status}`);
  return ((await res.json()) as { items: PantryIngredient[] }).items;
}

export async function addToPantry(ingredientId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/pantry/items`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ ingredientId }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Adicionar à despensa falhou: ${res.status}`);
}

export async function removeFromPantry(ingredientId: string): Promise<void> {
  const res = await fetch(
    `${API_BASE}/api/v1/pantry/items/${encodeURIComponent(ingredientId)}`,
    { method: "DELETE", cache: "no-store", headers: { ...(await authHeaders()) } },
  );
  if (!res.ok) throw new Error(`Remover da despensa falhou: ${res.status}`);
}

export async function searchIngredients(q: string): Promise<PantryIngredient[]> {
  const res = await fetch(
    `${API_BASE}/api/v1/ingredients/search?q=${encodeURIComponent(q)}`,
    { cache: "no-store", headers: { ...(await authHeaders()) } },
  );
  if (!res.ok) return [];
  return ((await res.json()) as { results: PantryIngredient[] }).results;
}

export async function adaptRecipe(id: string, body: AdaptBody): Promise<Recipe> {
  const res = await fetch(
    `${API_BASE}/api/v1/recipes/${encodeURIComponent(id)}/adapt`,
    {
      method: "POST",
      headers: { "content-type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify(body),
      cache: "no-store",
    },
  );
  if (!res.ok) {
    // @fastify/sensible devolve { message } — usa pra mostrar 429/503 ao usuário
    let msg = `Adaptação falhou (${res.status})`;
    try {
      const j = (await res.json()) as { message?: string };
      if (j?.message) msg = j.message;
    } catch {
      /* corpo não-JSON */
    }
    throw new Error(msg);
  }
  return res.json() as Promise<Recipe>;
}
