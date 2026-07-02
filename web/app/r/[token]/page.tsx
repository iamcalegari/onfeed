import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";

import { BackButton } from "@/components/BackButton";
import IngredientsSection from "@/components/IngredientsSection";
import { LazyThumbnail } from "@/components/LazyThumbnail";
import { LikeButton } from "@/components/LikeButton";
import { ShareButton } from "@/components/ShareButton";
import { StepTimer } from "@/components/StepTimer";
import { getRecipeByShareSlug } from "@/lib/api";
import { flagEmoji, formatMinutes } from "@/lib/format";
import {
  COOKIE_LANG,
  COOKIE_UNIT,
  formatQtyForSystem,
  translateUnit,
} from "@/lib/settings";
import type { Language, UnitSystem } from "@/lib/settings";

/**
 * Página pública do link compartilhável (Fase 5, SOC-01/02, D-01..D-04, D-12).
 * FORA do grupo (main) protegido pelo Clerk — este é o primeiro surface
 * deslogado do app. Renderiza a receita completa, somente leitura, com
 * créditos ao criador (sourceMeta) e CTAs de conversão. Curtir exige login
 * (D-01); as demais ações "de conta" ficam visíveis mas roteiam pro sign-in
 * (D-02) em vez de ficarem escondidas ou acinzentadas.
 */

const EQUIPMENT_LABELS: Record<string, string> = {
  stovetop: "Fogão",
  oven: "Forno",
  microwave: "Micro-ondas",
  blender: "Liquidificador",
  none: "Sem equipamento",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const share = await getRecipeByShareSlug(token);
  if (!share) return {};
  const { recipe } = share;
  const img = recipe.thumbnailUrl?.startsWith("http")
    ? recipe.thumbnailUrl
    : undefined;
  return {
    title: `${recipe.title} — onFeed`,
    description: recipe.intro,
    openGraph: {
      title: recipe.title,
      description: recipe.intro,
      type: "article",
      ...(img && {
        images: [{ url: img, width: 1200, height: 630, alt: recipe.title }],
      }),
    },
    twitter: {
      card: img ? "summary_large_image" : "summary",
      title: recipe.title,
      description: recipe.intro,
      ...(img && { images: [img] }),
    },
  };
}

