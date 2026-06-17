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
