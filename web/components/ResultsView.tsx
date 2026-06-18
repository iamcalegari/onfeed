"use client";

import { useState } from "react";

import type { SearchHit } from "@/lib/types";
import { InfiniteList } from "./InfiniteList";
import { ResultCard } from "./ResultCard";
import { SwipeDeck } from "./SwipeDeck";

export function ResultsView({
  results,
  haveIds,
  authenticated,
}: {
  results: SearchHit[];
  haveIds: string[];
  authenticated: boolean;
}) {
  const [view, setView] = useState<"list" | "packs">("list");

  return (
    <div className="flex flex-col gap-4">
      {/* Toggle lista / cards */}
      <div className="flex gap-1 rounded-full bg-areia/40 p-1 text-sm">
        <ViewTab active={view === "list"} onClick={() => setView("list")}>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5">
            <path d="M2 4h12M2 8h12M2 12h12" strokeLinecap="round" />
          </svg>
          Lista
        </ViewTab>
        <ViewTab active={view === "packs"} onClick={() => setView("packs")}>
          {/* Ícone de baralho empilhado */}
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-3.5 w-3.5">
            <rect x="3" y="5" width="10" height="8" rx="1.5" />
            <path d="M2 4h12" strokeLinecap="round" opacity="0.5" />
            <path d="M1 3h14" strokeLinecap="round" opacity="0.25" />
          </svg>
          Packs
        </ViewTab>
      </div>

      {view !== "packs" ? (
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
      ) : (
        <SwipeDeck results={results} haveIds={haveIds} authenticated={authenticated} />
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
