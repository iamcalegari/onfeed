"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import {
  applyGeneratedPlan,
  getDayMeals,
  removeMealFromPlan,
  setPendingSlot,
  type PlannedMeal,
} from "@/lib/planStorage";
import { getGoals } from "@/lib/nutritionPlan";
import { usePro } from "@/lib/usePro";
import { showToast } from "@/lib/toast";

/* ── Semana atual ────────────────────────────────────────────── */
function buildWeek() {
  const today  = new Date();
  const dow    = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((dow + 6) % 7));
  const DOWS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return {
      dow:     DOWS[i],
      num:     d.getDate(),
      date:    d.toISOString().slice(0, 10),
      isToday: d.toDateString() === today.toDateString(),
    };
  });
}

const WEEK = buildWeek();
const SLOTS = ["Café", "Almoço", "Lanche", "Jantar"];

/* ── Page ─────────────────────────────────────────────────────── */
export default function PlanoPage() {
  const router = useRouter();
  const pro = usePro();
  const [dayIdx, setDayIdx] = useState(() => WEEK.findIndex(d => d.isToday) ?? 0);
  const [meals, setMeals]   = useState<PlannedMeal[]>([]);
  const [goalKcal, setGoalKcal] = useState(0);
  const [generating, setGenerating] = useState(false);

  const selectedDay = WEEK[dayIdx];

  useEffect(() => {
    refresh();
    const g = getGoals();
    if (g) setGoalKcal(g.calories);
  }, [dayIdx]);

  function refresh() {
    setMeals(getDayMeals(selectedDay.date));
  }

  function handleAdd(slot: string) {
    setPendingSlot(slot, selectedDay.date);
    router.push("/buscar");
  }

  function handleRemove(slot: string) {
    removeMealFromPlan(selectedDay.date, slot);
    refresh();
  }

  async function handleGenerate() {
    if (!pro.isPro) {
      showToast("Planos com IA são exclusivos do PRO", "✨");
      router.push("/progresso");
      return;
    }
    if (generating) return;
    const goals = getGoals();
    if (!goals) {
      showToast("Configure suas metas primeiro", "🎯");
      router.push("/onboarding");
      return;
    }
    setGenerating(true);
    showToast("Gerando seu plano da semana com IA…", "✨");
    try {
      const res = await fetch("/api/mealplan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          days: 7,
          slots: ["breakfast", "lunch", "snack", "dinner"],
          goals,
          usePantry: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Falha ao gerar o plano");
      applyGeneratedPlan(data);
      refresh();
      showToast("Plano da semana pronto!", "✅");
    } catch (e) {
      showToast((e as Error).message || "Não foi possível gerar agora", "⚠️");
    } finally {
      setGenerating(false);
    }
  }

  const filledKcal = meals.reduce((s, m) => s + m.kcal, 0);
  const mealBySlot = Object.fromEntries(meals.map(m => [m.slot, m]));

  const monthName = new Date(selectedDay.date).toLocaleDateString("pt-BR", { month: "long" });

  const dateRange = (() => {
    const months = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
    const m = new Date().getMonth();
    return `${WEEK[0].num}–${WEEK[6].num} ${months[m]}`;
  })();

  return (
    <div className="flex flex-col gap-0 pb-4" style={{ animation: "ofRise .28s ease both" }}>

      {/* ── Header ─────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 18 }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 25, color: "var(--t-text-title)" }}>
          Seu plano
        </h1>
        <span style={{ fontSize: 13, color: "var(--t-text-secondary)", fontWeight: 600 }}>{dateRange}</span>
      </div>

      {/* ── Calendar ─────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 7 }}>
        {WEEK.map((d, i) => {
          const on = i === dayIdx;
          return (
            <button
              key={d.date}
              type="button"
              onClick={() => setDayIdx(i)}
              style={{
                flex: 1, textAlign: "center", padding: "11px 0", borderRadius: 14,
                background: on ? "var(--t-week-on-bg)" : "var(--t-week-off-bg)",
                border: `1px solid ${on ? "var(--t-week-on-bd)" : "var(--t-week-off-bd)"}`,
                cursor: "pointer",
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 600, color: on ? "var(--t-hero-fg2)" : "var(--t-text-muted)" }}>{d.dow}</div>
              <div style={{
                fontSize: 15, fontWeight: 700,
                color: on ? "var(--t-week-on-fg)" : d.isToday ? "var(--t-text-title)" : "var(--t-text-primary)",
                marginTop: 3, fontVariantNumeric: "tabular-nums",
              }}>
                {d.num}
              </div>
            </button>
          );
        })}
      </div>

      {/* ── Day label ─────────────────────────────────────────── */}
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.1, textTransform: "uppercase", color: "var(--t-text-secondary)", marginTop: 24, marginBottom: 13 }}>
        {selectedDay.dow}, {selectedDay.num} de {monthName}
      </div>

      {/* ── Meal slots ─────────────────────────────────────────── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
        {SLOTS.map(slot => {
          const meal = mealBySlot[slot];
          return (
            <div
              key={slot}
              style={{
                background: "var(--t-bg-card)", border: "1px solid var(--t-bd-card)", borderRadius: 18,
                padding: 15, boxShadow: "0 4px 12px -8px rgba(22,47,37,.14)",
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--t-text-secondary)", textTransform: "uppercase", letterSpacing: .8 }}>
                {slot}
              </div>
              {meal ? (
                <div>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginTop: 5 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: "var(--t-text-primary)" }}>{meal.name}</div>
                      <div style={{ fontSize: 12.5, color: "var(--t-text-secondary)", fontWeight: 600, marginTop: 4, fontVariantNumeric: "tabular-nums" }}>
                        {meal.kcal} kcal · P {meal.protein}g · C {meal.carbs}g · G {meal.fat}g
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemove(slot)}
                      style={{ color: "#d4644a", background: "none", border: "none", cursor: "pointer", fontSize: 18, lineHeight: 1, padding: "0 0 0 12px" }}
                    >
                      ×
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => router.push(`/recipe/${meal.recipeId}`)}
                    style={{ marginTop: 8, fontSize: 12, fontWeight: 600, color: "var(--t-text-title)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                  >
                    Ver receita →
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => handleAdd(slot)}
                  style={{ fontSize: 14, fontWeight: 700, color: "#d4644a", marginTop: 6, background: "none", border: "none", cursor: "pointer", padding: 0 }}
                >
                  + Adicionar receita
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Day total ─────────────────────────────────────────── */}
      <div style={{
        background: "var(--t-bg-section)", borderRadius: 16, padding: "15px 17px",
        marginTop: 18, display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <span style={{ fontSize: 13, color: "var(--t-text-body)", fontWeight: 600 }}>Total do dia</span>
        <span style={{ fontSize: 15, fontWeight: 800, color: "var(--t-text-title)", fontVariantNumeric: "tabular-nums" }}>
          {filledKcal.toLocaleString("pt-BR")}{" "}
          {goalKcal > 0 && (
            <span style={{ fontSize: 12, color: "var(--t-text-muted)", fontWeight: 600 }}>
              / {goalKcal.toLocaleString("pt-BR")} kcal
            </span>
          )}
        </span>
      </div>

      {/* ── PRO CTA ───────────────────────────────────────────── */}
      <div
        onClick={handleGenerate}
        className="ofcard"
        style={{
          display: "flex", alignItems: "center", gap: 10,
          background: "var(--t-bg-match-bar)", borderRadius: 18,
          padding: 16, marginTop: 18, cursor: "pointer",
          boxShadow: "0 10px 24px -12px rgba(22,47,37,.5)",
        }}
      >
        <span style={{ fontSize: 20 }}>✨</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--t-hero-fg)" }}>
            {generating ? "Gerando seu plano…" : "Gerar plano automático"}
          </div>
          <div style={{ fontSize: 12, color: "var(--t-hero-fg2)", marginTop: 1 }}>28 refeições com IA · onFeed Pro</div>
        </div>
        <span style={{
          fontSize: 10, fontWeight: 800, letterSpacing: 1, borderRadius: 8, padding: "4px 8px",
          background: pro.isPro ? "var(--t-success)" : "#e0c9a6",
          color:      pro.isPro ? "var(--t-cta-fg)" : "#162f25",
        }}>
          {pro.isPro ? "ATIVO" : "PRO"}
        </span>
      </div>

      {/* ── Lista de compras ──────────────────────────────────── */}
      <button
        type="button"
        onClick={() => router.push("/compras")}
        style={{
          display: "flex", alignItems: "center", gap: 10,
          background: "var(--t-bg-card)", border: "1px solid var(--t-bd-strong)", borderRadius: 18,
          padding: 16, marginTop: 11, cursor: "pointer", width: "100%", textAlign: "left",
        }}
      >
        <span style={{ fontSize: 19 }}>🛒</span>
        <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: "var(--t-text-primary)" }}>Gerar lista de compras</span>
        <span style={{ color: "#d4644a", fontSize: 16 }}>→</span>
      </button>
    </div>
  );
}
