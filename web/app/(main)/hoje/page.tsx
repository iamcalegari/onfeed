"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import {
  getGoals,
  getTodayEntries,
  getTodayTotals,
  type MealLogEntry,
  type NutritionGoals,
} from "@/lib/nutritionPlan";

/* ── Streak ──────────────────────────────────────────────────── */
const STREAK_KEY = "onfeed:streak";

function recordStreak(): number {
  if (typeof window === "undefined") return 0;
  const today = new Date().toISOString().slice(0, 10);
  try {
    const raw = localStorage.getItem(STREAK_KEY);
    const data = raw ? JSON.parse(raw) : { lastDate: "", count: 0 };
    if (data.lastDate === today) return data.count;
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const count = data.lastDate === yesterday ? data.count + 1 : 1;
    localStorage.setItem(STREAK_KEY, JSON.stringify({ lastDate: today, count }));
    return count;
  } catch { return 0; }
}

/* ── Greeting ─────────────────────────────────────────────────── */
function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

function todayLabel() {
  return new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
}

function nextMealSlot() {
  const h = new Date().getHours();
  if (h < 10) return "Café da manhã";
  if (h < 14) return "Almoço";
  if (h < 17) return "Lanche";
  return "Jantar";
}

/* ── Slot definitions ────────────────────────────────────────── */
const SLOTS = [
  { label: "Café da manhã", icon: "☕", iconBg: "#f3ede1", hours: [0, 10] as [number, number] },
  { label: "Almoço",        icon: "🍽", iconBg: "#eef3fb", hours: [10, 14] as [number, number] },
  { label: "Lanche",        icon: "🍎", iconBg: "#fbeae6", hours: [14, 17] as [number, number] },
  { label: "Jantar",        icon: "🌙", iconBg: "#f0ece3", hours: [17, 24] as [number, number] },
];

function slotForEntry(entry: MealLogEntry): string {
  const h = new Date(entry.loggedAt).getHours();
  return SLOTS.find(s => h >= s.hours[0] && h < s.hours[1])?.label ?? "Jantar";
}

