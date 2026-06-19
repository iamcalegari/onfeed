import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { getPantryAction } from "@/app/actions";
import { PantryManager } from "@/components/PantryManager";

export const metadata = { title: "Despensa" };

export default async function PantryPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const items = await getPantryAction();

  return (
    <div className="flex flex-col gap-7">
      <header className="pt-2">
        <h1 className="font-display text-[2rem] font-bold leading-tight text-forest">
          Minha despensa
        </h1>
        <p className="mt-1.5 text-sm text-carvao/55 leading-relaxed">
          Guarde o que você tem em casa. Na próxima vez, um toque e já busca.
        </p>
      </header>

      <PantryManager initial={items} />
    </div>
  );
}
