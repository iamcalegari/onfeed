export interface CanonicalIngredient {
  /** slug estável, ex: "olive_oil" — usado como canonicalId nas receitas */
  _id: string;
  displayName: string;
  synonyms: string[];
  category: string;
  /** staples (sal, água, pimenta) não contam como "faltando" na UI */
  isStaple: boolean;
  /** entradas criadas por resolução automática aguardam revisão humana */
  pending: boolean;
  /** displayName + synonyms embeddados — usado no match semântico de termos novos */
  embedding?: number[];
  insertedAt: Date;
  updatedAt: Date;
}
