import { type NextRequest, NextResponse } from "next/server";

import { searchRecipes } from "@/lib/api";

/* Pool de ingredientes e ocasiões por slot de refeição */
const SLOT_CONFIG: Record<string, { pool: string[][]; occasions: string[] }> = {
  "Café da manhã": {
    pool: [
      ["ovo", "queijo", "pão integral"],
      ["aveia", "banana", "mel"],
      ["iogurte", "granola", "frutas vermelhas"],
      ["tapioca", "queijo", "ovo"],
      ["pão", "manteiga", "geleia"],
    ],
    occasions: ["breakfast"],
  },
  Almoço: {
    pool: [
      ["frango", "arroz", "brócolis"],
      ["carne", "batata", "cebola"],
      ["peixe", "limão", "azeite"],
      ["feijão", "arroz", "couve"],
      ["massa", "tomate", "manjericão"],
    ],
    occasions: ["weeknight"],
  },
  Lanche: {
    pool: [
      ["iogurte", "aveia", "frutas"],
      ["amendoim", "banana", "mel"],
      ["queijo", "frutas", "castanha"],
      ["abacate", "limão", "sal"],
      ["pão integral", "pasta de amendoim"],
    ],
    occasions: ["quick", "healthy"],
  },
  Jantar: {
    pool: [
      ["frango", "limão", "ervas"],
      ["salmão", "azeite", "alho"],
      ["carne", "batata doce", "alecrim"],
      ["ovo", "legumes", "azeite"],
      ["tofu", "shoyu", "gengibre"],
    ],
    occasions: ["weeknight", "comfort_food"],
  },
};

const DEFAULT_CONFIG = SLOT_CONFIG["Almoço"];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Embaralha array no-mute (Fisher-Yates). */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * GET /api/suggest?kcal=N&slot=Almoço
 * Retorna até 5 receitas sugeridas variadas pelo slot de refeição.
 */
export async function GET(req: NextRequest) {
  const remaining = Number(req.nextUrl.searchParams.get("kcal") ?? 9999);
  const slot      = req.nextUrl.searchParams.get("slot") ?? "Almoço";

  const config = SLOT_CONFIG[slot] ?? DEFAULT_CONFIG;
  const ingredients = pickRandom(config.pool);

  try {
    const { results } = await searchRecipes({
      ingredients,
      occasions: config.occasions,
      limit: 18,
    });

    /* Adiciona ruído pequeno para variar a ordem entre receitas com score próximo */
    const hits = results
      .map(r => ({
        _id:          r._id,
        title:        r.title,
        thumbnailUrl: r.thumbnailUrl,
        prepTimeMin:  r.prepTimeMin,
        kcal:         r.nutrition ? Math.round(r.nutrition.calories) : null,
        protein:      r.nutrition ? Math.round(r.nutrition.protein)  : null,
        carbs:        r.nutrition ? Math.round(r.nutrition.carbs)    : null,
        fat:          r.nutrition ? Math.round(r.nutrition.fat)      : null,
        fits:         r.nutrition ? r.nutrition.calories <= remaining * 1.05 : null,
        score:        r.matchScore + Math.random() * 0.08, // ruído ±0.08
      }));

    /* Separa as que cabem no plano das demais, ordena cada grupo por score */
    const fitting   = hits.filter(h => h.fits !== false).sort((a, b) => b.score - a.score);
    const remaining_ = hits.filter(h => h.fits === false).sort((a, b) => b.score - a.score);

    /* Embaralha leve dentro de cada tier para não retornar sempre as mesmas */
    const ordered = [...shuffle(fitting.slice(0, 8)), ...shuffle(remaining_.slice(0, 6))];

    return NextResponse.json(ordered.slice(0, 5));
  } catch {
    return NextResponse.json([]);
  }
}
