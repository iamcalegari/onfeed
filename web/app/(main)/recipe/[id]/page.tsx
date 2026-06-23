import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";

import { AdaptButton }    from "@/components/AdaptButton";
import { AddToPlanButton } from "@/components/AddToPlanButton";
import { BackButton }     from "@/components/BackButton";
import { FavoriteButton } from "@/components/FavoriteButton";
import { LazyThumbnail }  from "@/components/LazyThumbnail";
import { LikeButton }     from "@/components/LikeButton";
import { LogMealButton }  from "@/components/LogMealButton";
import { ShareButton }    from "@/components/ShareButton";
import { StepTimer }      from "@/components/StepTimer";
import { getFavoriteIds, getRecipe, getRecipeLikes, getRecipeVariants } from "@/lib/api";
import { flagEmoji, formatMinutes, recipeHref }  from "@/lib/format";
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
      title: recipe.title, description: recipe.intro, type: "article",
      ...(img && { images: [{ url: img, width: 1200, height: 630, alt: recipe.title }] }),
    },
    twitter: {
      card: img ? "summary_large_image" : "summary",
      title: recipe.title, description: recipe.intro,
      ...(img && { images: [img] }),
    },
  };
}

const EQUIPMENT_LABELS: Record<string, string> = {
  stovetop: "Fogão", oven: "Forno", microwave: "Micro-ondas",
  blender: "Liquidificador", none: "Sem equipamento",
};

