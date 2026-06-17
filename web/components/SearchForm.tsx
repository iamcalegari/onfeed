"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { Equipment, NutritionGoal } from "@/lib/types";

const EQUIPMENT_OPTIONS: { value: Equipment; label: string }[] = [
  { value: "stovetop", label: "Fogão" },
  { value: "oven", label: "Forno" },
  { value: "microwave", label: "Microondas" },
  { value: "blender", label: "Liquidificador" },
];

const TIME_OPTIONS: { value: number | 0; label: string }[] = [
  { value: 0, label: "Qualquer" },
  { value: 30, label: "Até 30 min" },
  { value: 60, label: "Até 1h" },
];

const GOAL_OPTIONS: { value: NutritionGoal | ""; label: string }[] = [
  { value: "", label: "Tanto faz" },
  { value: "satiety", label: "Matar a fome" },
  { value: "macros", label: "Respeitar macros" },
];

const OCCASION_OPTIONS = ["tira-gosto", "entrada", "almoço", "sobremesa"];

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
    <div className="flex flex-col gap-7">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">O que você tem aí?</h1>
        <p className="mt-1 text-sm text-stone-500">
          A gente acha a receita que melhor combina.
        </p>
      </header>

      {/* I — Ingredientes */}
      <section className="flex flex-col gap-2">
        <Label n="I" title="Ingredientes disponíveis" />
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
            placeholder="ovo, farinha, ..."
            className="flex-1 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500"
          />
          <button
            type="button"
            onClick={addIngredient}
            className="rounded-lg bg-stone-800 px-4 text-sm font-medium text-white"
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
                onClick={() =>
                  setIngredients((p) => p.filter((x) => x !== ing))
                }
                className="rounded-full bg-emerald-100 px-3 py-1 text-xs text-emerald-800"
              >
                {ing} ✕
              </button>
            ))}
          </div>
        )}
      </section>

      {/* E — Equipamentos */}
      <section className="flex flex-col gap-2">
        <Label n="E" title="Equipamentos disponíveis" />
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

      {/* T — Tempo */}
      <section className="flex flex-col gap-2">
        <Label n="T" title="Tempo disponível" />
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

      {/* N — Objetivo */}
      <section className="flex flex-col gap-2">
        <Label n="N" title="Objetivo" />
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
      <section className="flex flex-col gap-2">
        <span className="text-sm font-semibold text-stone-700">Ocasião</span>
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
        className="mt-2 rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white disabled:opacity-40"
      >
        Buscar receitas
      </button>
    </div>
  );
}

function Label({ n, title }: { n: string; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-stone-800 text-xs font-bold text-white">
        {n}
      </span>
      <span className="text-sm font-semibold text-stone-700">{title}</span>
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
      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
        active
          ? "border-emerald-600 bg-emerald-600 text-white"
          : "border-stone-300 bg-white text-stone-700"
      }`}
    >
      {children}
    </button>
  );
}
