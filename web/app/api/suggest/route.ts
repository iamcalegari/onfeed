import { type NextRequest, NextResponse } from "next/server";

import { searchRecipes } from "@/lib/api";

/**
 * GET /api/suggest?kcal=N
 * Retorna até 4 receitas sugeridas, priorizando as que cabem nos kcal restantes.
 */
export async function GET(req: NextRequest) {
  const remaining = Number(req.nextUrl.searchParams.get("kcal") ?? 9999);

  try {
    const { results } = await searchRecipes({
      ingredients: ["frango", "ovo", "azeite"],
      limit: 12,
    });

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
        score:        r.matchScore,
      }))
      .sort((a, b) => {
        if (a.fits !== null && b.fits !== null) return (b.fits ? 1 : 0) - (a.fits ? 1 : 0) || b.score - a.score;
        return b.score - a.score;
      })
      .slice(0, 5);

    return NextResponse.json(hits);
  } catch {
    return NextResponse.json([]);
  }
}
