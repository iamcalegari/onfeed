import { auth } from "@clerk/nextjs/server";
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

  let authenticated = false;
  try {
    authenticated = (await auth()).userId !== null;
  } catch {
    authenticated = false;
  }

  const query = req.ingredients.join(", ");

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold text-forest">
          Resultados
        </h1>
        <Link href="/" className="text-sm font-medium text-terracota">
          nova busca
        </Link>
      </header>

      {query && (
        <div className="flex items-center gap-2 rounded-xl border border-areia bg-surface px-3.5 py-2.5">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 text-carvao/40">
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" strokeLinecap="round" />
          </svg>
          <span className="truncate text-sm text-carvao/70">{query}</span>
        </div>
      )}

      {unresolvedIngredients.length > 0 && (
        <p className="rounded-xl bg-terracota/10 px-3 py-2 text-xs text-terracota">
          Não reconhecemos: {unresolvedIngredients.join(", ")}
        </p>
      )}

      <p className="text-xs font-medium text-carvao/50">
        {results.length} receita{results.length === 1 ? "" : "s"} encontrada
        {results.length === 1 ? "" : "s"}
      </p>

      {results.length === 0 ? (
        <p className="text-sm text-carvao/50">
          Nada encontrado. Tente menos restrições.
        </p>
      ) : (
        <ResultsView
          results={results}
          haveIds={haveIds}
          authenticated={authenticated}
        />
      )}
    </div>
  );
}
