"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { addFavoriteAction } from "@/app/actions";
import { flagEmoji, formatMinutes, recipeHref } from "@/lib/format";
import type { SearchHit } from "@/lib/types";
import { LazyThumbnail } from "./LazyThumbnail";
import { MatchScore } from "./MatchScore";
import type { Rank } from "./ResultCard";
import { ScoreBars } from "./ScoreBars";

const MEDAL: Record<Rank, {
  color: string;
  label: string;
  shimmerColor: string;
  shimmerDuration: string;
  shimmerDelay: string;
  staticShadow?: string;
}> = {
  1: { color: "#c9973b", label: "1°", shimmerColor: "rgba(255,222,100,0.45)", shimmerDuration: "2.8s", shimmerDelay: "0.6s" },
  2: { color: "#9aa0a6", label: "2°", shimmerColor: "rgba(210,218,222,0.40)", shimmerDuration: "4s",   shimmerDelay: "1.8s", staticShadow: "0 0 0 1.5px #9aa0a6, 0 0 14px rgba(154,160,166,0.32), 0 4px 16px rgba(154,160,166,0.16)" },
  3: { color: "#a0663a", label: "3°", shimmerColor: "rgba(210,165,120,0.32)", shimmerDuration: "5.5s", shimmerDelay: "3s",   staticShadow: "0 0 0 1.5px #a0663a, 0 0 8px rgba(160,102,58,0.22), 0 4px 12px rgba(160,102,58,0.10)" },
};

const PACK_SIZE = 25;
const THRESHOLD = 110;
const VERTICAL_THRESHOLD = 80;
const SELECTED_KEY = "rod:selected";

