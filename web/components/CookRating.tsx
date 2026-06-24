"use client";

import { useState, useTransition } from "react";

import { rateRecipeAction } from "@/app/actions";

/**
 * Micro-rating pós-cozinha: aparece na tela de conclusão do modo cozinha.
 * Avaliar (1–5 estrelas) também sinaliza que o usuário de fato fez a receita.
 */
export function CookRating({
  recipeId,
  canRate,
}: {
  recipeId: string;
  canRate: boolean;
}) {
  const [rating, setRating] = useState(0);
  const [hover, setHover]   = useState(0);
  const [saved, setSaved]   = useState(false);
  const [pending, startTransition] = useTransition();

  function pick(value: number) {
    if (!canRate || pending || saved) return;
    setRating(value);
    startTransition(async () => {
      try {
        await rateRecipeAction(recipeId, value);
        setSaved(true);
      } catch {
        setRating(0);
      }
    });
  }

  if (saved) {
    return (
      <div className="flex flex-col items-center gap-1.5">
        <div className="flex items-center gap-1 text-2xl text-amber-400">
          {[1, 2, 3, 4, 5].map((v) => (
            <span key={v} className={rating >= v ? "" : "text-areia"}>★</span>
          ))}
        </div>
        <p className="text-sm font-semibold text-forest">
          ✓ Obrigado pela avaliação!
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2.5">
      <p className="text-sm font-medium text-carvao/60">
        {canRate ? "Como ficou?" : "Faça login para avaliar"}
      </p>
      <div className="flex items-center gap-1.5" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((v) => (
          <button
            key={v}
            type="button"
            disabled={!canRate || pending}
            onClick={() => pick(v)}
            onMouseEnter={() => setHover(v)}
            aria-label={`${v} estrela${v > 1 ? "s" : ""}`}
            className="text-3xl leading-none transition-transform active:scale-90 disabled:cursor-default enabled:cursor-pointer"
          >
            <span className={(hover || rating) >= v ? "text-amber-400" : "text-areia"}>
              ★
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
