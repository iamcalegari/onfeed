"use client";

import { useState } from "react";

import { useLazyThumbnail } from "@/lib/useLazyThumbnail";

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
  const [imgLoaded, setImgLoaded] = useState(false);

  return (
    <div
      ref={ref}
      className={`${className} ${rounded} relative flex shrink-0 items-center justify-center overflow-hidden bg-areia/30`}
    >
      {/* Skeleton visível enquanto imagem ainda não apareceu */}
      {!imgLoaded && (
        <span
          className={`absolute inset-0 ${
            loading ? "animate-pulse bg-areia/50" : "bg-areia/20"
          }`}
        />
      )}

      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          onLoad={() => setImgLoaded(true)}
          className={`h-full w-full object-cover transition-opacity duration-500 ${
            imgLoaded ? "opacity-100" : "opacity-0"
          }`}
        />
      ) : !loading ? (
        <span className={`${iconClassName} relative z-10`}>🍽️</span>
      ) : null}
    </div>
  );
}
