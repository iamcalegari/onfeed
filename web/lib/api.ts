import "server-only";

import { auth } from "@clerk/nextjs/server";

import type {
  Equipment,
  FavoriteRecipe,
  GeneratedPlan,
  GeneratePlanRequest,
  ImportedRecipeListItem,
  ImportJob,
  ImportRecipeEditPatch,
  NutritionGoal,
  PantryIngredient,
  RatingStats,
  Recipe,
  SearchRequest,
  SearchResponse,
  ShareRecipeResponse,
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

/**
 * Página pública do link compartilhável (Fase 5, D-01/D-03). Busca por
 * shareSlug — nunca por objectId. authHeaders() é enviado mesmo aqui (não
 * exige login) só para o backend resolver o `liked` de um visitante que por
 * acaso já esteja logado; retorna null em 404 (token inválido/expirado).
 */
export async function getRecipeByShareSlug(
  token: string,
): Promise<ShareRecipeResponse | null> {
  const res = await fetch(
    `${API_BASE}/api/v1/recipes/share/${encodeURIComponent(token)}`,
    { cache: "no-store", headers: { ...(await authHeaders()) } },
  );
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Receita compartilhada falhou: ${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<ShareRecipeResponse>;
}

export interface AdaptBody {
  haveIds: string[];
  equipment?: Equipment[];
  maxPrepTimeMin?: number;
  goal?: NutritionGoal;
  note?: string;
  lang?: "pt" | "en";
  username?: string;
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

// --- variantes ---

export async function getRecipeVariants(
  recipeId: string,
): Promise<{ count: number; variants: Recipe[] }> {
  const res = await fetch(
    `${API_BASE}/api/v1/recipes/${encodeURIComponent(recipeId)}/variants`,
    { cache: "no-store", headers: { ...(await authHeaders()) } },
  );
  if (!res.ok) return { count: 0, variants: [] };
  return res.json() as Promise<{ count: number; variants: Recipe[] }>;
}

// --- likes (count público; toggle exige login) ---

export async function getRecipeLikes(
  recipeId: string,
): Promise<{ count: number; liked: boolean }> {
  const res = await fetch(
    `${API_BASE}/api/v1/recipes/${encodeURIComponent(recipeId)}/likes`,
    { cache: "no-store", headers: { ...(await authHeaders()) } },
  );
  if (!res.ok) return { count: 0, liked: false };
  return res.json() as Promise<{ count: number; liked: boolean }>;
}

export async function toggleLike(
  recipeId: string,
): Promise<{ liked: boolean; count: number }> {
  const res = await fetch(
    `${API_BASE}/api/v1/recipes/${encodeURIComponent(recipeId)}/like`,
    { method: "POST", cache: "no-store", headers: { ...(await authHeaders()) } },
  );
  if (!res.ok) throw new Error(`Toggle like falhou: ${res.status}`);
  return res.json() as Promise<{ liked: boolean; count: number }>;
}

// --- avaliações pós-cozinha (count/avg público; avaliar exige login) ---

export async function getRecipeRating(recipeId: string): Promise<RatingStats> {
  const res = await fetch(
    `${API_BASE}/api/v1/recipes/${encodeURIComponent(recipeId)}/rating`,
    { cache: "no-store", headers: { ...(await authHeaders()) } },
  );
  if (!res.ok) return { avg: 0, count: 0, mine: null };
  return res.json() as Promise<RatingStats>;
}

export async function rateRecipe(
  recipeId: string,
  rating: number,
): Promise<RatingStats> {
  const res = await fetch(
    `${API_BASE}/api/v1/recipes/${encodeURIComponent(recipeId)}/rate`,
    {
      method: "POST",
      headers: { "content-type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ rating }),
      cache: "no-store",
    },
  );
  if (!res.ok) throw new Error(`Avaliar falhou: ${res.status}`);
  return res.json() as Promise<RatingStats>;
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

// --- sessão / entitlement (fonte de verdade do PRO) ---

export interface MeResponse {
  userId: string | null;
  authenticated: boolean;
  plan: "free" | "pro";
  isPro: boolean;
  currentPeriodEnd?: string | null;
  limits?: { adaptDaily: number; importDaily?: number };
  usage?: { adaptUsed: number; adaptLeft: number; importUsed?: number; importLeft?: number };
}

/** Entitlement + uso do dia, direto do backend. */
export async function getMe(): Promise<MeResponse> {
  const res = await fetch(`${API_BASE}/api/v1/me`, {
    cache: "no-store",
    headers: { ...(await authHeaders()) },
  });
  if (!res.ok) {
    return { userId: null, authenticated: false, plan: "free", isPro: false };
  }
  return res.json() as Promise<MeResponse>;
}

// --- CheffIA: geração de plano (PRO) ---

/** Gera o plano da semana. Lança Error com a mensagem do backend (403/429/503). */
export async function generateMealPlan(
  body: GeneratePlanRequest,
): Promise<GeneratedPlan> {
  const res = await fetch(`${API_BASE}/api/v1/mealplan/generate`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    let msg = `Geração de plano falhou (${res.status})`;
    try {
      const j = (await res.json()) as { message?: string };
      if (j?.message) msg = j.message;
    } catch {
      /* corpo não-JSON */
    }
    throw new Error(msg);
  }
  return res.json() as Promise<GeneratedPlan>;
}

// --- assinatura PRO (Mercado Pago) ---

/** Inicia a assinatura PRO e devolve o checkout do MP (init_point). */
export async function subscribePro(
  email: string,
): Promise<{ initPoint: string }> {
  const res = await fetch(`${API_BASE}/api/v1/billing/subscribe`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ email }),
    cache: "no-store",
  });
  if (!res.ok) {
    let msg = `Não foi possível iniciar a assinatura (${res.status})`;
    try {
      const j = (await res.json()) as { message?: string };
      if (j?.message) msg = j.message;
    } catch {
      /* não-JSON */
    }
    throw new Error(msg);
  }
  return res.json() as Promise<{ initPoint: string }>;
}

// --- onFeed Import (Fase 3 — captura + revisão obrigatória) ---

/**
 * Inicia a importação de um vídeo (Instagram/TikTok/YouTube).
 *
 * Retorna uma união discriminada: um 202 novo `{ jobId }` (fluxo normal, vai
 * pra tela de progresso) ou um 200 de dedup `{ deduped: true, recipeId }`
 * quando o backend já tem um import bem-sucedido dessa mesma URL para este
 * usuário (CAP-03) — nesse caso não há job novo, então o caller deve rotear
 * direto pra receita existente em vez de pro polling.
 */
export async function startImport(
  url: string,
): Promise<{ jobId: string } | { deduped: true; recipeId: string }> {
  const res = await fetch(`${API_BASE}/api/v1/import`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ url }),
    cache: "no-store",
  });
  if (!res.ok) {
    // Cobre também o 429 de cota diária excedida — a mensagem do backend já
    // vem com o upsell PRO (mirror do gate de adapt), reaproveitado aqui sem
    // UI nova.
    throw new Error(`Import falhou: ${res.status} ${await res.text()}`);
  }
  const body = (await res.json()) as { jobId?: string; deduped?: boolean; recipeId?: string };
  if (body.deduped && body.recipeId) {
    return { deduped: true, recipeId: body.recipeId };
  }
  return { jobId: body.jobId! };
}

