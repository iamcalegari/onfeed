"use client";

import { useEffect, useRef, useState } from "react";

import { getThumbnailUrlAction, triggerThumbnailAction } from "@/app/actions";

const POLL_INTERVAL_MS = 3_000;
const POLL_TIMEOUT_MS = 120_000; // 2 min — Bedrock nunca passa disso

/**
 * Geração lazy de thumbnail com fire-and-forget + polling:
 *  1. Quando o elemento entra na viewport, dispara POST /thumbnail (retorna 202
 *     imediatamente — não bloqueia).
 *  2. Faz polling no GET /thumbnail a cada 3s até a URL aparecer no DB.
 *  3. Para o polling quando a URL chega ou após 2 min (timeout).
 *
 * Isso resolve o problema do fluxo síncrono anterior, onde a conexão podia
 * cair antes de Bedrock (~15-30s) terminar, deixando a imagem nunca aparecer.
 */
export function useLazyThumbnail(recipeId: string, initialUrl: string) {
  const [url, setUrl] = useState(initialUrl);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const startedRef = useRef(false);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedAtRef = useRef<number>(0);

  // Limpa polling ao desmontar
  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (url || startedRef.current) return;
    const el = ref.current;
    if (!el) return;

    function stopPolling() {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
      setLoading(false);
    }

    function schedulePoll() {
      pollTimerRef.current = setTimeout(async () => {
        if (Date.now() - startedAtRef.current > POLL_TIMEOUT_MS) {
          stopPolling();
          return;
        }
        try {
          const { thumbnailUrl } = await getThumbnailUrlAction(recipeId);
          if (thumbnailUrl) {
            setUrl(thumbnailUrl);
            stopPolling();
          } else {
            schedulePoll(); // ainda gerando — tenta de novo
          }
        } catch {
          stopPolling(); // erro de rede — para silenciosamente
        }
      }, POLL_INTERVAL_MS);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.some((e) => e.isIntersecting);
        if (!visible || startedRef.current) return;
        startedRef.current = true;
        observer.disconnect();

        setLoading(true);
        startedAtRef.current = Date.now();

        // Dispara geração (não-bloqueante) e começa polling
        triggerThumbnailAction(recipeId).catch(() => {});
        schedulePoll();
      },
      { rootMargin: "200px" },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [recipeId, url]);

  return { ref, url, loading };
}
