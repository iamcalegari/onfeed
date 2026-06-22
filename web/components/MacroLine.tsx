import type { Nutrition } from "@/lib/types";

export function MacroLine({
  nutrition,
  compact = false,
}: {
  nutrition: Nutrition;
  compact?: boolean;
}) {
  const kcal = Math.round(nutrition.calories);
  const p    = Math.round(nutrition.protein);
  const c    = Math.round(nutrition.carbs);
  const f    = Math.round(nutrition.fat);

  if (compact) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] tabular-nums">
        <span className="font-semibold text-forest">{kcal} kcal</span>
        <span className="text-carvao/25">·</span>
        <span style={{ color: "#4a7fcb" }}>P{p}</span>
        <span className="text-carvao/25">·</span>
        <span style={{ color: "#c27a00" }}>C{c}</span>
        <span className="text-carvao/25">·</span>
        <span style={{ color: "#d4644a" }}>G{f}</span>
      </span>
    );
  }

  return (
    <div className="flex items-center gap-2 text-xs tabular-nums">
      <span className="font-bold text-forest">{kcal} kcal</span>
      <span className="text-carvao/25">·</span>
      <span style={{ color: "#4a7fcb" }}>
        P <strong>{p}g</strong>
      </span>
      <span className="text-carvao/25">·</span>
      <span style={{ color: "#c27a00" }}>
        C <strong>{c}g</strong>
      </span>
      <span className="text-carvao/25">·</span>
      <span style={{ color: "#d4644a" }}>
        G <strong>{f}g</strong>
      </span>
    </div>
  );
}
