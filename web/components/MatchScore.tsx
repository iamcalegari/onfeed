import type { Rank } from "./ResultCard";

const RANK_RING: Record<Rank, string> = {
  1: "0 0 0 2.5px #c9973b, 0 0 8px rgba(201,151,59,0.50)",
  2: "0 0 0 2px #9aa0a6,   0 0 6px rgba(154,160,166,0.35)",
  3: "0 0 0 2px #a0663a,   0 0 5px rgba(160,102,58,0.30)",
};

/** Percentual de match — círculo com número e paleta progressiva. */
export function MatchScore({
  score,
  rank,
}: {
  score: number;
  rank?: Rank;
}) {
  const pct = Math.round(score);

  const colorClass =
    pct >= 85 ? "bg-forest text-creme" :
    pct >= 75 ? "bg-forest/85 text-creme" :
    pct >= 45 ? "bg-salvia/20 text-forest" :
                "bg-areia/60 text-carvao/60";

  const size = rank === 1 ? "h-11 w-11 text-sm" : "h-10 w-10 text-xs";

  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full font-bold tabular-nums ${colorClass} ${size}`}
      style={rank ? { boxShadow: RANK_RING[rank] } : undefined}
      title={`Match: ${pct}%`}
    >
      {pct}
    </div>
  );
}
