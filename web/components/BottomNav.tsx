"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = {
  label: string;
  href?: string; // sem href = aba futura (placeholder, igual ao conceito)
  match?: (path: string) => boolean;
  icon: React.ReactNode;
};

const ITEMS: Item[] = [
  {
    label: "Buscar",
    href: "/",
    match: (p) => p === "/" || p.startsWith("/results") || p.startsWith("/recipe"),
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
        <circle cx="11" cy="11" r="7" />
        <path d="m21 21-4.3-4.3" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    label: "Descobrir",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
        <circle cx="12" cy="12" r="9" />
        <path d="m15 9-2 4-4 2 2-4z" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    label: "Favoritos",
    href: "/favorites",
    match: (p) => p.startsWith("/favorites"),
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
        <path d="M12 21s-7-4.6-9.3-9C1.2 9 2.5 5.5 6 5.5c2 0 3.2 1.2 4 2.4.8-1.2 2-2.4 4-2.4 3.5 0 4.8 3.5 3.3 6.5C19 16.4 12 21 12 21z" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    label: "Perfil",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 20c0-3.3 3.6-5 8-5s8 1.7 8 5" strokeLinecap="round" />
      </svg>
    ),
  },
];

export function BottomNav() {
  const pathname = usePathname() || "/";

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-areia/60 bg-creme/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-md items-stretch justify-around px-2 py-2">
        {ITEMS.map((item) => {
          const active = item.match?.(pathname) ?? false;
          const tone = active ? "text-forest" : "text-carvao/45";
          const content = (
            <span className={`flex flex-col items-center gap-1 ${tone}`}>
              {item.icon}
              <span className="text-[10px] font-medium">{item.label}</span>
            </span>
          );
          return item.href ? (
            <Link key={item.label} href={item.href} className="flex-1 py-1">
              {content}
            </Link>
          ) : (
            <span
              key={item.label}
              className="flex-1 cursor-default py-1"
              title="Em breve"
            >
              {content}
            </span>
          );
        })}
      </div>
    </nav>
  );
}
