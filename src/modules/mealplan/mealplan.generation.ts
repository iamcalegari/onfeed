import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

import {
  anthropic,
  effortOption,
  EXTRACTION_MODEL,
} from "@/infra/llm/anthropic.client.js";
import { IngredientModel } from "@/modules/ingredients/ingredient.model.js";
import { getPantryItems } from "@/modules/pantry/pantry.repository.js";
import type { Nutrition, RecipeSearchHit } from "@/modules/recipes/recipe.types.js";
import { searchRecipes } from "@/modules/search/search.service.js";

import type {
  GeneratePlanParams,
  GeneratedMealPlan,
  MealSlot,
  PlanDay,
  PlanMealItem,
  ShoppingListItem,
} from "./mealplan.types.js";

/** Candidata garantida de ter nutrição (filtrada). */
type ShortlistHit = RecipeSearchHit & { nutrition: Nutrition };

const SLOT_LABEL: Record<MealSlot, string> = {
  breakfast: "café da manhã",
  lunch: "almoço",
  snack: "lanche",
  dinner: "jantar",
};
const SLOT_ORDER: MealSlot[] = ["breakfast", "lunch", "snack", "dinner"];

// Seed para quando a despensa está vazia/desligada: ingredientes comuns no
// Brasil, só para o vetor ter o que recuperar (variedade factível).
const SEED_INGREDIENTS = [
  "arroz", "feijão", "frango", "ovo", "carne moída", "tomate", "cebola",
  "batata", "macarrão", "queijo", "leite", "alho", "cenoura", "banana",
];

const SHORTLIST_SIZE = 40;

const clamp = (v: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, v));

/** Porções realistas: arredonda a 0.5 e mantém entre 0.5 e 4. */
const roundToHalf = (v: number): number => clamp(Math.round(v * 2) / 2, 0.5, 4);

/* ── 1. Recuperação (Mongo, custo ~0): monta o cardápio fechado ─────── */
async function buildShortlist(p: GeneratePlanParams): Promise<ShortlistHit[]> {
  let ingredients = SEED_INGREDIENTS;
  if (p.usePantry !== false) {
    const pantry = await getPantryItems(p.userId);
    if (pantry.length > 0) ingredients = pantry.map((i) => i.displayName);
  }

  const { results } = await searchRecipes({
    ingredients,
    limit: SHORTLIST_SIZE,
    ...(p.dietaryTags?.length ? { dietaryTags: p.dietaryTags } : {}),
    ...(p.maxPrepTimeMin ? { maxPrepTimeMin: p.maxPrepTimeMin } : {}),
    ...(p.note ? { note: p.note } : {}),
  });

  // Plano nutricional precisa de números — descarta receitas sem nutrição.
  return results.filter(
    (r): r is ShortlistHit => Boolean(r.nutrition && r.nutrition.calories > 0),
  );
}

/* ── 2. Prompt: o LLM seleciona, não cria; números nunca vêm dele ───── */
const SYSTEM_PROMPT = `Você é um nutricionista que MONTA um plano alimentar semanal selecionando de um cardápio fixo de receitas reais.

REGRAS INVIOLÁVEIS:
- Escolha exclusivamente receitas pelo código REF fornecido. NUNCA invente receitas nem códigos.
- NÃO calcule nem mencione calorias ou macros — os números já são conhecidos pelo sistema.
- Seu trabalho é COMBINAÇÃO e VARIEDADE: equilibre os macros ao longo do dia, evite repetir a mesma receita em dias seguidos, varie proteínas e sabores.
- Respeite o tipo de cada refeição (café da manhã ≠ jantar).
- Ajuste 'servings' (porções, entre 0.5 e 4) para aproximar o total diário da meta de calorias.

Preencha todos os dias e todas as refeições pedidas.`;

function buildUserPrompt(shortlist: ShortlistHit[], p: GeneratePlanParams): string {
  const table = shortlist
    .map((r, i) => {
      const n = r.nutrition;
      return `R${i + 1} | ${r.title} | ${Math.round(n.calories)}kcal | P${Math.round(n.protein)} C${Math.round(n.carbs)} G${Math.round(n.fat)} | ${r.prepTimeMin}min`;
    })
    .join("\n");

  const slotsPt = p.slots.map((s) => `${s} (${SLOT_LABEL[s]})`).join(", ");

  return [
    `Monte um plano de ${p.days} dia(s).`,
    `Refeições por dia: ${slotsPt}.`,
    `Meta diária: ${p.goals.calories} kcal · ${p.goals.protein}g proteína · ${p.goals.carbs}g carbo · ${p.goals.fat}g gordura.`,
    p.note ? `Preferência do usuário: ${p.note}` : "",
    "",
    "Cardápio disponível (REF | receita | calorias por porção | macros | tempo):",
    table,
    "",
    `Para cada dia (dayIndex de 0 a ${p.days - 1}) e cada refeição pedida, escolha um REF do cardápio e defina as porções.`,
  ]
    .filter(Boolean)
    .join("\n");
}

/* ── helpers de nutrição (números sempre do banco) ──────────────────── */
function scaleNutrition(n: Nutrition, f: number): Nutrition {
  return {
    calories: Math.round(n.calories * f),
    protein: Math.round(n.protein * f),
    carbs: Math.round(n.carbs * f),
    fat: Math.round(n.fat * f),
  };
}

