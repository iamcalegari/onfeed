type Rank = 1 | 2 | 3;

const RANK_RING: Record<Rank, string> = {
  1: "#c9973b",
  2: "#9aa0a6",
  3: "#a0663a",
};

/** Percentual de match — círculo sólido com número, paleta do conceito. */
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

  const ringColor = rank ? RANK_RING[rank] : undefined;

  return (
    <div
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums transition-shadow ${colorClass}`}
      style={ringColor ? { boxShadow: `0 0 0 2.5px ${ringColor}` } : undefined}
      title={`Match: ${pct}%`}
    >
      {pct}
    </div>
  );
}
