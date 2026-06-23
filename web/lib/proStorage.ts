/**
 * Camada PRO / FREE — espelha o modelo de quotas do design onFeed v2.
 *
 * Plano grátis:
 *   • 10 buscas sob medida por dia  (SEARCH_FREE)
 *   • 3 adaptações de receita por dia (ADAPT_FREE)
 *   • CheffIA bloqueado
 *   • Anúncios após o limite
 *
 * Plano PRO: tudo ilimitado, sem anúncios, CheffIA liberado.
 *
 * Tudo client-side em localStorage (mesma estratégia de planStorage /
 * nutritionPlan). O contador de uso zera a cada dia.
 */

export const SEARCH_FREE = 10;
export const ADAPT_FREE = 3;
export const PRO_PRICE = "R$ 19,90";

const PRO_KEY = "onfeed:pro";

interface ProState {
  isPro: boolean;
  date: string; // dia de referência das quotas (YYYY-MM-DD)
  searchesUsed: number;
  adaptUsed: number;
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function read(): ProState {
  const fallback: ProState = { isPro: false, date: todayKey(), searchesUsed: 0, adaptUsed: 0 };
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(PRO_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as ProState;
    // Vira o dia → zera as quotas (preserva isPro)
    if (parsed.date !== todayKey()) {
      return { isPro: Boolean(parsed.isPro), date: todayKey(), searchesUsed: 0, adaptUsed: 0 };
    }
    return {
      isPro: Boolean(parsed.isPro),
      date: parsed.date,
      searchesUsed: parsed.searchesUsed ?? 0,
      adaptUsed: parsed.adaptUsed ?? 0,
    };
  } catch {
    return fallback;
  }
}

function write(state: ProState): void {
  try {
    localStorage.setItem(PRO_KEY, JSON.stringify(state));
    // notifica listeners na mesma aba (storage event só dispara entre abas)
    window.dispatchEvent(new CustomEvent("onfeed:pro:change"));
  } catch {
    /* ignore */
  }
}

/* ── Leitura ─────────────────────────────────────────────────── */

export interface ProSnapshot {
  isPro: boolean;
  searchesUsed: number;
  adaptUsed: number;
  searchesLeft: number;
  adaptLeft: number;
}

export function getProState(): ProSnapshot {
  const s = read();
  return {
    isPro: s.isPro,
    searchesUsed: s.searchesUsed,
    adaptUsed: s.adaptUsed,
    searchesLeft: Math.max(0, SEARCH_FREE - s.searchesUsed),
    adaptLeft: Math.max(0, ADAPT_FREE - s.adaptUsed),
  };
}

export function isPro(): boolean {
  return read().isPro;
}

/* ── Mutação ─────────────────────────────────────────────────── */

/** Liga/desliga o PRO (demo). Retorna o novo valor. */
export function togglePro(): boolean {
  const s = read();
  const next = !s.isPro;
  write({ ...s, isPro: next });
  return next;
}

export function setPro(value: boolean): void {
  const s = read();
  write({ ...s, isPro: value });
}

/**
 * Consome uma busca sob medida. PRO nunca consome.
 * Retorna true se a busca pode prosseguir sem anúncio.
 */
export function consumeSearch(): boolean {
  const s = read();
  if (s.isPro) return true;
  const left = Math.max(0, SEARCH_FREE - s.searchesUsed);
  if (left <= 0) return false; // precisa de anúncio
  write({ ...s, searchesUsed: s.searchesUsed + 1 });
  return true;
}

/**
 * Consome uma adaptação. PRO nunca consome.
 * Retorna true se a adaptação pode prosseguir sem anúncio.
 */
export function consumeAdapt(): boolean {
  const s = read();
  if (s.isPro) return true;
  const left = Math.max(0, ADAPT_FREE - s.adaptUsed);
  if (left <= 0) return false;
  write({ ...s, adaptUsed: s.adaptUsed + 1 });
  return true;
}

/* ── Conteúdo PRO (espelha o design) ─────────────────────────── */

export const PRO_FEATURES = [
  { title: "Buscas sob medida ilimitadas", free: "Grátis: 10/dia, depois cada busca exibe um anúncio" },
  { title: "Adaptar receita ilimitado",    free: "Grátis: 3/dia, depois cada adaptação exibe um anúncio" },
  { title: "CheffIA · nutrição e mais",    free: "Assistente exclusivo — tire dúvidas e monte pratos" },
  { title: "Planos com IA + histórico ilimitado", free: "Sem anúncios em todo o app" },
];
