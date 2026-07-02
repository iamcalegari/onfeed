"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { toggleLikeAction } from "@/app/actions";

export function LikeButton({
  recipeId,
  initialLiked,
  initialCount,
  canLike,
}: {
  recipeId: string;
  initialLiked: boolean;
  initialCount: number;
  canLike: boolean;
}) {
  const router = useRouter();
  const [liked,   setLiked]   = useState(initialLiked);
  const [count,   setCount]   = useState(initialCount);
  const [pending, startTransition] = useTransition();

  function toggle() {
    if (pending) return;
    // Deslogado: curtir exige conta (D-01) — redireciona pro sign-in em vez
    // de no-op silencioso, e volta pra página atual depois de autenticar.
    if (!canLike) {
      const returnTo =
        typeof window !== "undefined" ? window.location.pathname : "/";
      router.push(`/sign-in?redirect_url=${encodeURIComponent(returnTo)}`);
      return;
    }
    const nextLiked = !liked;
    const nextCount = Math.max(0, count + (nextLiked ? 1 : -1));
    setLiked(nextLiked);
    setCount(nextCount);
    startTransition(async () => {
      try {
        const result = await toggleLikeAction(recipeId);
        setLiked(result.liked);
        setCount(result.count);
      } catch {
        setLiked(!nextLiked);
        setCount(count);
      }
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={liked}
      aria-label={liked ? "Descurtir receita" : "Curtir receita"}
      title={!canLike ? "Faça login para curtir" : undefined}
      className={[
        "flex items-center gap-1.5 rounded-full border px-3 py-1.5 transition-all",
        "disabled:opacity-60",
        canLike ? "cursor-pointer active:scale-90" : "cursor-default",
        liked
          ? "border-terracota/40 bg-terracota/10 text-terracota"
          : "border-areia bg-surface text-carvao/40 hover:text-carvao/70",
      ].join(" ")}
    >
      <HeartIcon filled={liked} />
      {count > 0 && (
        <span className="text-xs font-semibold tabular-nums">{count}</span>
      )}
    </button>
  );
}

function HeartIcon({ filled }: { filled: boolean }) {
  return filled ? (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4 shrink-0">
      <path d="M12 21s-7-4.6-9.3-9C1.2 9 2.5 5.5 6 5.5c2 0 3.2 1.2 4 2.4.8-1.2 2-2.4 4-2.4 3.5 0 4.8 3.5 3.3 6.5C19 16.4 12 21 12 21z" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" className="h-4 w-4 shrink-0">
      <path d="M12 21s-7-4.6-9.3-9C1.2 9 2.5 5.5 6 5.5c2 0 3.2 1.2 4 2.4.8-1.2 2-2.4 4-2.4 3.5 0 4.8 3.5 3.3 6.5C19 16.4 12 21 12 21z" />
    </svg>
  );
}
