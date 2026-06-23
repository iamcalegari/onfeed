"use client";

/**
 * Toast global simples por evento — espelha showToast() do design onFeed v2.
 * Qualquer componente client chama showToast("…"); o <Toaster/> no layout
 * escuta e renderiza usando a animação ofToast (já definida em globals.css).
 */

export interface ToastDetail {
  message: string;
  icon?: string;
}

export function showToast(message: string, icon = "✅"): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ToastDetail>("onfeed:toast", { detail: { message, icon } }));
}
