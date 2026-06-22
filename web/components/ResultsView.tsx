"use client";

import { useEffect, useState } from "react";

import type { SearchHit } from "@/lib/types";
import { InfiniteList } from "./InfiniteList";
import { ResultCard } from "./ResultCard";
import { ShareButton } from "./ShareButton";
import { SwipeDeck } from "./SwipeDeck";

export function ResultsView({
  results,
  haveIds,
  authenticated,
  query,
  unresolvedIngredients,
  baseIngredients = [],
}: {
  results: SearchHit[];
  haveIds: string[];
  authenticated: boolean;
  query?: string;
  unresolvedIngredients?: string[];
  baseIngredients?: string[];
}) {
  const [view, setView] = useState<"list" | "packs">("list");
  const [showPopup, setShowPopup] = useState(false);
  const isPacks = view === "packs";

  // Popup: 75+ já é "verde escuro" = match muito bom. 85+ é para o banner por card.
  const perfectMatches  = results.filter((r) => r.matchScore >= 75);
  const cookableNow     = results.filter((r) => r.cookableNow && r.matchScore >= 75);

  // Mostra popup se houver receitas com match perfeito.
  // shownRef quebrava no React StrictMode: cleanup cancelava o timeout mas
  // não resetava o ref, então o segundo mount (StrictMode) via ref=true e abortava.
  // results é prop estático — perfectMatches.length não muda após mount,
  // então o timeout só dispara uma vez mesmo sem o guard.
  useEffect(() => {
    if (perfectMatches.length === 0) return;
    const t = setTimeout(() => setShowPopup(true), 420);
    return () => clearTimeout(t);
  }, [perfectMatches.length]);

  return (
    <div className="flex flex-col gap-4">
      {/* Popup de match perfeito */}
      {showPopup && (
        <PerfectMatchPopup
          perfectCount={perfectMatches.length}
          cookableCount={cookableNow.length}
          onDismiss={() => setShowPopup(false)}
        />
      )}

      {/* Tabs — pill style */}
      <div style={{ display: "flex", gap: 8, background: "#f1e7d6", padding: 5, borderRadius: 16 }}>
        {[
          { id: "list",  icon: "📋", label: "Lista"  },
          { id: "packs", icon: "🧩", label: "Packs"  },
        ].map(t => {
          const on = (t.id === "list") === !isPacks;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setView(t.id as "list" | "packs")}
              style={{
                flex: 1, textAlign: "center", padding: "11px 0",
                borderRadius: 12, fontSize: 14, fontWeight: 700,
                background: on ? "#fff" : "transparent",
                color: on ? "#162f25" : "#9aa39b",
                boxShadow: on ? "0 2px 8px -3px rgba(22,47,37,.2)" : "none",
                cursor: "pointer", border: "none",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                transition: "all .15s ease",
              }}
            >
              <span>{t.icon}</span>{t.label}
            </button>
          );
        })}
      </div>

      {/* Header + legenda — escondido no modo packs */}
      {!isPacks && (
        <>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginTop: 6 }}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 22, color: "#162f25" }}>
              Combinam com você
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12.5, color: "#7a9e94", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                {results.length} receita{results.length === 1 ? "" : "s"} · ordenadas por match
              </span>
              <ShareButton
                title="Receitas encontradas no onFeed"
                text={query ? `Receitas para: ${query}` : "Resultados no onFeed"}
                className="flex h-7 w-7 items-center justify-center rounded-full border border-areia bg-surface text-carvao/50 hover:text-carvao transition-colors"
              />
            </div>
          </div>

          {/* Legenda */}
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", fontSize: 11.5, color: "#9aa39b", fontWeight: 600 }}>
            <span style={{ color: "#7a9e94" }}>O que o match considera:</span>
            {[
              { label: "Ingredientes", color: "#2d7d4e" },
              { label: "Equipamento",  color: "#7a9e94" },
              { label: "Tempo",        color: "#c27a00" },
              { label: "Nutrição",     color: "#4a7fcb" },
            ].map(l => (
              <span key={l.label} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: l.color, display: "inline-block" }} />
                {l.label}
              </span>
            ))}
          </div>

          {unresolvedIngredients && unresolvedIngredients.length > 0 && (
            <p className="rounded-xl bg-terracota/10 px-3 py-2 text-xs text-terracota">
              Não reconhecemos: {unresolvedIngredients.join(", ")}
            </p>
          )}
        </>
      )}

      {results.length === 0 ? (
        <p className="text-sm text-carvao/50">
          Nada encontrado. Tente menos restrições.
        </p>
      ) : isPacks ? (
        <SwipeDeck results={results} haveIds={haveIds} authenticated={authenticated} baseIngredients={baseIngredients} />
      ) : (
        <InfiniteList
          items={results}
          className="flex flex-col gap-3.5"
          renderItem={(hit, i) => (
            <ResultCard
              key={hit._id}
              hit={hit}
              haveIds={haveIds}
              highlight={i === 0}
              rank={i < 3 ? ((i + 1) as 1 | 2 | 3) : undefined}
              baseIngredients={baseIngredients}
            />
          )}
        />
      )}
    </div>
  );
}

