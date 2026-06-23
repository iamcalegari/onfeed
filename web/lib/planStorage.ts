const PLAN_KEY     = "onfeed:plan";
const PENDING_KEY  = "onfeed:pending_plan";
const SHOPPING_KEY = "onfeed:shopping";

/* ── Types ───────────────────────────────────────────────────── */

export interface PlannedMeal {
  slot:        string;   // "Café" | "Almoço" | "Lanche" | "Jantar"
  recipeId:    string;
  name:        string;
  kcal:        number;
  protein:     number;
  carbs:       number;
  fat:         number;
  prepTime?:   number;
  ingredients: string[]; // nomes dos ingredientes (para lista de compras)
}

export interface PendingSlot {
  slot: string;
  date: string; // YYYY-MM-DD
}

/* ── Internal store: { [date]: PlannedMeal[] } ───────────────── */

type PlanStore = Record<string, PlannedMeal[]>;

function load(): PlanStore {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(PLAN_KEY);
    return raw ? (JSON.parse(raw) as PlanStore) : {};
  } catch { return {}; }
}

function persist(store: PlanStore): void {
  try { localStorage.setItem(PLAN_KEY, JSON.stringify(store)); } catch { /* ignore */ }
}

/* ── CRUD ────────────────────────────────────────────────────── */

export function getDayMeals(date: string): PlannedMeal[] {
  return load()[date] ?? [];
}

export function addMealToPlan(date: string, meal: PlannedMeal): void {
  const store = load();
  const meals = (store[date] ?? []).filter(m => m.slot !== meal.slot);
  meals.push(meal);
  meals.sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot));
  store[date] = meals;
  persist(store);
}

export function removeMealFromPlan(date: string, slot: string): void {
  const store = load();
  if (store[date]) {
    store[date] = store[date].filter(m => m.slot !== slot);
    persist(store);
  }
}

const SLOT_ORDER = ["Café", "Almoço", "Lanche", "Jantar"];

/* ── Shopping list — agrega ingredientes da semana atual ─────── */

export function getWeekIngredients(): string[] {
  const store = load();
  const today = new Date();
  const dow   = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((dow + 6) % 7));

  const all: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const date = d.toISOString().slice(0, 10);
    for (const meal of (store[date] ?? [])) {
      all.push(...meal.ingredients);
    }
  }
  return all;
}

/* ── Lista de compras direta (ingredientes faltantes de receitas) */

export interface ShoppingItem {
  name:        string;
  recipeId:    string;
  recipeTitle: string;
}

export function getDirectShoppingList(): ShoppingItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SHOPPING_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown[];
    // suporta formato legado (array de string) e novo (array de ShoppingItem)
    return parsed.map(item =>
      typeof item === "string"
        ? { name: item, recipeId: "", recipeTitle: "" }
        : (item as ShoppingItem)
    );
  } catch { return []; }
}

export function addToShoppingList(
  names: string[],
  recipe: { id: string; title: string },
): void {
  const current = getDirectShoppingList();
  const seen = new Set(current.map(n => n.name.toLowerCase()));
  const merged = [...current];
  for (const n of names) {
    if (!seen.has(n.toLowerCase())) {
      merged.push({ name: n, recipeId: recipe.id, recipeTitle: recipe.title });
      seen.add(n.toLowerCase());
    }
  }
  try { localStorage.setItem(SHOPPING_KEY, JSON.stringify(merged)); } catch { /* ignore */ }
}

export function removeFromShoppingList(name: string): void {
  const filtered = getDirectShoppingList().filter(n => n.name.toLowerCase() !== name.toLowerCase());
  try { localStorage.setItem(SHOPPING_KEY, JSON.stringify(filtered)); } catch { /* ignore */ }
}

export function clearDirectShoppingList(): void {
  try { localStorage.removeItem(SHOPPING_KEY); } catch { /* ignore */ }
}

/* ── Pending slot (para o fluxo Plano → Buscar → Receita) ────── */

export function setPendingSlot(slot: string, date: string): void {
  try { localStorage.setItem(PENDING_KEY, JSON.stringify({ slot, date })); } catch { /* ignore */ }
}

export function getPendingSlot(): PendingSlot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    return raw ? (JSON.parse(raw) as PendingSlot) : null;
  } catch { return null; }
}

export function clearPendingSlot(): void {
  try { localStorage.removeItem(PENDING_KEY); } catch { /* ignore */ }
}
