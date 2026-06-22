"use client";

import { useEffect, useState } from "react";

import {
  clearGoals,
  getGoals,
  setGoals,
  type NutritionGoals,
} from "@/lib/nutritionPlan";
import {
  applyTheme,
  COOKIE_LANG,
  COOKIE_THEME,
  COOKIE_UNIT,
  readCookie,
  setCookie,
} from "@/lib/settings";
import type { Language, Theme, UnitSystem } from "@/lib/settings";

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

const LANG_OPTIONS: { value: Language; label: string; flag: string }[] = [
  { value: "pt", label: "Português", flag: "🇧🇷" },
  { value: "en", label: "English",   flag: "🇺🇸" },
];

/* ── Page ───────────────────────────────────────────────────── */

export default function SettingsPage() {
  const [unitSystem, setUnitSystem] = useState<UnitSystem>("metric");
  const [theme, setTheme]           = useState<Theme>("light");
  const [lang, setLang]             = useState<Language>("pt");
  const [mounted, setMounted]       = useState(false);
  const [goals, setGoalsState]      = useState<NutritionGoals | null>(null);

  useEffect(() => {
    setUnitSystem((readCookie(COOKIE_UNIT)  ?? "metric") as UnitSystem);
    setTheme(     (readCookie(COOKIE_THEME) ?? "system") as Theme);
    setLang(      (readCookie(COOKIE_LANG)  ?? "pt")     as Language);
    setGoalsState(getGoals());
    setMounted(true);
  }, []);

  function handleUnit(v: UnitSystem) { setUnitSystem(v); setCookie(COOKIE_UNIT, v); }
  function handleLang(v: Language)   { setLang(v);       setCookie(COOKIE_LANG, v); }
  function handleTheme(v: Theme) {
    setTheme(v);
    setCookie(COOKIE_THEME, v);
    applyTheme(v);
  }
  function handleSaveGoals(g: NutritionGoals) { setGoals(g); setGoalsState(g); }
  function handleClearGoals() { clearGoals(); setGoalsState(null); }

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

      {/* ── Idioma ───────────────────────────────────────────── */}
      <SettingCard
        icon={<GlobeIcon />}
        title="Idioma das receitas"
        description={
          mounted
            ? lang === "pt"
              ? "Adaptações geradas em Português. Receitas do catálogo podem estar em inglês."
              : "New adaptations generated in English. Catalog recipes may be in other languages."
            : null
        }
      >
        <SegGroup>
          {LANG_OPTIONS.map((opt) => (
            <SegButton
              key={opt.value}
              active={mounted && lang === opt.value}
              onClick={() => handleLang(opt.value)}
            >
              <span className="text-base">{opt.flag}</span>
              <span className="font-semibold">{opt.label}</span>
            </SegButton>
          ))}
        </SegGroup>
      </SettingCard>

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

      {/* ── Metas nutricionais ────────────────────────────────── */}
      {mounted && (
        <NutritionGoalsCard
          current={goals}
          onSave={handleSaveGoals}
          onClear={handleClearGoals}
        />
      )}
    </div>
  );
}

/* ── Sub-components ──────────────────────────────────────────── */

function SettingCard({
  icon, title, description, children,
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
  return <div className="flex gap-1 rounded-full bg-areia/40 p-1">{children}</div>;
}

function SegButton({
  active, onClick, children,
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

/* ── NutritionGoalsCard ─────────────────────────────────────── */

function NutritionGoalsCard({
  current,
  onSave,
  onClear,
}: {
  current: NutritionGoals | null;
  onSave: (g: NutritionGoals) => void;
  onClear: () => void;
}) {
  const [cals, setCals] = useState(String(current?.calories ?? ""));
  const [prot, setProt] = useState(String(current?.protein  ?? ""));
  const [carb, setCarb] = useState(String(current?.carbs    ?? ""));
  const [fat,  setFat]  = useState(String(current?.fat      ?? ""));
  const [saved, setSaved] = useState(false);

  function handleSave() {
    const g: NutritionGoals = {
      calories: Number(cals) || 0,
      protein:  Number(prot) || 0,
      carbs:    Number(carb) || 0,
      fat:      Number(fat)  || 0,
    };
    if (g.calories <= 0) return;
    onSave(g);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function handleClear() {
    setCals(""); setProt(""); setCarb(""); setFat("");
    onClear();
  }

  const isValid = Number(cals) > 0;
  const hasGoal = current !== null;

  return (
    <section className="rounded-2xl bg-surface p-5 shadow-card ring-1 ring-areia/60">
      <div className="mb-4 flex items-center gap-2.5 text-forest">
        <HeartIcon />
        <h2 className="font-display text-base font-bold">Metas nutricionais</h2>
      </div>

      <p className="mb-4 text-xs text-carvao/45">
        {hasGoal
          ? `Meta ativa: ${current.calories} kcal · P ${current.protein}g · C ${current.carbs}g · G ${current.fat}g/dia`
          : "Configure suas metas diárias para ver o badge «Cabe no plano» nas receitas."}
      </p>

      <div className="grid grid-cols-2 gap-3">
        <GoalInput label="Calorias (kcal)" value={cals} onChange={setCals} placeholder="1800" />
        <GoalInput label="Proteína (g)" value={prot} onChange={setProt} placeholder="120" />
        <GoalInput label="Carboidratos (g)" value={carb} onChange={setCarb} placeholder="200" />
        <GoalInput label="Gorduras (g)" value={fat} onChange={setFat} placeholder="60" />
      </div>

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          disabled={!isValid}
          onClick={handleSave}
          className={`flex flex-1 items-center justify-center rounded-xl py-3 text-sm font-semibold transition-all ${
            saved
              ? "bg-forest/10 text-forest"
              : isValid
              ? "bg-forest text-creme shadow-sm active:scale-[0.98]"
              : "bg-areia/40 text-carvao/30"
          }`}
        >
          {saved ? "✓ Salvo!" : "Salvar metas"}
        </button>
        {hasGoal && (
          <button
            type="button"
            onClick={handleClear}
            className="rounded-xl px-4 py-3 text-sm text-carvao/40 hover:text-carvao/70 transition-colors"
          >
            Limpar
          </button>
        )}
      </div>
    </section>
  );
}

function GoalInput({
  label, value, onChange, placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-bold uppercase tracking-wider text-carvao/40">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-xl border border-areia bg-areia/30 px-3 py-2.5 text-sm font-semibold text-carvao placeholder:text-carvao/25 focus:border-forest/50 focus:outline-none focus:ring-2 focus:ring-forest/20"
      />
    </label>
  );
}

/* ── Ícones ──────────────────────────────────────────────────── */

function GlobeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5 shrink-0">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3c-3 4-3 14 0 18M12 3c3 4 3 14 0 18M3 12h18" strokeLinecap="round" />
    </svg>
  );
}

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

function HeartIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78Z" />
    </svg>
  );
}
