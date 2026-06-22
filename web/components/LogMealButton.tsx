"use client";

import { useState } from "react";

import type { Nutrition } from "@/lib/types";
import { logMeal } from "@/lib/nutritionPlan";

export function LogMealButton({
  recipeId,
  title,
  nutrition,
  servings = 1,
}: {
  recipeId: string;
  title: string;
  nutrition: Nutrition;
  servings?: number;
}) {
  const [state, setState] = useState<"idle" | "done">("idle");

  function handle() {
    logMeal({ recipeId, title, nutrition, servings });
    setState("done");
    setTimeout(() => setState("idle"), 2500);
  }

  if (state === "done") {
    return (
      <div className="flex items-center justify-center gap-2 rounded-2xl bg-forest/10 py-3.5 text-sm font-semibold text-forest">
        <span>✓</span> Registrado no seu dia!
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={handle}
      className="flex w-full items-center justify-center gap-2 rounded-2xl border border-forest/20 bg-forest/5 py-3.5 text-sm font-semibold text-forest transition-colors hover:bg-forest/10 active:scale-[0.98]"
    >
      <PlusIcon />
      Registrar no meu dia
    </button>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-4 w-4">
      <path d="M8 3v10M3 8h10" />
    </svg>
  );
}
