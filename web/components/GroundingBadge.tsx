import type { GroundingLevel } from "@/lib/types";

/**
 * Pill de "confira isto" para campos inferidos/imprecisos de uma receita
 * importada (REV-02). Sistema de 2 estados, não 3-color traffic-lighting:
 * `grounded` = ausência de badge (neutro), nunca um badge verde/check —
 * ver UI-SPEC §Grounding Badge Palette.
 */
export function GroundingBadge({ level }: { level: GroundingLevel }) {
  if (level === "grounded") return null;

  const label =
    level === "inferred" ? "Confira isto — inferido" : "Confira isto — impreciso";

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
      style={{
        background: "var(--t-warn-bg)",
        color: "var(--t-warn-fg)",
        border: "1px solid color-mix(in srgb, var(--t-warn-fg) 25%, transparent)",
      }}
    >
      {label}
    </span>
  );
}