/** Lê o status atual de um job de importação (usado pelo polling). */
export async function getImportJob(jobId: string): Promise<ImportJob> {
  const res = await fetch(
    `${API_BASE}/api/v1/import/${encodeURIComponent(jobId)}`,
    { cache: "no-store", headers: { ...(await authHeaders()) } },
  );
  if (!res.ok) {
    throw new Error(`Status falhou: ${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<ImportJob>;
}

/** Confirma (com edições opcionais) a receita extraída de um job pronto para revisão. */
export async function confirmImportRecipe(
  jobId: string,
  patch: ImportRecipeEditPatch,
): Promise<{ recipeId: string }> {
  const res = await fetch(
    `${API_BASE}/api/v1/import/${encodeURIComponent(jobId)}/recipe`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify(patch),
      cache: "no-store",
    },
  );
  if (!res.ok) {
    throw new Error(`Confirmação falhou: ${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<{ recipeId: string }>;
}

/** Lista as receitas importadas pelo usuário autenticado (owner-scoped). */
export async function listMyImports(): Promise<ImportedRecipeListItem[]> {
  const res = await fetch(`${API_BASE}/api/v1/import/mine`, {
    cache: "no-store",
    headers: { ...(await authHeaders()) },
  });
  if (!res.ok) {
    throw new Error(`Listagem falhou: ${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<ImportedRecipeListItem[]>;
}
