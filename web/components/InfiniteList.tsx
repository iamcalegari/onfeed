"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Scroll infinito client-side sobre um array já carregado (o pool ranqueado da
 * busca). Renderiza em lotes de `batchSize` e revela o próximo quando um
 * sentinela no fim entra na viewport. Não chama o backend — só fatia o array,
 * o que naturalmente limita quantos cards montam (e quantas thumbnails geram).
 */
export function InfiniteList<T>({
  items,
  renderItem,
  batchSize = 12,
  className,
}: {
  items: T[];
  renderItem: (item: T, index: number) => ReactNode;
  batchSize?: number;
  className?: string;
}) {
  const [count, setCount] = useState(batchSize);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // nova busca (array diferente) reinicia a contagem
  useEffect(() => {
    setCount(batchSize);
  }, [items, batchSize]);

  useEffect(() => {
    if (count >= items.length) return;
    const el = sentinelRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setCount((c) => Math.min(c + batchSize, items.length));
        }
      },
      { rootMargin: "300px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [count, items.length, batchSize]);

  return (
    <>
      <div className={className}>
        {items.slice(0, count).map((item, i) => renderItem(item, i))}
      </div>
      {count < items.length && (
        <div
          ref={sentinelRef}
          className="py-4 text-center text-xs text-stone-400"
        >
          carregando mais…
        </div>
      )}
    </>
  );
}
