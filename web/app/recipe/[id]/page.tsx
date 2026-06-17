import Link from "next/link";
import { notFound } from "next/navigation";

import { AdaptButton } from "@/components/AdaptButton";
import { RecipeThumbnail } from "@/components/RecipeThumbnail";
import { StepTimer } from "@/components/StepTimer";
import { getRecipe } from "@/lib/api";
import { flagEmoji, formatMinutes } from "@/lib/format";

const EQUIPMENT_LABELS: Record<string, string> = {
  stovetop: "Fogão",
  oven: "Forno",
  microwave: "Microondas",
  blender: "Liquidificador",
  none: "Sem equipamento",
};

export default async function RecipePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ have?: string }>;
}) {
  const { id } = await params;
  const { have } = await searchParams;
  const recipe = await getRecipe(id);
  if (!recipe) notFound();

  // o que o usuário tem (canonicalIds vindos da busca); staples contam como tem
  const haveSet = new Set((have ?? "").split(",").filter(Boolean));
  const hasIt = (canonicalId: string, isStaple: boolean) =>
    isStaple || haveSet.has(canonicalId);
  const haveCount = recipe.ingredients.filter((i) =>
    hasIt(i.canonicalId, i.isStaple),
  ).length;

  const totalTime =
    recipe.prepTimeMin ||
    recipe.steps.reduce((acc, s) => acc + (s.minutes ?? 0), 0);

  return (
    <article className="flex flex-col gap-5">
      <Link href="/results" className="text-sm text-emerald-700">
        ← voltar
      </Link>

      <RecipeThumbnail recipeId={recipe._id} initialUrl={recipe.thumbnailUrl} />

      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold leading-tight">
          <span className="mr-1">{flagEmoji(recipe.country)}</span>
          {recipe.title}
        </h1>
        <div className="flex flex-wrap gap-2">
          {recipe.occasions.map((o) => (
            <Badge key={o}>{o}</Badge>
          ))}
          {recipe.equipment
            .filter((e) => e !== "none")
            .map((e) => (
              <Badge key={e}>{EQUIPMENT_LABELS[e] ?? e}</Badge>
            ))}
        </div>
        <p className="text-sm text-stone-600">{recipe.intro}</p>
      </header>

      {have !== undefined && haveCount < recipe.ingredients.length && (
        <AdaptButton recipeId={recipe._id} haveIds={[...haveSet]} />
      )}

      {recipe.nutrition && (
        <section className="grid grid-cols-4 gap-2 rounded-xl border border-stone-200 bg-white p-3 text-center">
          <Macro label="kcal" value={recipe.nutrition.calories} />
          <Macro label="prot" value={`${recipe.nutrition.protein}g`} />
          <Macro label="carb" value={`${recipe.nutrition.carbs}g`} />
          <Macro label="gord" value={`${recipe.nutrition.fat}g`} />
        </section>
      )}

      {/* Ingredientes */}
      <section className="rounded-xl border border-stone-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wide text-stone-500">
            Ingredientes
          </h2>
          <span className="text-xs font-medium text-stone-500">
            {haveCount}/{recipe.ingredients.length}
          </span>
        </div>
        <ul className="flex flex-col gap-2">
          {recipe.ingredients.map((ing, i) => {
            const got = hasIt(ing.canonicalId, ing.isStaple);
            return (
              <li
                key={i}
                className="flex items-baseline justify-between gap-2 text-sm"
              >
                <span className="flex items-baseline gap-2">
                  <span
                    className={
                      got ? "text-emerald-600" : "text-stone-300"
                    }
                    aria-label={got ? "você tem" : "faltando"}
                  >
                    {got ? "✓" : "○"}
                  </span>
                  <span
                    className={`${ing.core ? "font-medium" : ""} ${
                      got ? "" : "text-stone-500"
                    }`}
                  >
                    {ing.name}
                  </span>
                </span>
                <span className="text-xs text-stone-400">
                  {ing.quantity ?? ""} {ing.unit ?? ""}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Passo a passo com timer */}
      <section className="rounded-xl border border-stone-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wide text-stone-500">
            Passo a passo
          </h2>
          <span className="text-xs font-medium text-stone-500">
            {formatMinutes(totalTime)}
          </span>
        </div>
        <ol className="flex flex-col gap-4">
          {recipe.steps.map((step, i) => (
            <li key={i} className="flex flex-col gap-1.5">
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-bold text-emerald-700">
                  {i + 1}.
                </span>
                <p className="text-sm text-stone-700">{step.text}</p>
              </div>
              {step.minutes ? (
                <div className="pl-6">
                  <StepTimer minutes={step.minutes} />
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      </section>
    </article>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs text-stone-600">
      {children}
    </span>
  );
}

function Macro({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-sm font-bold">{value}</div>
      <div className="text-[10px] uppercase text-stone-400">{label}</div>
    </div>
  );
}
