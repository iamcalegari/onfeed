"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { adaptRecipeAction } from "@/app/actions";
import { recipeHref } from "@/lib/format";

/** "Adaptar pro que eu tenho" — dispara a geração híbrida e abre a variação. */
export function AdaptButton({
  recipeId,
  haveIds,
}: {
  recipeId: string;
  haveIds: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run() {
    setError(null);
    startTransition(async () => {
      const res = await adaptRecipeAction(recipeId, haveIds);
      if (res.ok) {
        const href = recipeHref(res.id, haveIds);
        router.push(href + (href.includes("?") ? "&" : "?") + "adapted=1");
      } else setError(res.error); // ex.: limite diário atingido
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="w-full rounded-2xl bg-terracota py-3.5 text-sm font-semibold text-creme transition disabled:opacity-50"
      >
        {pending ? "Adaptando…" : "✦ Adaptar pro que eu tenho"}
      </button>
      {error && <p className="text-xs text-terracota">{error}</p>}
    </div>
  );
}
