import Link from "next/link";

import { flagEmoji, formatMinutes, recipeHref } from "@/lib/format";
import type { SearchHit } from "@/lib/types";
import { LazyThumbnail } from "./LazyThumbnail";
import { MatchScore } from "./MatchScore";
import { ScoreBars } from "./ScoreBars";

export type Rank = 1 | 2 | 3;

const MEDAL: Record<Rank, {
  color: string;
  label: string;
  shimmerColor: string;
  shimmerDuration: string;
  shimmerDelay: string;
  staticShadow?: string;
}> = {
  1: {
    color:           "#c9973b",
    label:           "1°",
    shimmerColor:    "rgba(255,222,100,0.45)",
    shimmerDuration: "2.8s",
    shimmerDelay:    "0.6s",
    // shadow handled by .medal-gold keyframe animation
  },
  2: {
    color:           "#9aa0a6",
    label:           "2°",
    shimmerColor:    "rgba(210,218,222,0.40)",
    shimmerDuration: "4s",
    shimmerDelay:    "1.8s",
    staticShadow:    "0 0 0 1.5px #9aa0a6, 0 0 14px rgba(154,160,166,0.32), 0 4px 16px rgba(154,160,166,0.16)",
  },
  3: {
    color:           "#a0663a",
    label:           "3°",
    shimmerColor:    "rgba(210,165,120,0.32)",
    shimmerDuration: "5.5s",
    shimmerDelay:    "3s",
    staticShadow:    "0 0 0 1.5px #a0663a, 0 0 8px rgba(160,102,58,0.22), 0 4px 12px rgba(160,102,58,0.10)",
  },
};

export function ResultCard({
  hit,
  haveIds,
  highlight,
  rank,
}: {
  hit: SearchHit;
  haveIds: string[];
  highlight?: boolean;
  rank?: Rank;
}) {
  const hasExtra = hit.missing.length > 0 || hit.cookableNow;
  const isPerfect = hit.matchScore >= 85;
  const medal = rank ? MEDAL[rank] : undefined;

  return (
    <Link
      href={recipeHref(hit._id, haveIds)}
      className={`group relative block overflow-hidden rounded-2xl bg-surface transition-all duration-200 hover:-translate-y-px ${
        medal
          ? rank === 1
            ? "medal-gold shadow-lift"
            : "shadow-lift"
          : highlight
          ? "shadow-lift ring-1 ring-salvia/40"
          : "shadow-card ring-1 ring-areia/70 hover:shadow-lift"
      }`}
      style={medal?.staticShadow ? { boxShadow: medal.staticShadow } : undefined}
    >
      {/* Reflexo / shimmer sweep */}
      {medal && (
        <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden rounded-2xl">
          <div
            className="absolute inset-y-0 w-[42%] bg-gradient-to-r from-transparent to-transparent"
            style={{
              backgroundImage: `linear-gradient(to right, transparent, ${medal.shimmerColor}, transparent)`,
              animation: `medal-shimmer ${medal.shimmerDuration} ease-in-out ${medal.shimmerDelay} infinite`,
            }}
          />
        </div>
      )}

      {/* Corpo horizontal: thumbnail + conteúdo */}
      <div className="flex">
        {/* Thumbnail com badge de medalha */}
        <div className="relative shrink-0">
          <LazyThumbnail
            recipeId={hit._id}
            initialUrl={hit.thumbnailUrl}
            className="h-27 w-27"
            rounded="rounded-none"
            iconClassName="text-4xl"
          />

          {/* Badge de medalha */}
          {medal && (
            <div
              className="absolute left-2 top-2 z-30 flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-extrabold text-white shadow-md"
              style={{
                backgroundColor: medal.color,
                boxShadow: `0 0 0 1.5px rgba(255,255,255,0.35), 0 2px 8px rgba(0,0,0,0.25)`,
              }}
            >
              {medal.label}
            </div>
          )}
        </div>

        {/* Conteúdo */}
        <div className="flex min-w-0 flex-1 flex-col justify-between p-3">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-display text-[0.92rem] font-semibold leading-snug text-carvao line-clamp-2">
              <span className="mr-1">{flagEmoji(hit.country)}</span>
              {hit.title}
            </h3>
            <MatchScore score={hit.matchScore} rank={rank} />
          </div>

          <p className="mt-1 line-clamp-1 text-[0.72rem] leading-relaxed text-carvao/45">
            {hit.intro}
          </p>

          <div className="mt-2 flex items-end justify-between">
            <ScoreBars scores={hit.scores} />
            <span className="text-[11px] font-medium text-carvao/35">
              {formatMinutes(hit.prepTimeMin)}
            </span>
          </div>
        </div>
      </div>

      {/* Banner "match perfeito" */}
      {isPerfect && (
        <div
          className="flex items-center gap-2 px-3 py-2"
          style={{
            background: "linear-gradient(90deg, rgba(22,47,37,0.07) 0%, rgba(22,47,37,0.12) 50%, rgba(22,47,37,0.07) 100%)",
          }}
        >
          <span
            className="text-xs text-[#c9973b]"
            style={{ animation: "star-spin 3s linear infinite", display: "inline-block" }}
          >
            ✦
          </span>
          <span className="text-[11px] font-bold text-forest tracking-wide">
            Essa receita é perfeita pra você
          </span>
        </div>
      )}

      {/* Rodapé: ingredientes faltando / cookableNow */}
      {hasExtra && (
        <div className="flex flex-wrap items-center gap-2 border-t border-areia/50 px-3 py-2">
          {hit.cookableNow && (
            <span className="rounded-full bg-forest/8 px-2.5 py-0.5 text-[10px] font-semibold text-forest">
              ✓ dá pra fazer agora
            </span>
          )}
          {hit.missing.length > 0 && (
            <p className="truncate text-[10px] text-carvao/40">
              Falta:{" "}
              <span className="font-medium text-terracota/70">
                {hit.missing.map((m) => m.name).join(", ")}
              </span>
            </p>
          )}
        </div>
      )}
    </Link>
  );
}
