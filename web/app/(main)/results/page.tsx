import { auth } from "@clerk/nextjs/server";
import { ResultsView } from "@/components/ResultsView";
import { searchRecipes } from "@/lib/api";
import type { Equipment, NutritionGoal, SearchRequest } from "@/lib/types";

function parseParams(
  sp: Record<string, string | string[] | undefined>,
): SearchRequest {
  const str = (k: string) => (typeof sp[k] === "string" ? sp[k] : undefined);
  const list = (k: string) =>
    str(k)
      ?.split(",")
      .map((s) => s.trim())
      .filter(Boolean) ?? [];

  const maxTime = str("maxPrepTimeMin");
  const goal = str("goal");

  const base = list("base");

  return {
    ingredients: list("ingredients"),
    equipment: list("equipment") as Equipment[],
    ...(maxTime && { maxPrepTimeMin: Number(maxTime) }),
    ...(goal && { goal: goal as NutritionGoal }),
    occasions: list("occasions"),
    limit: 75,
    ...(base.length > 0 && { baseIngredients: base }),
  };
}

export default async function ResultsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const req = parseParams(await searchParams);
  const { results, unresolvedIngredients, haveIds } = await searchRecipes(req);

  let authenticated = false;
  try {
    authenticated = (await auth()).userId !== null;
  } catch {
    authenticated = false;
  }

  const query = req.ingredients.join(", ");

  return (
    <ResultsView
      results={results}
      haveIds={haveIds}
      authenticated={authenticated}
      query={query}
      unresolvedIngredients={unresolvedIngredients}
      baseIngredients={req.baseIngredients ?? []}
    />
  );
}
