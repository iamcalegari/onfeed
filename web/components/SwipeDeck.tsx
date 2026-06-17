"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { flagEmoji, formatMinutes, recipeHref } from "@/lib/format";
import type { SearchHit } from "@/lib/types";
import { MatchScore } from "./MatchScore";
import { ScoreBars } from "./ScoreBars";

const PACK_SIZE = 25;
const THRESHOLD = 110; // px de arraste p/ decidir
const SELECTED_KEY = "rod:selected";

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** Packs de 25 em ordem de match; embaralhados DENTRO de cada pack. */
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
}: {
  results: SearchHit[];
  haveIds: string[];
}) {
  const [deck] = useState(() => buildDeck(results));
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<SearchHit[]>([]);
  const [showSelected, setShowSelected] = useState(false);
  const [drag, setDrag] = useState(0);
  const dragging = useRef(false);
  const startX = useRef(0);
  const animating = useRef(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SELECTED_KEY);
      if (raw) setSelected(JSON.parse(raw) as SearchHit[]);
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(SELECTED_KEY, JSON.stringify(selected));
    } catch {
      /* ignore */
    }
  }, [selected]);

  const current = deck[index];

  function decide(dir: "yes" | "no") {
    if (!current || animating.current) return;
    animating.current = true;
    setDrag(dir === "yes" ? 700 : -700);
    if (dir === "yes") {
      setSelected((prev) =>
        prev.some((s) => s._id === current._id) ? prev : [...prev, current],
      );
    }
    setTimeout(() => {
      setIndex((i) => i + 1);
      setDrag(0);
      animating.current = false;
    }, 180);
  }

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") decide("yes");
      if (e.key === "ArrowLeft") decide("no");
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  // --- painel de selecionadas ---
  if (showSelected) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Selecionadas ({selected.length})</h2>
          <button
            type="button"
            onClick={() => setShowSelected(false)}
            className="text-sm text-emerald-700"
          >
            ← voltar ao deck
          </button>
        </div>
        {selected.length === 0 ? (
          <p className="text-sm text-stone-500">
            Nenhuma ainda — arraste pra direita pra selecionar.
          </p>
        ) : (
          <>
            {selected.map((h) => (
              <div
                key={h._id}
                className="flex items-center gap-3 rounded-lg border border-stone-200 bg-white p-2"
              >
                <span className="text-xl">{flagEmoji(h.country)}</span>
                <Link
                  href={recipeHref(h._id, haveIds)}
                  className="flex-1 truncate text-sm font-medium"
                >
                  {h.title}
                </Link>
                <button
                  type="button"
                  onClick={() =>
                    setSelected((p) => p.filter((x) => x._id !== h._id))
                  }
                  className="text-xs text-stone-400"
                >
                  remover
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setSelected([])}
              className="mt-1 text-xs text-stone-400"
            >
              limpar tudo
            </button>
          </>
        )}
      </div>
    );
  }

  // --- fim do deck ---
  if (!current) {
    return (
      <div className="flex flex-col items-center gap-4 py-10 text-center">
        <p className="text-4xl">🎉</p>
        <p className="text-sm text-stone-600">
          Você passou por todas. {selected.length} selecionada
          {selected.length === 1 ? "" : "s"}.
        </p>
        <button
          type="button"
          onClick={() => setShowSelected(true)}
          className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white"
        >
          Ver selecionadas ({selected.length})
        </button>
      </div>
    );
  }

  const packNum = Math.floor(index / PACK_SIZE) + 1;
  const totalPacks = Math.ceil(deck.length / PACK_SIZE);
  const next = deck[index + 1];
  const tilt = drag / 25;
  const hint = Math.min(Math.abs(drag) / THRESHOLD, 1);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-stone-500">
          Pack {packNum}/{totalPacks}
        </span>
        <button
          type="button"
          onClick={() => setShowSelected(true)}
          className="text-sm font-medium text-emerald-700"
        >
          Ver selecionadas ({selected.length})
        </button>
      </div>

      {/* área do deck */}
      <div className="relative h-[420px] select-none">
        {next && (
          <DeckCard
            hit={next}
            style={{ transform: "scale(0.96) translateY(8px)" }}
            className="opacity-80"
          />
        )}
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
            if (Math.abs(drag) > THRESHOLD) decide(drag > 0 ? "yes" : "no");
            else setDrag(0);
          }}
          style={{
            transform: `translateX(${drag}px) rotate(${tilt}deg)`,
            transition: dragging.current ? "none" : "transform 0.18s ease-out",
            cursor: "grab",
          }}
        >
          {drag !== 0 && (
            <div
              className={`absolute left-4 top-4 rounded-md border-2 px-2 py-0.5 text-lg font-extrabold ${
                drag > 0
                  ? "border-emerald-500 text-emerald-500"
                  : "border-red-500 text-red-500"
              }`}
              style={{ opacity: hint }}
            >
              {drag > 0 ? "YES" : "NO"}
            </div>
          )}
        </DeckCard>
      </div>

      <div className="flex items-center justify-center gap-6">
        <button
          type="button"
          onClick={() => decide("no")}
          className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-red-400 text-2xl text-red-500"
          aria-label="não"
        >
          ✕
        </button>
        <button
          type="button"
          onClick={() => decide("yes")}
          className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-emerald-500 text-2xl text-emerald-600"
          aria-label="sim"
        >
          ♥
        </button>
      </div>
    </div>
  );
}

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
      className={`absolute inset-0 flex touch-none flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm ${className}`}
    >
      {hit.thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={hit.thumbnailUrl}
          alt=""
          className="h-40 w-full object-cover"
        />
      ) : (
        <div className="flex h-40 items-center justify-center bg-stone-100 text-5xl">
          🍽️
        </div>
      )}
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-base font-bold leading-tight">
            <span className="mr-1">{flagEmoji(hit.country)}</span>
            {hit.title}
          </h3>
          <MatchScore score={hit.matchScore} />
        </div>
        <p className="line-clamp-3 text-xs text-stone-500">{hit.intro}</p>
        <div className="mt-auto flex items-end justify-between">
          <ScoreBars scores={hit.scores} />
          <span className="text-[11px] text-stone-400">
            {formatMinutes(hit.prepTimeMin)}
          </span>
        </div>
        {hit.missing.length > 0 && (
          <p className="text-[11px] text-stone-500">
            Faltando: {hit.missing.map((m) => m.name).join(", ")}
          </p>
        )}
      </div>
      {children}
    </div>
  );
}
