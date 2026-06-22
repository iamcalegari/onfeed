"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { clearHistory, getHistory, saveSearch } from "@/lib/searchHistory";
import type { SearchHistoryEntry } from "@/lib/searchHistory";
import type { Equipment, NutritionGoal } from "@/lib/types";

const EQUIPMENT_OPTIONS: { value: Equipment; label: string; emoji: string }[] = [
  { value: "stovetop", label: "Fogão", emoji: "🔥" },
  { value: "oven", label: "Forno", emoji: "📦" },
  { value: "microwave", label: "Micro-ondas", emoji: "📡" },
  { value: "blender", label: "Liquidificador", emoji: "🌀" },
];

const TIME_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: "Qualquer" },
  { value: 30, label: "Até 30 min" },
  { value: 60, label: "Até 1h" },
];

const GOAL_OPTIONS: { value: NutritionGoal | ""; label: string }[] = [
  { value: "", label: "Trato fácil" },
  { value: "satiety", label: "Matar a fome" },
  { value: "macros", label: "Repetir sabores" },
];

const OCCASION_OPTIONS = ["tira-gosto", "brunch", "almoço", "sobremesa", "drinks"];

const RESTRICTION_OPTIONS = [
  { label: "Sem glúten",   value: "sem glúten"   },
  { label: "Vegetariano",  value: "vegetariano"  },
  { label: "Vegano",       value: "vegano"        },
  { label: "Sem lactose",  value: "sem lactose"  },
  { label: "Sem açúcar",   value: "sem açúcar"   },
  { label: "Low-carb",     value: "low-carb"      },
];

