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
  const hasExtra = hit.missing.length > 0 || hit.cookableNow;

  return (
    <Link
      href={recipeHref(hit._id, haveIds)}
      className={`group block overflow-hidden rounded-2xl bg-surface transition-all duration-200 hover:-translate-y-px ${
        highlight
          ? "shadow-lift ring-1 ring-salvia/40"
          : "shadow-card ring-1 ring-areia/70 hover:shadow-lift"
      }`}
    >
      {/* Corpo horizontal: thumbnail + conteúdo */}
      <div className="flex">
        {/* Thumbnail — altura fixa, canto arredondado só na esquerda */}
        <LazyThumbnail
          recipeId={hit._id}
          initialUrl={hit.thumbnailUrl}
          className="h-27 w-27 shrink-0"
          rounded="rounded-none"
          iconClassName="text-4xl"
        />

        {/* Conteúdo */}
        <div className="flex min-w-0 flex-1 flex-col justify-between p-3">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-display text-[0.92rem] font-semibold leading-snug text-carvao line-clamp-2">
              <span className="mr-1">{flagEmoji(hit.country)}</span>
              {hit.title}
            </h3>
            <MatchScore score={hit.matchScore} />
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

      {/* Rodapé extra: ingredientes faltando / badge */}
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