export default async function RecipePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ have?: string; adapted?: string; base?: string }>;
}) {
  const { id }            = await params;
  const { have, adapted, base } = await searchParams;
  const recipe            = await getRecipe(id);
  if (!recipe) notFound();

  const cookieStore = await cookies();
  const unitSystem  = (cookieStore.get(COOKIE_UNIT)?.value ?? "metric") as UnitSystem;
  const lang        = (cookieStore.get(COOKIE_LANG)?.value  ?? "pt")     as Language;

  let userId: string | null = null;
  try { userId = (await auth()).userId; } catch { userId = null; }

  const isVariant = recipe.source === "variant";

  const [favorited, likes, variantData, parentRecipe] = await Promise.all([
    userId ? getFavoriteIds().then(ids => ids.includes(recipe._id)) : false,
    getRecipeLikes(recipe._id),
    isVariant ? Promise.resolve({ count: 0, variants: [] }) : getRecipeVariants(recipe._id),
    isVariant && recipe.parentRecipeId ? getRecipe(recipe.parentRecipeId) : Promise.resolve(null),
  ]);

  const haveSet    = new Set((have ?? "").split(",").filter(Boolean));
  const hasIt      = (canonicalId: string, isStaple: boolean) => isStaple || haveSet.has(canonicalId);
  const baseSet    = new Set((base ?? "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean));
  const isBaseIng  = (name: string) => baseSet.has(name.toLowerCase());
  const haveCount  = recipe.ingredients.filter(i => hasIt(i.canonicalId, i.isStaple)).length;

  const totalTime  = recipe.prepTimeMin || recipe.steps.reduce((a, s) => a + (s.minutes ?? 0), 0);
  const nut        = recipe.nutrition;
  const hasBanner  = Boolean(adapted) || isVariant;

  return (
    <article style={{ display: "flex", flexDirection: "column", animation: "ofRise .28s ease both" }}>

      {/* ── Hero full-bleed 280px ─────────────────────────────── */}
      <div style={{ height: 280, position: "relative", overflow: "hidden", marginLeft: -16, marginRight: -16 }}>
        <LazyThumbnail
          recipeId={recipe._id}
          initialUrl={recipe.thumbnailUrl}
          className="h-full w-full"
          rounded="rounded-none"
          iconClassName="text-6xl"
        />
        {/* Fade creme na base */}
        <div style={{
          position: "absolute", bottom: 0, left: 0, right: 0, height: 90,
          background: "linear-gradient(to top, #faf4e8, transparent)",
          pointerEvents: "none",
        }} />
        {/* Botão voltar */}
        <BackButton
          fallbackHref="/"
          style={{
            position: "absolute", top: 60, left: 18,
            width: 38, height: 38, borderRadius: "50%",
            background: "rgba(255,255,255,.92)",
            boxShadow: "0 3px 10px rgba(0,0,0,.15)",
            display: "flex", alignItems: "center", justifyContent: "center",
            border: "none", cursor: "pointer", zIndex: 10,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#162f25" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 5-7 7 7 7" />
          </svg>
        </BackButton>
        {/* Ações (like, save, share) */}
        <div style={{ position: "absolute", top: 60, right: 18, display: "flex", gap: 8, zIndex: 10 }}>
          <LikeButton
            recipeId={recipe._id}
            initialLiked={likes.liked}
            initialCount={likes.count}
            canLike={Boolean(userId)}
          />
          {userId && <FavoriteButton recipeId={recipe._id} initiallyFavorited={favorited} compact />}
          <ShareButton
            title={recipe.title}
            text={`Receita de ${recipe.title} no onFeed`}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-areia bg-white/90 text-carvao/50 transition-colors hover:text-carvao"
          />
        </div>
      </div>

      {/* ── Conteúdo (sobrepõe hero -26px, exceto quando há banner) ── */}
      <div style={{ marginTop: hasBanner ? 14 : -26, paddingBottom: 80 }}>

        {/* Banners (adapted / variant) */}
        {adapted && (
          <div className="flex items-start gap-3 rounded-2xl bg-salvia/15 p-4 ring-1 ring-salvia/30 mb-4">
            <span className="text-xl text-forest">✦</span>
            <div>
              <p className="font-display text-base font-bold text-forest">Receita adaptada</p>
              <p className="text-sm text-carvao/65">com base nos ingredientes que você tem.</p>
            </div>
          </div>
        )}
        {isVariant && (
          <div className="variant-glow flex items-start gap-3 rounded-2xl p-4 mb-4"
            style={{ background: "linear-gradient(135deg,rgba(180,140,60,.10) 0%,rgba(200,165,80,.06) 100%)" }}>
            <span className="text-lg text-amber-500">✦</span>
            <div className="flex-1 min-w-0">
              <p className="font-display text-base font-bold text-amber-700">Receita Variante</p>
              {recipe.createdBy && recipe.createdBy.length > 0 && (
                <p className="mt-0.5 text-sm text-carvao/60">
                  Por {recipe.createdBy.map((c, i) => <span key={c.userId}>{i > 0 && ", "}<span className="font-semibold text-carvao/80">@{c.username}</span></span>)}
                </p>
              )}
              {parentRecipe && (
                <Link href={`/recipe/${parentRecipe._id}`} className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-amber-600 hover:text-amber-700">
                  Ver receita original: {parentRecipe.title} <span>→</span>
                </Link>
              )}
            </div>
          </div>
        )}

        {/* Ocasiões / equipamentos como badges */}
        {(recipe.occasions.length > 0 || recipe.equipment.filter(e => e !== "none").length > 0) && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
            {recipe.occasions.map(o => <BadgePill key={o}>{o}</BadgePill>)}
            {recipe.equipment.filter(e => e !== "none").map(e => <BadgePill key={e}>{EQUIPMENT_LABELS[e] ?? e}</BadgePill>)}
          </div>
        )}

        {/* Título */}
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 28, color: "#162f25", lineHeight: 1.15, marginTop: 11, margin: 0 }}>
          {recipe.title}
        </h1>

        {/* Meta */}
        <div style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 13, color: "#7a9e94", fontWeight: 600, marginTop: 9, flexWrap: "wrap" }}>
          <span>⏱ {formatMinutes(totalTime)}</span>
          <span>🍽 {recipe.servings} porções</span>
          <span>{flagEmoji(recipe.country)} {recipe.country}</span>
          {variantData.count > 0 && (
            <Link href={`/recipe/${recipe._id}/variants`} style={{ color: "#c9973b", fontWeight: 700, textDecoration: "none" }}>
              ✦ {variantData.count} variante{variantData.count !== 1 ? "s" : ""}
            </Link>
          )}
        </div>

        {/* Intro */}
        <p style={{ fontSize: 14, color: "#6c726a", lineHeight: 1.5, marginTop: 12 }}>{recipe.intro}</p>

        {/* ── Card nutricional ──────────────────────────────── */}
        {nut && (
          <div style={{
            background: "#fff", border: "1px solid #f2e6d6", borderRadius: 22,
            padding: 18, marginTop: 20, boxShadow: "0 6px 18px -12px rgba(22,47,37,.2)",
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase", color: "#7a9e94" }}>
              Informação nutricional · por porção
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 10 }}>
              <span style={{ fontFamily: "var(--font-display)", fontSize: 42, color: "#162f25", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
                {Math.round(nut.calories)}
              </span>
              <span style={{ fontSize: 14, color: "#7a9e94", fontWeight: 600 }}>kcal</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 16 }}>
              <MacroChip label="Proteína" value={Math.round(nut.protein)} color="#4a7fcb" labelColor="#7a8ba8" bg="#eef3fb" unit="g" />
              <MacroChip label="Carbo"    value={Math.round(nut.carbs)}   color="#c27a00" labelColor="#a98a4e" bg="#fbf1de" unit="g" />
              <MacroChip label="Gordura"  value={Math.round(nut.fat)}     color="#d4644a" labelColor="#b06a55" bg="#fbeae6" unit="g" />
            </div>
            <div style={{ marginTop: 14 }}>
              <LogMealButton recipeId={recipe._id} title={recipe.title} nutrition={nut} servings={1} />
            </div>
            <AddToPlanButton
              recipeId={recipe._id}
              title={recipe.title}
              nutrition={nut}
              prepTime={totalTime}
              ingredients={recipe.ingredients.map(i => i.name)}
            />
          </div>
        )}

        {/* ── Adaptar aos meus macros (PRO/FREE) ─────────────── */}
        {userId && (
          <div style={{ marginTop: 11 }}>
            <AdaptButton recipeId={recipe._id} haveIds={[...haveSet]} />
          </div>
        )}

        {/* ── Ingredientes ──────────────────────────────────── */}
        <div style={{ marginTop: 26 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.1, textTransform: "uppercase", color: "#7a9e94" }}>
              Ingredientes
            </span>
            <span style={{ fontSize: 12, color: "#9aa39b", fontWeight: 600 }}>
              {haveCount}/{recipe.ingredients.length} disponíveis
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {recipe.ingredients.map((ing, i) => {
              const got  = hasIt(ing.canonicalId, ing.isStaple);
              const base = isBaseIng(ing.name);
              const qty  = formatQtyForSystem(ing.quantity, translateUnit(ing.unit, lang), unitSystem);
              const bulletColor = base ? "#e8a020" : got ? "#7a9e94" : "#c4cabf";
              return (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "11px 2px",
                  borderBottom: i < recipe.ingredients.length - 1 ? "1px solid #f0e8da" : "none",
                }}>
                  <div style={{ width: 7, height: 7, borderRadius: "50%", background: bulletColor, flexShrink: 0 }} />
                  <span style={{
                    flex: 1, fontSize: 14,
                    color: got ? "#3a3a36" : "#b4b9ad",
                    fontWeight: base ? 700 : ing.core ? 600 : 400,
                  }}>
                    {base && <span style={{ color: "#e8a020", marginRight: 4 }}>★</span>}
                    {ing.name}
                  </span>
                  {qty && (
                    <span style={{ fontSize: 13, color: "#9aa39b", fontWeight: 600, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
                      {qty}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── CTA: modo cozinha ─────────────────────────────── */}
        <Link
          href={`/recipe/${recipe._id}/cook`}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
            background: "#162f25", color: "#faf4e8", borderRadius: 18, padding: 17,
            textAlign: "center", fontSize: 15, fontWeight: 700, marginTop: 20,
            boxShadow: "0 10px 24px -10px rgba(22,47,37,.5)",
            textDecoration: "none",
          }}
        >
          <span>🍳</span> Irei fazer esta receita
        </Link>

        {/* ── Modo de preparo ───────────────────────────────── */}
        <div style={{ marginTop: 24 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.1, textTransform: "uppercase", color: "#7a9e94" }}>
              Modo de preparo
            </span>
            <span style={{ fontSize: 12, color: "#9aa39b" }}>{formatMinutes(totalTime)}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {recipe.steps.map((step, i) => (
              <div key={i} style={{ display: "flex", gap: 13 }}>
                <div style={{
                  width: 26, height: 26, borderRadius: "50%",
                  background: "#162f25", color: "#faf4e8",
                  fontSize: 13, fontWeight: 700, flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {i + 1}
                </div>
                <div style={{ fontSize: 14, color: "#3a3a36", lineHeight: 1.5, paddingTop: 2, flex: 1 }}>
                  <p style={{ margin: 0 }}>{step.text}</p>
                  {step.minutes ? <StepTimer minutes={step.minutes} /> : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </article>
  );
}

/* ── Sub-components ──────────────────────────────────────────── */

function MacroChip({ label, value, color, labelColor, bg, unit }: {
  label: string; value: number; color: string; labelColor: string; bg: string; unit?: string;
}) {
  return (
    <div style={{ background: bg, borderRadius: 14, padding: 12, textAlign: "center" }}>
      <div style={{ fontSize: 20, fontWeight: 800, color, fontVariantNumeric: "tabular-nums" }}>
        {value}{unit}
      </div>
      <div style={{ fontSize: 11, color: labelColor, fontWeight: 600, marginTop: 2 }}>
        {label}
      </div>
    </div>
  );
}

function BadgePill({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      display: "inline-block", fontSize: 11, fontWeight: 700,
      padding: "4px 11px", borderRadius: 14,
      background: "#f3ede1", color: "#7a9e94",
    }}>
      {children}
    </span>
  );
}
