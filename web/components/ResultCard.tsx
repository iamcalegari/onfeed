import Link from "next/link";

import { flagEmoji, formatMinutes, recipeHref } from "@/lib/format";
import type { SearchHit } from "@/lib/types";
import { LazyThumbnail } from "./LazyThumbnail";
import { MatchScore } from "./MatchScore";
import { ScoreBars } from "./ScoreBars";

export function ResultCard({
  hit,
  haveIds,
  highlight,
}: {
  hit: SearchHit;
  haveIds: string[];
  highlight?: boolean;
}) {
  return (
    <Link
      href={recipeHref(hit._id, haveIds)}
      className={`group block rounded-2xl bg-surface p-3 shadow-card transition-all duration-200 hover:shadow-lift hover:-translate-y-px ${
        highlight
          ? "ring-1 ring-salvia/60"
          : "ring-1 ring-areia/80"
      }`}
    >
      <div className="flex gap-3">
        <LazyThumbnail
          recipeId={hit._id}
          initialUrl={hit.thumbnailUrl}
          className="h-20 w-20 shrink-0 overflow-hidden rounded-xl"
        />

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Título + score */}
          <div className="flex items-start justify-between gap-2">
            <h3 className="truncate font-display text-base font-semibold text-carvao leading-snug">
              <span className="mr-1">{flagEmoji(hit.country)}</span>
              {hit.title}
            </h3>
            <MatchScore score={hit.matchScore} />
          </div>

          {/* Intro */}
          <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-carvao/50">
            {hit.intro}
          </p>

          {/* Rodapé: barras + tempo */}
          <div className="mt-auto pt-2 flex items-end justify-between gap-2">
            <ScoreBars scores={hit.scores} />
            <span className="shrink-0 text-[11px] text-carvao/35 font-medium">
              {formatMinutes(hit.prepTimeMin)}
            </span>
          </div>

          {/* Ingredientes faltando */}
          {hit.missing.length > 0 && (
            <p className="mt-1.5 text-[11px] text-carvao/45 leading-snug">
              Faltando:{" "}
              <span className="text-terracota/80 font-medium">
                {hit.missing.map((m) => m.name).join(", ")}
              </span>
            </p>
          )}

          {/* Badge "dá pra fazer agora" */}
          {hit.cookableNow && (
            <span className="mt-2 w-fit rounded-full bg-forest/8 px-2.5 py-0.5 text-[10px] font-semibold text-forest">
              ✓ dá pra fazer agora
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
