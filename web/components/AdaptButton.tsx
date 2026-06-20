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
      } else setError(res.error);
    });
  }

  return (
    <>
      {pending && <AdaptLoader />}

      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={run}
          disabled={pending}
          className="w-full rounded-2xl bg-terracota py-3.5 text-sm font-semibold text-creme transition disabled:opacity-50"
        >
          ✦ Adaptar pro que eu tenho
        </button>
        {error && <p className="text-xs text-terracota">{error}</p>}
      </div>
    </>
  );
}

/* ── Loader ────────────────────────────────────────────────────── */

function AdaptLoader() {
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-8"
      style={{ background: "rgba(250,244,232,0.97)", backdropFilter: "blur(4px)" }}
    >
      {/* Ícone animado */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/app-icon.png"
        alt=""
        width={96}
        height={96}
        className="chef-float rounded-[22px] shadow-xl"
        aria-hidden
      />

      {/* Texto */}
      <div className="flex flex-col items-center gap-1 text-center">
        <p className="font-display text-xl font-bold" style={{ color: "#162f25" }}>
          Adaptando sua receita
        </p>
        <p className="text-sm" style={{ color: "rgba(35,35,32,0.50)" }}>
          aguarda um instante…
        </p>
      </div>

      {/* Dots */}
      <div className="flex gap-2">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-2 w-2 rounded-full"
            style={{
              background: "#d4644a",
              animation: `chef-dot 1.2s ease-in-out ${i * 0.2}s infinite`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
