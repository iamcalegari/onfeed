import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { PasteLinkButton } from "@/components/PasteLinkButton";
import { getMe } from "@/lib/api";

export const metadata = { title: "Importar receita" };

export default async function ImportPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  // Cota de importação do dia — mostra "X/N grátis hoje" ANTES de o usuário
  // bater no gate (COST-03 UX): free descobre o limite de forma proativa, não
  // só quando é bloqueado. PRO não vê o contador (teto alto anti-abuso).
  const me = await getMe();
  const importDaily = me.limits?.importDaily;
  const importLeft = me.usage?.importLeft;
  const showQuota =
    !me.isPro && typeof importDaily === "number" && typeof importLeft === "number";

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

      {showQuota && (
        <p className="-mt-3 text-xs text-carvao/55">
          Plano grátis:{" "}
          <span className="font-semibold text-forest">
            {importLeft} de {importDaily}
          </span>{" "}
          importações restantes hoje.{" "}
          {importLeft === 0 && (
            <Link href="/plano" className="font-medium text-terracota">
              Assine o PRO para importar mais.
            </Link>
          )}
        </p>
      )}

      <PasteLinkButton />
    </div>
  );
}
