"use client";

import { useEffect, useRef, useState } from "react";
import { useUser } from "@clerk/nextjs";

import { getMacroHistory, getGoals, type DayMacro } from "@/lib/nutritionPlan";
import {
  addWeight,
  deleteWeight,
  getWeightHistory,
  getLatestWeight,
  weightSparklinePoints,
  type WeightEntry,
} from "@/lib/weightStorage";
import { PRO_FEATURES, PRO_PRICE } from "@/lib/proStorage";
import { usePro } from "@/lib/usePro";
import { showToast } from "@/lib/toast";

/* ── Achievements ────────────────────────────────────────────── */
const ACHIEVEMENTS = [
  { icon: "🔥", title: "Semana perfeita",        sub: "7 dias seguidos na meta",      bg: "var(--t-fat-bg)", minStreak: 7 },
  { icon: "🥗", title: "10 receitas cozinhadas", sub: "Você está pegando o jeito!",   bg: "var(--t-ok-bg)", minStreak: 0 },
  { icon: "💪", title: "Meta de proteína 5×",    sub: "Bateu a meta 5 dias seguidos", bg: "var(--t-protein-bg)", minStreak: 5 },
];

export default function ProgressoPage() {
  const pro = usePro();
  const { user } = useUser();
  const [subscribing, setSubscribing] = useState(false);
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
    <div className="flex flex-col gap-4 pb-4" style={{ animation: "ofRise .28s ease both" }}>

      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 25, color: "var(--t-text-title)", marginBottom: 4 }}>
        Progresso
      </h1>

      {/* ── Aderência ─────────────────────────────────────────── */}
      <div style={{ background: "var(--t-bg-card)", border: "1px solid var(--t-bd-card)", borderRadius: 22, padding: 20, boxShadow: "0 6px 18px -12px rgba(22,47,37,.18)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--t-text-body)" }}>Aderência à dieta · esta semana</span>
          <span style={{ fontFamily: "var(--font-display)", fontSize: 26, color: "var(--t-success)" }}>{adherence}%</span>
        </div>
        <div style={{ height: 9, borderRadius: 6, background: "var(--t-progress-track)", overflow: "hidden", marginTop: 12 }}>
          <div style={{ height: "100%", borderRadius: 6, width: `${adherence}%`, background: "linear-gradient(90deg,var(--t-success),#6bbd86)", transition: "width .6s ease" }} />
        </div>
        <div style={{ fontSize: 12, color: "var(--t-text-muted)", fontWeight: 600, marginTop: 8 }}>
          {daysWithData} de {macros.length} dias com registro 🎯
        </div>
      </div>

      {/* ── Macros bar chart ──────────────────────────────────── */}
      <div style={{ background: "var(--t-bg-card)", border: "1px solid var(--t-bd-card)", borderRadius: 22, padding: 20, boxShadow: "0 6px 18px -12px rgba(22,47,37,.18)" }}>
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "var(--t-text-secondary)" }}>
          Macros · 7 dias
        </span>
        {daysWithData === 0 ? (
          <p style={{ fontSize: 13, color: "var(--t-text-muted)", marginTop: 16, textAlign: "center", padding: "16px 0" }}>
            Registre suas refeições para ver o histórico de macros.
          </p>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 9, height: 130, marginTop: 18 }}>
              {macros.map((b, i) => (
                <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                  <div style={{ width: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end", height: 104, borderRadius: "6px 6px 0 0", overflow: "hidden", background: b.hasData ? undefined : "var(--t-bg-section)" }}>
                    {b.hasData && (
                      <>
                        <div style={{ height: toH(b.fat     * 9), background: "#d4644a" }} />
                        <div style={{ height: toH(b.carbs   * 4), background: "#e8a020" }} />
                        <div style={{ height: toH(b.protein * 4), background: "var(--t-protein-fg)" }} />
                      </>
                    )}
                  </div>
                  <span style={{ fontSize: 10, color: "var(--t-text-muted)", fontWeight: 600 }}>{b.dow}</span>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 16, marginTop: 14 }}>
              <span style={{ fontSize: 11, color: "var(--t-protein-lbl)", fontWeight: 600 }}>● Proteína</span>
              <span style={{ fontSize: 11, color: "var(--t-carb-lbl)", fontWeight: 600 }}>● Carbo</span>
              <span style={{ fontSize: 11, color: "var(--t-fat-lbl)", fontWeight: 600 }}>● Gordura</span>
            </div>
          </>
        )}
      </div>

      {/* ── Peso ─────────────────────────────────────────────── */}
      <div style={{ background: "var(--t-bg-hero)", borderRadius: 22, padding: 20, color: "var(--t-hero-fg)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "var(--t-hero-fg2)" }}>
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
            {latestKg.kg.toLocaleString("pt-BR", { minimumFractionDigits: 1 })} <span style={{ fontSize: 16, color: "var(--t-hero-fg2)" }}>kg</span>
          </div>
        ) : (
          <div style={{ fontSize: 14, color: "var(--t-hero-fg2)", marginTop: 8 }}>Nenhum registro ainda</div>
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
                borderRadius: 10, padding: "10px 12px", color: "var(--t-hero-fg)", fontSize: 15,
                outline: "none",
              }}
            />
            <button
              type="submit"
              style={{
                background: "#e0c9a6", color: "var(--t-text-title)", borderRadius: 10,
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
                <span style={{ fontSize: 12, color: "var(--t-hero-fg2)" }}>
                  {new Date(e.date + "T12:00:00").toLocaleDateString("pt-BR", { day: "numeric", month: "short" })}
                </span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--t-hero-fg)", fontVariantNumeric: "tabular-nums" }}>
                  {e.kg.toLocaleString("pt-BR", { minimumFractionDigits: 1 })} kg
                </span>
                <button
                  type="button"
                  onClick={() => { deleteWeight(e.date); refreshWeight(); }}
                  style={{ fontSize: 13, color: "var(--t-hero-fg2)", background: "none", border: "none", cursor: "pointer" }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Conquistas ───────────────────────────────────────── */}
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.1, textTransform: "uppercase", color: "var(--t-text-secondary)", marginTop: 10 }}>
        Conquistas
      </div>
      {unlocked.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {unlocked.map(a => (
            <div key={a.title} style={{ display: "flex", alignItems: "center", gap: 13, background: "var(--t-bg-card)", border: "1px solid var(--t-bd-card)", borderRadius: 16, padding: "14px 16px" }}>
              <span style={{ width: 42, height: 42, borderRadius: 13, background: a.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>
                {a.icon}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--t-text-primary)" }}>{a.title}</div>
                <div style={{ fontSize: 12, color: "var(--t-text-muted)", fontWeight: 500, marginTop: 1 }}>{a.sub}</div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p style={{ fontSize: 13, color: "var(--t-text-muted)", padding: "8px 0" }}>
          Registre suas refeições para desbloquear conquistas!
        </p>
      )}

      {/* ── onFeed PRO ───────────────────────────────────────── */}
      <div style={{
        background: "linear-gradient(125deg,#d4644a,#e0865f)", borderRadius: 22, padding: 22,
        marginTop: 6, color: "#fff", boxShadow: "0 12px 28px -12px rgba(212,100,74,.6)",
      }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.5 }}>✨ ONFEED PRO</div>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 21, marginTop: 8, lineHeight: 1.2 }}>
          {pro.isPro ? "Você está no PRO ✦" : "Sem limites, sem anúncios"}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 15 }}>
          {PRO_FEATURES.map(f => (
            <div key={f.title} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <span style={{
                width: 20, height: 20, borderRadius: "50%", background: "rgba(255,255,255,.22)",
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, flexShrink: 0, marginTop: 1,
              }}>✓</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, lineHeight: 1.25 }}>{f.title}</div>
                <div style={{ fontSize: 11.5, opacity: 0.82, marginTop: 1, lineHeight: 1.3 }}>{f.free}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 16 }}>
          <span style={{ fontSize: 24, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{PRO_PRICE}</span>
          <span style={{ fontSize: 13, opacity: 0.85 }}>/mês</span>
        </div>
        {!pro.isPro && (
          <button
            type="button"
            disabled={subscribing}
            onClick={async () => {
              if (subscribing) return;
              const email = user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses?.[0]?.emailAddress;
              if (!email) { showToast("Não foi possível obter seu e-mail", "⚠️"); return; }
              setSubscribing(true);
              try {
                const res = await fetch("/api/billing/subscribe", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ email }),
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data?.error ?? "Falha ao iniciar a assinatura");
                window.open(data.initPoint as string, "_blank", "noopener");
              } catch (e) {
                showToast((e as Error).message || "Não foi possível assinar agora", "⚠️");
              } finally {
                setSubscribing(false);
              }
            }}
            style={{
              width: "100%", background: "var(--t-bg-card)", color: "#d4644a", border: "none",
              borderRadius: 14, padding: 13, textAlign: "center", fontSize: 14, fontWeight: 800,
              marginTop: 14, cursor: subscribing ? "default" : "pointer", opacity: subscribing ? 0.7 : 1,
            }}
          >
            {subscribing ? "Redirecionando…" : "Testar 7 dias grátis"}
          </button>
        )}
      </div>
    </div>
  );
}
