import Link from "next/link";

import { flagEmoji, formatMinutes, recipeHref } from "@/lib/format";
import type { SearchHit } from "@/lib/types";
import { LazyThumbnail } from "./LazyThumbnail";
import { MatchScore } from "./MatchScore";
import { ScoreBars } from "./ScoreBars";

type Rank = 1 | 2 | 3;

const MEDAL: Record<Rank, { color: string; glow: string; label: string }> = {
  1: { color: "#c9973b", glow: "rgba(201,151,59,0.22)", label: "1°" },
  2: { color: "#9aa0a6", glow: "rgba(154,160,166,0.12)", label: "2°" },
  3: { color: "#a0663a", glow: "rgba(160,102,58,0.12)", label: "3°" },
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

  const cardStyle = medal
    ? {
        boxShadow: `0 0 0 2px ${medal.color}, 0 4px 16px ${medal.glow}`,
      }
    : undefined;

  return (
    <Link
      href={recipeHref(hit._id, haveIds)}
      className={`group block overflow-hidden rounded-2xl bg-surface transition-all duration-200 hover:-translate-y-px ${
        medal
          ? "shadow-lift"
          : highlight
          ? "shadow-lift ring-1 ring-salvia/40"
          : "shadow-card ring-1 ring-areia/70 hover:shadow-lift"
      }`}
      style={cardStyle}
    >
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
          {medal && (
            <div
              className="absolute left-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-extrabold text-white shadow-sm"
              style={{ backgroundColor: medal.color }}
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

      {/* Banner "combinação perfeita" */}
      {isPerfect && (
        <div className="flex items-center gap-1.5 bg-forest/8 px-3 py-1.5">
          <span className="text-[10px] text-forest">✦</span>
          <span className="text-[11px] font-semibold text-forest">
            Essa receita é perfeita pra você
          </span>
        </div>
      )}

      {/* Rodapé: ingredientes faltando / badge */}
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
