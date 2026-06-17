"use client";

import { useState } from "react";

import type { SearchHit } from "@/lib/types";
import { InfiniteList } from "./InfiniteList";
import { ResultCard } from "./ResultCard";
import { SwipeDeck } from "./SwipeDeck";

/** Alterna entre a Result List e o Card View (swipe deck) do esboço. */
export function ResultsView({
  results,
  haveIds,
  authenticated,
}: {
  results: SearchHit[];
  haveIds: string[];
  authenticated: boolean;
}) {
  const [view, setView] = useState<"list" | "cards">("list");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1 rounded-full border border-areia bg-white p-1 text-sm">
        <Tab active={view === "list"} onClick={() => setView("list")}>
          Lista
        </Tab>
        <Tab active={view === "cards"} onClick={() => setView("cards")}>
          Cards
        </Tab>
      </div>

      {view === "list" ? (
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
        <SwipeDeck
          results={results}
          haveIds={haveIds}
          authenticated={authenticated}
        />
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
      className={`flex-1 rounded-full py-1.5 font-medium transition ${
        active ? "bg-forest text-creme" : "text-carvao/55"
      }`}
    >
      {children}
    </button>
  );
}
