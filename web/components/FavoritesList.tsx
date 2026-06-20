"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

import { removeFavoriteAction } from "@/app/actions";
import { flagEmoji, formatMinutes } from "@/lib/format";
import type { FavoriteRecipe } from "@/lib/types";

const SWIPE_THRESHOLD = 80;

interface PendingRemoval {
  recipe: FavoriteRecipe;
  countdown: number;
}

/* ── Swipable row ─────────────────────────────────────────────── */

function SwipableRow({
  recipe,
  onRemove,
}: {
  recipe: FavoriteRecipe;
  onRemove: (r: FavoriteRecipe) => void;
}) {
  const [drag, setDrag] = useState(0);
  const [leaving, setLeaving] = useState<"left" | "right" | null>(null);

  const startXRef = useRef<number | null>(null);
  const startYRef = useRef<number | null>(null);
  const lockedHRef = useRef(false);
  // tracks max horizontal distance during the gesture — checked in Link's onClick
  const maxDxRef = useRef(0);

  function onPointerDown(e: React.PointerEvent) {
    startXRef.current = e.clientX;
    startYRef.current = e.clientY;
    lockedHRef.current = false;
    maxDxRef.current = 0;
  }

  function onPointerMove(e: React.PointerEvent) {
    if (startXRef.current === null) return;
    const dx = e.clientX - startXRef.current;
    const dy = e.clientY - (startYRef.current ?? e.clientY);

    if (!lockedHRef.current) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      if (Math.abs(dx) >= Math.abs(dy)) {
        lockedHRef.current = true;
      } else {
        startXRef.current = null;
        return;
      }
    }

    maxDxRef.current = Math.max(maxDxRef.current, Math.abs(dx));
    setDrag(dx);
  }

  function onPointerUp(e: React.PointerEvent) {
    if (startXRef.current === null) return;
    const dx = e.clientX - startXRef.current;
    startXRef.current = null;

    if (lockedHRef.current && Math.abs(dx) >= SWIPE_THRESHOLD) {
      setLeaving(dx > 0 ? "right" : "left");
      setTimeout(() => onRemove(recipe), 240);
    } else {
      setDrag(0);
    }
    lockedHRef.current = false;
  }

  const absProgress = Math.min(1, Math.abs(drag) / SWIPE_THRESHOLD);

  return (
    <div
      className="relative overflow-hidden rounded-2xl"
      style={{ touchAction: "pan-y" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => { setDrag(0); startXRef.current = null; lockedHRef.current = false; }}
    >
      {/* Delete hint */}
      <div
        className="absolute inset-0 flex items-center rounded-2xl px-5"
        style={{
          background: `rgba(239,68,68,${absProgress * 0.18})`,
          justifyContent: drag <= 0 ? "flex-end" : "flex-start",
        }}
      >
        <span style={{ opacity: absProgress, fontSize: "1.1rem" }}>🗑️</span>
      </div>

      {/* Card — Link para navegação nativa (funciona mouse + touch) */}
      <Link
        href={`/recipe/${recipe._id}`}
        onClick={(e) => { if (maxDxRef.current > 10) e.preventDefault(); }}
        draggable={false}
        className="relative flex select-none gap-3 rounded-2xl border border-areia bg-surface p-3"
        style={{
          transform: leaving
            ? `translateX(${leaving === "right" ? "110%" : "-110%"})`
            : `translateX(${drag}px)`,
          transition: drag === 0 || leaving ? "transform 0.24s ease" : undefined,
          opacity: 1 - absProgress * 0.25,
        }}
      >
        {recipe.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={recipe.thumbnailUrl}
            alt=""
            className="h-16 w-16 shrink-0 rounded-xl object-cover"
            draggable={false}
          />
        ) : (
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-areia/30 text-xl">
            🍽️
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-display text-base font-semibold text-carvao">
            <span className="mr-1">{flagEmoji(recipe.country)}</span>
            {recipe.title}
          </h3>
          <p className="line-clamp-2 text-xs text-carvao/55">{recipe.intro}</p>
          <span className="text-[11px] text-carvao/40">{formatMinutes(recipe.prepTimeMin)}</span>
        </div>
      </Link>
    </div>
  );
}

/* ── Main component ───────────────────────────────────────────── */

export function FavoritesList({ initialRecipes }: { initialRecipes: FavoriteRecipe[] }) {
  const [items, setItems] = useState<FavoriteRecipe[]>(initialRecipes);
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState<PendingRemoval | null>(null);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRecipeRef = useRef<FavoriteRecipe | null>(null);

  const commitPending = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (pendingRecipeRef.current) {
      void removeFavoriteAction(pendingRecipeRef.current._id);
      pendingRecipeRef.current = null;
    }
    setPending(null);
  }, []);

  function handleRemove(recipe: FavoriteRecipe) {
    if (pendingRecipeRef.current) commitPending();

    setItems((prev) => prev.filter((r) => r._id !== recipe._id));
    pendingRecipeRef.current = recipe;
    setPending({ recipe, countdown: 3 });

    intervalRef.current = setInterval(() => {
      setPending((prev) => {
        if (!prev) return null;
        if (prev.countdown <= 1) {
          clearInterval(intervalRef.current!);
          return null;
        }
        return { ...prev, countdown: prev.countdown - 1 };
      });
    }, 1000);

    timeoutRef.current = setTimeout(async () => {
      if (pendingRecipeRef.current) {
        await removeFavoriteAction(pendingRecipeRef.current._id);
        pendingRecipeRef.current = null;
      }
      setPending(null);
    }, 3000);
  }

  function handleUndo() {
    if (!pending || !pendingRecipeRef.current) return;
    clearInterval(intervalRef.current!);
    clearTimeout(timeoutRef.current!);
    const restored = pendingRecipeRef.current;
    pendingRecipeRef.current = null;
    setItems((prev) => [restored, ...prev]);
    setPending(null);
  }

  useEffect(() => {
    return () => {
      clearInterval(intervalRef.current!);
      clearTimeout(timeoutRef.current!);
    };
  }, []);

  const filtered = query.trim()
    ? items.filter((r) => {
        const q = query.toLowerCase();
        return (
          r.title.toLowerCase().includes(q) ||
          r.ingredientNames.some((n) => n.toLowerCase().includes(q))
        );
      })
    : items;

  return (
    <>
      {/* Search input */}
      <div className="relative">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-carvao/30">
          🔍
        </span>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nome ou ingrediente…"
          className="w-full rounded-2xl border border-areia bg-surface py-3 pl-9 pr-9 text-sm text-carvao placeholder:text-carvao/30 focus:border-forest/40 focus:outline-none focus:ring-2 focus:ring-forest/10"
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-lg leading-none text-carvao/35 hover:text-carvao/60"
          >
            ×
          </button>
        )}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <p className="py-6 text-center text-sm text-carvao/40">
          {query ? "Nenhuma receita encontrada." : "Nada salvo ainda — favorite receitas pelo coração."}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((r) => (
            <SwipableRow key={r._id} recipe={r} onRemove={handleRemove} />
          ))}
        </div>
      )}

      {/* Undo snackbar */}
      {pending && (
        <div className="fixed inset-x-4 bottom-24 z-50 flex items-center gap-3 rounded-2xl bg-carvao px-4 py-3.5 shadow-xl">
          <span className="min-w-0 flex-1 truncate text-sm text-creme/80">
            Receita removida dos favoritos
          </span>
          <span className="shrink-0 font-mono text-xs text-creme/40">{pending.countdown}s</span>
          <button
            onClick={handleUndo}
            className="shrink-0 rounded-full bg-terracota px-3.5 py-1 text-xs font-bold text-creme"
          >
            Desfazer
          </button>
        </div>
      )}
    </>
  );
}
