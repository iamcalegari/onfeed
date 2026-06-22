"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Show, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";

const PAGE_TITLES: Record<string, string> = {
  "/hoje":      "onFeed",
  "/buscar":    "Buscar",
  "/plano":     "Plano",
  "/progresso": "Progresso",
  "/perfil":    "Perfil",
  "/pantry":    "Minha Despensa",
  "/favorites": "Favoritos",
  "/settings":  "Configurações",
};

export function TopBar({ clerkEnabled }: { clerkEnabled: boolean }) {
  const pathname = usePathname() ?? "/";

  const title = (() => {
    if (pathname.startsWith("/recipe")) return null; // sem barra no detalhe
    for (const [key, val] of Object.entries(PAGE_TITLES)) {
      if (pathname === key || pathname.startsWith(key + "/")) return val;
    }
    if (pathname === "/" || pathname === "/hoje") return "onFeed";
    return "onFeed";
  })();

  const isHome = pathname === "/" || pathname === "/hoje";

  return (
    <header className="sticky top-0 z-30 border-b border-areia/50 bg-creme/90 backdrop-blur pt-safe">
      <div className="mx-auto flex w-full max-w-md items-center justify-between px-4 py-3">
        {/* Logo apenas na home, título nas outras */}
        {isHome ? (
          <Link href="/hoje" className="flex items-center gap-2">
            <img src="/app-icon.png" alt="onFeed" className="h-7 w-7 rounded-lg" />
            <span className="font-display text-lg font-bold text-forest">onFeed</span>
          </Link>
        ) : title ? (
          <h1 className="font-display text-lg font-bold text-carvao">{title}</h1>
        ) : (
          <div />
        )}

        <div className="flex items-center gap-3">
          {clerkEnabled && (
            <>
              <Show when="signed-out">
                <SignInButton mode="modal">
                  <button className="text-sm font-medium text-forest">Entrar</button>
                </SignInButton>
                <SignUpButton mode="modal">
                  <button className="rounded-full bg-forest px-3 py-1.5 text-sm font-semibold text-creme">
                    Criar conta
                  </button>
                </SignUpButton>
              </Show>
              <Show when="signed-in">
                <UserButton />
              </Show>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
