import Link from "next/link";

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

  return {
    ingredients: list("ingredients"),
    equipment: list("equipment") as Equipment[],
    ...(maxTime && { maxPrepTimeMin: Number(maxTime) }),
    ...(goal && { goal: goal as NutritionGoal }),
    occasions: list("occasions"),
    // mais resultados para o Card View formar packs de 25
    limit: 75,
  };
}

export default async function ResultsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const req = parseParams(await searchParams);
  const { results, unresolvedIngredients, haveIds } = await searchRecipes(req);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Resultados</h1>
        <Link href="/" className="text-sm text-emerald-700">
          ← nova busca
        </Link>
      </header>

      {unresolvedIngredients.length > 0 && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Não reconhecemos: {unresolvedIngredients.join(", ")}
        </p>
      )}

      {results.length === 0 ? (
        <p className="text-sm text-stone-500">
          Nada encontrado. Tente menos restrições.
        </p>
      ) : (
        <ResultsView results={results} haveIds={haveIds} />
      )}
    </div>
  );
}
