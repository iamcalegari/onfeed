import { auth } from "@clerk/nextjs/server";
import Link from "next/link";

import { listMyImportsAction } from "@/app/actions";
import { ImportsList } from "@/components/ImportsList";

export default async function ImportMinePage() {
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
          Minhas importações
        </h1>
        <p className="text-sm text-carvao/60">
          Entre na sua conta pra ver suas receitas importadas.
        </p>
      </div>
    );
  }

  const items = await listMyImportsAction();

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold text-forest">
          Minhas importações
        </h1>
        <Link href="/import" className="text-sm font-medium text-terracota">
          Importar
        </Link>
      </header>

      <ImportsList initialItems={items} />
    </div>
  );
}
