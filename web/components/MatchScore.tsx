/** O "Match Score" no círculo (0..100), neutro como no conceito. */
export function MatchScore({ score }: { score: number }) {
  return (
    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-areia bg-white text-sm font-semibold text-forest">
      {Math.round(score)}
    </div>
  );
}
