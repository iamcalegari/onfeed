/** O "Match Score" no círculo (0..100). Cor varia com o valor. */
export function MatchScore({ score }: { score: number }) {
  const v = Math.round(score);
  const tone =
    v >= 90
      ? "border-emerald-500 text-emerald-700"
      : v >= 75
        ? "border-amber-500 text-amber-700"
        : "border-stone-400 text-stone-600";
  return (
    <div
      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold ${tone}`}
    >
      {v}
    </div>
  );
}
