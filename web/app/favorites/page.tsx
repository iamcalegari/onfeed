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
        <h1 className="text-xl font-bold">Favoritos</h1>
        <p className="text-sm text-stone-500">
          Entre na sua conta pra ver suas receitas salvas.
        </p>
      </div>
    );
  }

  const recipes = await getFavorites();

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Favoritos</h1>
        <Link href="/" className="text-sm text-emerald-700">
          ← buscar
        </Link>
      </header>

      {recipes.length === 0 ? (
        <p className="text-sm text-stone-500">
          Nada salvo ainda — favorite receitas pelo coração.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {recipes.map((r) => (
            <Link
              key={r._id}
              href={`/recipe/${r._id}`}
              className="flex gap-3 rounded-xl border border-stone-200 bg-white p-3"
            >
              {r.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={r.thumbnailUrl}
                  alt=""
                  className="h-16 w-16 shrink-0 rounded-lg object-cover"
                />
              ) : (
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-xl">
                  🍽️
                </div>
              )}
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-sm font-semibold">
                  <span className="mr-1">{flagEmoji(r.country)}</span>
                  {r.title}
                </h3>
                <p className="line-clamp-2 text-xs text-stone-500">{r.intro}</p>
                <span className="text-[11px] text-stone-400">
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
