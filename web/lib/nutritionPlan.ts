import type { Nutrition } from "./types";

const GOALS_KEY   = "onfeed:nutrition:goals";
const LOG_KEY     = "onfeed:nutrition:log";

export interface NutritionGoals {
  calories: number;
  protein:  number; // g
  carbs:    number; // g
  fat:      number; // g
}

export interface MealLogEntry {
  id:        string;
  recipeId:  string;
  title:     string;
  nutrition: Nutrition; // por porção
  servings:  number;
  loggedAt:  number; // unix ms
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10); // "2026-06-22"
}

/* ── Goals ─────────────────────────────────────────────────── */

export function getGoals(): NutritionGoals | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(GOALS_KEY);
    return raw ? (JSON.parse(raw) as NutritionGoals) : null;
  } catch { return null; }
}

export function setGoals(goals: NutritionGoals): void {
  try { localStorage.setItem(GOALS_KEY, JSON.stringify(goals)); } catch { /* ignore */ }
}

export function clearGoals(): void {
  try { localStorage.removeItem(GOALS_KEY); } catch { /* ignore */ }
}

/* ── Daily log ─────────────────────────────────────────────── */

interface DayLog {
  date: string;
  entries: MealLogEntry[];
}

function getDayLog(): DayLog {
  if (typeof window === "undefined") return { date: todayKey(), entries: [] };
  try {
    const raw = localStorage.getItem(LOG_KEY);
    if (!raw) return { date: todayKey(), entries: [] };
    const parsed = JSON.parse(raw) as DayLog;
    // Zera se for de outro dia
    if (parsed.date !== todayKey()) return { date: todayKey(), entries: [] };
    return parsed;
  } catch { return { date: todayKey(), entries: [] }; }
}

function saveDayLog(log: DayLog): void {
  try { localStorage.setItem(LOG_KEY, JSON.stringify(log)); } catch { /* ignore */ }
}

export function getTodayEntries(): MealLogEntry[] {
  return getDayLog().entries;
}

export function logMeal(entry: Omit<MealLogEntry, "id" | "loggedAt">): MealLogEntry {
  const log = getDayLog();
  const full: MealLogEntry = {
    ...entry,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    loggedAt: Date.now(),
  };
  log.entries.push(full);
  saveDayLog(log);
  return full;
}

export function removeEntry(id: string): void {
  const log = getDayLog();
  log.entries = log.entries.filter((e) => e.id !== id);
  saveDayLog(log);
}

/* ── Totals ─────────────────────────────────────────────────── */

export function getTodayTotals(): Nutrition {
  const entries = getTodayEntries();
  return entries.reduce(
    (acc, e) => ({
      calories: acc.calories + e.nutrition.calories * e.servings,
      protein:  acc.protein  + e.nutrition.protein  * e.servings,
      carbs:    acc.carbs    + e.nutrition.carbs     * e.servings,
      fat:      acc.fat      + e.nutrition.fat       * e.servings,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );
}

export function getRemaining(goals: NutritionGoals): Nutrition {
  const totals = getTodayTotals();
  return {
    calories: Math.max(0, goals.calories - totals.calories),
    protein:  Math.max(0, goals.protein  - totals.protein),
    carbs:    Math.max(0, goals.carbs    - totals.carbs),
    fat:      Math.max(0, goals.fat      - totals.fat),
  };
}

/** "fits" | "tight" | "over" | null (sem metas) */
export function planFitStatus(
  nutrition: Nutrition,
  goals: NutritionGoals | null,
): "fits" | "tight" | "over" | null {
  if (!goals) return null;
  const remaining = getRemaining(goals);
  const ratio = nutrition.calories / Math.max(1, remaining.calories);
  if (ratio <= 1.05) return "fits";
  if (ratio <= 1.35) return "tight";
  return "over";
}
