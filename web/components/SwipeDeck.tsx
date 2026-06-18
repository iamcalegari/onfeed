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
const THRESHOLD = 110; // px de arraste para decidir
const SELECTED_KEY = "rod:selected";

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
  const [index, setIndex]           = useState(0);
  const [selected, setSelected]     = useState<SearchHit[]>([]);
  const [showSelected, setShowSelected] = useState(false);
  const [drag, setDrag]             = useState(0);

  // refs para controle de gesto sem re-renders
  const dragging  = useRef(false);
  const animating = useRef(false);
  const startX    = useRef(0);

  /* Persistência local das selecionadas */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SELECTED_KEY);
      if (raw) setSelected(JSON.parse(raw) as SearchHit[]);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    try { localStorage.setItem(SELECTED_KEY, JSON.stringify(selected)); }
    catch { /* ignore */ }
  }, [selected]);

  const current = deck[index];

  const decide = useCallback((dir: "yes" | "no") => {
    if (!current || animating.current) return;
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
    }, 200);
  }, [current, authenticated]);

  /* Teclado */
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") decide("yes");
      if (e.key === "ArrowLeft")  decide("no");
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [decide]);

  /* Reset drag — centralizado para reutilizar em cancel e pointerup sem swipe */
  function cancelDrag() {
    dragging.current = false;
    setDrag(0);
  }

  /* ── Painel: selecionadas ───────────────────────────────── */
  if (showSelected) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-semibold text-forest">
            Selecionadas ({selected.length})
          </h2>
          <button
            type="button"
            onClick={() => setShowSelected(false)}
            className="text-sm font-medium text-terracota"
          >
            voltar ao deck
          </button>
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
                  onClick={() => setSelected((p) => p.filter((x) => x._id !== h._id))}
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

  /* ── Fim do deck ────────────────────────────────────────── */
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

  const next = deck[index + 1];
  const tilt = drag / 25;
  const hint = Math.min(Math.abs(drag) / THRESHOLD, 1);

  return (
    <div className="flex flex-col gap-4">

      {/* Contador + atalho para selecionadas */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-carvao/50">
          {index + 1} de {deck.length}
        </span>
        <button
          type="button"
          onClick={() => setShowSelected(true)}
          className="text-sm font-medium text-terracota"
        >
          Selecionadas ({selected.length})
        </button>
      </div>

      {/* ── Área do deck ─────────────────────────────────────── */}
      <div className="relative select-none" style={{ height: "clamp(300px, calc(100svh - 22rem), 440px)" }}>

        {/* Carta de fundo (próxima) */}
        {next && (
          <DeckCard
            hit={next}
            style={{ transform: "scale(0.96) translateY(10px)" }}
            className="opacity-70"
          />
        )}

        {/* Carta ativa (com gestos) */}
        <DeckCard
          hit={current}
          onPointerDown={(e) => {
            if (animating.current) return;
            dragging.current = true;
            startX.current = e.clientX;
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (!dragging.current) return;
            setDrag(e.clientX - startX.current);
          }}
          onPointerUp={() => {
            if (!dragging.current) return;
            dragging.current = false;
            // Bug fix: se animating.current === true, decide() retorna sem fazer
            // nada e setDrag(0) nunca seria chamado → carta ficava travada.
            if (Math.abs(drag) > THRESHOLD && !animating.current) {
              decide(drag > 0 ? "yes" : "no");
            } else {
              setDrag(0);
            }
          }}
          onPointerCancel={cancelDrag}
          style={{
            transform: `translateX(${drag}px) rotate(${tilt}deg)`,
            transition: dragging.current ? "none" : "transform 0.2s ease-out",
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
        </DeckCard>
      </div>

      {/* ── Botões de ação ───────────────────────────────────── */}
      <div className="flex items-center justify-center gap-5">
        <button
          type="button"
          onClick={() => decide("no")}
          className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-terracota text-2xl text-terracota transition-transform active:scale-90"
          aria-label="não"
        >
          ✕
        </button>
        <Link
          href={recipeHref(current._id, haveIds)}
          aria-label="ver receita"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-areia bg-surface text-lg text-carvao/60 transition-transform active:scale-90"
        >
          i
        </Link>
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
  );
}

/* ── DeckCard ────────────────────────────────────────────── */
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
      className={`absolute inset-0 flex touch-none flex-col overflow-hidden rounded-3xl border border-areia bg-surface shadow-card ${className}`}
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
      {children}
    </div>
  );
}
