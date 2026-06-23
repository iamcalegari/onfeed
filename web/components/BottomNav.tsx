"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  label: string;
  href:  string;
  match: (path: string) => boolean;
  paths: React.ReactNode;
};

const ITEMS: NavItem[] = [
  {
    label: "Hoje",
    href:  "/hoje",
    match: (p) => p === "/" || p === "/hoje" || p.startsWith("/hoje"),
    paths: (
      <>
        <path d="M3 10.5 12 3l9 7.5" />
        <path d="M5 9.5V20h14V9.5" />
      </>
    ),
  },
  {
    label: "Buscar",
    href:  "/buscar",
    match: (p) => p === "/buscar" || p.startsWith("/results") || p.startsWith("/recipe"),
    paths: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.2-3.2" />
      </>
    ),
  },
  {
    label: "Plano",
    href:  "/plano",
    match: (p) => p.startsWith("/plano") || p.startsWith("/compras"),
    paths: (
      <>
        <rect x="3.5" y="4.5" width="17" height="16" rx="2.5" />
        <path d="M3.5 9h17M8 3v3M16 3v3" />
      </>
    ),
  },
  {
    label: "Progresso",
    href:  "/progresso",
    match: (p) => p.startsWith("/progresso"),
    paths: (
      <>
        <path d="M4 20V4M4 20h16" />
        <path d="M8 16v-4M12 16V8M16 16v-6" />
      </>
    ),
  },
  {
    label: "Perfil",
    href:  "/perfil",
    match: (p) => p.startsWith("/perfil") || p.startsWith("/settings") || p.startsWith("/pantry") || p.startsWith("/favorites"),
    paths: (
      <>
        <circle cx="12" cy="8" r="3.6" />
        <path d="M5.5 20c.6-3.6 3.3-5.5 6.5-5.5s5.9 1.9 6.5 5.5" />
      </>
    ),
  },
];

export function BottomNav() {
  const pathname = usePathname() || "/";

  return (
    <nav style={{
      position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 40,
      background: "rgba(255,255,255,.92)",
      backdropFilter: "blur(18px)",
      WebkitBackdropFilter: "blur(18px)",
      borderTop: "1px solid #efe4d3",
      display: "flex",
      paddingTop: 9,
      paddingLeft: 8,
      paddingRight: 8,
      paddingBottom: "max(env(safe-area-inset-bottom), 10px)",
    }}>
      {ITEMS.map((item) => {
        const active = item.match(pathname);
        return (
          <Link
            key={item.label}
            href={item.href}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
              paddingTop: 5,
              textDecoration: "none",
              color: active ? "#162f25" : "#a9b5ac",
            }}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={active ? 2.3 : 2}
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ width: 24, height: 24 }}
            >
              {item.paths}
            </svg>
            <span style={{
              fontSize: 10.5,
              fontWeight: 600,
              color: active ? "#162f25" : "#a9b5ac",
            }}>
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
