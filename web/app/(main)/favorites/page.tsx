import { auth } from "@clerk/nextjs/server";
import Link from "next/link";

import { FavoritesList } from "@/components/FavoritesList";
import { getFavorites } from "@/lib/api";

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

      <FavoritesList initialRecipes={recipes} />
    </div>
  );
}
