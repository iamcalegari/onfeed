export function MacroPill({
  label,
  value,
  goal,
  unit,
  color,
  icon,
}: {
  label: string;
  value: number;
  goal: number;
  unit: string;
  color: string;
  icon: string;
}) {
  const pct = goal > 0 ? Math.min(100, Math.round((value / goal) * 100)) : 0;
  const over = value > goal;

  return (
    <div className="flex flex-col gap-1.5 rounded-2xl bg-surface p-3 shadow-card ring-1 ring-areia/60">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-carvao/40">
          <span>{icon}</span> {label}
        </span>
        <span
          className="text-[10px] font-semibold tabular-nums"
          style={{ color: over ? "#c27a00" : "var(--color-carvao)", opacity: over ? 1 : 0.45 }}
        >
          {over ? "+" : ""}{Math.round(value - goal)}{unit === "kcal" ? "" : unit} {over ? "acima" : "restam"}
        </span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="font-display text-xl font-bold tabular-nums" style={{ color }}>
          {Math.round(value)}
        </span>
        <span className="text-xs text-carvao/35">/ {Math.round(goal)}{unit}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-areia/40">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{
            width: `${pct}%`,
            backgroundColor: over ? "#c27a00" : color,
          }}
        />
      </div>
    </div>
  );
}
