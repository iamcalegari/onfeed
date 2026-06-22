"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  label: string;
  href: string;
  match: (path: string) => boolean;
  icon: React.ReactNode;
  activeIcon?: React.ReactNode;
};

const ITEMS: NavItem[] = [
  {
    label: "Hoje",
    href: "/hoje",
    match: (p) => p === "/" || p === "/hoje" || p.startsWith("/hoje"),
    icon: <HomeIcon />,
    activeIcon: <HomeIcon filled />,
  },
  {
    label: "Buscar",
    href: "/buscar",
    match: (p) =>
      p === "/buscar" ||
      p.startsWith("/results") ||
      p.startsWith("/recipe"),
    icon: <SearchIcon />,
  },
  {
    label: "Plano",
    href: "/plano",
    match: (p) => p.startsWith("/plano") || p.startsWith("/compras"),
    icon: <PlanIcon />,
  },
  {
    label: "Progresso",
    href: "/progresso",
    match: (p) => p.startsWith("/progresso"),
    icon: <ProgressIcon />,
  },
  {
    label: "Perfil",
    href: "/perfil",
    match: (p) =>
      p.startsWith("/perfil") ||
      p.startsWith("/settings") ||
      p.startsWith("/pantry") ||
      p.startsWith("/favorites"),
    icon: <ProfileIcon />,
    activeIcon: <ProfileIcon filled />,
  },
];

export function BottomNav() {
  const pathname = usePathname() || "/";

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 bg-creme/95 backdrop-blur shadow-top">
      <div className="mx-auto flex w-full max-w-md items-stretch justify-around px-1 pb-safe pt-1">
        {ITEMS.map((item) => {
          const active = item.match(pathname);
          return (
            <Link
              key={item.label}
              href={item.href}
              className="flex flex-1 flex-col items-center gap-0.5 py-1"
            >
              <span
                className={`flex items-center justify-center rounded-full px-3.5 py-1.5 transition-all duration-200 ${
                  active ? "bg-forest/10 text-forest" : "text-carvao/35"
                }`}
              >
                {active && item.activeIcon ? item.activeIcon : item.icon}
              </span>
              <span
                className={`text-[10px] font-medium transition-colors duration-200 ${
                  active ? "font-semibold text-forest" : "text-carvao/35"
                }`}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

/* ── Ícones ──────────────────────────────────────────────────── */

function HomeIcon({ filled = false }: { filled?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      {filled
        ? <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        : <><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></>
      }
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-5 w-5">
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function PlanIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" strokeWidth="2.5" />
    </svg>
  );
}

function ProgressIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4"  />
      <line x1="6"  y1="20" x2="6"  y2="14" />
    </svg>
  );
}

function ProfileIcon({ filled = false }: { filled?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke={filled ? "none" : "currentColor"} strokeWidth="2" strokeLinecap="round" className="h-5 w-5">
      {filled ? (
        <>
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </>
      ) : (
        <>
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </>
      )}
    </svg>
  );
}
