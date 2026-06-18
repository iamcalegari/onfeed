"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = {
  label: string;
  href?: string;
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
    label: "Ajustes",
    href: "/settings",
    match: (p) => p.startsWith("/settings"),
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
        <circle cx="12" cy="12" r="3" />
        <path
          d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
];

export function BottomNav() {
  const pathname = usePathname() || "/";

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 bg-creme/95 backdrop-blur shadow-top">
      <div className="mx-auto flex w-full max-w-md items-stretch justify-around px-2 pb-safe pt-1">
        {ITEMS.map((item) => {
          const active = item.match?.(pathname) ?? false;

          const content = (
            <span className="flex flex-col items-center gap-0.5">
              <span
                className={`flex items-center justify-center rounded-full px-4 py-1.5 transition-all duration-200 ${
                  active ? "bg-forest/10 text-forest" : "text-carvao/40"
                }`}
              >
                {item.icon}
              </span>
              <span
                className={`text-[10px] font-medium transition-colors duration-200 ${
                  active ? "text-forest" : "text-carvao/40"
                }`}
              >
                {item.label}
              </span>
            </span>
          );

          return item.href ? (
            <Link key={item.label} href={item.href} className="flex-1 py-1">
              {content}
            </Link>
          ) : (
            <span
              key={item.label}
              className="flex-1 cursor-default py-1 opacity-40"
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