function sumNutrition(slots: PlanMealItem[]): Nutrition {
  return slots.reduce(
    (a, s) => ({
      calories: a.calories + s.recipe.nutrition.calories,
      protein: a.protein + s.recipe.nutrition.protein,
      carbs: a.carbs + s.recipe.nutrition.carbs,
      fat: a.fat + s.recipe.nutrition.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );
}

/**
 * Resolve os canonicalIds que faltam para nomes de compra limpos. Deduplica por
 * canonicalId (colapsa "alho", "dente de alho", "alho assado" → 1× "Alho") e usa
 * o displayName canônico em vez do nome cru da receita. Ordena por categoria
 * depois nome, deixando a lista navegável como num mercado.
 */
async function buildShoppingList(
  fallbackByCanonical: Map<string, string>,
): Promise<ShoppingListItem[]> {
  const ids = [...fallbackByCanonical.keys()];
  if (ids.length === 0) return [];

  const ings = (await IngredientModel.findMany(
    { _id: { $in: ids } } as never,
    { projection: { displayName: 1, category: 1 } },
  )) as { _id: string; displayName?: string; category?: string }[];
  const byId = new Map(ings.map((i) => [i._id, i]));

  const seen = new Set<string>();
  const items: { name: string; category: string }[] = [];
  for (const id of ids) {
    const ing = byId.get(id);
    const name = ing?.displayName ?? fallbackByCanonical.get(id) ?? id;
    const key = name.toLowerCase();
    if (seen.has(key)) continue; // 2 canonicalIds com o mesmo displayName → 1
    seen.add(key);
    items.push({ name, category: ing?.category ?? "" });
  }

  items.sort(
    (a, b) =>
      a.category.localeCompare(b.category) || a.name.localeCompare(b.name),
  );
  return items.map((i) => ({ name: i.name, haveInPantry: false }));
}

/* ── orquestração: recupera → 1 chamada LLM → valida e monta ────────── */
export async function generateMealPlan(
  p: GeneratePlanParams,
): Promise<GeneratedMealPlan> {
  const shortlist = await buildShortlist(p);
  if (shortlist.length < p.slots.length) {
    throw new Error(
      "Não há receitas suficientes (com informação nutricional) para montar o plano.",
    );
  }

  const refs = shortlist.map((_, i) => `R${i + 1}`);

  // O enum trava o LLM: ele só pode emitir um REF do cardápio e um slot pedido.
  const SelectionSchema = z.object({
    days: z.array(
      z.object({
        slots: z.array(
          z.object({
            slot: z.enum(p.slots as [MealSlot, ...MealSlot[]]),
            ref: z.enum(refs as [string, ...string[]]),
            servings: z.number(),
            why: z.string().optional(),
          }),
        ),
      }),
    ),
  });

  const res = await anthropic.messages.parse({
    model: EXTRACTION_MODEL,
    max_tokens: 4000,
    output_config: {
      format: zodOutputFormat(SelectionSchema),
      ...effortOption("low"),
    },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserPrompt(shortlist, p) }],
  });

  if (!res.parsed_output) {
    throw new Error(`Geração de plano falhou (stop_reason=${res.stop_reason}).`);
  }

  // Validação determinística: tudo que é número é recalculado do banco.
  const byRef = new Map<string, ShortlistHit>(
    shortlist.map((r, i) => [`R${i + 1}`, r]),
  );
  const days: PlanDay[] = [];

  res.parsed_output.days.slice(0, p.days).forEach((day, dayIndex) => {
    const used = new Set<MealSlot>();
    const picks: { slot: MealSlot; r: ShortlistHit; servings: number; why?: string }[] = [];
    for (const sel of day.slots) {
      const slot = sel.slot as MealSlot;
      if (!p.slots.includes(slot) || used.has(slot)) continue;
      const r = byRef.get(sel.ref);
      if (!r) continue;
      used.add(slot);
      picks.push({
        slot,
        r,
        servings: clamp(Number(sel.servings) || 1, 0.5, 4),
        ...(sel.why ? { why: sel.why } : {}),
      });
    }

    // O número manda, não o LLM: reescala as porções para aproximar a meta de
    // calorias do dia, preservando as proporções entre os pratos.
    const rawKcal = picks.reduce((s, pk) => s + pk.r.nutrition.calories * pk.servings, 0);
    if (rawKcal > 0) {
      const factor = p.goals.calories / rawKcal;
      for (const pk of picks) pk.servings = roundToHalf(pk.servings * factor);
    }

    const slots: PlanMealItem[] = picks
      .map((pk) => ({
        slot: pk.slot,
        recipe: {
          _id: pk.r._id,
          title: pk.r.title,
          thumbnailUrl: pk.r.thumbnailUrl,
          prepTimeMin: pk.r.prepTimeMin,
          country: pk.r.country,
          nutrition: scaleNutrition(pk.r.nutrition, pk.servings),
        },
        servings: pk.servings,
        ...(pk.why ? { why: pk.why } : {}),
      }))
      .sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot));

    days.push({ dayIndex, slots, totals: sumNutrition(slots) });
  });

  // Lista de compras: união dos 'missing' das escolhidas, deduplicada por
  // canonicalId e exibida com o nome canônico limpo (ver buildShoppingList).
  const chosen = new Set(days.flatMap((d) => d.slots.map((s) => s.recipe._id)));
  const fallbackByCanonical = new Map<string, string>();
  for (const r of shortlist) {
    if (!chosen.has(r._id)) continue;
    for (const m of r.missing) {
      if (!fallbackByCanonical.has(m.canonicalId)) {
        fallbackByCanonical.set(m.canonicalId, m.name);
      }
    }
  }
  const shoppingList = await buildShoppingList(fallbackByCanonical);

  const avgDailyCalories = days.length
    ? Math.round(days.reduce((s, d) => s + d.totals.calories, 0) / days.length)
    : 0;

  return {
    days,
    shoppingList,
    summary: {
      avgDailyCalories,
      targetCalories: p.goals.calories,
      fitsGoal:
        Math.abs(avgDailyCalories - p.goals.calories) <= p.goals.calories * 0.15,
    },
  };
}