/* ── Dark Macro Ring ─────────────────────────────────────────── */
function DarkRing({ totals, goals }: { totals: ReturnType<typeof getTodayTotals>; goals: NutritionGoals }) {
  const size = 148, stroke = 15;
  const r = (size - stroke) / 2;
  const C = 2 * Math.PI * r;
  const cx = size / 2, cy = size / 2;

  const segs = [
    { color: "#4a7fcb", kcal: totals.protein * 4 },
    { color: "#e8a020", kcal: totals.carbs   * 4 },
    { color: "#d4644a", kcal: totals.fat     * 9 },
  ];

  let off = 0;
  const arcs = segs.map((seg, i) => {
    const len = Math.min(seg.kcal / goals.calories, 1) * C;
    const dashArray  = `${len} ${C - len}`;
    const dashOffset = -off;
    off += len;
    return { key: i, color: seg.color, dashArray, dashOffset };
  });

  const consumed  = totals.protein * 4 + totals.carbs * 4 + totals.fat * 9;
  const remaining = Math.max(0, Math.round(goals.calories - consumed));

  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(224,201,166,0.16)" strokeWidth={stroke} />
        {arcs.map(arc => (
          <circle
            key={arc.key}
            cx={cx} cy={cy} r={r} fill="none"
            stroke={arc.color} strokeWidth={stroke}
            strokeDasharray={arc.dashArray}
            strokeDashoffset={arc.dashOffset}
            strokeLinecap="butt"
            transform={`rotate(-90 ${cx} ${cy})`}
            style={{ transition: "stroke-dasharray .5s ease" }}
          />
        ))}
      </svg>
      <div style={{
        position: "absolute", inset: 0,
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
      }}>
        <span style={{
          fontFamily: "var(--font-display)", fontSize: 38,
          lineHeight: 1, color: "#faf4e8", fontVariantNumeric: "tabular-nums",
        }}>
          {remaining.toLocaleString("pt-BR")}
        </span>
        <span style={{
          fontSize: 10, letterSpacing: 1.4, textTransform: "uppercase",
          color: "#9db8ad", marginTop: 4,
        }}>
          kcal restantes
        </span>
      </div>
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────────── */
export default function HojePage() {
  const router = useRouter();
  const [goals, setGoalsState] = useState<NutritionGoals | null>(null);
  const [entries, setEntries]  = useState<MealLogEntry[]>([]);
  const [streak, setStreak]    = useState(0);
  const [mounted, setMounted]  = useState(false);

  useEffect(() => {
    const g = getGoals();
    if (!g) { router.replace("/onboarding"); return; }
    setGoalsState(g);
    setEntries(getTodayEntries());
    setStreak(recordStreak());
    setMounted(true);
  }, [router]);

  if (!mounted) return <HojeSkeleton />;

  const totals = getTodayTotals();
  const pills = [
    { label: "Proteína", color: "#4a7fcb", val: totals.protein, goal: goals!.protein },
    { label: "Carbo",    color: "#e8a020", val: totals.carbs,   goal: goals!.carbs   },
    { label: "Gordura",  color: "#d4644a", val: totals.fat,     goal: goals!.fat     },
  ];

  const slotMap: Record<string, MealLogEntry | undefined> = {};
  for (const e of entries) slotMap[slotForEntry(e)] = e;

  return (
    <div className="flex flex-col gap-6 pb-4">

      {/* ── Header ─────────────────────────────────────────── */}
      <header className="flex items-start justify-between pt-1">
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 26, color: "#162f25", lineHeight: 1.1 }}>
            {greeting()} 👋
          </h1>
          <p style={{ fontSize: 13, color: "#7a9e94", fontWeight: 500, marginTop: 3 }}>
            {todayLabel()}
          </p>
        </div>
        {streak > 0 && (
          <Link href="/progresso"
            className="flex items-center gap-1.5 rounded-full"
            style={{ background: "#fff", border: "1px solid #f2e6d6", padding: "7px 11px", boxShadow: "0 2px 6px rgba(22,47,37,.05)" }}>
            <span style={{ fontSize: 14 }}>🔥</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#f45d22", fontVariantNumeric: "tabular-nums" }}>
              {streak}
            </span>
          </Link>
        )}
      </header>

      {/* ── MacroRing Card ─────────────────────────────────── */}
      <div style={{
        background: "#162f25", borderRadius: 26, padding: "26px 22px",
        color: "#faf4e8", boxShadow: "0 16px 36px -14px rgba(22,47,37,.5)",
        position: "relative", overflow: "hidden",
      }}>
        <div style={{
          position: "absolute", top: -40, right: -30,
          width: 140, height: 140, borderRadius: "50%",
          background: "rgba(224,201,166,.07)", pointerEvents: "none",
        }} />
        <div style={{ display: "flex", alignItems: "center", gap: 22, position: "relative" }}>
          <DarkRing totals={totals} goals={goals!} />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 13 }}>
            {pills.map(p => (
              <div key={p.label}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
                  <span style={{ fontSize: 11, color: "#cdddd4", fontWeight: 500 }}>{p.label}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "#faf4e8" }}>
                    {Math.round(p.val)}/{p.goal}g
                  </span>
                </div>
                <div style={{ height: 6, borderRadius: 4, background: "rgba(224,201,166,.16)", overflow: "hidden" }}>
                  <div style={{
                    height: "100%", borderRadius: 4, background: p.color,
                    width: `${Math.min(100, Math.round(p.val / Math.max(1, p.goal) * 100))}%`,
                    transition: "width .5s ease",
                  }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Próxima refeição ───────────────────────────────── */}
      <div>
        <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase", color: "#7a9e94", marginBottom: 11 }}>
          Próxima refeição · {nextMealSlot()}
        </p>
        <Link href="/buscar" className="block" style={{ borderRadius: 22, overflow: "hidden", background: "#fff", boxShadow: "0 8px 22px -12px rgba(22,47,37,.22)", border: "1px solid #f2e6d6", textDecoration: "none" }}>
          <div style={{ height: 142, position: "relative", background: "repeating-linear-gradient(135deg,#e9ddc7 0 11px,#e2d4ba 11px 22px)", display: "flex", alignItems: "flex-end" }}>
            <span style={{ position: "absolute", top: 12, left: 12, background: "rgba(45,125,78,.95)", color: "#fff", fontSize: 11, fontWeight: 700, padding: "5px 10px", borderRadius: 20 }}>
              ✓ Buscar receitas
            </span>
            <div style={{ width: "100%", padding: "14px 16px", background: "linear-gradient(to top,rgba(0,0,0,.32),transparent)" }}>
              <span style={{ color: "#fff", fontFamily: "var(--font-display)", fontSize: 21 }}>
                Encontrar receita para {nextMealSlot()}
              </span>
            </div>
          </div>
          <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 13, color: "#5c5c57", fontWeight: 600 }}>
              Ver receitas que cabem no plano
            </span>
            <span style={{ fontSize: 13, color: "#d4644a", fontWeight: 600 }}>→</span>
          </div>
        </Link>
        <p
          onClick={() => router.push("/buscar")}
          style={{ textAlign: "center", marginTop: 11, fontSize: 13, fontWeight: 600, color: "#d4644a", cursor: "pointer" }}>
          Ver outras opções →
        </p>
      </div>

      {/* ── Refeições de hoje ──────────────────────────────── */}
      <div>
        <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase", color: "#7a9e94", marginBottom: 12 }}>
          Hoje
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {SLOTS.map(slot => {
            const entry = slotMap[slot.label];
            const kcal = entry ? Math.round(entry.nutrition.calories * entry.servings) : 0;
            const p = entry ? Math.round(entry.nutrition.protein * entry.servings) : 0;
            const c = entry ? Math.round(entry.nutrition.carbs   * entry.servings) : 0;
            const f = entry ? Math.round(entry.nutrition.fat     * entry.servings) : 0;
            return (
              <div
                key={slot.label}
                onClick={() => router.push(entry ? `/recipe/${entry.recipeId}` : "/buscar")}
                style={{
                  background: "#fff", border: "1px solid #f2e6d6", borderRadius: 18,
                  padding: "14px 16px", display: "flex", alignItems: "center", gap: 13,
                  cursor: "pointer", boxShadow: "0 3px 10px -6px rgba(22,47,37,.12)",
                }}
              >
                <div style={{ width: 40, height: 40, borderRadius: 12, background: slot.iconBg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>
                  {slot.icon}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: "#7a9e94", fontWeight: 600 }}>{slot.label}</div>
                  <div style={{ fontSize: 14, color: "#232320", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {entry ? entry.title : "Toque para adicionar"}
                  </div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  {entry ? (
                    <>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#162f25", fontVariantNumeric: "tabular-nums" }}>{kcal} kcal</div>
                      <div style={{ fontSize: 11, color: "#9aa39b", fontVariantNumeric: "tabular-nums" }}>P{p} C{c} G{f}</div>
                    </>
                  ) : (
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#d4644a" }}>+ Registrar</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ── Skeleton ────────────────────────────────────────────────── */
function HojeSkeleton() {
  return (
    <div className="flex flex-col gap-6 animate-pulse pt-2">
      <div className="h-8 w-48 rounded-full bg-areia/40" />
      <div className="h-48 rounded-[26px] bg-forest/10" />
      <div className="h-36 rounded-[22px] bg-areia/30" />
      <div className="flex flex-col gap-3">
        {[0,1,2,3].map(i => <div key={i} className="h-16 rounded-[18px] bg-areia/30" />)}
      </div>
    </div>
  );
}
