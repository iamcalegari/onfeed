import { notFound } from "next/navigation";
import Link from "next/link";

import { BackButton } from "@/components/BackButton";
import { LazyThumbnail } from "@/components/LazyThumbnail";
import { getRecipe, getRecipeVariants } from "@/lib/api";
import { flagEmoji, formatMinutes } from "@/lib/format";
import type { Recipe } from "@/lib/types";

export default async function VariantsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [recipe, { count, variants }] = await Promise.all([
    getRecipe(id),
    getRecipeVariants(id),
  ]);

  if (!recipe) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <BackButton className="w-fit text-sm font-medium text-terracota">
          ← voltar
        </BackButton>
        <h1 className="font-display text-2xl font-bold text-carvao">
          Variantes
        </h1>
        <p className="text-sm text-carvao/55">
          {count} variante{count !== 1 ? "s" : ""} de{" "}
          <Link href={`/recipe/${recipe._id}`} className="font-medium text-carvao/75 underline-offset-2 hover:underline">
            {recipe.title}
          </Link>
        </p>
      </div>

      {count === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <span className="text-4xl">✦</span>
          <p className="text-sm text-carvao/50">
            Nenhuma variante ainda. Adapte a receita para criar a primeira!
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-4">
          {variants.map((v) => (
            <VariantCard key={v._id} variant={v} />
          ))}
        </ul>
      )}
    </div>
  );
}

function VariantCard({ variant }: { variant: Recipe }) {
  const creators = variant.createdBy ?? [];

  return (
    <li>
      <Link
        href={`/recipe/${variant._id}`}
        className="variant-glow flex overflow-hidden rounded-2xl bg-surface transition-all hover:-translate-y-px"
      >
        {/* Thumbnail */}
        <div className="relative shrink-0">
          <LazyThumbnail
            recipeId={variant._id}
            initialUrl={variant.thumbnailUrl}
            className="h-28 w-28"
            rounded="rounded-none"
            iconClassName="text-4xl"
          />
          <div className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-carvao/70 px-2 py-0.5 backdrop-blur-sm">
            <span className="text-[9px] text-amber-300">✦</span>
            <span className="text-[9px] font-bold uppercase tracking-wide text-amber-200">
              Variante
            </span>
          </div>
        </div>

        {/* Info */}
        <div className="flex min-w-0 flex-1 flex-col justify-between p-3">
          <div>
            <h3 className="font-display text-[0.92rem] font-semibold leading-snug text-carvao line-clamp-2">
              <span className="mr-1">{flagEmoji(variant.country)}</span>
              {variant.title}
            </h3>
            <p className="mt-1 line-clamp-2 text-[0.72rem] leading-relaxed text-carvao/45">
              {variant.intro}
            </p>
          </div>

          <div className="mt-2 flex items-end justify-between">
            {creators.length > 0 && (
              <p className="truncate text-[10px] text-amber-600">
                Por{" "}
                {creators.map((c, i) => (
                  <span key={c.userId}>
                    {i > 0 && ", "}@{c.username}
                  </span>
                ))}
              </p>
            )}
            <span className="ml-auto shrink-0 text-[11px] font-medium text-carvao/35">
              {formatMinutes(variant.prepTimeMin)}
            </span>
          </div>
        </div>
      </Link>
    </li>
  );
}
