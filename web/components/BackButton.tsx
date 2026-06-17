"use client";

import { useRouter } from "next/navigation";

/**
 * Volta para a página anterior pelo histórico (router.back), preservando o
 * estado dela — ex.: /results com os query params da busca. Um Link fixo para
 * "/results" perderia os params e refaria uma busca vazia.
 */
export function BackButton({
  children,
  className,
  fallbackHref = "/",
}: {
  children: React.ReactNode;
  className?: string;
  fallbackHref?: string;
}) {
  const router = useRouter();

  function onClick() {
    // sem histórico (ex.: link aberto direto) → vai pro fallback
    if (typeof window !== "undefined" && window.history.length <= 1) {
      router.push(fallbackHref);
    } else {
      router.back();
    }
  }

  return (
    <button type="button" onClick={onClick} className={className}>
      {children}
    </button>
  );
}
