/** ISO 3166-1 alpha-2 -> emoji de bandeira (indicadores regionais). */
export function flagEmoji(countryCode: string): string {
  const cc = countryCode.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return "🍽️";
  const base = 0x1f1e6;
  return String.fromCodePoint(
    base + (cc.charCodeAt(0) - 65),
    base + (cc.charCodeAt(1) - 65),
  );
}

/** Link para o detalhe carregando o que o usuário tem (p/ marcar ✓). */
export function recipeHref(id: string, haveIds: string[]): string {
  const base = `/recipe/${id}`;
  if (haveIds.length === 0) return base;
  return `${base}?have=${encodeURIComponent(haveIds.join(","))}`;
}

export function formatMinutes(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h${m}`;
}

const FRACS: Record<string, string> = {
  "0.25": "¼",
  "0.50": "½",
  "0.75": "¾",
  "0.33": "⅓",
  "0.67": "⅔",
};

function formatQty(qty: number): string {
  if (Number.isInteger(qty)) return String(qty);
  const floor = Math.floor(qty);
  const rem = qty - floor;
  const remKey = rem.toFixed(2);
  if (floor > 0 && FRACS[remKey]) return `${floor}${FRACS[remKey]}`;
  if (FRACS[qty.toFixed(2)]) return FRACS[qty.toFixed(2)]!;
  return qty.toFixed(1).replace(".", ",");
}

/** Monta o rótulo legível do ingrediente combinando quantidade + unidade + nome. */
export function formatIngredientLabel(ing: {
  name: string;
  quantity?: number;
  unit?: string;
}): string {
  const { quantity, unit, name } = ing;
  if (quantity == null && !unit) return name;
  // "sal a gosto", "pimenta a gosto"
  if (quantity == null && unit) return `${name} ${unit}`;
  const qty = formatQty(quantity!);
  if (!unit) return `${qty} ${name}`;
  // métricas coladas ao número: "250g de manteiga", "100ml de leite"
  if (/^(g|kg|mg|ml|l|cl|dl)$/i.test(unit)) return `${qty}${unit} de ${name}`;
  return `${qty} ${unit} de ${name}`;
}
