"use client";

import { useEffect, useState } from "react";

import {
  applyTheme,
  COOKIE_THEME,
  COOKIE_UNIT,
  readCookie,
  setCookie,
} from "@/lib/settings";
import type { Theme, UnitSystem } from "@/lib/settings";

/* ── Opções ─────────────────────────────────────────────────── */

const UNIT_OPTIONS: { value: UnitSystem; label: string; hint: string }[] = [
  { value: "metric",   label: "Métrico",   hint: "g, kg, ml, l" },
  { value: "imperial", label: "Imperial",  hint: "oz, lb, fl oz, qt" },
];

const THEME_OPTIONS: { value: Theme; label: string; icon: React.ReactNode }[] = [
  { value: "light",  label: "Claro",  icon: <SunIcon /> },
  { value: "dark",   label: "Escuro", icon: <MoonIcon /> },
  { value: "system", label: "Auto",   icon: <SystemIcon /> },
];

/* ── Page ───────────────────────────────────────────────────── */

export default function SettingsPage() {
  const [unitSystem, setUnitSystem] = useState<UnitSystem>("metric");
  const [theme, setTheme] = useState<Theme>("system");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setUnitSystem((readCookie(COOKIE_UNIT) ?? "metric") as UnitSystem);
    setTheme((readCookie(COOKIE_THEME) ?? "system") as Theme);
    setMounted(true);
  }, []);

  function handleUnit(v: UnitSystem) {
    setUnitSystem(v);
    setCookie(COOKIE_UNIT, v);
  }

  function handleTheme(v: Theme) {
    setTheme(v);
    setCookie(COOKIE_THEME, v);
    applyTheme(v);
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="pt-2">
        <h1 className="font-display text-[2rem] font-bold leading-tight text-forest">
          Configurações
        </h1>
        <p className="mt-1 text-sm text-carvao/55">
          Preferências salvas neste dispositivo.
        </p>
      </header>

      {/* ── Unidades ─────────────────────────────────────────── */}
      <SettingCard
        icon={<ScaleIcon />}
        title="Unidades de medida"
        description={
          mounted
            ? unitSystem === "metric"
              ? "Usando g, kg, ml e litros."
              : "Usando oz, lb, fl oz e quartos."
            : null
        }
      >
        <SegGroup>
          {UNIT_OPTIONS.map((opt) => (
            <SegButton
              key={opt.value}
              active={mounted && unitSystem === opt.value}
              onClick={() => handleUnit(opt.value)}
            >
              <span className="font-semibold">{opt.label}</span>
              <span className="text-[10px] opacity-70">{opt.hint}</span>
            </SegButton>
          ))}
        </SegGroup>
      </SettingCard>

      {/* ── Aparência ────────────────────────────────────────── */}
      <SettingCard
        icon={<PaletteIcon />}
        title="Aparência"
        description="Auto segue a preferência do sistema operacional."
      >
        <SegGroup>
          {THEME_OPTIONS.map((opt) => (
            <SegButton
              key={opt.value}
              active={mounted && theme === opt.value}
              onClick={() => handleTheme(opt.value)}
            >
              {opt.icon}
              <span>{opt.label}</span>
            </SegButton>
          ))}
        </SegGroup>
      </SettingCard>
    </div>
  );
}

/* ── Sub-components ──────────────────────────────────────────── */

function SettingCard({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-surface p-5 shadow-card ring-1 ring-areia/60">
      <div className="mb-4 flex items-center gap-2.5 text-forest">
        {icon}
        <h2 className="font-display text-base font-bold">{title}</h2>
      </div>
      {children}
      {description && (
        <p className="mt-3 text-xs text-carvao/45">{description}</p>
      )}
    </section>
  );
}

function SegGroup({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-1 rounded-full bg-areia/40 p-1">
      {children}
    </div>
  );
}

function SegButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-1 flex-col items-center justify-center gap-0.5 rounded-full py-2.5 text-xs transition-all duration-200 ${
        active
          ? "bg-surface font-semibold text-forest shadow-sm"
          : "text-carvao/50 hover:text-carvao/80"
      }`}
    >
      {children}
    </button>
  );
}

/* ── Ícones ──────────────────────────────────────────────────── */

function ScaleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5 shrink-0">
      <path d="M12 3v18M3 12h18" strokeLinecap="round" />
      <circle cx="12" cy="12" r="3" />
      <path d="M5 5l4 4M15 15l4 4M5 19l4-4M15 9l4-4" strokeLinecap="round" />
    </svg>
  );
}

function PaletteIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5 shrink-0">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a9 9 0 0 1 0 18 4 4 0 0 1 0-8 4 4 0 0 0 0-8 9.01 9.01 0 0 1 0-2Z" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" strokeLinecap="round" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" strokeLinejoin="round" />
    </svg>
  );
}

function SystemIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" strokeLinecap="round" />
    </svg>
  );
}
