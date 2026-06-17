"use client";

import { useState } from "react";

import type { SearchHit } from "@/lib/types";
import { ResultCard } from "./ResultCard";
import { SwipeDeck } from "./SwipeDeck";

/** Alterna entre a Result List e o Card View (swipe deck) do esboço. */
export function ResultsView({
  results,
  haveIds,
}: {
  results: SearchHit[];
  haveIds: string[];
}) {
  const [view, setView] = useState<"list" | "cards">("list");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1 rounded-lg bg-stone-200 p-1 text-sm">
        <Tab active={view === "list"} onClick={() => setView("list")}>
          Lista
        </Tab>
        <Tab active={view === "cards"} onClick={() => setView("cards")}>
          Cards
        </Tab>
      </div>

      {view === "list" ? (
        <div className="flex flex-col gap-3">
          {results.map((hit, i) => (
            <ResultCard
              key={hit._id}
              hit={hit}
              haveIds={haveIds}
              highlight={i === 0}
            />
          ))}
        </div>
      ) : (
        <SwipeDeck results={results} haveIds={haveIds} />
      )}
    </div>
  );
}

function Tab({
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
      className={`flex-1 rounded-md py-1.5 font-medium transition ${
        active ? "bg-white text-stone-900 shadow-sm" : "text-stone-500"
      }`}
    >
      {children}
    </button>
  );
}
