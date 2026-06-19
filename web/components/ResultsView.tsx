"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

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
}: {
  results: SearchHit[];
  haveIds: string[];
  authenticated: boolean;
  query?: string;
  unresolvedIngredients?: string[];
}) {
  const [view, setView] = useState<"list" | "packs">("list");
  const [showPopup, setShowPopup] = useState(false);
  const isPacks = view === "packs";

  // Popup: 75+ já é "verde escuro" = match muito bom. 85+ é para o banner por card.
  const perfectMatches  = results.filter((r) => r.matchScore >= 75);
  const cookableNow     = results.filter((r) => r.cookableNow && r.matchScore >= 75);

  // Mostra popup uma vez se houver receitas com match perfeito
  const shownRef = useRef(false);
  useEffect(() => {
    if (shownRef.current || perfectMatches.length === 0) return;
    shownRef.current = true;
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

      {/* Header — escondido no modo packs */}
      {!isPacks && (
        <>
          <header className="flex items-center justify-between">
            <h1 className="font-display text-2xl font-semibold text-forest">
              Resultados
            </h1>
            <div className="flex items-center gap-3">
              <ShareButton
                title="Receitas encontradas no onFeed"
                text={query ? `Receitas para: ${query}` : "Resultados no onFeed"}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-areia bg-surface text-carvao/50 hover:text-carvao transition-colors"
              />
              <Link href="/" className="text-sm font-medium text-terracota">
                nova busca
              </Link>
            </div>
          </header>

          {query && (
            <div className="flex items-center gap-2 rounded-xl border border-areia bg-surface px-3.5 py-2.5">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 text-carvao/40">
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.3-4.3" strokeLinecap="round" />
              </svg>
              <span className="truncate text-sm text-carvao/70">{query}</span>
            </div>
          )}

          {unresolvedIngredients && unresolvedIngredients.length > 0 && (
            <p className="rounded-xl bg-terracota/10 px-3 py-2 text-xs text-terracota">
              Não reconhecemos: {unresolvedIngredients.join(", ")}
            </p>
          )}

          <p className="text-xs font-medium text-carvao/50">
            {results.length} receita{results.length === 1 ? "" : "s"} encontrada
            {results.length === 1 ? "" : "s"}
          </p>
        </>
      )}

      {/* Toggle lista / packs */}
      <div className={`flex gap-1 rounded-full bg-areia/40 p-1 text-sm ${isPacks ? "-mx-1" : ""}`}>
        <ViewTab active={!isPacks} onClick={() => setView("list")}>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5">
            <path d="M2 4h12M2 8h12M2 12h12" strokeLinecap="round" />
          </svg>
          Lista
        </ViewTab>
        <ViewTab active={isPacks} onClick={() => setView("packs")}>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-3.5 w-3.5">
            <rect x="3" y="5" width="10" height="8" rx="1.5" />
            <path d="M2 4h12" strokeLinecap="round" opacity="0.5" />
            <path d="M1 3h14" strokeLinecap="round" opacity="0.25" />
          </svg>
          Packs
        </ViewTab>
      </div>

      {results.length === 0 ? (
        <p className="text-sm text-carvao/50">
          Nada encontrado. Tente menos restrições.
        </p>
      ) : isPacks ? (
        <SwipeDeck results={results} haveIds={haveIds} authenticated={authenticated} />
      ) : (
        <InfiniteList
          items={results}
          className="flex flex-col gap-3"
          renderItem={(hit, i) => (
            <ResultCard
              key={hit._id}
              hit={hit}
              haveIds={haveIds}
              highlight={i === 0}
              rank={i < 3 ? ((i + 1) as 1 | 2 | 3) : undefined}
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
  const cStr = cookableCount === 1 ? "ela" : "elas";

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

/* ── ViewTab ─────────────────────────────────────────────────── */

function ViewTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-2 text-xs font-semibold transition-all duration-200 ${
        active
          ? "bg-surface text-forest shadow-sm"
          : "text-carvao/50 hover:text-carvao/70"
      }`}
    >
      {children}
    </button>
  );
}
