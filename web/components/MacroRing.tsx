"use client";

import { useEffect, useRef } from "react";

export interface MacroRingData {
  proteinKcal:   number;
  carbsKcal:     number;
  fatKcal:       number;
  goalKcal:      number;
}

const COLORS = {
  protein:   "#4a7fcb",
  carb:      "#e8a020",
  fat:       "#d4644a",
  remaining: "#e0c9a6",
};

const GAP_DEG = 2.5; // gap em graus entre cada arco

export function MacroRing({
  data,
  size = 200,
  strokeWidth = 14,
}: {
  data: MacroRingData;
  size?: number;
  strokeWidth?: number;
}) {
  const center = size / 2;
  const radius = center - strokeWidth;
  const circumference = 2 * Math.PI * radius;

  const consumedKcal  = data.proteinKcal + data.carbsKcal + data.fatKcal;
  const remainingKcal = Math.max(0, data.goalKcal - consumedKcal);
  const total         = data.goalKcal || 1;

  // Frações (0..1)
  const pFrac = Math.min(data.proteinKcal / total, 1);
  const cFrac = Math.min(data.carbsKcal   / total, 1);
  const fFrac = Math.min(data.fatKcal     / total, 1);
  const rFrac = Math.max(0, remainingKcal / total);

  // Comprimentos de arco em unidades do circumference
  const gap     = (GAP_DEG / 360) * circumference;
  const arcs    = buildArcs([pFrac, cFrac, fFrac, rFrac], circumference, gap);

  const kcalRemaining = Math.round(remainingKcal);
  const pct = Math.round((consumedKcal / total) * 100);

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="absolute inset-0">
        {/* Track background */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="var(--color-areia)"
          strokeWidth={strokeWidth * 0.5}
          strokeOpacity={0.4}
        />

        {/* Protein arc */}
        <Arc
          cx={center}
          cy={center}
          r={radius}
          strokeWidth={strokeWidth}
          color={COLORS.protein}
          {...arcs[0]}
          delay={0}
        />
        {/* Carbs arc */}
        <Arc
          cx={center}
          cy={center}
          r={radius}
          strokeWidth={strokeWidth}
          color={COLORS.carb}
          {...arcs[1]}
          delay={0.1}
        />
        {/* Fat arc */}
        <Arc
          cx={center}
          cy={center}
          r={radius}
          strokeWidth={strokeWidth}
          color={COLORS.fat}
          {...arcs[2]}
          delay={0.2}
        />
        {/* Remaining arc */}
        <Arc
          cx={center}
          cy={center}
          r={radius}
          strokeWidth={strokeWidth * 0.55}
          color={COLORS.remaining}
          {...arcs[3]}
          delay={0.3}
          opacity={0.6}
        />
      </svg>

      {/* Centro */}
      <div className="flex flex-col items-center justify-center gap-0.5 text-center">
        <span
          className="font-display font-bold tabular-nums leading-none"
          style={{ fontSize: size * 0.2, color: "var(--color-forest)" }}
        >
          {kcalRemaining.toLocaleString("pt-BR")}
        </span>
        <span
          className="font-medium uppercase tracking-wide"
          style={{ fontSize: size * 0.075, color: "var(--color-carvao)", opacity: 0.45 }}
        >
          kcal restantes
        </span>
        {pct > 0 && (
          <span
            className="font-semibold tabular-nums"
            style={{ fontSize: size * 0.075, color: "var(--color-carvao)", opacity: 0.5 }}
          >
            {pct}% consumido
          </span>
        )}
      </div>
    </div>
  );
}

/* ── Helpers ─────────────────────────────────────────────────── */

interface ArcParams {
  dashArray: string;
  dashOffset: number;
}

function buildArcs(fracs: number[], circ: number, gap: number): ArcParams[] {
  // Aplica gaps entre segmentos não-zero
  const adjusted = fracs.map((f) => Math.max(0, f * circ - gap));
  const result: ArcParams[] = [];
  let cursor = 0; // offset acumulado (quanto já foi percorrido)

  for (const arcLen of adjusted) {
    const offset = circ * 0.25 - cursor; // 0.25 = começa no topo (12h)
    result.push({
      dashArray:  `${arcLen} ${circ - arcLen}`,
      dashOffset: offset,
    });
    cursor += arcLen + gap;
  }
  return result;
}

function Arc({
  cx, cy, r, strokeWidth, color, dashArray, dashOffset, delay = 0, opacity = 1,
}: {
  cx: number; cy: number; r: number;
  strokeWidth: number;
  color: string;
  dashArray: string;
  dashOffset: number;
  delay?: number;
  opacity?: number;
}) {
  const ref = useRef<SVGCircleElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.transition = "none";
    el.style.strokeDasharray = "0 9999";
    el.style.strokeDashoffset = String(dashOffset);
    const frame = requestAnimationFrame(() => {
      el.style.transition = `stroke-dasharray 0.85s cubic-bezier(0.34,1.4,0.64,1) ${delay}s`;
      el.style.strokeDasharray = dashArray;
    });
    return () => cancelAnimationFrame(frame);
  }, [dashArray, dashOffset, delay]);

  return (
    <circle
      ref={ref}
      cx={cx}
      cy={cy}
      r={r}
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeDasharray={dashArray}
      strokeDashoffset={dashOffset}
      style={{ opacity }}
      transform={`rotate(-90 ${cx} ${cy})`}
    />
  );
}
