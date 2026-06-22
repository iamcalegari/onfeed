"use client";

import { useEffect, useRef, useState } from "react";

import { getMacroHistory, getGoals, type DayMacro } from "@/lib/nutritionPlan";
import {
  addWeight,
  deleteWeight,
  getWeightHistory,
  getLatestWeight,
  weightSparklinePoints,
  type WeightEntry,
} from "@/lib/weightStorage";

/* ── Achievements ────────────────────────────────────────────── */
const ACHIEVEMENTS = [
  { icon: "🔥", title: "Semana perfeita",        sub: "7 dias seguidos na meta",      bg: "#fde8df", minStreak: 7 },
  { icon: "🥗", title: "10 receitas cozinhadas", sub: "Você está pegando o jeito!",   bg: "#e4f1e9", minStreak: 0 },
  { icon: "💪", title: "Meta de proteína 5×",    sub: "Bateu a meta 5 dias seguidos", bg: "#eef3fb", minStreak: 5 },
];

export default function ProgressoPage() {
  const [streak, setStreak]       = useState(0);
  const [macros, setMacros]       = useState<DayMacro[]>([]);
  const [goalKcal, setGoalKcal]   = useState(0);
  const [weights, setWeights]     = useState<WeightEntry[]>([]);
  const [latestKg, setLatestKg]   = useState<WeightEntry | null>(null);
  const [newKg, setNewKg]         = useState("");
  const [showWeightForm, setShowWeightForm] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("onfeed:streak");
      if (raw) setStreak(JSON.parse(raw).count ?? 0);
    } catch { /* ignore */ }

    const g = getGoals();
    if (g) setGoalKcal(g.calories);

    setMacros(getMacroHistory(7));
    refreshWeight();
  }, []);

  function refreshWeight() {
    const history = getWeightHistory();
    setWeights(history);
    setLatestKg(getLatestWeight());
  }

  function handleAddWeight(e: React.FormEvent) {
    e.preventDefault();
    const kg = parseFloat(newKg.replace(",", "."));
    if (!isNaN(kg) && kg > 0) {
      addWeight(kg);
      setNewKg("");
      setShowWeightForm(false);
      refreshWeight();
    }
  }

  // Aderência: % de dias com dados na última semana
  const daysWithData = macros.filter(d => d.hasData).length;
  const adherence = macros.length > 0 ? Math.round((daysWithData / macros.length) * 100) : 0;

  // Para o gráfico: normaliza alturas por goals
  const maxKcal = Math.max(goalKcal, ...macros.map(d => d.calories), 1);
  function toH(v: number): string { return `${Math.round((v / maxKcal) * 100)}%`; }

  // Variação de peso
  const weightDelta = weights.length >= 2
    ? weights[weights.length - 1].kg - weights[0].kg
    : null;

  // Pontos para sparkline
  const sparkPts = weightSparklinePoints(weights.slice(-14));

  // Conquistas desbloqueadas
  const unlocked = ACHIEVEMENTS.filter(a => {
    if (a.minStreak === 0) return daysWithData > 0;
    return streak >= a.minStreak;
  });

  return (
    <div className="flex flex-col gap-4 pb-4">

      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 25, color: "#162f25", marginBottom: 4 }}>
        Progresso
      </h1>

      {/* ── Aderência ─────────────────────────────────────────── */}
      <div style={{ background: "#fff", border: "1px solid #f2e6d6", borderRadius: 22, padding: 20, boxShadow: "0 6px 18px -12px rgba(22,47,37,.18)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#5c5c57" }}>Aderência à dieta · esta semana</span>
          <span style={{ fontFamily: "var(--font-display)", fontSize: 26, color: "#2d7d4e" }}>{adherence}%</span>
        </div>
        <div style={{ height: 9, borderRadius: 6, background: "#eef0ea", overflow: "hidden", marginTop: 12 }}>
          <div style={{ height: "100%", borderRadius: 6, width: `${adherence}%`, background: "linear-gradient(90deg,#2d7d4e,#6bbd86)", transition: "width .6s ease" }} />
        </div>
        <div style={{ fontSize: 12, color: "#9aa39b", fontWeight: 600, marginTop: 8 }}>
          {daysWithData} de {macros.length} dias com registro 🎯
        </div>
      </div>

      {/* ── Macros bar chart ──────────────────────────────────── */}
      <div style={{ background: "#fff", border: "1px solid #f2e6d6", borderRadius: 22, padding: 20, boxShadow: "0 6px 18px -12px rgba(22,47,37,.18)" }}>
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "#7a9e94" }}>
          Macros · 7 dias
        </span>
        {daysWithData === 0 ? (
          <p style={{ fontSize: 13, color: "#9aa39b", marginTop: 16, textAlign: "center", padding: "16px 0" }}>
            Registre suas refeições para ver o histórico de macros.
          </p>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 9, height: 130, marginTop: 18 }}>
              {macros.map((b, i) => (
                <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                  <div style={{ width: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end", height: 104, borderRadius: "6px 6px 0 0", overflow: "hidden", background: b.hasData ? undefined : "#f3ede1" }}>
                    {b.hasData && (
                      <>
                        <div style={{ height: toH(b.fat     * 9), background: "#d4644a" }} />
                        <div style={{ height: toH(b.carbs   * 4), background: "#e8a020" }} />
                        <div style={{ height: toH(b.protein * 4), background: "#4a7fcb" }} />
                      </>
                    )}
                  </div>
                  <span style={{ fontSize: 10, color: "#9aa39b", fontWeight: 600 }}>{b.dow}</span>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 16, marginTop: 14 }}>
              <span style={{ fontSize: 11, color: "#7a8ba8", fontWeight: 600 }}>● Proteína</span>
              <span style={{ fontSize: 11, color: "#a98a4e", fontWeight: 600 }}>● Carbo</span>
              <span style={{ fontSize: 11, color: "#b06a55", fontWeight: 600 }}>● Gordura</span>
            </div>
          </>
        )}
      </div>

      {/* ── Peso ─────────────────────────────────────────────── */}
      <div style={{ background: "#162f25", borderRadius: 22, padding: 20, color: "#faf4e8" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "#9db8ad" }}>
            Peso
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            {weightDelta !== null && (
              <span style={{ fontSize: 12, color: weightDelta < 0 ? "#7ec79a" : "#f0a070", fontWeight: 700 }}>
                {weightDelta < 0 ? "↓" : "↑"} {Math.abs(weightDelta).toFixed(1)} kg
              </span>
            )}
            <button
              type="button"
              onClick={() => setShowWeightForm(v => !v)}
              style={{ fontSize: 12, color: "#e0c9a6", fontWeight: 700, background: "none", border: "none", cursor: "pointer" }}
            >
              {showWeightForm ? "Cancelar" : "+ Registrar"}
            </button>
          </div>
        </div>

        {latestKg ? (
          <div style={{ fontFamily: "var(--font-display)", fontSize: 34, marginTop: 6, fontVariantNumeric: "tabular-nums" }}>
            {latestKg.kg.toLocaleString("pt-BR", { minimumFractionDigits: 1 })} <span style={{ fontSize: 16, color: "#9db8ad" }}>kg</span>
          </div>
        ) : (
          <div style={{ fontSize: 14, color: "#9db8ad", marginTop: 8 }}>Nenhum registro ainda</div>
        )}

        {showWeightForm && (
          <form onSubmit={handleAddWeight} style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              placeholder="Ex: 72,5"
              value={newKg}
              onChange={e => setNewKg(e.target.value)}
              style={{
                flex: 1, background: "rgba(255,255,255,.1)", border: "1px solid rgba(255,255,255,.2)",
                borderRadius: 10, padding: "10px 12px", color: "#faf4e8", fontSize: 15,
                outline: "none",
              }}
            />
            <button
              type="submit"
              style={{
                background: "#e0c9a6", color: "#162f25", borderRadius: 10,
                padding: "10px 16px", fontSize: 14, fontWeight: 700,
                border: "none", cursor: "pointer",
              }}
            >
              Salvar
            </button>
          </form>
        )}

        {weights.length > 1 && sparkPts && (
          <svg viewBox="0 0 300 70" style={{ width: "100%", height: 64, marginTop: 12 }} preserveAspectRatio="none">
            <polyline
              points={sparkPts}
              fill="none" stroke="#7ec79a" strokeWidth="3"
              strokeLinecap="round" strokeLinejoin="round"
            />
            {weights.slice(-1).map((_, i) => {
              const pts = sparkPts.split(" ");
              const last = pts[pts.length - 1].split(",");
              return <circle key={i} cx={last[0]} cy={last[1]} r="4.5" fill="#e0c9a6" />;
            })}
          </svg>
        )}

        {/* histórico de entradas */}
        {weights.length > 0 && (
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
            {weights.slice(-5).reverse().map(e => (
              <div key={e.date} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 12, color: "#9db8ad" }}>
                  {new Date(e.date + "T12:00:00").toLocaleDateString("pt-BR", { day: "numeric", month: "short" })}
                </span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#faf4e8", fontVariantNumeric: "tabular-nums" }}>
                  {e.kg.toLocaleString("pt-BR", { minimumFractionDigits: 1 })} kg
                </span>
                <button
                  type="button"
                  onClick={() => { deleteWeight(e.date); refreshWeight(); }}
                  style={{ fontSize: 13, color: "#9db8ad", background: "none", border: "none", cursor: "pointer" }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Conquistas ───────────────────────────────────────── */}
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.1, textTransform: "uppercase", color: "#7a9e94", marginTop: 10 }}>
        Conquistas
      </div>
      {unlocked.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {unlocked.map(a => (
            <div key={a.title} style={{ display: "flex", alignItems: "center", gap: 13, background: "#fff", border: "1px solid #f2e6d6", borderRadius: 16, padding: "14px 16px" }}>
              <span style={{ width: 42, height: 42, borderRadius: 13, background: a.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>
                {a.icon}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#232320" }}>{a.title}</div>
                <div style={{ fontSize: 12, color: "#9aa39b", fontWeight: 500, marginTop: 1 }}>{a.sub}</div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p style={{ fontSize: 13, color: "#9aa39b", padding: "8px 0" }}>
          Registre suas refeições para desbloquear conquistas!
        </p>
      )}
    </div>
  );
}
