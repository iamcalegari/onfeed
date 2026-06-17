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
      className={`w-full rounded-2xl border py-3.5 text-sm font-semibold transition disabled:opacity-60 ${
        fav
          ? "border-forest bg-white text-forest"
          : "border-transparent bg-forest text-creme"
      }`}
    >
      {fav ? "♥ Receita salva" : "Salvar receita"}
    </button>
  );
}
