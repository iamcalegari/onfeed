import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";

import { AdaptButton } from "@/components/AdaptButton";
import { BackButton } from "@/components/BackButton";
import { FavoriteButton } from "@/components/FavoriteButton";
import { RecipeThumbnail } from "@/components/RecipeThumbnail";
import { StepTimer } from "@/components/StepTimer";
import { getFavoriteIds, getRecipe } from "@/lib/api";
import { flagEmoji, formatMinutes } from "@/lib/format";

const EQUIPMENT_LABELS: Record<string, string> = {
  stovetop: "Fogão",
  oven: "Forno",
  microwave: "Micro-ondas",
  blender: "Liquidificador",
  none: "Sem equipamento",
};

export default async function RecipePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ have?: string; adapted?: string }>;
}) {
  const { id } = await params;
  const { have, adapted } = await searchParams;
  const recipe = await getRecipe(id);
  if (!recipe) notFound();

  let userId: string | null = null;
  try {
    userId = (await auth()).userId;
  } catch {
    userId = null;
  }
  const favorited = userId
    ? (await getFavoriteIds()).includes(recipe._id)
    : false;

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
      <BackButton className="w-fit text-sm font-medium text-terracota">
        ← voltar
      </BackButton>

      {adapted && (
        <div className="flex items-start gap-3 rounded-2xl bg-salvia/20 p-4">
          <span className="text-xl text-forest">✦</span>
          <div>
            <p className="font-display text-lg font-semibold text-forest">
              Receita adaptada
            </p>
            <p className="text-sm text-carvao/70">
              com base nos ingredientes que você tem.
            </p>
          </div>
        </div>
      )}

      <RecipeThumbnail recipeId={recipe._id} initialUrl={recipe.thumbnailUrl} />

      <header className="flex flex-col gap-3">
        <h1 className="font-display text-3xl font-semibold leading-tight text-carvao">
          <span className="mr-1">{flagEmoji(recipe.country)}</span>
          {recipe.title}
        </h1>

        {/* meta */}
        <div className="flex flex-wrap items-center gap-4 text-sm text-carvao/70">
          <Meta icon="⏱" label={formatMinutes(totalTime)} />
          <Meta icon="🍽" label={`${recipe.servings} porções`} />
        </div>

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
        <p className="text-sm text-carvao/70">{recipe.intro}</p>
      </header>

      {userId &&
        have !== undefined &&
        haveCount < recipe.ingredients.length && (
          <AdaptButton recipeId={recipe._id} haveIds={[...haveSet]} />
        )}

      {recipe.nutrition && (
        <section className="grid grid-cols-4 gap-2 rounded-2xl border border-areia bg-white p-3 text-center">
          <Macro label="kcal" value={recipe.nutrition.calories} />
          <Macro label="prot" value={`${recipe.nutrition.protein}g`} />
          <Macro label="carb" value={`${recipe.nutrition.carbs}g`} />
          <Macro label="gord" value={`${recipe.nutrition.fat}g`} />
        </section>
      )}

      {/* Ingredientes */}
      <section className="rounded-2xl border border-areia bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-forest">
            Ingredientes
          </h2>
          <span className="text-xs font-medium text-carvao/50">
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
                  <span className={got ? "text-forest" : "text-areia"}>
                    {got ? "✓" : "○"}
                  </span>
                  <span
                    className={`${ing.core ? "font-medium" : ""} ${
                      got ? "text-carvao" : "text-carvao/50"
                    }`}
                  >
                    {ing.name}
                  </span>
                </span>
                <span className="text-xs text-carvao/40">
                  {ing.quantity ?? ""} {ing.unit ?? ""}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Passo a passo */}
      <section className="rounded-2xl border border-areia bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-forest">
            Passo a passo
          </h2>
          <span className="text-xs font-medium text-carvao/50">
            {formatMinutes(totalTime)}
          </span>
        </div>
        <ol className="flex flex-col gap-4">
          {recipe.steps.map((step, i) => (
            <li key={i} className="flex flex-col gap-1.5">
              <div className="flex items-baseline gap-2">
                <span className="font-display text-base font-bold text-terracota">
                  {i + 1}.
                </span>
                <p className="text-sm text-carvao/80">{step.text}</p>
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

      {userId && (
        <FavoriteButton recipeId={recipe._id} initiallyFavorited={favorited} />
      )}
    </article>
  );
}

function Meta({ icon, label }: { icon: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span aria-hidden>{icon}</span>
      {label}
    </span>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-areia/40 px-2.5 py-0.5 text-xs text-carvao/70">
      {children}
    </span>
  );
}

function Macro({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="font-display text-base font-bold text-carvao">{value}</div>
      <div className="text-[10px] uppercase text-carvao/40">{label}</div>
    </div>
  );
}
