import type { DimensionScores } from "@/lib/types";

const DIMS: { key: keyof DimensionScores; label: string; title: string }[] = [
  { key: "i", label: "I", title: "Ingredientes" },
  { key: "e", label: "E", title: "Equipamentos" },
  { key: "t", label: "T", title: "Tempo" },
  { key: "n", label: "N", title: "Nutrição" },
];

/** As 4 barrinhas I/E/T/N do esboço — um sub-score por dimensão (0..1). */
export function ScoreBars({ scores }: { scores: DimensionScores }) {
  return (
    <div className="flex items-end gap-2">
      {DIMS.map((d) => {
        const v = Math.max(0, Math.min(1, scores[d.key]));
        return (
          <div key={d.key} className="flex flex-col items-center gap-1">
            <div
              className="flex h-10 w-3 items-end overflow-hidden rounded-sm bg-stone-200"
              title={`${d.title}: ${Math.round(v * 100)}%`}
            >
              <div
                className="w-full rounded-sm bg-emerald-600"
                style={{ height: `${Math.max(6, v * 100)}%` }}
              />
            </div>
            <span className="text-[10px] font-semibold text-stone-500">
              {d.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