export function SearchForm() {
  const router = useRouter();
  const [ingredients, setIngredients] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [maxTime, setMaxTime] = useState(0);
  const [goal, setGoal] = useState<NutritionGoal | "">("");
  const [occasion, setOccasion] = useState("");
  const [restrictions, setRestrictions] = useState<string[]>([]);
  const [history, setHistory] = useState<SearchHistoryEntry[]>([]);
  const [baseIngredients, setBaseIngredients] = useState<Set<string>>(new Set());

  useEffect(() => {
    setHistory(getHistory());
  }, []);

  function addIngredient() {
    const parts = draft
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (parts.length === 0) return;
    setIngredients((prev) => [...new Set([...prev, ...parts])]);
    setDraft("");
  }

  function removeIngredient(ing: string) {
    setIngredients((p) => p.filter((x) => x !== ing));
    setBaseIngredients((prev) => {
      const next = new Set(prev);
      next.delete(ing);
      return next;
    });
  }

  function toggleBase(ing: string) {
    setBaseIngredients((prev) => {
      const next = new Set(prev);
      if (next.has(ing)) next.delete(ing);
      else next.add(ing);
      return next;
    });
  }

  function toggleEquip(v: Equipment) {
    setEquipment((prev) =>
      prev.includes(v) ? prev.filter((e) => e !== v) : [...prev, v],
    );
  }

  function submit() {
    const qs = new URLSearchParams();
    if (ingredients.length) qs.set("ingredients", ingredients.join(","));
    if (equipment.length) qs.set("equipment", equipment.join(","));
    if (maxTime > 0) qs.set("maxPrepTimeMin", String(maxTime));
    if (goal) qs.set("goal", goal);
    const allOccasions = [...(occasion ? [occasion] : []), ...restrictions];
    if (allOccasions.length) qs.set("occasions", allOccasions.join(","));
    if (baseIngredients.size > 0)
      qs.set("base", [...baseIngredients].join(","));
    saveSearch(ingredients, qs);
    router.push(`/results?${qs.toString()}`);
  }

  // Base ingredientes aparecem primeiro
  const sortedIngredients = [
    ...ingredients.filter((i) => baseIngredients.has(i)),
    ...ingredients.filter((i) => !baseIngredients.has(i)),
  ];

  return (
    <div className="flex flex-col gap-7">
      {/* Header */}
      <header className="pt-2">
        <h1 className="font-display text-[2rem] font-bold leading-tight text-forest">
          O que você tem aí?
        </h1>
        <p className="mt-1.5 text-sm text-carvao/55 leading-relaxed">
          Diga o que tem na geladeira — a gente acha a receita certa.
        </p>
      </header>

      {/* Histórico de buscas */}
      {history.length > 0 && (
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <SectionLabel icon={<HistoryIcon />} title="Buscas recentes" />
            <button
              type="button"
              onClick={() => { clearHistory(); setHistory([]); }}
              className="text-[11px] font-medium text-carvao/40 hover:text-carvao/60 transition-colors"
            >
              limpar
            </button>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-0.5 scrollbar-none">
            {history.map((entry) => (
              <button
                key={entry.ts}
                type="button"
                onClick={() => {
                  const ings = entry.query.split(",").map((s) => s.trim()).filter(Boolean);
                  setIngredients(ings);
                  const base = new URLSearchParams(entry.params).get("base");
                  setBaseIngredients(base ? new Set(base.split(",").map((s) => s.trim())) : new Set());
                }}
                className="shrink-0 flex items-center gap-1.5 rounded-full border border-areia bg-surface px-3.5 py-1.5 text-xs font-medium text-carvao/70 hover:border-salvia hover:text-forest transition-colors whitespace-nowrap"
              >
                {entry.query.length > 22
                  ? `${entry.query.slice(0, 22)}…`
                  : entry.query}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Ingredientes */}
      <section className="flex flex-col gap-3">
        <SectionLabel icon={<LeafIcon />} title="Ingredientes disponíveis" />

        <div className="flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                addIngredient();
              }
            }}
            placeholder="ovo, farinha, tomate..."
            className="flex-1 rounded-xl border border-areia bg-surface px-4 py-3 text-sm shadow-sm outline-none placeholder:text-carvao/35 focus:border-salvia focus:ring-2 focus:ring-salvia/20 transition-all"
          />
          <button
            type="button"
            onClick={addIngredient}
            aria-label="Adicionar ingrediente"
            className="flex h-11.5 w-11.5 shrink-0 items-center justify-center rounded-xl bg-forest text-xl font-bold text-creme shadow-sm transition-all active:scale-95 hover:bg-forest/90"
          >
            +
          </button>
        </div>

        {ingredients.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-2">
              {sortedIngredients.map((ing) => (
                <IngredientChip
                  key={ing}
                  name={ing}
                  isBase={baseIngredients.has(ing)}
                  onToggleBase={() => toggleBase(ing)}
                  onRemove={() => removeIngredient(ing)}
                />
              ))}
            </div>
            <p className="text-[10px] leading-relaxed text-carvao/35">
              Segure para marcar como principal · toque 2× para remover
            </p>
          </div>
        )}
      </section>

      {/* Equipamentos */}
      <section className="flex flex-col gap-3">
        <SectionLabel icon={<StoveIcon />} title="Equipamentos disponíveis" />
        <div className="flex flex-wrap gap-2">
          {EQUIPMENT_OPTIONS.map((opt) => (
            <Chip
              key={opt.value}
              active={equipment.includes(opt.value)}
              onClick={() => toggleEquip(opt.value)}
            >
              <span>{opt.emoji}</span>
              {opt.label}
            </Chip>
          ))}
        </div>
      </section>

      {/* Tempo */}
      <section className="flex flex-col gap-3">
        <SectionLabel icon={<ClockIcon />} title="Tempo disponível" />
        <div className="flex flex-wrap gap-2">
          {TIME_OPTIONS.map((opt) => (
            <Chip
              key={opt.value}
              active={maxTime === opt.value}
              onClick={() => setMaxTime(opt.value)}
            >
              {opt.label}
            </Chip>
          ))}
        </div>
      </section>

      {/* Objetivo */}
      <section className="flex flex-col gap-3">
        <SectionLabel icon={<TargetIcon />} title="Objetivo" />
        <div className="flex flex-wrap gap-2">
          {GOAL_OPTIONS.map((opt) => (
            <Chip
              key={opt.value || "none"}
              active={goal === opt.value}
              onClick={() => setGoal(opt.value)}
            >
              {opt.label}
            </Chip>
          ))}
        </div>
      </section>

      {/* Ocasião */}
      <section className="flex flex-col gap-3">
        <SectionLabel icon={<OccasionIcon />} title="Ocasião" />
        <div className="flex flex-wrap gap-2">
          {OCCASION_OPTIONS.map((occ) => (
            <Chip
              key={occ}
              active={occasion === occ}
              onClick={() => setOccasion((p) => (p === occ ? "" : occ))}
            >
              {occ}
            </Chip>
          ))}
        </div>
      </section>

      {/* Restrições alimentares */}
      <section className="flex flex-col gap-3">
        <SectionLabel icon={<RestrictionIcon />} title="Restrições alimentares" />
        <div className="flex flex-wrap gap-2">
          {RESTRICTION_OPTIONS.map((r) => (
            <Chip
              key={r.value}
              active={restrictions.includes(r.value)}
              onClick={() =>
                setRestrictions((prev) =>
                  prev.includes(r.value)
                    ? prev.filter((x) => x !== r.value)
                    : [...prev, r.value],
                )
              }
            >
              {r.label}
            </Chip>
          ))}
        </div>
      </section>

      {/* CTA */}
      <button
        type="button"
        onClick={submit}
        disabled={ingredients.length === 0}
        className="mt-1 flex items-center justify-center gap-2.5 rounded-2xl bg-terracota py-4 text-sm font-semibold text-creme shadow-card transition-all hover:bg-terracota/90 hover:shadow-lift hover:-translate-y-px active:translate-y-0 active:shadow-card disabled:opacity-40 disabled:pointer-events-none"
      >
        Buscar receitas
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="h-4 w-4"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

/* ── Sub-components ───────────────────────────────────────────── */

function IngredientChip({
  name,
  isBase,
  onToggleBase,
  onRemove,
}: {
  name: string;
  isBase: boolean;
  onToggleBase: () => void;
  onRemove: () => void;
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapRef = useRef(0);
  const longFiredRef = useRef(false);
  const [pressing, setPressing] = useState(false);

  function handleDown(e: React.PointerEvent<HTMLButtonElement>) {
    if (e.button !== 0) return;
    longFiredRef.current = false;
    setPressing(true);
    timerRef.current = setTimeout(() => {
      longFiredRef.current = true;
      setPressing(false);
      onToggleBase();
      try { navigator.vibrate(40); } catch { /* not supported */ }
    }, 500);
  }

  function handleUp() {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    setPressing(false);
    if (longFiredRef.current) return;
    const now = Date.now();
    if (now - lastTapRef.current < 350) {
      lastTapRef.current = 0;
      onRemove();
    } else {
      lastTapRef.current = now;
    }
  }

  function handleCancel() {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    setPressing(false);
    longFiredRef.current = false;
  }

  return (
    <button
      type="button"
      onPointerDown={handleDown}
      onPointerUp={handleUp}
      onPointerLeave={handleCancel}
      onPointerCancel={handleCancel}
      onContextMenu={(e) => e.preventDefault()}
      style={{ touchAction: "none" }}
      className={`flex select-none items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-150 ${
        pressing ? "scale-90" : "scale-100"
      } ${
        isBase
          ? "bg-amber-400 text-amber-950 shadow-sm ring-2 ring-amber-300/60"
          : "bg-forest text-creme"
      }`}
    >
      {isBase && <span className="text-[11px]">★</span>}
      {name}
      {isBase && (
        <span className="rounded-full bg-amber-950/15 px-1.5 text-[9px] font-bold uppercase tracking-wide">
          base
        </span>
      )}
    </button>
  );
}

function SectionLabel({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 text-forest">
      {icon}
      <span className="text-sm font-semibold">{title}</span>
    </div>
  );
}

function Chip({
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
      className={`flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all ${
        active
          ? "border-forest bg-forest text-creme shadow-sm"
          : "border-areia bg-surface text-carvao/70 hover:border-salvia hover:text-forest"
      }`}
    >
      {children}
    </button>
  );
}

/* ── Ícones inline ────────────────────────────────────────────── */

function HistoryIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 shrink-0">
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 3v5h5M12 7v5l4 2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LeafIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 shrink-0">
      <path d="M11 20A7 7 0 0 1 4 13c0-5 5-9 16-9 0 11-4 16-9 16Z" strokeLinejoin="round" />
      <path d="M4 20c3-3 6-5 9-6" strokeLinecap="round" />
    </svg>
  );
}

function StoveIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 shrink-0">
      <rect x="3" y="8" width="18" height="12" rx="2" />
      <path d="M7 8V5h10v3M8 12h.01M12 12h.01" strokeLinecap="round" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 shrink-0">
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l3 2" strokeLinecap="round" />
    </svg>
  );
}

function TargetIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 shrink-0">
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function OccasionIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 shrink-0">
      <path d="M8 3v4M16 3v4M3 9h18M5 21h14a2 2 0 0 0 2-2V9H3v10a2 2 0 0 0 2 2Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function RestrictionIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 shrink-0">
      <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10Z" />
      <path d="m4.93 4.93 14.14 14.14" strokeLinecap="round" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M2 2l8 8M10 2l-8 8" />
    </svg>
  );
}