export default async function SharedRecipePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const share = await getRecipeByShareSlug(token);
  if (!share) notFound();
  const { recipe, likes } = share;

  // D-12: uma vez pública, /r/[token] segue válido mas canonicaliza pra
  // /recipe/[id] — a URL do token não vira "a" URL oficial da receita.
  if (recipe.visibility === "public") {
    redirect(`/recipe/${recipe._id}`);
  }

  const cookieStore = await cookies();
  const unitSystem = (cookieStore.get(COOKIE_UNIT)?.value ??
    "metric") as UnitSystem;
  const lang = (cookieStore.get(COOKIE_LANG)?.value ?? "pt") as Language;

  let userId: string | null = null;
  try {
    userId = (await auth()).userId;
  } catch {
    userId = null;
  }

  const signInHref = `/sign-in?redirect_url=${encodeURIComponent(`/r/${token}`)}`;

  const haveCount = 0; // visitante anônimo não tem despensa/have set
  const totalTime =
    recipe.prepTimeMin ||
    recipe.steps.reduce((a, s) => a + (s.minutes ?? 0), 0);
  const nut = recipe.nutrition;

  return (
    <article
      style={{
        display: "flex",
        flexDirection: "column",
        animation: "ofRise .28s ease both",
        maxWidth: 480,
        margin: "0 auto",
        padding: "0 16px",
      }}
    >
      {/* ── Hero full-bleed 280px ─────────────────────────────── */}
      <div
        style={{
          height: 280,
          position: "relative",
          overflow: "hidden",
          marginLeft: -16,
          marginRight: -16,
        }}
      >
        <LazyThumbnail
          recipeId={recipe._id}
          initialUrl={recipe.thumbnailUrl}
          className="h-full w-full"
          rounded="rounded-none"
          iconClassName="text-6xl"
        />
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: 90,
            background: "var(--t-photo-fade)",
            pointerEvents: "none",
          }}
        />
        <BackButton
          fallbackHref="/"
          style={{
            position: "absolute",
            top: 60,
            left: 18,
            width: 38,
            height: 38,
            borderRadius: "50%",
            background: "var(--t-back-btn-bg)",
            boxShadow: "0 3px 10px rgba(0,0,0,.15)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "none",
            cursor: "pointer",
            zIndex: 10,
          }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--t-text-title)"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m15 5-7 7 7 7" />
          </svg>
        </BackButton>
        {/* Ações — só Like + Share (D-01: Favorite não tem affordance deslogada) */}
        <div
          style={{
            position: "absolute",
            top: 60,
            right: 18,
            display: "flex",
            gap: 8,
            zIndex: 10,
          }}
        >
          <LikeButton
            recipeId={recipe._id}
            initialLiked={likes.liked}
            initialCount={likes.count}
            canLike={Boolean(userId)}
          />
          <ShareButton
            title={recipe.title}
            text={`Receita de ${recipe.title} no onFeed`}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-areia bg-white/90 text-carvao/50 transition-colors hover:text-carvao"
          />
        </div>
      </div>

      {/* ── Conteúdo (sobrepõe hero -26px) ─────────────────────── */}
      <div
        style={{
          marginTop: -26,
          paddingBottom: 64,
          position: "relative",
          zIndex: 1,
        }}
      >
        {/* Ocasiões / equipamentos como badges */}
        {(recipe.occasions.length > 0 ||
          recipe.equipment.filter((e) => e !== "none").length > 0) && (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 6,
              marginBottom: 8,
            }}
          >
            {recipe.occasions.map((o) => (
              <BadgePill key={o}>{o}</BadgePill>
            ))}
            {recipe.equipment
              .filter((e) => e !== "none")
              .map((e) => (
                <BadgePill key={e}>{EQUIPMENT_LABELS[e] ?? e}</BadgePill>
              ))}
          </div>
        )}

        {/* Título */}
        <h1
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 28,
            color: "var(--t-text-title)",
            lineHeight: 1.15,
            marginTop: 11,
            margin: 0,
          }}
        >
          {recipe.title}
        </h1>

        {/* Meta */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 18,
            fontSize: 13,
            color: "var(--t-text-secondary)",
            fontWeight: 600,
            marginTop: 9,
            flexWrap: "wrap",
          }}
        >
          <span>⏱ {formatMinutes(totalTime)}</span>
          <span>🍽 {recipe.servings} porções</span>
          <span>
            {flagEmoji(recipe.country)} {recipe.country}
          </span>
        </div>

        {/* Intro */}
        <p
          style={{
            fontSize: 14,
            color: "var(--t-text-body)",
            lineHeight: 1.5,
            marginTop: 12,
          }}
        >
          {recipe.intro}
        </p>

        {/* ── Créditos da fonte (SOC-03) — verbatim, nunca o vídeo re-hospedado ── */}
        {recipe.source === "imported" && recipe.sourceMeta && (
          <div
            className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-areia/20 px-3 py-2 text-xs text-carvao/60"
            style={{ border: "1px solid var(--t-bd-card)" }}
          >
            <span>🎬 Importado de vídeo</span>
            {recipe.sourceMeta.authorHandle &&
              (recipe.sourceMeta.authorUrl ? (
                <a
                  href={recipe.sourceMeta.authorUrl}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="font-semibold text-terracota"
                >
                  @{recipe.sourceMeta.authorHandle}
                </a>
              ) : (
                <span className="font-semibold text-carvao/80">
                  @{recipe.sourceMeta.authorHandle}
                </span>
              ))}
            {recipe.sourceMeta.sourceUrl && (
              <>
                <span className="text-carvao/30">·</span>
                <a
                  href={recipe.sourceMeta.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="font-medium text-terracota"
                >
                  Ver vídeo original ↗
                </a>
              </>
            )}
          </div>
        )}

        {/* ── Card nutricional ──────────────────────────────── */}
        {nut && (
          <div
            style={{
              background: "var(--t-bg-card)",
              border: "1px solid var(--t-bd-card)",
              borderRadius: 22,
              padding: 18,
              marginTop: 20,
              boxShadow: "0 6px 18px -12px rgba(22,47,37,.2)",
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: 1.2,
                textTransform: "uppercase",
                color: "var(--t-text-secondary)",
              }}
            >
              Informação nutricional · por porção
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 8,
                marginTop: 10,
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 42,
                  color: "var(--t-text-title)",
                  lineHeight: 1,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {Math.round(nut.calories)}
              </span>
              <span style={{ fontSize: 14, color: "var(--t-text-secondary)", fontWeight: 600 }}>
                kcal
              </span>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: 10,
                marginTop: 16,
              }}
            >
              <MacroChip
                label="Proteína"
                value={Math.round(nut.protein)}
                color="var(--t-protein-fg)"
                labelColor="var(--t-protein-lbl)"
                bg="var(--t-protein-bg)"
                unit="g"
              />
              <MacroChip
                label="Carbo"
                value={Math.round(nut.carbs)}
                color="var(--t-carb-fg)"
                labelColor="var(--t-carb-lbl)"
                bg="var(--t-carb-bg)"
                unit="g"
              />
              <MacroChip
                label="Gordura"
                value={Math.round(nut.fat)}
                color="#d4644a"
                labelColor="var(--t-fat-lbl)"
                bg="var(--t-fat-bg)"
                unit="g"
              />
            </div>
            {/* Registrar no dia / adicionar ao plano exigem conta — vai pro
               sign-in em vez de ficar oculto (D-02). Mesmo visual das ações
               reais nas telas autenticadas. */}
            <div style={{ marginTop: 14 }}>
              <Link
                href={signInHref}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-forest/20 bg-forest/5 py-3.5 text-sm font-semibold text-forest transition-colors hover:bg-forest/10 active:scale-[0.98]"
              >
                <span>＋</span> Registrar no meu dia
              </Link>
            </div>
          </div>
        )}

        {/* ── Adaptar aos meus macros — conta-only, vai pro sign-in (D-02) ── */}
        <div style={{ marginTop: 11 }}>
          <Link
            href={signInHref}
            className="ofcard"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              background: "var(--t-bg-card)",
              border: "1px solid var(--t-bd-strong)",
              borderRadius: 18,
              padding: "15px 16px",
              textDecoration: "none",
            }}
          >
            <span
              style={{
                width: 38,
                height: 38,
                borderRadius: 11,
                background: "var(--t-carb-bg)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 18,
                flexShrink: 0,
              }}
            >
              ✨
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14.5, fontWeight: 700, color: "var(--t-text-primary)" }}>
                Adaptar aos meus macros
              </div>
              <div style={{ fontSize: 12, color: "var(--t-text-muted)", fontWeight: 500, marginTop: 1 }}>
                Ajusta porções e ingredientes aos seus macros
              </div>
            </div>
          </Link>
        </div>

        {/* ── Ingredientes (lista de compras funciona local, sem conta) ── */}
        <IngredientsSection
          recipeId={recipe._id}
          recipeTitle={recipe.title}
          haveCount={haveCount}
          originalServings={recipe.servings}
          unitSystem={unitSystem}
          lang={lang}
          ingredients={recipe.ingredients.map((ing) => ({
            name: ing.name,
            got: ing.isStaple,
            base: false,
            core: ing.core ?? false,
            qty: formatQtyForSystem(ing.quantity, translateUnit(ing.unit, lang), unitSystem),
            quantityRaw: ing.quantity,
            unitRaw: ing.unit,
          }))}
        />

        {/* ── CTA: modo cozinha — conta-only, vai pro sign-in (D-02) ── */}
        <Link
          href={signInHref}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            background: "var(--t-bg-hero)",
            color: "var(--t-hero-fg)",
            borderRadius: 18,
            padding: 17,
            textAlign: "center",
            fontSize: 15,
            fontWeight: 700,
            marginTop: 20,
            boxShadow: "0 10px 24px -10px rgba(22,47,37,.5)",
            textDecoration: "none",
          }}
        >
          <span>🍳</span> Irei fazer esta receita
        </Link>

        {/* ── Modo de preparo ───────────────────────────────── */}
        <div style={{ marginTop: 24 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 14,
            }}
          >
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: 1.1,
                textTransform: "uppercase",
                color: "var(--t-text-secondary)",
              }}
            >
              Modo de preparo
            </span>
            <span style={{ fontSize: 12, color: "var(--t-text-muted)" }}>
              {formatMinutes(totalTime)}
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {recipe.steps.map((step, i) => (
              <div key={i} style={{ display: "flex", gap: 13 }}>
                <div
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: "50%",
                    background: "var(--t-bg-hero)",
                    color: "var(--t-hero-fg)",
                    fontSize: 13,
                    fontWeight: 700,
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {i + 1}
                </div>
                <div
                  style={{
                    fontSize: 14,
                    color: "var(--t-text-body)",
                    lineHeight: 1.5,
                    paddingTop: 2,
                    flex: 1,
                  }}
                >
                  <p style={{ margin: 0 }}>{step.text}</p>
                  {step.minutes ? <StepTimer minutes={step.minutes} /> : null}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Bloco de conversão (NOVO) — funil pós-receita (D-02) ── */}
        <div style={{ marginTop: 24, paddingTop: 48 }}>
          <Link
            href={signInHref}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "var(--t-bg-hero)",
              color: "var(--t-hero-fg)",
              borderRadius: 18,
              padding: 17,
              textAlign: "center",
              fontSize: 15,
              fontWeight: 700,
              textDecoration: "none",
              boxShadow: "0 10px 24px -10px rgba(22,47,37,.5)",
            }}
          >
            Criar minha conta
          </Link>
          <Link
            href="/sign-up"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "transparent",
              border: "1px solid var(--t-bd-card)",
              color: "var(--t-text-title)",
              borderRadius: 18,
              padding: 17,
              textAlign: "center",
              fontSize: 15,
              fontWeight: 700,
              textDecoration: "none",
              marginTop: 12,
            }}
          >
            Importar a minha receita
          </Link>
        </div>
      </div>
    </article>
  );
}

/* ── Sub-components ──────────────────────────────────────────── */

function MacroChip({
  label,
  value,
  color,
  labelColor,
  bg,
  unit,
}: {
  label: string;
  value: number;
  color: string;
  labelColor: string;
  bg: string;
  unit?: string;
}) {
  return (
    <div
      style={{
        background: bg,
        borderRadius: 14,
        padding: 12,
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontSize: 20,
          fontWeight: 800,
          color,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
        {unit}
      </div>
      <div
        style={{
          fontSize: 11,
          color: labelColor,
          fontWeight: 600,
          marginTop: 2,
        }}
      >
        {label}
      </div>
    </div>
  );
}

function BadgePill({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: 11,
        fontWeight: 700,
        padding: "4px 11px",
        borderRadius: 14,
        background: "var(--t-bg-section)",
        color: "var(--t-text-secondary)",
      }}
    >
      {children}
    </span>
  );
}
