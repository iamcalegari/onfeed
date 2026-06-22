"use client";

import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Detecta mudanças de sessão (login/logout) e chama router.refresh() para
 * invalidar o cache de RSC do Next.js e re-renderizar os Server Components
 * com o novo estado de auth — sem precisar de um reload completo da página.
 */
export function SessionRefresher() {
  const { isSignedIn } = useAuth();
  const router = useRouter();
  const prevRef = useRef<boolean | undefined>(undefined);

  useEffect(() => {
    if (prevRef.current !== undefined && prevRef.current !== isSignedIn) {
      router.refresh();
    }
    prevRef.current = isSignedIn;
  }, [isSignedIn, router]);

  return null;
}
