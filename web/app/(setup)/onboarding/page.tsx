"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { setGoals } from "@/lib/nutritionPlan";

/* ── Cálculo de TMB ──────────────────────────────────────────── */
function calcGoals(weight: number, height: number, age: number, objective: string) {
  const bmr  = 10 * weight + 6.25 * height - 5 * age + (objective === "muscle" ? 5 : -161);
  const tdee = bmr * 1.4;
  let calories = tdee;
  if (objective === "lose")   calories = tdee - 400;
  if (objective === "gain")   calories = tdee + 300;
  if (objective === "muscle") calories = tdee + 200;
  calories = Math.round(calories / 10) * 10;
  const protein = Math.round(weight * (objective === "muscle" ? 2.2 : 1.8));
  const fat     = Math.round((calories * 0.27) / 9);
  const carbs   = Math.round((calories - protein * 4 - fat * 9) / 4);
  return { calories, protein, carbs, fat };
}

type Objective = "lose" | "maintain" | "muscle" | "better";
type Diet = "normal" | "lowcarb" | "vegetarian" | "vegan" | "glutenfree" | "lactosefree" | "highprotein";

/* ── Page ─────────────────────────────────────────────────────── */
export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep]           = useState(0);
  const [objective, setObjective] = useState<Objective>("lose");
  const [weight, setWeight]       = useState("");
  const [height, setHeight]       = useState("");
  const [age, setAge]             = useState("");
  const [diets, setDiets]         = useState<Diet[]>([]);
  const [computed, setComputed]   = useState<ReturnType<typeof calcGoals> | null>(null);
  const [custom, setCustom]       = useState<ReturnType<typeof calcGoals> | null>(null);
  const [editingGoals, setEditing] = useState(false);

  const progress = ((step + 1) / 6) * 100;

  function nextStep() {
    if (step === 2) {
      const w = Number(weight), h = Number(height), a = Number(age);
      if (w > 0 && h > 0 && a > 0) {
        const g = calcGoals(w, h, a, objective);
        setComputed(g);
        setCustom(g);
        setStep(s => s + 1);
      }
      return;
    }
    setStep(s => s + 1);
  }

  function finish() {
    setGoals(custom ?? computed!);
    router.replace("/hoje");
  }

  function toggleDiet(d: Diet) {
    setDiets(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);
  }

  const OBJECTIVES: { value: Objective; label: string; emoji: string }[] = [
    { value: "lose",     label: "Perder peso",              emoji: "⚖️" },
    { value: "maintain", label: "Manter o peso saudável",   emoji: "✅" },
    { value: "muscle",   label: "Ganhar massa muscular",     emoji: "💪" },
    { value: "better",   label: "Simplesmente comer melhor", emoji: "🥗" },
  ];

  const DIETS: { value: Diet; label: string }[] = [
    { value: "normal",      label: "Normal (como de tudo)" },
    { value: "lowcarb",     label: "Low-carb / Keto"       },
    { value: "vegetarian",  label: "Vegetariano"            },
    { value: "vegan",       label: "Vegano"                 },
    { value: "glutenfree",  label: "Sem glúten"             },
    { value: "lactosefree", label: "Sem lactose"            },
    { value: "highprotein", label: "Alta proteína"          },
  ];

  return (
    <div className="flex min-h-[calc(100svh-3rem)] flex-col">
      {/* Progress bar */}
      <div className="mb-8">
        <div className="h-1.5 overflow-hidden rounded-full bg-areia/40">
          <div
            className="h-full rounded-full bg-forest transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="mt-2 text-right text-xs text-carvao/35">{step + 1} de 6</p>
      </div>

      {/* Step content */}
      <div className="flex flex-1 flex-col">
        {step === 0 && (
          <StepShell title="Bem-vindo ao onFeed" subtitle="Receitas que encaixam no seu plano">
            <div className="flex flex-col items-center gap-6 py-4">
              <img src="/app-icon.png" alt="onFeed" className="h-24 w-24 rounded-[22px] shadow-xl" />
              <p className="max-w-60 text-center text-sm leading-relaxed text-carvao/55">
                Em poucos passos, vamos configurar suas metas e mostrar receitas perfeitas para você.
              </p>
            </div>
          </StepShell>
        )}

        {step === 1 && (
          <StepShell title="Qual é o seu objetivo?" subtitle="Toque em uma opção">
            <div className="flex flex-col gap-2.5">
              {OBJECTIVES.map((obj) => (
                <button
                  key={obj.value}
                  type="button"
                  onClick={() => setObjective(obj.value)}
                  className={`flex items-center gap-4 rounded-2xl border-2 p-4 text-left transition-all ${
                    objective === obj.value
                      ? "border-forest bg-forest/6 text-forest"
                      : "border-areia/60 bg-white text-carvao"
                  }`}
                >
                  <span className="text-2xl">{obj.emoji}</span>
                  <span className="font-semibold">{obj.label}</span>
                  {objective === obj.value && <span className="ml-auto text-forest">✓</span>}
                </button>
              ))}
            </div>
          </StepShell>
        )}

        {step === 2 && (
          <StepShell title="Seus dados" subtitle="Para calcular suas metas automaticamente">
            <div className="flex flex-col gap-4">
              <OInput label="Peso atual (kg)" value={weight} onChange={setWeight} placeholder="70" />
              <OInput label="Altura (cm)"     value={height} onChange={setHeight} placeholder="168" />
              <OInput label="Idade"           value={age}    onChange={setAge}    placeholder="28" />
            </div>
          </StepShell>
        )}

        {step === 3 && (
          <StepShell title="Como você come?" subtitle="Selecione todas que se aplicam">
            <div className="flex flex-col gap-2">
              {DIETS.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => toggleDiet(d.value)}
                  className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm font-medium transition-all ${
                    diets.includes(d.value)
                      ? "border-forest/30 bg-forest/6 text-forest"
                      : "border-areia/60 bg-white text-carvao"
                  }`}
                >
                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded text-[11px] font-bold ${
                    diets.includes(d.value) ? "bg-forest text-creme" : "border border-areia/80 bg-areia/20 text-transparent"
                  }`}>✓</span>
                  {d.label}
                </button>
              ))}
            </div>
          </StepShell>
        )}

        {step === 4 && computed && custom && (
          <StepShell title="Sua meta diária" subtitle="Calculamos com base nos seus dados">
            {!editingGoals ? (
              <div className="flex flex-col gap-5">
                <div className="rounded-3xl bg-forest/6 p-6 text-center">
                  <p className="font-display text-5xl font-bold tabular-nums text-forest">{custom.calories}</p>
                  <p className="mt-1 text-sm font-semibold text-forest/60">kcal por dia</p>
                </div>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <MBox label="Proteína" value={custom.protein} color="#4a7fcb" />
                  <MBox label="Carbs"    value={custom.carbs}   color="#e8a020" />
                  <MBox label="Gordura"  value={custom.fat}     color="#d4644a" />
                </div>
                <button type="button" onClick={() => setEditing(true)}
                  className="text-center text-sm text-carvao/40 hover:text-carvao/70">
                  Ajustar manualmente →
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {(["calories","protein","carbs","fat"] as const).map((k) => (
                  <EInput
                    key={k}
                    label={{ calories: "Calorias (kcal)", protein: "Proteína (g)", carbs: "Carbs (g)", fat: "Gordura (g)" }[k]}
                    value={String(custom[k])}
                    onChange={(v) => setCustom(c => ({ ...c!, [k]: Number(v) || 0 }))}
                  />
                ))}
                <button type="button" onClick={() => setEditing(false)}
                  className="text-sm font-semibold text-forest">
                  ← Valores calculados
                </button>
              </div>
            )}
          </StepShell>
        )}

        {step === 5 && (
          <StepShell title="Pronto!" subtitle="Agora me diz o que tem na geladeira 🥦">
            <div className="flex flex-col items-center gap-5 py-4 text-center">
              <span className="text-6xl">🎉</span>
              <p className="text-sm leading-relaxed text-carvao/55">
                Suas metas estão configuradas. Na próxima tela você informa os ingredientes que tem e vê as melhores receitas para o seu plano.
              </p>
            </div>
          </StepShell>
        )}
      </div>

      {/* CTA */}
      <div className="mt-auto pt-6">
        {step < 5 ? (
          <button
            type="button"
            onClick={nextStep}
            disabled={step === 2 && (!weight || !height || !age)}
            className={`flex w-full items-center justify-center rounded-2xl py-4 text-base font-bold transition-all ${
              step === 2 && (!weight || !height || !age)
                ? "bg-areia/40 text-carvao/30"
                : "bg-forest text-creme shadow-sm active:scale-[0.98]"
            }`}
          >
            Continuar →
          </button>
        ) : (
          <button
            type="button"
            onClick={finish}
            className="flex w-full items-center justify-center rounded-2xl bg-forest py-4 text-base font-bold text-creme shadow-sm active:scale-[0.98]"
          >
            Ver minhas receitas →
          </button>
        )}
      </div>
    </div>
  );
}

/* ── Sub-components ─────────────────────────────────────────── */

function StepShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-forest">{title}</h1>
        <p className="mt-1 text-sm text-carvao/45">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}

function MBox({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-2xl bg-white py-4 shadow-sm ring-1 ring-areia/60">
      <span className="font-display text-2xl font-bold tabular-nums" style={{ color }}>{value}g</span>
      <span className="text-[10px] font-bold uppercase tracking-wide text-carvao/40">{label}</span>
    </div>
  );
}

function OInput({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-semibold text-carvao/55">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-2xl border border-areia bg-white px-4 py-3.5 text-base font-semibold text-carvao placeholder:text-carvao/25 focus:border-forest/50 focus:outline-none focus:ring-2 focus:ring-forest/15"
      />
    </label>
  );
}

function EInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center gap-3">
      <span className="w-36 shrink-0 text-xs font-bold uppercase tracking-wide text-carvao/40">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 rounded-xl border border-areia bg-white px-3 py-2.5 text-sm font-semibold text-carvao focus:border-forest/50 focus:outline-none focus:ring-2 focus:ring-forest/15"
      />
    </label>
  );
}
