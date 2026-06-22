import type { IngestRecipeInput } from "@/modules/recipes/recipe.ingestion.js";

/** Uma linha do CSV já com colunas nomeadas pelo header. */
export type DatasetRow = Record<string, string | undefined>;

/** Mapeia uma linha bruta -> input de ingestão, ou null para pular a linha. */
export type DatasetAdapter = (row: DatasetRow) => IngestRecipeInput | null;

// Datasets públicos de receita não trazem imagem; o thumbnail é preenchido
// depois (S3/CloudFront, ou geração). Placeholder vazio por enquanto.
const PLACEHOLDER_THUMBNAIL = "";
const DEFAULT_SERVINGS = 4;
const MAX_PREP_MIN = 24 * 60;

// Valores de referência diária (Daily Value) para converter %DV -> gramas.
const DV_PROTEIN_G = 50;
const DV_CARBS_G = 275;
const DV_FAT_G = 78;

/** Parseia um array JSON (RecipeNLG: ingredients/directions são JSON válido). */
function parseJsonArray(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((x) => String(x).trim()).filter(Boolean);
    }
  } catch {
    /* cai para [] */
  }
  return [];
}

/**
 * Parseia uma lista no estilo Python (Food.com usa repr com aspas simples,
 * que NÃO é JSON válido). Best-effort: tenta JSON, senão extrai strings entre
 * aspas (lidando com escapes `\'`).
 */
function parsePyList(raw: string | undefined): string[] {
  if (!raw) return [];
  const t = raw.trim();
  if (!t.startsWith("[")) return [];

  const json = parseJsonArray(t);
  if (json.length > 0) return json;

  const items: string[] = [];
  const re = /'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t)) !== null) {
    const s = (m[1] ?? m[2] ?? "").replace(/\\(['"])/g, "$1").trim();
    if (s) items.push(s);
  }
  return items;
}

/**
 * RecipeNLG (Kaggle/HuggingFace). Colunas: title, ingredients, directions,
 * link, source, NER. ingredients/directions são arrays JSON.
 * Sem tempo/porções → defaults.
 */
export const recipeNlgAdapter: DatasetAdapter = (row) => {
  const title = row.title?.trim();
  if (!title) return null;

  const rawIngredients = parseJsonArray(row.ingredients);
  const steps = parseJsonArray(row.directions);
  if (rawIngredients.length === 0 || steps.length === 0) return null;

  // sem tempo/nutrição → prepTimeMin omitido (cai para a soma dos passos)
  return {
    title,
    rawIngredients,
    steps,
    thumbnailUrl: PLACEHOLDER_THUMBNAIL,
    servings: DEFAULT_SERVINGS,
  };
};

/**
 * A coluna `nutrition` do Food.com é uma lista:
 * [calorias, gordura%DV, açúcar%DV, sódio%DV, proteína%DV, gordura_sat%DV, carbo%DV].
 * Calorias são absolutas; o resto é % do valor diário → convertemos para gramas.
 */
function parseFoodComNutrition(raw: string | undefined) {
  const v = parsePyList(raw).map(Number);
  if (v.length < 7 || v.some((n) => !Number.isFinite(n))) return undefined;
  return {
    calories: Math.round(v[0]!),
    fat: Math.round((v[1]! * DV_FAT_G) / 100),
    protein: Math.round((v[4]! * DV_PROTEIN_G) / 100),
    carbs: Math.round((v[6]! * DV_CARBS_G) / 100),
  };
}

/**
 * Food.com (Kaggle RAW_recipes.csv). Colunas: name, minutes, steps,
 * ingredients, nutrition, ... Listas em repr Python (aspas simples).
 * Tem `minutes` e `nutrition` → usamos para T e N.
 */
export const foodComAdapter: DatasetAdapter = (row) => {
  const title = row.name?.trim();
  if (!title) return null;

  const rawIngredients = parsePyList(row.ingredients);
  const steps = parsePyList(row.steps);
  if (rawIngredients.length === 0 || steps.length === 0) return null;

  const minutes = Number(row.minutes);
  const nutrition = parseFoodComNutrition(row.nutrition);

  return {
    title,
    rawIngredients,
    steps,
    thumbnailUrl: PLACEHOLDER_THUMBNAIL,
    servings: DEFAULT_SERVINGS,
    ...(row.id && { externalId: `food-com:${row.id}` }),
    ...(Number.isFinite(minutes) &&
      minutes > 0 && { prepTimeMin: Math.min(minutes, MAX_PREP_MIN) }),
    ...(nutrition && { nutrition }),
  };
};

export const ADAPTERS: Record<string, DatasetAdapter> = {
  "recipe-nlg": recipeNlgAdapter,
  "food-com": foodComAdapter,
};
