"use client";

import type { CSSProperties, ReactNode } from "react";
import { useRouter } from "next/navigation";

export function BackButton({
  children,
  className,
  style,
  fallbackHref = "/",
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  fallbackHref?: string;
}) {
  const router = useRouter();

  function onClick() {
    if (typeof window !== "undefined" && window.history.length <= 1) {
      router.push(fallbackHref);
    } else {
      router.back();
    }
  }

  return (
    <button type="button" onClick={onClick} className={className} style={style}>
      {children}
    </button>
  );
}
