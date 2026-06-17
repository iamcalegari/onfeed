import type { DimensionScores } from "@/lib/types";

const DIMS: {
  key: keyof DimensionScores;
  label: string;
  title: string;
  accent?: boolean;
}[] = [
  { key: "i", label: "I", title: "Ingredientes" },
  { key: "e", label: "E", title: "Equipamentos" },
  { key: "t", label: "T", title: "Tempo" },
  { key: "n", label: "N", title: "Nutrição", accent: true },
];

/** As 4 barrinhas I/E/T/N — sub-score por dimensão (0..1). N em terracota. */
export function ScoreBars({ scores }: { scores: DimensionScores }) {
  return (
    <div className="flex items-end gap-1.5">
      {DIMS.map((d) => {
        const v = Math.max(0, Math.min(1, scores[d.key]));
        return (
          <div key={d.key} className="flex flex-col items-center gap-1">
            <div
              className="flex h-9 w-2.5 items-end overflow-hidden rounded-full bg-areia/60"
              title={`${d.title}: ${Math.round(v * 100)}%`}
            >
              <div
                className={`w-full rounded-full ${d.accent ? "bg-terracota" : "bg-forest"}`}
                style={{ height: `${Math.max(8, v * 100)}%` }}
              />
            </div>
            <span className="text-[9px] font-semibold text-carvao/40">
              {d.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
