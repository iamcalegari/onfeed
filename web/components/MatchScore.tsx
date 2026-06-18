/** Percentual de match — círculo sólido com número, paleta do conceito. */
export function MatchScore({ score }: { score: number }) {
  const pct = Math.round(score);

  // Cor progride creme→salvia→forest conforme score
  const colorClass =
    pct >= 75 ? "bg-forest text-creme" :
    pct >= 45 ? "bg-salvia/20 text-forest" :
                "bg-areia/60 text-carvao/60";

  return (
    <div
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums ${colorClass}`}
      title={`Match: ${pct}%`}
    >
      {pct}
    </div>
  );
}
