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
      if (res.ok) router.push(recipeHref(res.id, haveIds));
      else setError(res.error); // ex.: limite diário atingido
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="rounded-xl bg-amber-500 py-3 text-sm font-semibold text-white disabled:opacity-50"
      >
        {pending ? "Adaptando…" : "✨ Adaptar pro que eu tenho"}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
