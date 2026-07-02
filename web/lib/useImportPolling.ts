"use client";

import { useEffect, useRef, useState } from "react";

import { getImportJobAction } from "@/app/actions";
import type { ImportJob } from "@/lib/types";

const POLL_INTERVAL_MS = 2_000;
const POLL_TIMEOUT_MS = 10 * 60_000; // 10 min

/**
 * Polling do status de um job de importação (tela de progresso, CAP-01):
 *  - loop via setTimeout-recursion (nunca setInterval — evita requests
 *    sobrepostas), reagendando só depois que a request anterior resolveu.
 *  - para quando o status chega a um estado terminal (ready_for_review/failed).
 *  - em erro de rede transiente, mantém tentando (não mata o loop).
 *  - diferente de useLazyThumbnail (que fica silencioso após o timeout — a
 *    thumbnail é um detalhe de fundo), esta tela é ativamente observada pelo
 *    usuário: após POLL_TIMEOUT_MS sem status terminal, expõe `timedOut: true`
 *    explicitamente para o componente renderizar o aviso de demora (Pitfall 2).
 */
export function useImportPolling(jobId: string, initialJob: ImportJob) {
  const [job, setJob] = useState<ImportJob>(initialJob);
  const [timedOut, setTimedOut] = useState(false);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedAtRef = useRef<number>(Date.now());

  // Limpa o timer ao desmontar.
  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (job.status === "ready_for_review" || job.status === "failed") {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
      return;
    }

    function schedulePoll() {
      pollTimerRef.current = setTimeout(async () => {
        if (Date.now() - startedAtRef.current > POLL_TIMEOUT_MS) {
          setTimedOut(true); // aviso explícito — nunca ficar silencioso (Pitfall 2)
          return;
        }
        try {
          const next = await getImportJobAction(jobId);
          setJob(next);
          if (next.status !== "ready_for_review" && next.status !== "failed") {
            schedulePoll();
          }
        } catch {
          schedulePoll(); // erro de rede transiente — continua tentando
        }
      }, POLL_INTERVAL_MS);
    }

    schedulePoll();
    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, [jobId, job.status]);

  return { job, timedOut };
}
