import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { PasteLinkButton } from "@/components/PasteLinkButton";

export const metadata = { title: "Importar receita" };

export default async function ImportPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  return (
    <div className="flex flex-col gap-7">
      <header className="flex items-start justify-between gap-3 pt-2">
        <div>
          <h1 className="font-display text-[2rem] font-bold leading-tight text-forest">
            Importar receita
          </h1>
          <p className="mt-1.5 text-sm text-carvao/55 leading-relaxed">
            Cole o link de um vídeo de receita e a gente extrai os ingredientes e o passo a passo pra você.
          </p>
        </div>
        <Link
          href="/import/mine"
          className="mt-1 shrink-0 text-sm font-medium text-terracota"
        >
          Minhas importações
        </Link>
      </header>

      <PasteLinkButton />
    </div>
  );
}
