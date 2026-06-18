"use client";

import Link from "next/link";
import { useState } from "react";

import type { SearchHit } from "@/lib/types";
import { InfiniteList } from "./InfiniteList";
import { ResultCard } from "./ResultCard";
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
  const isPacks = view === "packs";

  return (
    <div className="flex flex-col gap-4">

      {/* Header — escondido no modo packs para economizar espaço vertical */}
      {!isPacks && (
        <>
          <header className="flex items-center justify-between">
            <h1 className="font-display text-2xl font-semibold text-forest">
              Resultados
            </h1>
            <Link href="/" className="text-sm font-medium text-terracota">
              nova busca
            </Link>
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
            />
          )}
        />
      )}
    </div>
  );
}

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
