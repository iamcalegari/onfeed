"use client";

import { useEffect, useRef, useState } from "react";

import { generateThumbnailAction } from "@/app/actions";

/**
 * Geração lazy de thumbnail disparada por VISIBILIDADE: só gera (Bedrock→S3)
 * quando o card entra na viewport, e uma única vez. Isso controla o custo —
 * receitas que o usuário nunca rola até ver não geram imagem.
 *
 * Liga o `ref` retornado no elemento da imagem/card. Reusa a action existente;
 * o backend persiste a URL, então a próxima visita já vem com `initialUrl`.
 */
export function useLazyThumbnail(recipeId: string, initialUrl: string) {
  const [url, setUrl] = useState(initialUrl);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  // evita disparar a geração mais de uma vez por card
  const startedRef = useRef(false);

  useEffect(() => {
    if (url || startedRef.current) return;
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.some((e) => e.isIntersecting);
        if (!visible || startedRef.current) return;
        startedRef.current = true;
        observer.disconnect();

        setLoading(true);
        generateThumbnailAction(recipeId)
          .then((u) => {
            if (u) setUrl(u);
          })
          .finally(() => setLoading(false));
      },
      // começa a gerar um pouco antes de entrar na tela (scroll mais fluido)
      { rootMargin: "200px" },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [recipeId, url]);

  return { ref, url, loading };
}
