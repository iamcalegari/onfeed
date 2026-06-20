"use client";

import { useState, useTransition } from "react";

import { addFavoriteAction, removeFavoriteAction } from "@/app/actions";

export function FavoriteButton({
  recipeId,
  initiallyFavorited,
  compact = false,
}: {
  recipeId: string;
  initiallyFavorited: boolean;
  compact?: boolean;
}) {
  const [fav, setFav] = useState(initiallyFavorited);
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = !fav;
    setFav(next);
    startTransition(async () => {
      try {
        if (next) await addFavoriteAction(recipeId);
        else await removeFavoriteAction(recipeId);
      } catch {
        setFav(!next);
      }
    });
  }

  if (compact) {
    return (
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-pressed={fav}
        aria-label={fav ? "Remover dos salvos" : "Salvar receita"}
        className={`flex h-9 w-9 items-center justify-center rounded-full border transition-all disabled:opacity-60 active:scale-90 ${
          fav
            ? "border-forest/40 bg-forest/10 text-forest"
            : "border-areia bg-creme text-carvao/50 hover:text-carvao"
        }`}
      >
        <BookmarkIcon filled={fav} />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={fav}
      className={`w-full rounded-2xl border py-3.5 text-sm font-semibold transition disabled:opacity-60 ${
        fav
          ? "border-forest bg-surface text-forest"
          : "border-transparent bg-forest text-creme"
      }`}
    >
      {fav ? "♥ Receita salva" : "Salvar receita"}
    </button>
  );
}

function BookmarkIcon({ filled }: { filled: boolean }) {
  return filled ? (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
      <path d="M5 3h14a1 1 0 0 1 1 1v17l-8-4-8 4V4a1 1 0 0 1 1-1z" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M5 3h14a1 1 0 0 1 1 1v17l-8-4-8 4V4a1 1 0 0 1 1-1z" />
    </svg>
  );
}
