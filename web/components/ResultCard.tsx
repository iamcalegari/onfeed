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
      className={`block rounded-2xl border bg-white p-3 transition ${
        highlight ? "border-salvia" : "border-areia"
      }`}
    >
      <div className="flex gap-3">
        <LazyThumbnail
          recipeId={hit._id}
          initialUrl={hit.thumbnailUrl}
          className="h-20 w-20"
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-start justify-between gap-2">
            <h3 className="truncate font-display text-base font-semibold text-carvao">
              <span className="mr-1">{flagEmoji(hit.country)}</span>
              {hit.title}
            </h3>
            <MatchScore score={hit.matchScore} />
          </div>
          <p className="mt-0.5 line-clamp-2 text-xs text-carvao/55">
            {hit.intro}
          </p>
          <div className="mt-2 flex items-end justify-between gap-2">
            <ScoreBars scores={hit.scores} />
            <span className="text-[11px] text-carvao/40">
              {formatMinutes(hit.prepTimeMin)}
            </span>
          </div>
          {hit.missing.length > 0 && (
            <p className="mt-2 text-[11px] text-carvao/55">
              Faltando:{" "}
              <span className="text-carvao/80">
                {hit.missing.map((m) => m.name).join(", ")}
              </span>
            </p>
          )}
          {hit.cookableNow && (
            <span className="mt-2 w-fit rounded-full bg-salvia/20 px-2 py-0.5 text-[10px] font-medium text-forest">
              dá pra fazer agora
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
