"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { adaptRecipeAction } from "@/app/actions";
import { recipeHref } from "@/lib/format";
import { ADAPT_FREE, consumeAdapt } from "@/lib/proStorage";
import { showToast } from "@/lib/toast";
import { usePro } from "@/lib/usePro";

/**
 * "Adaptar aos meus macros" — card no estilo do design onFeed v2, com a
 * lógica de quota PRO/FREE (3 adaptações grátis/dia, depois anúncio ou PRO).
 */
export function AdaptButton({
  recipeId,
  haveIds,
}: {
  recipeId: string;
  haveIds: string[];
}) {
  const router = useRouter();
  const pro = usePro();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const aLeft = pro.adaptLeft;

  const adaptNote = pro.isPro
    ? "Ajusta porções e ingredientes aos seus macros"
    : aLeft > 0
      ? `${aLeft} de ${ADAPT_FREE} adaptações grátis hoje`
      : "Limite grátis atingido · anúncio ou PRO";

  const adaptTag = pro.isPro ? "PRO" : aLeft > 0 ? `${aLeft} grátis` : "▶ Anúncio";

  const tagStyle = pro.isPro
    ? { bg: "#fbf1de", fg: "#a76a00", bd: "#eccf95" }
    : aLeft > 0
      ? { bg: "#e4f1e9", fg: "#2d7d4e", bd: "#c2e0ce" }
      : { bg: "#fbeae6", fg: "#c25a3c", bd: "#eccabe" };

  function run() {
    // Quota: PRO ignora; FREE consome 1, e sem saldo cai no "anúncio".
    if (!consumeAdapt()) {
      showToast("Assistindo anúncio para adaptar…", "▶");
      return;
    }
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

      <div
        onClick={pending ? undefined : run}
        className="ofcard"
        style={{
          display: "flex", alignItems: "center", gap: 12,
          background: "#fff", border: "1px solid #ecdcc4", borderRadius: 18,
          padding: "15px 16px", cursor: pending ? "default" : "pointer",
          opacity: pending ? 0.6 : 1,
        }}
      >
        <span style={{
          width: 38, height: 38, borderRadius: 11, background: "#fbf1de",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0,
        }}>✨</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14.5, fontWeight: 700, color: "#232320" }}>Adaptar aos meus macros</div>
          <div style={{ fontSize: 12, color: "#9aa39b", fontWeight: 500, marginTop: 1 }}>{adaptNote}</div>
        </div>
        <span style={{
          flexShrink: 0, fontSize: 11, fontWeight: 800, letterSpacing: 0.4,
          color: tagStyle.fg, background: tagStyle.bg, border: `1px solid ${tagStyle.bd}`,
          padding: "5px 9px", borderRadius: 10, whiteSpace: "nowrap",
        }}>
          {adaptTag}
        </span>
      </div>
      {error && <p style={{ fontSize: 12, color: "#d4644a", marginTop: 6 }}>{error}</p>}
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
