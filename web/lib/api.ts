import "server-only";

import type {
  Equipment,
  NutritionGoal,
  Recipe,
  SearchRequest,
  SearchResponse,
} from "./types";

const API_BASE = process.env.API_BASE_URL ?? "http://localhost:3000";

export async function searchRecipes(
  req: SearchRequest,
): Promise<SearchResponse> {
  const res = await fetch(`${API_BASE}/api/v1/search`, {
    method: "POST",
    headers: { "content-type": "application/json" },
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
    { cache: "no-store" },
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
}

export async function generateThumbnail(id: string): Promise<string | null> {
  const res = await fetch(
    `${API_BASE}/api/v1/recipes/${encodeURIComponent(id)}/thumbnail`,
    { method: "POST", cache: "no-store" },
  );
  if (!res.ok) {
    throw new Error(`Thumbnail falhou: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { thumbnailUrl: string | null };
  return json.thumbnailUrl;
}

export async function adaptRecipe(id: string, body: AdaptBody): Promise<Recipe> {
  const res = await fetch(
    `${API_BASE}/api/v1/recipes/${encodeURIComponent(id)}/adapt`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    },
  );
  if (!res.ok) {
    throw new Error(`Adaptação falhou: ${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<Recipe>;
}
