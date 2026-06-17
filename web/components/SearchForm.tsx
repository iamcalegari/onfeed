"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { Equipment, NutritionGoal } from "@/lib/types";

const EQUIPMENT_OPTIONS: { value: Equipment; label: string }[] = [
  { value: "stovetop", label: "Fogão" },
  { value: "oven", label: "Forno" },
  { value: "microwave", label: "Micro-ondas" },
  { value: "blender", label: "Liquidificador" },
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

const OCCASION_OPTIONS = ["tira-gosto", "brunch", "almoço", "sobremesa"];

export function SearchForm() {
  const router = useRouter();
  const [ingredients, setIngredients] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [maxTime, setMaxTime] = useState(0);
  const [goal, setGoal] = useState<NutritionGoal | "">("");
  const [occasion, setOccasion] = useState("");

  function addIngredient() {
    const parts = draft
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (parts.length === 0) return;
    setIngredients((prev) => [...new Set([...prev, ...parts])]);
    setDraft("");
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
    if (occasion) qs.set("occasions", occasion);
    router.push(`/results?${qs.toString()}`);
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-display text-3xl font-semibold text-forest">
          O que você tem aí?
        </h1>
        <p className="mt-1 text-sm text-carvao/60">
          A gente acha a receita que melhor combina.
        </p>
      </header>

      {/* Ingredientes */}
      <section className="flex flex-col gap-2.5">
        <Label icon={ICONS.leaf} title="Ingredientes disponíveis" />
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
            placeholder="Ovo, farinha, tomate..."
            className="flex-1 rounded-xl border border-areia bg-white px-3.5 py-2.5 text-sm outline-none placeholder:text-carvao/40 focus:border-forest"
          />
          <button
            type="button"
            onClick={addIngredient}
            aria-label="Adicionar ingrediente"
            className="flex w-11 items-center justify-center rounded-xl bg-forest text-lg font-semibold text-creme"
          >
            +
          </button>
        </div>
        {ingredients.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {ingredients.map((ing) => (
              <button
                key={ing}
                type="button"
                onClick={() => setIngredients((p) => p.filter((x) => x !== ing))}
                className="rounded-full bg-salvia/20 px-3 py-1 text-xs font-medium text-forest"
              >
                {ing} ✕
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Equipamentos */}
      <section className="flex flex-col gap-2.5">
        <Label icon={ICONS.stove} title="Equipamentos disponíveis" />
        <div className="flex flex-wrap gap-2">
          {EQUIPMENT_OPTIONS.map((opt) => (
            <Chip
              key={opt.value}
              active={equipment.includes(opt.value)}
              onClick={() => toggleEquip(opt.value)}
            >
              {opt.label}
            </Chip>
          ))}
        </div>
      </section>

      {/* Tempo */}
      <section className="flex flex-col gap-2.5">
        <Label icon={ICONS.clock} title="Tempo disponível" />
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
      <section className="flex flex-col gap-2.5">
        <Label icon={ICONS.target} title="Objetivo" />
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
      <section className="flex flex-col gap-2.5">
        <span className="text-sm font-semibold text-carvao">Ocasião</span>
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

      <button
        type="button"
        onClick={submit}
        disabled={ingredients.length === 0}
        className="mt-1 flex items-center justify-center gap-2 rounded-2xl bg-forest py-3.5 text-sm font-semibold text-creme transition disabled:opacity-40"
      >
        Buscar receitas
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

const ICONS = {
  leaf: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
      <path d="M11 20A7 7 0 0 1 4 13c0-5 5-9 16-9 0 11-4 16-9 16Z" strokeLinejoin="round" />
      <path d="M4 20c3-3 6-5 9-6" strokeLinecap="round" />
    </svg>
  ),
  stove: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
      <rect x="3" y="8" width="18" height="12" rx="2" />
      <path d="M7 8V5h10v3M8 12h.01M12 12h.01" strokeLinecap="round" />
    </svg>
  ),
  clock: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l3 2" strokeLinecap="round" />
    </svg>
  ),
  target: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
} as const;

function Label({ icon, title }: { icon: React.ReactNode; title: string }) {
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
      className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition ${
        active
          ? "border-forest bg-forest text-creme"
          : "border-areia bg-white text-carvao hover:border-salvia"
      }`}
    >
      {children}
    </button>
  );
}
