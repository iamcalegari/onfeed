/**
 * Grupos de substituição entre ingredientes canônicos.
 *
 * Ingredientes distintos (ids diferentes) mas intercambiáveis para fins de
 * COBERTURA: se o usuário tem um membro do grupo, conta como se tivesse os
 * demais. Ex: quem tem óleo vegetal "cobre" uma receita que pede azeite.
 *
 * É uma regra de domínio (não dado de banco) — fica versionada aqui e aplicada
 * em tempo de busca, sem precisar re-seedar/re-embeddar o catálogo.
 */
export const SUBSTITUTION_GROUPS: string[][] = [
  // gorduras de cozimento — trocáveis para refogar/saltear
  ["azeite_de_oliva", "oleo_vegetal"],
];

// id -> substitutos diretos (derivado dos grupos, bidirecional)
const SUBSTITUTES = new Map<string, Set<string>>();
for (const group of SUBSTITUTION_GROUPS) {
  for (const id of group) {
    const set = SUBSTITUTES.get(id) ?? new Set<string>();
    for (const other of group) if (other !== id) set.add(other);
    SUBSTITUTES.set(id, set);
  }
}

/**
 * Expande uma lista de canonicalIds com seus substitutos (1 nível). Usado para
 * que a cobertura de ingredientes trate membros do mesmo grupo como equivalentes.
 */
export function expandWithSubstitutes(ids: string[]): string[] {
  const out = new Set(ids);
  for (const id of ids) {
    const subs = SUBSTITUTES.get(id);
    if (subs) for (const s of subs) out.add(s);
  }
  return [...out];
}