/* ── Popup de premiação ─────────────────────────────────────── */

function PerfectMatchPopup({
  perfectCount,
  cookableCount,
  onDismiss,
}: {
  perfectCount: number;
  cookableCount: number;
  onDismiss: () => void;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  function dismiss() {
    setVisible(false);
    setTimeout(onDismiss, 350);
  }

  const pStr = perfectCount === 1 ? "receita" : "receitas";

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end justify-center p-4 transition-all duration-300 ${
        visible ? "opacity-100" : "opacity-0 pointer-events-none"
      }`}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-carvao/55 backdrop-blur-sm"
        onClick={dismiss}
      />

      {/* Card */}
      <div
        className={`relative w-full max-w-sm overflow-hidden rounded-3xl bg-surface shadow-2xl transition-transform duration-350 ease-out ${
          visible ? "translate-y-0" : "translate-y-full"
        }`}
      >
        {/* Faixa dourada superior */}
        <div
          className="h-1.5"
          style={{ background: "linear-gradient(90deg, rgba(201,151,59,0.6) 0%, #e8c66a 50%, rgba(201,151,59,0.6) 100%)" }}
        />

        {/* Decoração de fundo */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden select-none">
          <span className="absolute -right-3 -top-2 text-[80px] leading-none text-[#c9973b]/7">✦</span>
          <span className="absolute -left-1 bottom-10 text-[60px] leading-none text-[#c9973b]/5">★</span>
          <span className="absolute right-8 bottom-14 text-[30px] leading-none text-[#c9973b]/8">✧</span>
        </div>

        <div className="relative flex flex-col items-center gap-5 px-6 pb-7 pt-6 text-center">
          {/* Troféu animado */}
          <div className="trophy-bounce text-6xl" aria-hidden>
            🏆
          </div>

          {/* Título */}
          <div className="flex flex-col items-center gap-1">
            <p className="font-display text-[1.65rem] font-bold leading-tight text-forest">
              Match Perfeito!
            </p>
            <p
              className="text-xs font-semibold uppercase tracking-[0.2em]"
              style={{ color: "#c9973b" }}
            >
              você foi premiado
            </p>
          </div>

          {/* Descrição */}
          <p className="max-w-[17rem] text-sm leading-relaxed text-carvao/65">
            Encontramos{" "}
            <span className="font-bold text-carvao">{perfectCount}</span>{" "}
            {pStr} com mais de{" "}
            <span className="font-bold text-carvao">75%</span> de match
            {cookableCount > 0 && (
              <>
                {" — "}e{" "}
                <span className="font-bold text-forest">
                  {cookableCount === perfectCount
                    ? `tod${perfectCount === 1 ? "a" : "as"}`
                    : cookableCount === 1
                    ? "1 delas"
                    : `${cookableCount} delas`}
                </span>{" "}
                dá pra fazer agora com o que você tem.
              </>
            )}
            {cookableCount === 0 && "."}
          </p>

          {/* Estrelinhas decorativas */}
          <div className="flex items-center gap-1.5">
            {["✦", "✧", "✦", "✧", "✦"].map((s, i) => (
              <span
                key={i}
                className="text-sm"
                style={{
                  color: "#c9973b",
                  opacity: i % 2 === 0 ? 1 : 0.35,
                  animation: i % 2 === 0 ? `star-spin ${3 + i * 0.5}s linear infinite` : undefined,
                  display: "inline-block",
                }}
              >
                {s}
              </span>
            ))}
          </div>

          {/* CTA principal */}
          <button
            type="button"
            onClick={dismiss}
            className="w-full rounded-2xl py-3.5 text-sm font-bold text-white shadow-md transition-transform active:scale-[0.97]"
            style={{ background: "linear-gradient(135deg, #c9973b 0%, #e8c66a 60%, #c9973b 100%)" }}
          >
            ✦ Ver {perfectCount === 1 ? "a receita premiada" : "as receitas premiadas"}
          </button>

          {/* Ação secundária */}
          <button
            type="button"
            onClick={dismiss}
            className="text-xs text-carvao/35 transition-colors hover:text-carvao/60"
          >
            mostrar todas as receitas
          </button>
        </div>

        {/* Faixa dourada inferior */}
        <div
          className="h-1"
          style={{ background: "linear-gradient(90deg, rgba(201,151,59,0.4) 0%, #c9973b 50%, rgba(201,151,59,0.4) 100%)" }}
        />
      </div>
    </div>
  );
}

