import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";

import { AdaptButton } from "@/components/AdaptButton";
import { AddToPlanButton } from "@/components/AddToPlanButton";
import { BackButton } from "@/components/BackButton";
import { FavoriteButton } from "@/components/FavoriteButton";
import { LikeButton } from "@/components/LikeButton";
import { LogMealButton } from "@/components/LogMealButton";
import { NutritionBadge } from "@/components/NutritionBadge";
import { RecipeThumbnail } from "@/components/RecipeThumbnail";
import { ShareButton } from "@/components/ShareButton";
import { StepTimer } from "@/components/StepTimer";
import { getFavoriteIds, getRecipe, getRecipeLikes, getRecipeVariants } from "@/lib/api";
import { flagEmoji, formatMinutes } from "@/lib/format";
import { COOKIE_LANG, COOKIE_UNIT, formatQtyForSystem, translateUnit } from "@/lib/settings";
import type { Language, UnitSystem } from "@/lib/settings";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const recipe = await getRecipe(id);
  if (!recipe) return {};

  const img = recipe.thumbnailUrl?.startsWith("http") ? recipe.thumbnailUrl : undefined;

  return {
    title: `${recipe.title} — onFeed`,
    description: recipe.intro,
    openGraph: {
      title: recipe.title,
      description: recipe.intro,
      type: "article",
      ...(img && { images: [{ url: img, width: 1200, height: 630, alt: recipe.title }] }),
    },
    twitter: {
      card: img ? "summary_large_image" : "summary",
      title: recipe.title,
      description: recipe.intro,
      ...(img && { images: [img] }),
    },
  };
}

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
  searchParams: Promise<{ have?: string; adapted?: string; base?: string }>;
}) {
  const { id } = await params;
  const { have, adapted, base } = await searchParams;
  const recipe = await getRecipe(id);
  if (!recipe) notFound();

  const cookieStore = await cookies();
  const unitSystem = (cookieStore.get(COOKIE_UNIT)?.value ?? "metric") as UnitSystem;
  const lang = (cookieStore.get(COOKIE_LANG)?.value ?? "pt") as Language;

  let userId: string | null = null;
  try {
    userId = (await auth()).userId;
  } catch {
    userId = null;
  }
  const isVariant = recipe.source === "variant";

  const [favorited, likes, variantData, parentRecipe] = await Promise.all([
    userId ? getFavoriteIds().then((ids) => ids.includes(recipe._id)) : false,
    getRecipeLikes(recipe._id),
    // conta variantes só se for receita base
    isVariant ? Promise.resolve({ count: 0, variants: [] }) : getRecipeVariants(recipe._id),
    // busca receita pai se for variante
    isVariant && recipe.parentRecipeId ? getRecipe(recipe.parentRecipeId) : Promise.resolve(null),
  ]);

  const haveSet = new Set((have ?? "").split(",").filter(Boolean));
  const hasIt = (canonicalId: string, isStaple: boolean) =>
    isStaple || haveSet.has(canonicalId);

  const baseSet = new Set(
    (base ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
  );
  const isBaseIng = (name: string) => baseSet.has(name.toLowerCase());
  const haveCount = recipe.ingredients.filter((i) =>
    hasIt(i.canonicalId, i.isStaple),
  ).length;

  const totalTime =
    recipe.prepTimeMin ||
    recipe.steps.reduce((acc, s) => acc + (s.minutes ?? 0), 0);

  return (
    <article className="flex flex-col gap-7">
      <BackButton className="w-fit text-sm font-medium text-terracota">
        ← voltar
      </BackButton>

      {/* Banner receita adaptada */}
      {adapted && (
        <div className="flex items-start gap-3 rounded-2xl bg-salvia/15 p-4 ring-1 ring-salvia/30">
          <span className="text-xl text-forest">✦</span>
          <div>
            <p className="font-display text-base font-bold text-forest">Receita adaptada</p>
            <p className="text-sm text-carvao/65">com base nos ingredientes que você tem.</p>
          </div>
        </div>
      )}

      {/* Banner variante — só aparece quando a receita é uma variante */}
      {isVariant && (
        <div
          className="variant-glow flex items-start gap-3 rounded-2xl p-4"
          style={{ background: "linear-gradient(135deg, rgba(180,140,60,0.10) 0%, rgba(200,165,80,0.06) 100%)" }}
        >
          <span className="text-lg text-amber-500">✦</span>
          <div className="flex-1 min-w-0">
            <p className="font-display text-base font-bold text-amber-700 dark:text-amber-400">
              Receita Variante
            </p>
            {recipe.createdBy && recipe.createdBy.length > 0 && (
              <p className="mt-0.5 text-sm text-carvao/60">
                Por{" "}
                {recipe.createdBy.map((c, i) => (
                  <span key={c.userId}>
                    {i > 0 && ", "}
                    <span className="font-semibold text-carvao/80">@{c.username}</span>
                  </span>
                ))}
              </p>
            )}
            {parentRecipe && (
              <Link
                href={`/recipe/${parentRecipe._id}`}
                className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-amber-600 hover:text-amber-700 dark:text-amber-400"
              >
                Ver receita original: {parentRecipe.title}
                <span aria-hidden>→</span>
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Imagem hero */}
      <div className="aspect-4/3 overflow-hidden rounded-3xl shadow-card">
        <RecipeThumbnail recipeId={recipe._id} initialUrl={recipe.thumbnailUrl} />
      </div>

      {/* Cabeçalho */}
      <header className="flex flex-col gap-5">
        <p className="text-xs font-semibold uppercase tracking-widest text-carvao/35">
          {flagEmoji(recipe.country)}&ensp;{recipe.country}
        </p>

        <h1 className="font-display text-[1.9rem] font-bold leading-tight text-carvao">
          {recipe.title}
        </h1>

        {/* Like + Salvar + Share */}
        <div className="flex items-center justify-between">
          <LikeButton
            recipeId={recipe._id}
            initialLiked={likes.liked}
            initialCount={likes.count}
            canLike={Boolean(userId)}
          />
          <div className="flex items-center gap-2">
            {userId && (
              <FavoriteButton recipeId={recipe._id} initiallyFavorited={favorited} compact />
            )}
            <ShareButton
              title={recipe.title}
              text={`Receita de ${recipe.title} no onFeed`}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-areia bg-surface text-carvao/50 transition-colors hover:text-carvao"
            />
          </div>
        </div>

        <div className="h-px bg-areia/60" />

        {/* Meta */}
        <div className="flex items-center gap-5 text-sm font-medium text-carvao/55">
          <MetaTag icon="⏱" label={formatMinutes(totalTime)} />
          <div className="h-4 w-px bg-areia" />
          <MetaTag icon="🍽" label={`${recipe.servings} porções`} />
          {variantData.count > 0 && (
            <>
              <div className="h-4 w-px bg-areia" />
              <Link
                href={`/recipe/${recipe._id}/variants`}
                className="flex items-center gap-1 text-amber-600 transition-colors hover:text-amber-700"
              >
                <span className="text-[11px]">✦</span>
                <span>{variantData.count} variante{variantData.count !== 1 ? "s" : ""}</span>
              </Link>
            </>
          )}
        </div>

        {/* Badges */}
        {(recipe.occasions.length > 0 || recipe.equipment.filter((e) => e !== "none").length > 0) && (
          <div className="flex flex-wrap gap-1.5">
            {recipe.occasions.map((o) => <OccasionBadge key={o}>{o}</OccasionBadge>)}
            {recipe.equipment.filter((e) => e !== "none").map((e) => (
              <OccasionBadge key={e}>{EQUIPMENT_LABELS[e] ?? e}</OccasionBadge>
            ))}
          </div>
        )}

        <p className="text-[0.9rem] leading-relaxed text-carvao/60">{recipe.intro}</p>
      </header>

      {/* Adaptar receita */}
      {userId && have !== undefined && haveCount < recipe.ingredients.length && (
        <AdaptButton recipeId={recipe._id} haveIds={[...haveSet]} />
      )}

      {/* Macros */}
      {recipe.nutrition && (
        <section className="flex flex-col gap-3 rounded-2xl bg-surface p-5 shadow-card ring-1 ring-areia/60">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-bold text-carvao">Nutrição</h2>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-carvao/35">por porção</span>
              <NutritionBadge nutrition={recipe.nutrition} />
            </div>
          </div>
          <div className="grid grid-cols-4 gap-3 text-center">
            <MacroCell label="kcal" value={Math.round(recipe.nutrition.calories)} color="#162f25" />
            <MacroCell label="prot" value={`${Math.round(recipe.nutrition.protein)}g`} color="#4a7fcb" />
            <MacroCell label="carb" value={`${Math.round(recipe.nutrition.carbs)}g`} color="#c27a00" />
            <MacroCell label="gord" value={`${Math.round(recipe.nutrition.fat)}g`} color="#d4644a" />
          </div>
          <LogMealButton
            recipeId={recipe._id}
            title={recipe.title}
            nutrition={recipe.nutrition}
            servings={1}
          />
          <AddToPlanButton
            recipeId={recipe._id}
            title={recipe.title}
            nutrition={recipe.nutrition}
            prepTime={totalTime}
            ingredients={recipe.ingredients.map(i => i.name)}
          />
        </section>
      )}

      {/* Ingredientes */}
      <section className="rounded-2xl bg-surface p-5 shadow-card ring-1 ring-areia/60">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-forest">Ingredientes</h2>
          <span className="rounded-full bg-areia/40 px-2.5 py-0.5 text-xs font-semibold text-carvao/55">
            {haveCount}/{recipe.ingredients.length}
          </span>
        </div>
        <ul className="flex flex-col divide-y divide-areia/40">
          {recipe.ingredients.map((ing, i) => {
            const got = hasIt(ing.canonicalId, ing.isStaple);
            const base = isBaseIng(ing.name);
            const qty = formatQtyForSystem(ing.quantity, translateUnit(ing.unit, lang), unitSystem);
            return (
              <li
                key={i}
                className={`flex items-center gap-3 py-3 first:pt-0 last:pb-0 ${
                  base ? "-mx-1 rounded-xl bg-amber-50/70 px-1" : ""
                }`}
              >
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                    base ? "bg-amber-400/25 text-amber-600" : got ? "bg-forest/10 text-forest" : "bg-areia/60 text-carvao/30"
                  }`}
                >
                  {base ? "★" : got ? "✓" : "○"}
                </span>
                <span
                  className={`flex-1 text-sm leading-snug ${ing.core || base ? "font-semibold" : ""} ${
                    base ? "text-amber-700" : got ? "text-carvao" : "text-carvao/40"
                  }`}
                >
                  {ing.name}
                </span>
                {qty && (
                  <span
                    className={`shrink-0 text-right text-xs font-semibold tabular-nums ${
                      base ? "text-amber-600/80" : got ? "text-forest/70" : "text-carvao/30"
                    }`}
                  >
                    {qty}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {/* CTA: modo cozinha */}
      <Link
        href={`/recipe/${recipe._id}/cook`}
        className="flex w-full items-center justify-center gap-2.5 rounded-2xl bg-forest py-4 text-sm font-bold text-creme shadow-card transition-all hover:bg-forest/90 active:scale-[0.98]"
      >
        <span className="text-base" aria-hidden>🍳</span>
        Irei fazer esta receita
      </Link>

      {/* Passo a passo */}
      <section className="rounded-2xl bg-surface p-5 shadow-card ring-1 ring-areia/60">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-forest">Passo a passo</h2>
          <span className="text-xs font-medium text-carvao/40">{formatMinutes(totalTime)}</span>
        </div>
        <ol className="flex flex-col gap-6">
          {recipe.steps.map((step, i) => (
            <li key={i} className="flex gap-4">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-terracota/12 font-display text-xs font-bold text-terracota">
                {i + 1}
              </span>
              <div className="flex flex-1 flex-col gap-2 pt-0.5">
                <p className="text-sm leading-relaxed text-carvao/75">{step.text}</p>
                {step.minutes ? <StepTimer minutes={step.minutes} /> : null}
              </div>
            </li>
          ))}
        </ol>
      </section>
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


function MacroCell({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 rounded-xl bg-areia/30 py-2.5">
      <span className="font-display text-base font-bold" style={{ color: color ?? "#232320" }}>
        {value}
      </span>
      <span className="text-[10px] font-semibold uppercase tracking-wider text-carvao/40">
        {label}
      </span>
    </div>
  );
}
