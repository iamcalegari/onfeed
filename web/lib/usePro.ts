"use client";

import { useEffect, useState } from "react";

import { getProState, hydrateProFromServer, type ProSnapshot } from "./proStorage";

const EMPTY: ProSnapshot = {
  isPro: false,
  searchesUsed: 0,
  adaptUsed: 0,
  searchesLeft: 10,
  adaptLeft: 3,
};

/**
 * Lê o estado PRO/FREE e re-renderiza quando ele muda — tanto na mesma aba
 * (evento "onfeed:pro:change") quanto entre abas (evento "storage").
 *
 * Inicia com EMPTY no SSR/primeiro paint pra evitar hydration mismatch e
 * sincroniza no effect.
 */
export function usePro(): ProSnapshot {
  const [snap, setSnap] = useState<ProSnapshot>(EMPTY);

  useEffect(() => {
    const sync = () => setSnap(getProState());
    sync();
    // A autoridade do entitlement é o servidor; hidrata e o write() interno
    // dispara "onfeed:pro:change", que re-renderiza via o listener abaixo.
    void hydrateProFromServer();
    window.addEventListener("onfeed:pro:change", sync);
    window.addEventListener("storage", sync);
    window.addEventListener("focus", sync);
    return () => {
      window.removeEventListener("onfeed:pro:change", sync);
      window.removeEventListener("storage", sync);
      window.removeEventListener("focus", sync);
    };
  }, []);

  return snap;
}
