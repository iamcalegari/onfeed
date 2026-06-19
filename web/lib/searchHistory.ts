const HISTORY_KEY = "rod:history";
const MAX_ENTRIES = 8;

export interface SearchHistoryEntry {
  query: string;   // ex: "ovo, farinha, tomate"
  params: string;  // URLSearchParams.toString() para reconstituir a busca
  ts: number;
}

export function saveSearch(ingredients: string[], qs: URLSearchParams): void {
  if (typeof window === "undefined" || ingredients.length === 0) return;
  const entry: SearchHistoryEntry = {
    query: ingredients.join(", "),
    params: qs.toString(),
    ts: Date.now(),
  };
  try {
    const prev = getHistory().filter((h) => h.query !== entry.query);
    localStorage.setItem(
      HISTORY_KEY,
      JSON.stringify([entry, ...prev].slice(0, MAX_ENTRIES)),
    );
  } catch { /* ignore */ }
}

export function getHistory(): SearchHistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? (JSON.parse(raw) as SearchHistoryEntry[]) : [];
  } catch {
    return [];
  }
}

export function clearHistory(): void {
  if (typeof window === "undefined") return;
  try { localStorage.removeItem(HISTORY_KEY); } catch { /* ignore */ }
}
