"use client";

import { useState, useTransition } from "react";

import { addFavoriteAction, removeFavoriteAction } from "@/app/actions";

/** Coração com toggle otimista; reverte se a chamada falhar. */
export function FavoriteButton({
  recipeId,
  initiallyFavorited,
}: {
  recipeId: string;
  initiallyFavorited: boolean;
}) {
  const [fav, setFav] = useState(initiallyFavorited);
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = !fav;
    setFav(next); // otimista
    startTransition(async () => {
      try {
        if (next) await addFavoriteAction(recipeId);
        else await removeFavoriteAction(recipeId);
      } catch {
        setFav(!next); // reverte
      }
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={fav}
      className={`flex items-center gap-2 rounded-xl border py-2.5 text-sm font-semibold transition disabled:opacity-60 ${
        fav
          ? "border-rose-300 bg-rose-50 text-rose-600"
          : "border-stone-300 text-stone-700"
      }`}
    >
      <span className="px-3">
        {fav ? "♥ Favoritada" : "♡ Favoritar"}
      </span>
    </button>
  );
}
