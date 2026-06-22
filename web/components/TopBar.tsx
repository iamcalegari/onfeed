"use client";

import { usePathname } from "next/navigation";
import { Show, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";

/* Telas com título próprio no body — TopBar fica invisível nelas */
const SELF_TITLED = ["/hoje", "/buscar", "/plano", "/progresso", "/perfil", "/compras"];

/* Telas secundárias onde o TopBar mostra o título */
const PAGE_TITLES: Record<string, string> = {
  "/pantry":    "Minha Despensa",
  "/favorites": "Favoritos",
  "/settings":  "Configurações",
  "/onboarding":"Configurar metas",
};

export function TopBar({ clerkEnabled }: { clerkEnabled: boolean }) {
  const pathname = usePathname() ?? "/";

  const isSelfTitled =
    pathname === "/" ||
    SELF_TITLED.some(p => pathname === p || pathname.startsWith(p + "/"));

  const isRecipe = pathname.startsWith("/recipe");

  const title = (() => {
    for (const [key, val] of Object.entries(PAGE_TITLES)) {
      if (pathname === key || pathname.startsWith(key + "/")) return val;
    }
    return null;
  })();

  /* Esconde completamente em telas de receita e telas com título próprio sem auth */
  if ((isRecipe || isSelfTitled) && !clerkEnabled) return null;

  /* Barra mínima de auth — sem título, fundo transparente */
  if (isSelfTitled || isRecipe) {
    return (
      <div className="fixed top-0 right-0 z-50 flex items-center gap-2 p-3 pt-safe">
        {clerkEnabled && (
          <>
            <Show when="signed-out">
              <SignInButton mode="modal">
                <button
                  style={{
                    fontSize: 12, fontWeight: 700, color: "#162f25",
                    background: "rgba(255,255,255,.85)", backdropFilter: "blur(8px)",
                    border: "1px solid #f0e4d2", borderRadius: 20,
                    padding: "6px 12px", cursor: "pointer",
                  }}
                >
                  Entrar
                </button>
              </SignInButton>
            </Show>
            <Show when="signed-in">
              <UserButton />
            </Show>
          </>
        )}
      </div>
    );
  }

  /* Barra completa — telas secundárias */
  return (
    <header
      style={{
        position: "sticky", top: 0, zIndex: 30,
        background: "rgba(250,244,232,.92)",
        backdropFilter: "blur(12px)",
        borderBottom: "1px solid rgba(224,201,166,.5)",
      }}
      className="pt-safe"
    >
      <div className="mx-auto flex w-full max-w-md items-center justify-between px-4 py-3">
        {title ? (
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700, color: "#162f25", margin: 0 }}>
            {title}
          </h1>
        ) : (
          <div />
        )}

        {clerkEnabled && (
          <div className="flex items-center gap-2">
            <Show when="signed-out">
              <SignInButton mode="modal">
                <button
                  style={{
                    fontSize: 13, fontWeight: 700, color: "#162f25",
                    background: "none", border: "none", cursor: "pointer",
                  }}
                >
                  Entrar
                </button>
              </SignInButton>
              <SignUpButton mode="modal">
                <button
                  style={{
                    background: "#162f25", color: "#faf4e8",
                    borderRadius: 20, padding: "6px 14px",
                    fontSize: 13, fontWeight: 700, border: "none", cursor: "pointer",
                  }}
                >
                  Criar conta
                </button>
              </SignUpButton>
            </Show>
            <Show when="signed-in">
              <UserButton />
            </Show>
          </div>
        )}
      </div>
    </header>
  );
}
