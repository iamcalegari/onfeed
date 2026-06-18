import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";

import { AdaptButton } from "@/components/AdaptButton";
import { BackButton } from "@/components/BackButton";
import { FavoriteButton } from "@/components/FavoriteButton";
import { RecipeThumbnail } from "@/components/RecipeThumbnail";
import { StepTimer } from "@/components/StepTimer";
import { getFavoriteIds, getRecipe } from "@/lib/api";
import { flagEmoji, formatMinutes } from "@/lib/format";
import { COOKIE_UNIT, formatQtyForSystem } from "@/lib/settings";
import type { UnitSystem } from "@/lib/settings";

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

  const cookieStore = await cookies();
  const unitSystem = (cookieStore.get(COOKIE_UNIT)?.value ?? "metric") as UnitSystem;

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

      {/* Banner receita adaptada */}
      {adapted && (
        <div className="flex items-start gap-3 rounded-2xl bg-salvia/15 p-4 ring-1 ring-salvia/30">
          <span className="text-xl text-forest">✦</span>
          <div>
            <p className="font-display text-base font-bold text-forest">
              Receita adaptada
            </p>
            <p className="text-sm text-carvao/65">
              com base nos ingredientes que você tem.
            </p>
          </div>
        </div>
      )}

      {/* Imagem hero */}
      <div className="overflow-hidden rounded-2xl shadow-card">
        <RecipeThumbnail recipeId={recipe._id} initialUrl={recipe.thumbnailUrl} />
      </div>

      {/* Cabeçalho */}
      <header className="flex flex-col gap-3">
        <h1 className="font-display text-[1.75rem] font-bold leading-tight text-carvao">
          <span className="mr-1.5">{flagEmoji(recipe.country)}</span>
          {recipe.title}
        </h1>

        {/* Meta */}
        <div className="flex flex-wrap items-center gap-3 text-sm text-carvao/60">
          <MetaTag icon="⏱" label={formatMinutes(totalTime)} />
          <span className="text-areia">·</span>
          <MetaTag icon="🍽" label={`${recipe.servings} porções`} />
        </div>

        {/* Badges de ocasião e equipamento */}
        {(recipe.occasions.length > 0 ||
          recipe.equipment.filter((e) => e !== "none").length > 0) && (
          <div className="flex flex-wrap gap-1.5">
            {recipe.occasions.map((o) => (
              <OccasionBadge key={o}>{o}</OccasionBadge>
            ))}
            {recipe.equipment
              .filter((e) => e !== "none")
              .map((e) => (
                <OccasionBadge key={e}>{EQUIPMENT_LABELS[e] ?? e}</OccasionBadge>
              ))}
          </div>
        )}

        <p className="text-sm leading-relaxed text-carvao/65">{recipe.intro}</p>
      </header>

      {/* Adaptar receita */}
      {userId &&
        have !== undefined &&
        haveCount < recipe.ingredients.length && (
          <AdaptButton recipeId={recipe._id} haveIds={[...haveSet]} />
        )}

      {/* Macros */}
      {recipe.nutrition && (
        <section className="grid grid-cols-4 gap-2 rounded-2xl bg-surface p-4 text-center shadow-card ring-1 ring-areia/60">
          <MacroCell label="kcal" value={recipe.nutrition.calories} />
          <MacroCell label="prot" value={`${recipe.nutrition.protein}g`} />
          <MacroCell label="carb" value={`${recipe.nutrition.carbs}g`} />
          <MacroCell label="gord" value={`${recipe.nutrition.fat}g`} />
        </section>
      )}

      {/* Ingredientes */}
      <section className="rounded-2xl bg-surface p-4 shadow-card ring-1 ring-areia/60">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-forest">
            Ingredientes
          </h2>
          <span className="rounded-full bg-areia/40 px-2.5 py-0.5 text-xs font-semibold text-carvao/60">
            {haveCount}/{recipe.ingredients.length}
          </span>
        </div>
        <ul className="flex flex-col divide-y divide-areia/40">
          {recipe.ingredients.map((ing, i) => {
            const got = hasIt(ing.canonicalId, ing.isStaple);
            const qty = formatQtyForSystem(ing.quantity, ing.unit, unitSystem);
            return (
              <li key={i} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                    got
                      ? "bg-forest/10 text-forest"
                      : "bg-areia/60 text-carvao/30"
                  }`}
                >
                  {got ? "✓" : "○"}
                </span>
                {/* Quantidade em coluna fixa à esquerda */}
                {qty && (
                  <span className={`w-14 shrink-0 text-right text-xs font-semibold tabular-nums ${got ? "text-forest/70" : "text-carvao/30"}`}>
                    {qty}
                  </span>
                )}
                {/* Nome do ingrediente */}
                <span
                  className={`flex-1 text-sm leading-snug ${ing.core ? "font-semibold" : ""} ${
                    got ? "text-carvao" : "text-carvao/40"
                  }`}
                >
                  {ing.name}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Passo a passo */}
      <section className="rounded-2xl bg-surface p-4 shadow-card ring-1 ring-areia/60">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-forest">
            Passo a passo
          </h2>
          <span className="text-xs font-medium text-carvao/40">
            {formatMinutes(totalTime)}
          </span>
        </div>
        <ol className="flex flex-col gap-5">
          {recipe.steps.map((step, i) => (
            <li key={i} className="flex gap-3">
              {/* Número do passo em círculo terracota */}
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-terracota/12 font-display text-xs font-bold text-terracota mt-0.5">
                {i + 1}
              </span>
              <div className="flex flex-col gap-1.5 flex-1">
                <p className="text-sm leading-relaxed text-carvao/80">{step.text}</p>
                {step.minutes ? <StepTimer minutes={step.minutes} /> : null}
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Botão favoritar */}
      {userId && (
        <FavoriteButton recipeId={recipe._id} initiallyFavorited={favorited} />
      )}
    </article>
  );
}

/* ── Sub-components ──────────────────────────────────────────── */

function MetaTag({ icon, label }: { icon: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span aria-hidden>{icon}</span>
      {label}
    </span>
  );
}

function OccasionBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-areia/50 px-2.5 py-0.5 text-xs font-medium text-carvao/60">
      {children}
    </span>
  );
}


function MacroCell({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="font-display text-base font-bold text-carvao">{value}</span>
      <span className="text-[10px] font-semibold uppercase tracking-wider text-carvao/35">
        {label}
      </span>
    </div>
  );
}
