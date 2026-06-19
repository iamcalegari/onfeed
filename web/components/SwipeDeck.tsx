"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { addFavoriteAction } from "@/app/actions";
import { flagEmoji, formatMinutes, recipeHref } from "@/lib/format";
import type { SearchHit } from "@/lib/types";
import { LazyThumbnail } from "./LazyThumbnail";
import { MatchScore } from "./MatchScore";
import { ScoreBars } from "./ScoreBars";

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

/* ── RecipePreview (bottom sheet no swipe-up) ────────────────── */
function RecipePreview({
  hit,
  haveIds,
  onClose,
}: {
  hit: SearchHit;
  haveIds: string[];
  onClose: () => void;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  function close() {
    setVisible(false);
    setTimeout(onClose, 300);
  }

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col justify-end transition-all duration-300 ${
        visible ? "opacity-100" : "opacity-0"
      }`}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-carvao/50 backdrop-blur-sm"
        onClick={close}
      />

      {/* Sheet */}
      <div
        className={`relative rounded-t-3xl bg-surface shadow-2xl transition-transform duration-300 ${
          visible ? "translate-y-0" : "translate-y-full"
        }`}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3">
          <div className="h-1 w-12 rounded-full bg-areia" />
        </div>

        {/* Fechar */}
        <button
          type="button"
          onClick={close}
          className="absolute right-4 top-3.5 flex h-7 w-7 items-center justify-center rounded-full bg-areia/70 text-carvao/60 hover:text-carvao"
        >
          <XSmallIcon />
        </button>

        {/* Imagem */}
        <div className="mx-4 mt-3 overflow-hidden rounded-2xl" style={{ height: 152 }}>
          <LazyThumbnail
            recipeId={hit._id}
            initialUrl={hit.thumbnailUrl}
            className="h-full w-full"
            rounded="rounded-none"
            iconClassName="text-4xl"
          />
        </div>

        {/* Conteúdo */}
        <div className="flex flex-col gap-3 p-4">
          <div className="flex items-start justify-between gap-3">
            <h3 className="font-display text-xl font-semibold leading-tight text-carvao">
              {flagEmoji(hit.country)} {hit.title}
            </h3>
            <MatchScore score={hit.matchScore} />
          </div>
          <p className="line-clamp-2 text-sm leading-relaxed text-carvao/60">
            {hit.intro}
          </p>
          <ScoreBars scores={hit.scores} />
          <Link
            href={recipeHref(hit._id, haveIds)}
            onClick={close}
            className="mt-1 flex items-center justify-center gap-2 rounded-2xl bg-forest py-3.5 text-sm font-semibold text-creme shadow-sm transition-transform active:scale-[0.98]"
          >
            Ver receita completa
            <ArrowRightIcon />
          </Link>
        </div>
        <div className="h-4" />
      </div>
    </div>
  );
}

/* ── SwipeDeck ──────────────────────────────────────────────── */
export function SwipeDeck({
  results,
  haveIds,
  authenticated,
}: {
  results: SearchHit[];
  haveIds: string[];
  authenticated: boolean;
}) {
  const [deck] = useState(() => buildDeck(results));
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<SearchHit[]>([]);
  const [showSelected, setShowSelected] = useState(false);
  const [drag, setDrag] = useState(0);
  const [dragY, setDragY] = useState(0);
  const [showPreview, setShowPreview] = useState(false);
  const [packOpener, setPackOpener] = useState<number | null>(null);
  const [deckShared, setDeckShared] = useState(false);

  const dragging    = useRef(false);
  const animating   = useRef(false);
  const startX      = useRef(0);
  const startY      = useRef(0);
  const dragModeRef = useRef<"idle" | "horizontal" | "vertical">("idle");
  const shownPacks  = useRef(new Set<number>());

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
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-semibold text-forest">
            Selecionadas ({selected.length})
          </h2>
          <div className="flex items-center gap-3">
            {selected.length > 0 && (
              <button
                type="button"
                onClick={shareDeck}
                title={deckShared ? "Copiado!" : "Compartilhar deck"}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-areia bg-surface text-carvao/50 hover:text-carvao transition-colors"
              >
                {deckShared ? <CheckSmallIcon /> : <ShareSmallIcon />}
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowSelected(false)}
              className="text-sm font-medium text-terracota"
            >
              voltar ao deck
            </button>
          </div>
        </div>

        {selected.length === 0 ? (
          <p className="text-sm text-carvao/50">
            Nenhuma ainda — arraste para a direita para selecionar.
          </p>
        ) : (
          <>
            {selected.map((h) => (
              <div
                key={h._id}
                className="flex items-center gap-3 rounded-2xl border border-areia bg-surface p-2.5"
              >
                <span className="text-xl">{flagEmoji(h.country)}</span>
                <Link
                  href={recipeHref(h._id, haveIds)}
                  className="flex-1 truncate text-sm font-medium text-carvao"
                >
                  {h.title}
                </Link>
                <button
                  type="button"
                  onClick={() =>
                    setSelected((p) => p.filter((x) => x._id !== h._id))
                  }
                  className="text-xs text-carvao/40 hover:text-terracota transition-colors"
                >
                  remover
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setSelected([])}
              className="mt-1 text-xs text-carvao/40 hover:text-terracota transition-colors"
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
  const cardTransform = isVerticalDrag
    ? `translateY(${dragY * 0.45}px)`
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
          className="relative select-none"
          style={{ height: "clamp(300px, calc(100svh - 22rem), 440px)" }}
        >
          {bg2 && (
            <DeckCard
              key={bg2._id}
              hit={bg2}
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
            onPointerDown={(e) => {
              if (animating.current || packOpener !== null) return;
              dragging.current = true;
              startX.current = e.clientX;
              startY.current = e.clientY;
              dragModeRef.current = "idle";
              e.currentTarget.setPointerCapture(e.pointerId);
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
              else if (dragModeRef.current === "vertical")
                setDragY(Math.min(0, dy));
            }}
            onPointerUp={() => {
              if (!dragging.current) return;
              dragging.current = false;
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

            {/* Hint: swipe para cima → preview */}
            {dragY < -25 && (
              <div
                className="pointer-events-none absolute inset-x-0 bottom-5 flex flex-col items-center"
                style={{ opacity: Math.min(1, (-dragY - 25) / 55) }}
              >
                <div className="flex items-center gap-1.5 rounded-full bg-carvao/70 px-4 py-1.5">
                  <UpArrowIcon />
                  <span className="text-xs font-semibold text-creme">
                    ver receita
                  </span>
                </div>
              </div>
            )}
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

/* ── DeckCard ────────────────────────────────────────────────── */
function DeckCard({
  hit,
  children,
  className = "",
  style,
  ...handlers
}: {
  hit: SearchHit;
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...handlers}
      style={style}
      className={`absolute inset-0 flex touch-none flex-col overflow-hidden rounded-3xl border border-areia/80 bg-surface shadow-card ${className}`}
    >
      <div className="relative">
        <LazyThumbnail
          recipeId={hit._id}
          initialUrl={hit.thumbnailUrl}
          className="h-48 w-full"
          rounded="rounded-none"
          iconClassName="text-5xl"
        />
        <span className="absolute right-3 top-3">
          <MatchScore score={hit.matchScore} />
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
      {hit.matchScore >= 85 && (
        <div className="flex items-center gap-1.5 bg-forest/8 px-4 py-2">
          <span className="text-[10px] text-forest">✦</span>
          <span className="text-[11px] font-semibold text-forest">
            Essa receita é perfeita pra você
          </span>
        </div>
      )}
      {children}
    </div>
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
