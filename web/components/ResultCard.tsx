import Link from "next/link";

import { flagEmoji, formatMinutes, recipeHref } from "@/lib/format";
import type { DimensionScores, SearchHit } from "@/lib/types";
import { LazyThumbnail } from "./LazyThumbnail";

export type Rank = 1 | 2 | 3;

/* ── Tier (score → cor + label) ─────────────────────────────── */
function tierOf(score: number): { color: string; tier: string } {
  if (score >= 80) return { color: "#2d7d4e", tier: "ótimo" };
  if (score >= 72) return { color: "#7a9e3a", tier: "bom" };
  if (score >= 60) return { color: "#c27a00", tier: "ok" };
  return { color: "#d4644a", tier: "fraco" };
}

/* ── Gauge circular SVG ──────────────────────────────────────── */
function ScoreGauge({ score }: { score: number }) {
  const size = 56, stroke = 5;
  const r = (size - stroke) / 2;
  const C = 2 * Math.PI * r;
  const cx = size / 2, cy = size / 2;
  const { color, tier } = tierOf(score);
  const len = (score / 100) * C;

  return (
    <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
      <div style={{ position: "relative", width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f0eadd" strokeWidth={stroke} />
          <circle
            cx={cx} cy={cy} r={r} fill="none"
            stroke={color} strokeWidth={stroke}
            strokeDasharray={`${len} ${C - len}`}
            strokeLinecap="round"
            transform={`rotate(-90 ${cx} ${cy})`}
            style={{ transition: "stroke-dasharray .6s ease" }}
          />
        </svg>
        <div style={{
          position: "absolute", inset: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <span style={{
            fontFamily: "var(--font-display)", fontSize: 22, lineHeight: 1,
            color, fontVariantNumeric: "tabular-nums",
          }}>
            {score}
          </span>
        </div>
      </div>
      <span style={{
        fontSize: 9.5, fontWeight: 800, letterSpacing: .6,
        textTransform: "uppercase", color,
      }}>
        {tier}
      </span>
    </div>
  );
}

/* ── Match Breakdown (2×2 grid de barrinhas pontuadas) ───────── */
const FACTORS: { label: string; key: keyof DimensionScores; color: string }[] = [
  { label: "Ingredientes", key: "i", color: "#2d7d4e" },
  { label: "Equipamento",  key: "e", color: "#7a9e94" },
  { label: "Tempo",        key: "t", color: "#c27a00" },
  { label: "Nutrição",     key: "n", color: "#4a7fcb" },
];

function MatchBreakdown({ scores }: { scores: DimensionScores }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 16px" }}>
      {FACTORS.map(f => {
        const val = Math.round(Math.max(0, Math.min(1, scores[f.key])) * 5);
        return (
          <div key={f.key} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 10.5, fontWeight: 700, color: "#5c5c57" }}>{f.label}</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: f.color, fontVariantNumeric: "tabular-nums" }}>
                {val}/5
              </span>
            </div>
            <div style={{ display: "flex", gap: 3 }}>
              {[0,1,2,3,4].map(seg => (
                <div
                  key={seg}
                  style={{
                    flex: 1, height: 5, borderRadius: 3,
                    background: seg < val ? f.color : "#efe7d8",
                  }}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Rank badge configs ──────────────────────────────────────── */
const RANK_CONFIG: Record<Rank, { icon: string; bg: string; fg: string }> = {
  1: { icon: "🥇", bg: "#fdf0d2", fg: "#9a6b00" },
  2: { icon: "🥈", bg: "#eef0f2", fg: "#5c6770" },
  3: { icon: "🥉", bg: "#f6e4d6", fg: "#9a5a32" },
};

/* ── ResultCard ──────────────────────────────────────────────── */
export function ResultCard({
  hit,
  haveIds,
  rank,
  baseIngredients = [],
}: {
  hit: SearchHit;
  haveIds: string[];
  highlight?: boolean;
  rank?: Rank;
  baseIngredients?: string[];
}) {
  const rk = rank ? RANK_CONFIG[rank] : null;
  const flag = flagEmoji(hit.country);
  const missing = hit.missing.map(m => m.name).join(", ");
  const hasFalta = missing.length > 0;

  return (
    <Link
      href={recipeHref(hit._id, haveIds, baseIngredients.length ? baseIngredients : undefined)}
      style={{
        background: "#fff",
        border: "1px solid #f0e4d2",
        borderRadius: 20,
        overflow: "hidden",
        display: "flex",
        cursor: "pointer",
        boxShadow: "0 6px 18px -12px rgba(22,47,37,.2)",
        textDecoration: "none",
        transition: "transform .14s ease, box-shadow .14s ease",
      }}
    >
      {/* Imagem — estica até a altura do card */}
      <div style={{
        width: 138, flexShrink: 0, alignSelf: "stretch", position: "relative",
        minHeight: 170,
      }}>
        <LazyThumbnail
          recipeId={hit._id}
          initialUrl={hit.thumbnailUrl}
          className="h-full w-full"
          rounded="rounded-none"
          iconClassName="text-4xl"
        />

        {/* Badge de rank */}
        {rk && (
          <div style={{
            position: "absolute", top: 10, left: 10,
            display: "flex", alignItems: "center", gap: 5,
            background: rk.bg, color: rk.fg,
            fontSize: 11, fontWeight: 800,
            padding: "4px 9px", borderRadius: 20,
            boxShadow: "0 2px 6px rgba(0,0,0,.18)",
          }}>
            <span>{rk.icon}</span>
            {rank}º
          </div>
        )}
      </div>

      {/* Conteúdo */}
      <div style={{
        flex: 1, minWidth: 0,
        padding: "15px 16px",
        display: "flex", flexDirection: "column",
      }}>

        {/* Título + gauge */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, color: "#7a9e94", fontWeight: 600, display: "flex", alignItems: "center", gap: 5 }}>
              {flag} {hit.country}
            </div>
            <div style={{
              fontFamily: "var(--font-display)", fontSize: 18.5,
              color: "#162f25", lineHeight: 1.18, marginTop: 3,
            }}>
              {hit.title}
            </div>
          </div>
          <ScoreGauge score={hit.matchScore} />
        </div>

        {/* Descrição */}
        <div style={{
          fontSize: 12.5, color: "#6c726a", lineHeight: 1.45, marginTop: 8,
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        } as React.CSSProperties}>
          {hit.intro}
        </div>

        {/* Match breakdown */}
        <div style={{ marginTop: 12 }}>
          <MatchBreakdown scores={hit.scores} />
        </div>

        {/* Rodapé */}
        <div style={{
          marginTop: 13, paddingTop: 12,
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
          borderTop: "1px solid #f3ece0",
        }}>
          <div style={{
            fontSize: 11.5, color: "#9aa39b", fontWeight: 500,
            minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {hasFalta
              ? <><span style={{ color: "#b06a55", fontWeight: 700 }}>Falta:</span> {missing}</>
              : <span style={{ color: "#2d7d4e", fontWeight: 700 }}>✓ Você tem tudo</span>
            }
          </div>
          <span style={{
            flexShrink: 0, fontSize: 12, color: "#7a9e94",
            fontWeight: 700, fontVariantNumeric: "tabular-nums",
          }}>
            ⏱ {formatMinutes(hit.prepTimeMin)}
          </span>
        </div>
      </div>
    </Link>
  );
}
