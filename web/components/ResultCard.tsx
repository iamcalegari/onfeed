import Link from "next/link";

import { flagEmoji, formatMinutes, recipeHref } from "@/lib/format";
import type { SearchHit } from "@/lib/types";
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
      className={`block rounded-xl border bg-white p-3 transition ${
        highlight ? "border-amber-400 ring-2 ring-amber-200" : "border-stone-200"
      }`}
    >
      <div className="flex gap-3">
        <Thumbnail url={hit.thumbnailUrl} />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-start justify-between gap-2">
            <h3 className="truncate text-sm font-semibold">
              <span className="mr-1">{flagEmoji(hit.country)}</span>
              {hit.title}
            </h3>
            <MatchScore score={hit.matchScore} />
          </div>
          <p className="mt-0.5 line-clamp-2 text-xs text-stone-500">
            {hit.intro}
          </p>
          <div className="mt-2 flex items-end justify-between gap-2">
            <ScoreBars scores={hit.scores} />
            <span className="text-[11px] text-stone-400">
              {formatMinutes(hit.prepTimeMin)}
            </span>
          </div>
          {hit.missing.length > 0 && (
            <p className="mt-2 text-[11px] text-stone-500">
              Faltando:{" "}
              <span className="text-stone-700">
                {hit.missing.map((m) => m.name).join(", ")}
              </span>
            </p>
          )}
          {hit.cookableNow && (
            <span className="mt-2 w-fit rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
              dá pra fazer agora
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

function Thumbnail({ url }: { url: string }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={url}
        alt=""
        className="h-20 w-20 shrink-0 rounded-lg object-cover"
      />
    );
  }
  return (
    <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-2xl">
      🍽️
    </div>
  );
}
