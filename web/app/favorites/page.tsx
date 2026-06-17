import { auth } from "@clerk/nextjs/server";
import Link from "next/link";

import { getFavorites } from "@/lib/api";
import { flagEmoji, formatMinutes } from "@/lib/format";

export default async function FavoritesPage() {
  let userId: string | null = null;
  try {
    userId = (await auth()).userId;
  } catch {
    userId = null;
  }

  if (!userId) {
    return (
      <div className="flex flex-col gap-3">
        <h1 className="font-display text-2xl font-semibold text-forest">
          Favoritos
        </h1>
        <p className="text-sm text-carvao/60">
          Entre na sua conta pra ver suas receitas salvas.
        </p>
      </div>
    );
  }

  const recipes = await getFavorites();

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold text-forest">
          Favoritos
        </h1>
        <Link href="/" className="text-sm font-medium text-terracota">
          buscar
        </Link>
      </header>

      {recipes.length === 0 ? (
        <p className="text-sm text-carvao/60">
          Nada salvo ainda — favorite receitas pelo coração.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {recipes.map((r) => (
            <Link
              key={r._id}
              href={`/recipe/${r._id}`}
              className="flex gap-3 rounded-2xl border border-areia bg-white p-3"
            >
              {r.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={r.thumbnailUrl}
                  alt=""
                  className="h-16 w-16 shrink-0 rounded-xl object-cover"
                />
              ) : (
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-areia/30 text-xl">
                  🍽️
                </div>
              )}
              <div className="min-w-0 flex-1">
                <h3 className="truncate font-display text-base font-semibold text-carvao">
                  <span className="mr-1">{flagEmoji(r.country)}</span>
                  {r.title}
                </h3>
                <p className="line-clamp-2 text-xs text-carvao/55">{r.intro}</p>
                <span className="text-[11px] text-carvao/40">
                  {formatMinutes(r.prepTimeMin)}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
