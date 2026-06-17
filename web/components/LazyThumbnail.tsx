"use client";

import { useLazyThumbnail } from "@/lib/useLazyThumbnail";

/**
 * Thumbnail com geração lazy por visibilidade (ver useLazyThumbnail). Serve
 * tanto o card da lista quanto o hero do detalhe — o tamanho vem por className.
 */
export function LazyThumbnail({
  recipeId,
  initialUrl,
  className,
  rounded = "rounded-lg",
  iconClassName = "text-2xl",
}: {
  recipeId: string;
  initialUrl: string;
  className: string;
  rounded?: string;
  iconClassName?: string;
}) {
  const { ref, url, loading } = useLazyThumbnail(recipeId, initialUrl);

  return (
    <div
      ref={ref}
      className={`${className} ${rounded} flex shrink-0 items-center justify-center overflow-hidden bg-stone-100`}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : loading ? (
        <span className="h-full w-full animate-pulse bg-stone-200" />
      ) : (
        <span className={iconClassName}>🍽️</span>
      )}
    </div>
  );
}
