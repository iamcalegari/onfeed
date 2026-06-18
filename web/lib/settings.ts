export type UnitSystem = "metric" | "imperial";
export type Theme     = "light" | "dark" | "system";
export type Language  = "pt" | "en";

/* ── Cookies ───────────────────────────────────────────────── */

export const COOKIE_UNIT  = "unit-system";
export const COOKIE_THEME = "theme";
export const COOKIE_LANG  = "lang";
const MAX_AGE = 60 * 60 * 24 * 365; // 1 ano

export function setCookie(name: string, value: string) {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=${value}; path=/; max-age=${MAX_AGE}; SameSite=Lax`;
}

/** Lê uma cookie no browser sem depender de APIs do servidor. */
export function readCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  return document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`))?.[1];
}

/* ── Tema ──────────────────────────────────────────────────── */

export function applyTheme(theme: Theme) {
  if (typeof window === "undefined") return;
  const dark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

/**
 * Script inline rodado antes do React hidratar — evita flash de tema errado.
 * Inserido como dangerouslySetInnerHTML no <head>.
 */
export const THEME_SCRIPT = `(function(){try{
  var t=document.cookie.match(/(?:^|;\\s*)theme=([^;]*)/)?.[1]??'system';
  var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);
  if(d)document.documentElement.classList.add('dark');
}catch(e){}})();`;

/* ── Conversão de unidades ────────────────────────────────── */

type ConvEntry = { factor: number; unit: string };

/** Conversões métricas → imperial. Apenas unidades que aparecem em receitas. */
const TO_IMPERIAL: Record<string, ConvEntry> = {
  g:   { factor: 1 / 28.3495,  unit: "oz"    },
  kg:  { factor: 2.20462,      unit: "lb"    },
  ml:  { factor: 1 / 29.5735,  unit: "fl oz" },
  l:   { factor: 1.05669,      unit: "qt"    },
  cl:  { factor: 1 / 2.95735,  unit: "fl oz" },
  dl:  { factor: 1 / 2.95735 * 10, unit: "fl oz" },
};

export function convertUnit(
  quantity: number,
  unit: string,
  system: UnitSystem,
): { quantity: number; unit: string } {
  if (system === "metric") return { quantity, unit };
  const conv = TO_IMPERIAL[unit.toLowerCase()];
  if (!conv) return { quantity, unit };
  return { quantity: quantity * conv.factor, unit: conv.unit };
}

/** Formata número para exibição: inteiros sem decimal, resto com 1 casa. */
export function fmtNumber(n: number): string {
  if (Number.isInteger(n)) return String(n);
  // Frações comuns
  const FRACS: Record<string, string> = {
    "0.25": "¼", "0.50": "½", "0.75": "¾",
    "0.33": "⅓", "0.67": "⅔",
  };
  const floor = Math.floor(n);
  const rem   = n - floor;
  const key   = rem.toFixed(2);
  if (floor > 0 && FRACS[key]) return `${floor}${FRACS[key]}`;
  if (FRACS[n.toFixed(2)]) return FRACS[n.toFixed(2)]!;
  // Arredonda para 1 casa; se >= 10 arredonda ao inteiro
  return n >= 10
    ? String(Math.round(n))
    : n.toFixed(1).replace(".", ",");
}

/**
 * Retorna a string de quantidade formatada para um ingrediente,
 * respeitando o sistema de unidades escolhido.
 */
export function formatQtyForSystem(
  quantity: number | undefined,
  unit: string | undefined,
  system: UnitSystem,
): string {
  if (quantity == null && !unit) return "";
  if (quantity == null) return unit!;

  const { quantity: q, unit: u } = convertUnit(quantity, unit ?? "", system);
  const qStr = fmtNumber(q);

  if (!u) return qStr;
  // Métricas coladas ao número (250g), imperial com espaço (8 oz)
  if (/^(g|kg|mg|ml|l|cl|dl)$/i.test(u)) return `${qStr}${u}`;
  return `${qStr} ${u}`;
}
