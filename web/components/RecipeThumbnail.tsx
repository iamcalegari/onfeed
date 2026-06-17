"use client";

import { useEffect, useState } from "react";

import { generateThumbnailAction } from "@/app/actions";

/**
 * Hero com geração lazy: renderiza o placeholder na hora e, se não houver
 * imagem, dispara a geração (Bedrock→S3) uma vez. Quando o backend tem imagens
 * desabilitadas, a action devolve null e o placeholder permanece.
 */
export function RecipeThumbnail({
  recipeId,
  initialUrl,
}: {
  recipeId: string;
  initialUrl: string;
}) {
  const [url, setUrl] = useState(initialUrl);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (url) return;
    let cancelled = false;
    setLoading(true);
    generateThumbnailAction(recipeId)
      .then((u) => {
        if (cancelled) return;
        if (u) setUrl(u);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [recipeId, url]);

  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={url}
        alt=""
        className="h-44 w-full rounded-2xl object-cover"
      />
    );
  }

  return (
    <div className="flex h-44 w-full items-center justify-center rounded-2xl bg-stone-100">
      {loading ? (
        <span className="animate-pulse text-sm text-stone-400">
          gerando imagem…
        </span>
      ) : (
        <span className="text-5xl">🍽️</span>
      )}
    </div>
  );
}