const TILTS = [-2.5, 1.8, -3.2, 2.1, -1.4, 3.0, -2.0, 1.2, -3.5, 2.8, 1.5, -1.8];
function deckTilt(idx: number): number {
  return TILTS[idx % TILTS.length] ?? 0;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function buildDeck(results: SearchHit[]): SearchHit[] {
  const deck: SearchHit[] = [];
  for (let i = 0; i < results.length; i += PACK_SIZE) {
    deck.push(...shuffle(results.slice(i, i + PACK_SIZE)));
  }
  return deck;
}

/* ── PackOpener ─────────────────────────────────────────────── */
function PackOpener({
  pack,
  totalPacks,
  totalCards,
  onOpen,
}: {
  pack: number;
  totalPacks: number;
  totalCards: number;
  onOpen: () => void;
}) {
  const [phase, setPhase] = useState<"entering" | "idle" | "opening">("entering");
  const openedRef = useRef(false);

  const startIdx = pack * PACK_SIZE + 1;
  const endIdx = Math.min((pack + 1) * PACK_SIZE, totalCards);

  // Dispara a animação de entrada
  useEffect(() => {
    const t = setTimeout(() => setPhase("idle"), 60);
    return () => clearTimeout(t);
  }, []);

  // Auto-abre após 2.8s caso o usuário não toque
  useEffect(() => {
    if (phase !== "idle") return;
    const t = setTimeout(handleOpen, 2800);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  function handleOpen() {
    if (openedRef.current) return;
    openedRef.current = true;
    setPhase("opening");
    setTimeout(onOpen, 480);
  }

  const packDescs = [
    "A seleção principal da sua busca",
    "Descobertas escondidas no meio",
    "Surpresas reservadas para você",
  ];

  return (
    <div
      className={`fixed inset-0 z-100 flex items-center justify-center px-6 transition-opacity duration-300 ${
        phase === "entering" ? "opacity-0" : "opacity-100"
      }`}
      onClick={handleOpen}
    >
      <div className="absolute inset-0 bg-carvao/80 backdrop-blur-md" />

      <div
        className={`relative w-full max-w-sm overflow-hidden rounded-3xl shadow-2xl transition-all ${
          phase === "entering"
            ? "translate-y-16 scale-90 opacity-0 duration-[0ms]"
            : phase === "idle"
              ? "translate-y-0 scale-100 opacity-100 duration-520 ease-out"
              : "-translate-y-full scale-110 opacity-0 duration-450 ease-in rotate-2"
        }`}
      >
        {/* Frente do pack */}
        <div className="relative bg-linear-to-b from-[#162c1e] to-forest">
          {/* Reflexo de luz */}
          <div className="pointer-events-none absolute inset-0 bg-linear-to-br from-white/8 via-transparent to-transparent" />
          {/* Faixa superior terracota */}
          <div className="h-2 bg-linear-to-r from-terracota/90 via-terracota to-terracota/90" />

          <div className="flex flex-col items-center gap-6 px-8 py-10">
            {/* Logo */}
            <div className="flex flex-col items-center gap-2">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/20 bg-white/10 shadow-lg">
                <span className="font-display text-3xl font-bold text-creme">i</span>
              </div>
              <span className="font-display text-lg font-bold uppercase tracking-[0.18em] text-creme/85">
                onFeed
              </span>
            </div>

            {/* Divisor */}
            <div className="flex w-full items-center gap-3">
              <div className="h-px flex-1 bg-white/20" />
              <span className="text-[10px] text-white/35">✦</span>
              <div className="h-px flex-1 bg-white/20" />
            </div>

            {/* Identidade do pack */}
            <div className="text-center">
              <p className="font-display text-[2.4rem] font-bold leading-none text-creme">
                Pack top
              </p>
              <p className="font-display text-[2.4rem] font-bold leading-none text-creme mb-3">
                {startIdx}–{endIdx}
              </p>
              <span className="inline-flex items-center rounded-full border border-white/25 bg-white/10 px-4 py-1">
                <span className="text-sm font-semibold text-white/75">
                  {pack + 1} / {totalPacks}
                </span>
              </span>
            </div>

            {/* Descrição */}
            <p className="max-w-45 text-center text-sm leading-relaxed text-white/55">
              {packDescs[pack] ?? "Mais receitas para você explorar"}
            </p>
          </div>

          {/* Faixa inferior */}
          <div className="h-2 bg-linear-to-r from-terracota/80 via-terracota to-terracota/80" />
        </div>

        {/* CTA */}
        <div className="bg-[#0f1f15] py-4 text-center">
          <span
            className={`text-sm font-semibold text-white/55 ${
              phase === "idle" ? "animate-pulse" : ""
            }`}
          >
            Toque para abrir
          </span>
        </div>
      </div>
    </div>
  );
}

/* ── PeekOverlay (aparece no card durante swipe-up) ─────────── */
function PeekOverlay({ hit, dragY }: { hit: SearchHit; dragY: number }) {
  const opacity = Math.min(1, (-dragY - 20) / 55);
  const missingCore = hit.missing.filter((m) => m.core);
  const missingOpt  = hit.missing.filter((m) => !m.core);

  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-0 overflow-hidden rounded-b-3xl"
      style={{ opacity }}
    >
      <div className="flex flex-col gap-2 bg-carvao/82 px-4 pb-5 pt-3 backdrop-blur-sm">
        {hit.missing.length === 0 ? (
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-forest/35 text-[10px] font-bold text-forest">✓</span>
            <span className="text-sm font-semibold text-creme">Você tem todos os ingredientes</span>
          </div>
        ) : hit.cookableNow ? (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-forest/35 text-[10px] font-bold text-forest">✓</span>
              <span className="text-xs font-semibold text-creme">Dá pra fazer! Falta só opcional:</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {missingOpt.slice(0, 5).map((m) => (
                <span key={m.canonicalId} className="rounded-full bg-white/12 px-2 py-0.5 text-[11px] text-creme/75">{m.name}</span>
              ))}
              {missingOpt.length > 5 && <span className="text-[11px] text-creme/40">+{missingOpt.length - 5}</span>}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-terracota/80">
              Falta {missingCore.length} essencial{missingCore.length !== 1 ? "is" : ""}
            </span>
            <div className="flex flex-wrap gap-1">
              {missingCore.slice(0, 5).map((m) => (
                <span key={m.canonicalId} className="rounded-full bg-terracota/28 px-2 py-0.5 text-[11px] font-medium text-creme/85">{m.name}</span>
              ))}
              {missingCore.length > 5 && <span className="text-[11px] text-creme/40">+{missingCore.length - 5}</span>}
            </div>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <UpArrowIcon />
          <span className="text-[10px] text-creme/40">Solte para ver mais</span>
        </div>
      </div>
    </div>
  );
}

/* ── RecipePreview (card expandido no swipe-up) ──────────────── */
function RecipePreview({
  hit,
  haveIds,
  baseIngredients = [],
  onClose,
}: {
  hit: SearchHit;
  haveIds: string[];
  baseIngredients?: string[];
  onClose: () => void;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  function close() {
    setVisible(false);
    setTimeout(onClose, 250);
  }

  const missingCore   = hit.missing.filter((m) => m.core);
  const missingOpt    = hit.missing.filter((m) => !m.core);
  const coveragePct   = Math.round(hit.scores.i * 100);

  return (
    <div
      className={`fixed inset-0 z-50 overflow-y-auto transition-opacity duration-250 ${
        visible ? "opacity-100" : "opacity-0"
      }`}
      onClick={close}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-carvao/65 backdrop-blur-sm" />

      {/* Wrapper que centraliza verticalmente e ainda permite scroll */}
      <div className="relative flex min-h-full items-center justify-center px-4 py-8">

      {/* Card expandido — stopPropagation para não fechar ao clicar nele */}
      <div
        className={`w-full max-w-sm overflow-hidden rounded-3xl bg-surface shadow-2xl transition-all duration-250 ${
          visible ? "translate-y-0 scale-100" : "translate-y-5 scale-95"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Botão fechar */}
        <button
          type="button"
          onClick={close}
          className="absolute right-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-carvao/40 text-creme/80 backdrop-blur-sm transition-colors hover:bg-carvao/60"
        >
          <XSmallIcon />
        </button>

        {/* Thumbnail com título sobreposto */}
        <div className="relative h-44">
          <LazyThumbnail
            recipeId={hit._id}
            initialUrl={hit.thumbnailUrl}
            className="h-full w-full"
            rounded="rounded-none"
            iconClassName="text-5xl"
          />
          <div className="absolute inset-x-0 bottom-0 h-20 bg-linear-to-t from-carvao/75 to-transparent" />
          <div className="absolute bottom-3 left-4 right-14 pr-1">
            <h3 className="font-display text-lg font-bold leading-tight text-creme line-clamp-2">
              {flagEmoji(hit.country)} {hit.title}
            </h3>
          </div>
          <div className="absolute bottom-3 right-3">
            <MatchScore score={hit.matchScore} />
          </div>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-3 border-b border-areia/50 px-4 py-3">
          <RecipeStatChip icon="⏱" label={formatMinutes(hit.prepTimeMin)} />
          <RecipeStatChip icon="🍽" label={`${hit.servings} porç${hit.servings !== 1 ? "ões" : "ão"}`} />
          {hit.cookableNow && (
            <span className="ml-auto rounded-full bg-forest/10 px-2.5 py-0.5 text-[11px] font-semibold text-forest">
              ✓ dá pra fazer
            </span>
          )}
        </div>

        {/* Ingredientes */}
        <div className="px-4 py-3">
          <div className="mb-2.5 flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-carvao/40">Ingredientes</p>
            <span className={`text-xs font-semibold ${coveragePct >= 80 ? "text-forest" : coveragePct >= 50 ? "text-amber-600" : "text-terracota"}`}>
              {coveragePct}% disponível
            </span>
          </div>

          {hit.missing.length === 0 ? (
            <p className="text-sm font-semibold text-forest">✓ Você tem todos os ingredientes!</p>
          ) : (
            <div className="flex flex-col gap-3">
              {missingCore.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-terracota/70">
                    Precisa comprar ({missingCore.length})
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {missingCore.map((m) => (
                      <span key={m.canonicalId} className="rounded-full border border-terracota/25 bg-terracota/10 px-2.5 py-0.5 text-xs font-medium text-terracota/80">
                        {m.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {missingOpt.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-carvao/35">
                    Opcional ({missingOpt.length})
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {missingOpt.map((m) => (
                      <span key={m.canonicalId} className="rounded-full border border-areia bg-areia/50 px-2.5 py-0.5 text-xs text-carvao/55">
                        {m.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ScoreBars */}
        <div className="border-t border-areia/50 px-4 py-3">
          <ScoreBars scores={hit.scores} />
        </div>

        {/* CTA */}
        <div className="px-4 pb-5 pt-2">
          <Link
            href={recipeHref(hit._id, haveIds, baseIngredients.length ? baseIngredients : undefined)}
            onClick={close}
            className="flex items-center justify-center gap-2 rounded-2xl bg-forest py-3.5 text-sm font-semibold text-creme shadow-sm transition-transform active:scale-[0.98]"
          >
            Ver receita completa
            <ArrowRightIcon />
          </Link>
        </div>
      </div>
      </div>
    </div>
  );
}

/* ── SwipeDeck ──────────────────────────────────────────────── */
export function SwipeDeck({
  results,
  haveIds,
  authenticated,
  baseIngredients = [],
}: {
  results: SearchHit[];
  haveIds: string[];
  authenticated: boolean;
  baseIngredients?: string[];
}) {
  const [deck] = useState(() => buildDeck(results));
  const [index, setIndex] = useState(0);

  // Mapeia _id → rank original (top 3 da busca, antes de embaralhar)
  const rankMap = useMemo(
    () => new Map(results.slice(0, 3).map((r, i) => [r._id, (i + 1) as Rank])),
    [results],
  );
  const [selected, setSelected] = useState<SearchHit[]>([]);
  const [showSelected, setShowSelected] = useState(false);
  const [drag, setDrag] = useState(0);
  const [dragY, setDragY] = useState(0);
  const [showPreview, setShowPreview] = useState(false);
  const [packOpener, setPackOpener] = useState<number | null>(null);
  const [deckShared, setDeckShared] = useState(false);

  const dragging            = useRef(false);
  const animating           = useRef(false);
  const startX              = useRef(0);
  const startY              = useRef(0);
  const dragModeRef         = useRef<"idle" | "horizontal" | "vertical">("idle");
  const shownPacks          = useRef(new Set<number>());
  const thresholdVibratedRef = useRef(false);
  const containerRef         = useRef<HTMLDivElement>(null);
  const centerOffsetRef      = useRef(0); // distância entre centro do card e centro da tela

  const current     = deck[index];
  const totalPacks  = Math.ceil(deck.length / PACK_SIZE);
  const currentPack = Math.floor(index / PACK_SIZE);
  const posInPack   = (index % PACK_SIZE) + 1;
  const packSize    = Math.min(PACK_SIZE, deck.length - currentPack * PACK_SIZE);

  // Carrega selecionadas do localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SELECTED_KEY);
      if (raw) setSelected(JSON.parse(raw) as SearchHit[]);
    } catch { /* ignore */ }
  }, []);

  // Persiste selecionadas
  useEffect(() => {
    try { localStorage.setItem(SELECTED_KEY, JSON.stringify(selected)); }
    catch { /* ignore */ }
  }, [selected]);

  // Exibe o pack opener ao entrar em um novo pack
  useEffect(() => {
    if (!shownPacks.current.has(currentPack)) {
      shownPacks.current.add(currentPack);
      setPackOpener(currentPack);
    }
  }, [currentPack]);

  const decide = useCallback(
    (dir: "yes" | "no") => {
      if (!current || animating.current || packOpener !== null) return;
      animating.current = true;
      setDrag(dir === "yes" ? 700 : -700);
      if (dir === "yes") {
        setSelected((prev) =>
          prev.some((s) => s._id === current._id) ? prev : [...prev, current],
        );
        if (authenticated) void addFavoriteAction(current._id).catch(() => {});
      }
      setTimeout(() => {
        setIndex((i) => i + 1);
        setDrag(0);
        animating.current = false;
      }, 220);
    },
    [current, authenticated, packOpener],
  );

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") decide("yes");
      if (e.key === "ArrowLeft") decide("no");
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [decide]);

  function cancelDrag() {
    dragging.current = false;
    dragModeRef.current = "idle";
    thresholdVibratedRef.current = false;
    setDrag(0);
    setDragY(0);
  }

  function shareDeck() {
    const text =
      `Meu deck montado no onFeed:\n` +
      selected.map((r) => `• ${r.title}`).join("\n") +
      `\n\nhttps://onfeed.app`;
    void (navigator.share
      ? navigator.share({ title: "Deck onFeed", text })
      : navigator.clipboard.writeText(text).then(() => {
          setDeckShared(true);
          setTimeout(() => setDeckShared(false), 2000);
        })
    ).catch(() => {});
  }

  /* ── Painel: selecionadas ─────────────────────────────────── */
  if (showSelected) {
    return (
      <div className="flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="font-display text-2xl font-bold text-forest">
              Seu deck
            </h2>
            <p className="mt-0.5 text-xs text-carvao/45">
              {selected.length === 0
                ? "nenhuma receita ainda"
                : `${selected.length} receita${selected.length !== 1 ? "s" : ""} escolhida${selected.length !== 1 ? "s" : ""}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {selected.length > 0 && (
              <button
                type="button"
                onClick={shareDeck}
                title={deckShared ? "Copiado!" : "Compartilhar deck"}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-areia bg-surface text-carvao/50 shadow-sm transition-colors hover:text-carvao"
              >
                {deckShared ? <CheckSmallIcon /> : <ShareSmallIcon />}
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowSelected(false)}
              className="rounded-full border border-areia bg-surface px-4 py-2 text-sm font-medium text-terracota shadow-sm"
            >
              voltar ao deck
            </button>
          </div>
        </div>

        {selected.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center gap-3 py-14 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-areia/60 text-carvao/30">
              <DeckStackIcon />
            </div>
            <p className="text-sm font-semibold text-carvao/50">Deck vazio</p>
            <p className="max-w-60 text-xs leading-relaxed text-carvao/35">
              Arraste os cards para a direita para montar seu deck
            </p>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-2.5">
              {selected.map((h, i) => (
                <SwipeableSelectedCard
                  key={h._id}
                  hit={h}
                  index={i}
                  haveIds={haveIds}
                  baseIngredients={baseIngredients}
                  onRemove={() => setSelected((p) => p.filter((x) => x._id !== h._id))}
                />
              ))}
            </div>

            {/* Hint de swipe — some após o primeiro uso */}
            <p className="text-center text-[11px] text-carvao/30">
              ← deslize para remover · ver receita →
            </p>

            <button
              type="button"
              onClick={() => setSelected([])}
              className="self-center text-xs text-carvao/30 transition-colors hover:text-terracota"
            >
              limpar tudo
            </button>
          </>
        )}
      </div>
    );
  }

  /* ── Fim do deck ──────────────────────────────────────────── */
  if (!current) {
    return (
      <div className="flex flex-col items-center gap-4 py-10 text-center">
        <p className="text-4xl">🎉</p>
        <p className="text-sm text-carvao/70">
          Você passou por todas. {selected.length} selecionada
          {selected.length === 1 ? "" : "s"}.
        </p>
        <button
          type="button"
          onClick={() => setShowSelected(true)}
          className="rounded-2xl bg-forest px-5 py-2.5 text-sm font-semibold text-creme"
        >
          Ver selecionadas ({selected.length})
        </button>
      </div>
    );
  }

  const bg1 = deck[index + 1];
  const bg2 = deck[index + 2];
  const tilt1 = deckTilt(index + 1);
  const tilt2 = deckTilt(index + 2);
  const dragTilt = drag / 25;
  const hint = Math.min(Math.abs(drag) / THRESHOLD, 1);
  const bgTransition = "transform 0.22s ease-out, opacity 0.22s ease-out";

  // Modo de arrasto determina o transform da carta ativa
  const isVerticalDrag = dragY < 0;
  const dragProgress   = isVerticalDrag ? Math.min(1, -dragY / VERTICAL_THRESHOLD) : 0;
  // translateY primeiro (espaço original) → move em direção ao centro; scale depois (âncora = centro do card)
  const cardTransform  = isVerticalDrag
    ? `translateY(${centerOffsetRef.current * dragProgress}px) scale(${1 + dragProgress * 0.08})`
    : `translateX(${drag}px) rotate(${dragTilt}deg)`;

  return (
    <>
      {/* Pack opener (overlay fixo) */}
      {packOpener !== null && (
        <PackOpener
          pack={packOpener}
          totalPacks={totalPacks}
          totalCards={deck.length}
          onOpen={() => setPackOpener(null)}
        />
      )}

      {/* Preview de receita (swipe para cima) */}
      {showPreview && (
        <RecipePreview
          hit={current}
          haveIds={haveIds}
          baseIngredients={baseIngredients}
          onClose={() => setShowPreview(false)}
        />
      )}

      <div className="flex flex-col gap-4">
        {/* Contador + pack info */}
        <div className="flex items-center justify-between">
          <div className="flex items-baseline gap-1.5">
            <span className="text-xs font-medium text-carvao/50">
              {posInPack} / {packSize}
            </span>
            {totalPacks > 1 && (
              <span className="text-[10px] font-medium text-carvao/35">
                pack {currentPack + 1}/{totalPacks}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setShowSelected(true)}
            className="text-sm font-medium text-terracota"
          >
            Selecionadas ({selected.length})
          </button>
        </div>

        {/* Área do deck */}
        <div
          ref={containerRef}
          className="relative select-none"
          style={{ height: "clamp(300px, calc(100svh - 22rem), 440px)" }}
        >
          {bg2 && (
            <DeckCard
              key={bg2._id}
              hit={bg2}
              rank={rankMap.get(bg2._id)}
              className="opacity-35 pointer-events-none"
              style={{
                transform: `scale(0.89) translateY(26px) rotate(${tilt2}deg)`,
                transition: bgTransition,
              }}
            />
          )}
          {bg1 && (
            <DeckCard
              key={bg1._id}
              hit={bg1}
              rank={rankMap.get(bg1._id)}
              className="opacity-60 pointer-events-none"
              style={{
                transform: `scale(0.95) translateY(13px) rotate(${tilt1}deg)`,
                transition: bgTransition,
              }}
            />
          )}

          {/* Carta ativa */}
          <DeckCard
            key={current._id}
            hit={current}
            rank={rankMap.get(current._id)}
            onPointerDown={(e) => {
              if (animating.current || packOpener !== null) return;
              dragging.current = true;
              startX.current = e.clientX;
              startY.current = e.clientY;
              dragModeRef.current = "idle";
              e.currentTarget.setPointerCapture(e.pointerId);
              // calcula offset do centro do card até o centro da viewport
              if (containerRef.current) {
                const r = containerRef.current.getBoundingClientRect();
                centerOffsetRef.current = window.innerHeight / 2 - (r.top + r.height / 2);
              }
            }}
            onPointerMove={(e) => {
              if (!dragging.current) return;
              const dx = e.clientX - startX.current;
              const dy = e.clientY - startY.current;
              if (dragModeRef.current === "idle") {
                if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
                  dragModeRef.current =
                    Math.abs(dy) > Math.abs(dx) && dy < 0
                      ? "vertical"
                      : "horizontal";
                }
              }
              if (dragModeRef.current === "horizontal") setDrag(dx);
              else if (dragModeRef.current === "vertical") {
                setDragY(Math.min(0, dy));
                if (-dy > VERTICAL_THRESHOLD && !thresholdVibratedRef.current) {
                  thresholdVibratedRef.current = true;
                  try { navigator.vibrate(12); } catch { /* not supported */ }
                }
              }
            }}
            onPointerUp={() => {
              if (!dragging.current) return;
              dragging.current = false;
              thresholdVibratedRef.current = false;
              if (dragModeRef.current === "horizontal") {
                if (Math.abs(drag) > THRESHOLD && !animating.current) {
                  decide(drag > 0 ? "yes" : "no");
                } else {
                  setDrag(0);
                }
              } else if (
                dragModeRef.current === "vertical" &&
                dragY < -VERTICAL_THRESHOLD
              ) {
                setDragY(0);
                setShowPreview(true);
              } else {
                cancelDrag();
              }
              dragModeRef.current = "idle";
            }}
            onPointerCancel={cancelDrag}
            style={{
              transform: cardTransform,
              transition: dragging.current
                ? "none"
                : "transform 0.22s ease-out",
              cursor: dragging.current ? "grabbing" : "grab",
            }}
          >
            {/* Overlay SIM / NÃO */}
            {drag !== 0 && (
              <div
                className={`absolute left-4 top-16 rounded-lg border-2 px-3 py-1 text-lg font-extrabold ${
                  drag > 0
                    ? "border-forest text-forest"
                    : "border-terracota text-terracota"
                }`}
                style={{ opacity: hint }}
              >
                {drag > 0 ? "SIM" : "NÃO"}
              </div>
            )}

            {/* Peek overlay durante swipe-up */}
            {dragY < -20 && <PeekOverlay hit={current} dragY={dragY} />}
          </DeckCard>
        </div>

        {/* Botões de ação */}
        <div className="flex items-center justify-center gap-5">
          <button
            type="button"
            onClick={() => decide("no")}
            className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-terracota text-2xl text-terracota transition-transform active:scale-90"
            aria-label="não"
          >
            ✕
          </button>
          <button
            type="button"
            onClick={() => setShowSelected(true)}
            aria-label="ver deck montado"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-areia bg-surface text-carvao/60 transition-transform active:scale-90"
          >
            <DeckStackIcon />
          </button>
          <button
            type="button"
            onClick={() => decide("yes")}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-forest text-2xl text-creme transition-transform active:scale-90"
            aria-label="sim"
          >
            ♥
          </button>
        </div>
      </div>
    </>
  );
}

/* ── SwipeableSelectedCard ───────────────────────────────────── */
function SwipeableSelectedCard({
  hit,
  index,
  haveIds,
  baseIngredients,
  onRemove,
}: {
  hit: SearchHit;
  index: number;
  haveIds: string[];
  baseIngredients: string[];
  onRemove: () => void;
}) {
  const router = useRouter();
  const [dx, setDx] = useState(0);
  const draggingRef  = useRef(false);
  const dirLockedRef = useRef<"h" | "v" | null>(null);
  const startX = useRef(0);
  const startY = useRef(0);

  const COMMIT = 120;
  const abs      = Math.abs(dx);
  const progress = Math.min(1, abs / COMMIT);
  const goingRight = dx > 0;
  const goingLeft  = dx < 0;

  function onPointerDown(e: React.PointerEvent) {
    startX.current = e.clientX;
    startY.current = e.clientY;
    draggingRef.current = false;
    dirLockedRef.current = null;
  }

  function onPointerMove(e: React.PointerEvent) {
    const ddx = e.clientX - startX.current;
    const ddy = e.clientY - startY.current;

    if (!dirLockedRef.current) {
      if (Math.abs(ddx) < 6 && Math.abs(ddy) < 6) return;
      dirLockedRef.current = Math.abs(ddx) > Math.abs(ddy) ? "h" : "v";
    }
    if (dirLockedRef.current !== "h") return;

    if (!draggingRef.current) {
      draggingRef.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    setDx(ddx);
    if (Math.abs(ddx) >= COMMIT) {
      try { navigator.vibrate(10); } catch { /* not supported */ }
    }
  }

  function onPointerUp() {
    // Tap sem arrasto → abre receita
    if (!draggingRef.current) {
      if (dirLockedRef.current === null) {
        router.push(recipeHref(hit._id, haveIds, baseIngredients.length ? baseIngredients : undefined));
      }
      return;
    }
    draggingRef.current = false;

    if (dx > COMMIT) {
      setDx(600);
      setTimeout(() => {
        router.push(recipeHref(hit._id, haveIds, baseIngredients.length ? baseIngredients : undefined));
      }, 250);
    } else if (dx < -COMMIT) {
      setDx(-600);
      setTimeout(onRemove, 250);
    } else {
      setDx(0);
    }
  }

  function onPointerCancel() {
    draggingRef.current = false;
    setDx(0);
  }

  return (
    <div className="relative overflow-hidden rounded-2xl">
      {/* Fundo: ver receita (esquerda → direita) */}
      <div
        className="absolute inset-0 flex items-center justify-start gap-2 rounded-2xl bg-forest pl-5"
        style={{ opacity: goingRight ? Math.min(1, progress * 1.4) : 0 }}
        aria-hidden
      >
        <span className="text-xl text-creme">→</span>
        <span className="text-sm font-bold text-creme">Ver receita</span>
      </div>

      {/* Fundo: remover (direita → esquerda) */}
      <div
        className="absolute inset-0 flex items-center justify-end gap-2 rounded-2xl bg-terracota pr-5"
        style={{ opacity: goingLeft ? Math.min(1, progress * 1.4) : 0 }}
        aria-hidden
      >
        <span className="text-sm font-bold text-creme">Remover</span>
        <span className="text-xl text-creme">✕</span>
      </div>

      {/* Card */}
      <div
        className="relative flex touch-pan-y overflow-hidden rounded-2xl border border-areia/70 bg-surface shadow-card"
        style={{
          transform: `translateX(${dx}px)`,
          transition: draggingRef.current ? "none" : "transform 0.28s cubic-bezier(0.25,1,0.5,1)",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        {/* Thumbnail */}
        <div className="relative shrink-0">
          <LazyThumbnail
            recipeId={hit._id}
            initialUrl={hit.thumbnailUrl}
            className="h-24 w-24"
            rounded="rounded-none"
            iconClassName="text-3xl"
          />
          <span className="absolute left-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-carvao/50 text-[10px] font-bold text-white backdrop-blur-sm">
            {index + 1}
          </span>
        </div>

        {/* Conteúdo */}
        <div className="flex min-w-0 flex-1 flex-col justify-between p-3">
          <div className="flex items-start justify-between gap-2">
            <p className="line-clamp-2 text-sm font-semibold leading-snug text-carvao">
              <span className="mr-0.5">{flagEmoji(hit.country)}</span>
              {hit.title}
            </p>
            <MatchScore score={hit.matchScore} />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-carvao/40">{formatMinutes(hit.prepTimeMin)}</span>
            {hit.cookableNow && (
              <span className="text-[10px] font-semibold text-forest">✓ dá pra fazer</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── DeckCard ────────────────────────────────────────────────── */
function DeckCard({
  hit,
  rank,
  children,
  className = "",
  style,
  ...handlers
}: {
  hit: SearchHit;
  rank?: Rank;
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
} & React.HTMLAttributes<HTMLDivElement>) {
  const medal = rank ? MEDAL[rank] : undefined;
  const isPerfect = hit.matchScore >= 85;

  const medalClass = medal
    ? rank === 1
      ? "medal-gold"
      : ""
    : "";

  const medalStyle: React.CSSProperties = {
    ...(medal?.staticShadow ? { boxShadow: medal.staticShadow } : {}),
    ...style,
  };

  return (
    <div
      {...handlers}
      style={medalStyle}
      className={`absolute inset-0 flex touch-none flex-col overflow-hidden rounded-3xl border border-areia/80 bg-surface shadow-card ${medalClass} ${className}`}
    >
      {/* Shimmer sweep (medalhas) */}
      {medal && (
        <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden rounded-3xl">
          <div
            className="absolute inset-y-0 w-[42%]"
            style={{
              backgroundImage: `linear-gradient(to right, transparent, ${medal.shimmerColor}, transparent)`,
              animation: `medal-shimmer ${medal.shimmerDuration} ease-in-out ${medal.shimmerDelay} infinite`,
            }}
          />
        </div>
      )}

      <div className="relative">
        <LazyThumbnail
          recipeId={hit._id}
          initialUrl={hit.thumbnailUrl}
          className="h-48 w-full"
          rounded="rounded-none"
          iconClassName="text-5xl"
        />

        {/* Badge de medalha */}
        {medal && (
          <div
            className="absolute left-3 top-3 z-30 flex h-8 w-8 items-center justify-center rounded-full text-[12px] font-extrabold text-white shadow-md"
            style={{
              backgroundColor: medal.color,
              boxShadow: `0 0 0 1.5px rgba(255,255,255,0.35), 0 2px 8px rgba(0,0,0,0.25)`,
            }}
          >
            {medal.label}
          </div>
        )}

        <span className="absolute right-3 top-3 z-30">
          <MatchScore score={hit.matchScore} rank={rank} />
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="font-display text-xl font-semibold leading-tight text-carvao">
          <span className="mr-1">{flagEmoji(hit.country)}</span>
          {hit.title}
        </h3>
        <p className="line-clamp-3 text-sm text-carvao/55">{hit.intro}</p>
        <div className="mt-auto flex items-end justify-between">
          <ScoreBars scores={hit.scores} />
          <span className="text-[11px] text-carvao/40">
            {formatMinutes(hit.prepTimeMin)}
          </span>
        </div>
      </div>

      {/* Banner "match perfeito" */}
      {isPerfect && (
        <div
          className="flex items-center gap-2 px-4 py-2"
          style={{
            background: "linear-gradient(90deg, rgba(22,47,37,0.07) 0%, rgba(22,47,37,0.12) 50%, rgba(22,47,37,0.07) 100%)",
          }}
        >
          <span
            className="text-xs text-[#c9973b]"
            style={{ animation: "star-spin 3s linear infinite", display: "inline-block" }}
          >
            ✦
          </span>
          <span className="text-[11px] font-bold text-forest tracking-wide">
            Essa receita é perfeita pra você
          </span>
        </div>
      )}

      {children}
    </div>
  );
}

/* ── RecipeStatChip ──────────────────────────────────────────── */
function RecipeStatChip({ icon, label }: { icon: string; label: string }) {
  return (
    <span className="flex items-center gap-1 text-xs text-carvao/60">
      <span aria-hidden>{icon}</span>
      {label}
    </span>
  );
}

/* ── Ícones ──────────────────────────────────────────────────── */

function DeckStackIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="h-5 w-5"
    >
      <path d="M12 2L2 7l10 5 10-5-10-5z" strokeLinejoin="round" />
      <path
        d="M2 12l10 5 10-5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.65"
      />
      <path
        d="M2 17l10 5 10-5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.35"
      />
    </svg>
  );
}

function UpArrowIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      className="h-3.5 w-3.5 text-creme"
    >
      <path
        fillRule="evenodd"
        d="M10 17a.75.75 0 01-.75-.75V5.612L5.29 9.77a.75.75 0 01-1.08-1.04l5.25-5.5a.75.75 0 011.08 0l5.25 5.5a.75.75 0 11-1.08 1.04l-3.96-4.158V16.25A.75.75 0 0110 17z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
      <path
        fillRule="evenodd"
        d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function XSmallIcon() {
  return (
    <svg
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      className="h-3 w-3"
    >
      <path d="M2 2l10 10M12 2L2 12" />
    </svg>
  );
}

function ShareSmallIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className="h-3.5 w-3.5"
    >
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path
        d="m8.59 13.51 6.83 3.98M15.41 6.51l-6.82 3.98"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CheckSmallIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      className="h-3.5 w-3.5 text-forest"
    >
      <path d="M5 12l5 5L20 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
