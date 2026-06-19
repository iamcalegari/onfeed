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
      {/* Overlay de loading */}
      {pending && <ChefLoader />}

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

/* ── Chef loader ───────────────────────────────────────────────── */

function ChefLoader() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-creme/95 backdrop-blur-sm dark:bg-carvao/95">
      {/* F-chef animado */}
      <div className="chef-float">
        <svg
          viewBox="0 0 64 78"
          width={96}
          height={116}
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden
        >
          {/* Corpo (stroke vertical) */}
          <line
            x1="16" y1="12" x2="16" y2="68"
            stroke="#162f25" strokeWidth="7.5" strokeLinecap="round"
          />

          {/* Topo / bigode — ondula como bigode de chef */}
          <path stroke="#162f25" strokeWidth="7" strokeLinecap="round">
            <animate
              attributeName="d"
              values="M16 20 Q34 13 52 19;M16 20 Q34 26 52 19;M16 20 Q34 13 52 19"
              dur="1.5s"
              repeatCount="indefinite"
              calcMode="spline"
              keySplines="0.45 0 0.55 1;0.45 0 0.55 1"
            />
          </path>

          {/* Braço esquerdo — apoia na cintura (estático) */}
          <path
            d="M16 40 Q7 47 5 58"
            stroke="#162f25"
            strokeWidth="6.5"
            strokeLinecap="round"
          />

          {/* Braço direito — levantado, enrolando a ponta do bigode */}
          <path stroke="#162f25" strokeWidth="6.5" strokeLinecap="round">
            <animate
              attributeName="d"
              values="M16 40 Q36 30 47 18;M16 40 Q40 25 52 13;M16 40 Q36 30 47 18"
              dur="1.5s"
              repeatCount="indefinite"
              calcMode="spline"
              keySplines="0.45 0 0.55 1;0.45 0 0.55 1"
            />
          </path>

          {/* Dedo — ponta do braço direito */}
          <circle r="5.5" fill="#162f25">
            <animate
              attributeName="cx"
              values="47;52;47"
              dur="1.5s"
              repeatCount="indefinite"
              calcMode="spline"
              keySplines="0.45 0 0.55 1;0.45 0 0.55 1"
            />
            <animate
              attributeName="cy"
              values="18;13;18"
              dur="1.5s"
              repeatCount="indefinite"
              calcMode="spline"
              keySplines="0.45 0 0.55 1;0.45 0 0.55 1"
            />
          </circle>
        </svg>
      </div>

      {/* Texto */}
      <div className="flex flex-col items-center gap-1 text-center">
        <p className="font-display text-xl font-bold text-forest">
          Adaptando sua receita
        </p>
        <p className="text-sm text-carvao/55">
          o chef está trabalhando nisso…
        </p>
      </div>

      {/* Dots pulsando */}
      <div className="flex gap-2">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-2 w-2 rounded-full bg-terracota"
            style={{ animation: `chef-dot 1.2s ease-in-out ${i * 0.2}s infinite` }}
          />
        ))}
      </div>
    </div>
  );
}
