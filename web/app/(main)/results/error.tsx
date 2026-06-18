"use client";

import Link from "next/link";

export default function ResultsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isApiDown = error.message?.includes("Busca falhou");

  return (
    <div className="flex flex-col items-center gap-6 py-16 text-center">
      <p className="text-4xl">🍳</p>
      <div className="flex flex-col gap-1">
        <p className="font-display text-lg font-semibold text-forest">
          {isApiDown ? "Serviço temporariamente indisponível" : "Algo deu errado"}
        </p>
        <p className="text-sm text-carvao/60">
          {isApiDown
            ? "O servidor está atualizando. Tente novamente em alguns instantes."
            : "Ocorreu um erro inesperado ao buscar receitas."}
        </p>
      </div>
      <div className="flex gap-3">
        <button
          onClick={reset}
          className="rounded-xl bg-forest px-4 py-2 text-sm font-medium text-creme"
        >
          Tentar de novo
        </button>
        <Link
          href="/"
          className="rounded-xl border border-areia px-4 py-2 text-sm font-medium text-carvao"
        >
          Nova busca
        </Link>
      </div>
    </div>
  );
}
