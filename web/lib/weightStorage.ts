const KEY     = "onfeed:weight";
const MAX_LEN = 90; // guarda até 90 dias

export interface WeightEntry {
  date: string; // YYYY-MM-DD
  kg:   number;
}

function load(): WeightEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as WeightEntry[]) : [];
  } catch { return []; }
}

function persist(entries: WeightEntry[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(entries)); } catch { /* ignore */ }
}

export function getWeightHistory(): WeightEntry[] {
  return load().slice(-MAX_LEN);
}

export function getLatestWeight(): WeightEntry | null {
  const history = load();
  return history.length > 0 ? history[history.length - 1] : null;
}

export function addWeight(kg: number): void {
  const today = new Date().toISOString().slice(0, 10);
  const history = load().filter(e => e.date !== today);
  history.push({ date: today, kg });
  persist(history.slice(-MAX_LEN));
}

export function deleteWeight(date: string): void {
  persist(load().filter(e => e.date !== date));
}

/** Últimas N entradas de peso formatadas como pontos SVG para sparkline */
export function weightSparklinePoints(entries: WeightEntry[], width = 300, height = 70): string {
  if (entries.length === 0) return "";
  if (entries.length === 1) return `0,${height / 2} ${width},${height / 2}`;

  const vals = entries.map(e => e.kg);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  const step = width / (entries.length - 1);

  return entries.map((e, i) => {
    const x = Math.round(i * step);
    const y = Math.round(height - ((e.kg - min) / range) * (height * 0.8) - height * 0.1);
    return `${x},${y}`;
  }).join(" ");
}
