"use client";

import { useEffect, useState } from "react";

import type { ToastDetail } from "@/lib/toast";

interface ActiveToast extends ToastDetail {
  id: number;
}

/**
 * Renderiza toasts disparados via showToast(). Fica fixo acima da tab bar,
 * centralizado, e usa a animação ofToast (2.4s) que se auto-remove.
 */
export function Toaster() {
  const [toast, setToast] = useState<ActiveToast | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const onToast = (e: Event) => {
      const detail = (e as CustomEvent<ToastDetail>).detail;
      const id = Date.now();
      setToast({ id, message: detail.message, icon: detail.icon ?? "✅" });
      clearTimeout(timer);
      timer = setTimeout(() => setToast(null), 2400);
    };
    window.addEventListener("onfeed:toast", onToast);
    return () => {
      window.removeEventListener("onfeed:toast", onToast);
      clearTimeout(timer);
    };
  }, []);

  if (!toast) return null;

  return (
    <div
      key={toast.id}
      style={{
        position: "fixed",
        bottom: "calc(104px + env(safe-area-inset-bottom))",
        left: "50%",
        zIndex: 60,
        animation: "ofToast 2.4s ease forwards",
        background: "var(--t-bg-hero)",
        color: "var(--t-hero-fg)",
        padding: "13px 20px",
        borderRadius: 16,
        fontSize: 13.5,
        fontWeight: 600,
        boxShadow: "0 12px 30px -10px rgba(22,47,37,.6)",
        display: "flex",
        alignItems: "center",
        gap: 9,
        whiteSpace: "nowrap",
        maxWidth: "calc(100vw - 40px)",
      }}
    >
      <span style={{ fontSize: 15 }}>{toast.icon}</span>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{toast.message}</span>
    </div>
  );
}
