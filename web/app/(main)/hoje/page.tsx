"use client";

import { useRouter } from "next/navigation";

import { useEffect, useRef, useState } from "react";

import {
  getGoals,
  getTodayEntries,
  getTodayTotals,
  type MealLogEntry,
  type NutritionGoals,
} from "@/lib/nutritionPlan";
import { setPendingSlot } from "@/lib/planStorage";

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

/* ── Profile ──────────────────────────────────────────────────── */
function loadProfileName(): string {
  if (typeof window === "undefined") return "";
  try {
    const raw = localStorage.getItem("onfeed:profile");
    return raw ? (JSON.parse(raw).name ?? "") : "";
  } catch { return ""; }
}

function firstName(fullName: string): string {
  return fullName.split(" ")[0] || "";
}

/* ── Time helpers ─────────────────────────────────────────────── */
function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

function todayLabel() {
  return new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
}

function nextMealSlot(): string {
  const h = new Date().getHours();
  if (h < 10) return "Café da manhã";
  if (h < 14) return "Almoço";
  if (h < 17) return "Lanche";
  return "Jantar";
}

/* ── Slot definitions ─────────────────────────────────────────── */
const SLOTS = [
  { label: "Café da manhã", icon: "☕", iconBg: "var(--t-bg-section)", hours: [0, 10] as [number, number] },
  { label: "Almoço",        icon: "🍽", iconBg: "var(--t-protein-bg)", hours: [10, 14] as [number, number] },
  { label: "Lanche",        icon: "🍎", iconBg: "var(--t-fat-bg)", hours: [14, 17] as [number, number] },
  { label: "Jantar",        icon: "🌙", iconBg: "var(--t-bg-section)", hours: [17, 24] as [number, number] },
];

function slotForEntry(entry: MealLogEntry): string {
  const h = new Date(entry.loggedAt).getHours();
  return SLOTS.find(s => h >= s.hours[0] && h < s.hours[1])?.label ?? "Jantar";
}

/* ── Suggestion type ──────────────────────────────────────────── */
interface Suggestion {
  _id: string;
  title: string;
  thumbnailUrl: string | null;
  prepTimeMin: number | null;
  kcal: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  fits: boolean | null;
}

/* ── Dark Macro Ring ─────────────────────────────────────────── */
function DarkRing({ totals, goals }: { totals: ReturnType<typeof getTodayTotals>; goals: NutritionGoals }) {
  const size = 148, stroke = 15;
  const r = (size - stroke) / 2;
  const C = 2 * Math.PI * r;
  const cx = size / 2, cy = size / 2;

  const segs = [
    { color: "var(--t-protein-fg)", kcal: totals.protein * 4 },
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
            style={{ transition: "stroke-dasharray .5s ease, stroke-dashoffset .5s ease" }}
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
          lineHeight: 1, color: "var(--t-hero-fg)", fontVariantNumeric: "tabular-nums",
        }}>
          {remaining.toLocaleString("pt-BR")}
        </span>
        <span style={{
          fontSize: 10, letterSpacing: 1.4, textTransform: "uppercase",
          color: "var(--t-hero-fg2)", marginTop: 4,
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

  const [goals, setGoalsState]       = useState<NutritionGoals | null>(null);
  const [entries, setEntries]        = useState<MealLogEntry[]>([]);
  const [streak, setStreak]          = useState(0);
  const [profileName, setProfileName] = useState("");
  const [pantryCount, setPantryCount]   = useState<number | null>(null);
  const [suggestions, setSuggestions]  = useState<Suggestion[]>([]);
  const [mounted, setMounted]          = useState(false);

  useEffect(() => {
    const g = getGoals();
    if (!g) { router.replace("/onboarding"); return; }
    setGoalsState(g);
    setEntries(getTodayEntries());
    setStreak(recordStreak());
    setProfileName(loadProfileName());
    setMounted(true);

    // Buscar contagem da despensa
    fetch("/api/pantry")
      .then(r => r.json())
      .then(d => setPantryCount(Array.isArray(d.items) ? d.items.length : null))
      .catch(() => setPantryCount(null));

    // Buscar sugestão de receita
    const totals = getTodayTotals();
    const consumed = totals.protein * 4 + totals.carbs * 4 + totals.fat * 9;
    const remaining = Math.max(0, Math.round(g.calories - consumed));
    fetch(`/api/suggest?kcal=${remaining}`)
      .then(r => r.json())
      .then(d => Array.isArray(d) ? setSuggestions(d.slice(0, 5)) : null)
      .catch(() => null);
  }, [router]);

  if (!mounted) return <HojeSkeleton />;

  const totals = getTodayTotals();
  const pills = [
    { label: "Proteína", color: "var(--t-protein-fg)", val: totals.protein, goal: goals!.protein },
    { label: "Carbo",    color: "#e8a020", val: totals.carbs,   goal: goals!.carbs   },
    { label: "Gordura",  color: "#d4644a", val: totals.fat,     goal: goals!.fat     },
  ];

  const slotMap: Record<string, MealLogEntry | undefined> = {};
  for (const e of entries) slotMap[slotForEntry(e)] = e;

  const today = new Date().toISOString().slice(0, 10);
  const nextSlot = nextMealSlot();

  function handleSlotClick(slotLabel: string, entry?: MealLogEntry) {
    if (entry) {
      router.push(`/recipe/${entry.recipeId}`);
    } else {
      setPendingSlot(slotLabel, today);
      router.push("/buscar");
    }
  }

  const greetingText = profileName
    ? `${greeting()}, ${firstName(profileName)} 👋`
    : `${greeting()} 👋`;

  return (
    <div className="flex flex-col gap-6 pb-4" style={{ animation: "ofRise .28s ease both" }}>

      {/* ── Header ─────────────────────────────────────────── */}
      <header style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 0, paddingTop: 4 }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 26, color: "var(--t-text-title)", lineHeight: 1.1, margin: 0 }}>
            {greetingText}
          </h1>
          <p style={{ fontSize: 13, color: "var(--t-text-secondary)", fontWeight: 500, marginTop: 3, margin: "3px 0 0" }}>
            {todayLabel()}
          </p>
        </div>
        <button
          type="button"
          onClick={() => router.push("/progresso")}
          style={{
            display: "flex", alignItems: "center", gap: 5,
            background: "var(--t-bg-card)", border: "1px solid var(--t-bd-card)",
            padding: "7px 11px", borderRadius: 20, cursor: "pointer",
            boxShadow: "0 2px 6px rgba(22,47,37,.05)",
          }}
        >
          <span style={{ fontSize: 14 }}>🔥</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#f45d22", fontVariantNumeric: "tabular-nums" }}>
            {streak}
          </span>
        </button>
      </header>

      {/* ── MacroRing Card ─────────────────────────────────── */}
      <div style={{
        background: "var(--t-bg-hero)", borderRadius: 26, padding: "26px 22px",
        color: "var(--t-hero-fg)", boxShadow: "0 16px 36px -14px rgba(22,47,37,.5)",
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
                  <span style={{ fontSize: 11, color: "var(--t-hero-fg2)", fontWeight: 500 }}>{p.label}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "var(--t-hero-fg)" }}>
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

      {/* ── Despensa Shortcut ──────────────────────────────── */}
      <button
        type="button"
        onClick={() => router.push("/pantry")}
        style={{
          display: "flex", alignItems: "center", gap: 13,
          background: "var(--t-bg-card)", border: "1px solid var(--t-bd-card)",
          borderRadius: 18, padding: "14px 16px", cursor: "pointer",
          boxShadow: "0 3px 10px -6px rgba(22,47,37,.12)",
          textAlign: "left", width: "100%",
          transition: "transform .12s ease, box-shadow .12s ease",
        }}
        onMouseDown={e => (e.currentTarget.style.transform = "scale(.985)")}
        onMouseUp={e => (e.currentTarget.style.transform = "")}
        onTouchStart={e => (e.currentTarget.style.transform = "scale(.985)")}
        onTouchEnd={e => (e.currentTarget.style.transform = "")}
      >
        <div style={{
          width: 40, height: 40, borderRadius: 12,
          background: "var(--t-bg-section)", display: "flex",
          alignItems: "center", justifyContent: "center",
          fontSize: 18, flexShrink: 0,
        }}>
          🧺
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, color: "var(--t-text-primary)", fontWeight: 700 }}>Minha despensa</div>
          <div style={{ fontSize: 12, color: "var(--t-text-secondary)", fontWeight: 600, marginTop: 1 }}>
            {pantryCount !== null
              ? `${pantryCount} ${pantryCount === 1 ? "item" : "itens"} · ver o que dá pra cozinhar`
              : "ver o que dá pra cozinhar"}
          </div>
        </div>
        <span style={{ color: "#d4644a", fontSize: 16, flexShrink: 0 }}>→</span>
      </button>

      {/* ── Próxima refeição ───────────────────────────────── */}
      <div>
        <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase", color: "var(--t-text-secondary)", margin: "0 0 11px" }}>
          Próxima refeição · {nextSlot}
        </p>
        <SuggestionCarousel
          suggestions={suggestions}
          nextSlot={nextSlot}
          onNavigate={id => router.push(`/recipe/${id}`)}
          onEmpty={() => router.push("/buscar")}
        />
        <button
          type="button"
          onClick={() => router.push("/buscar")}
          style={{ textAlign: "center", width: "100%", marginTop: 11, fontSize: 13, fontWeight: 600, color: "#d4644a", cursor: "pointer", background: "none", border: "none", padding: 0 }}>
          Ver outras opções →
        </button>
      </div>

      {/* ── Refeições de hoje ──────────────────────────────── */}
      <div>
        <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase", color: "var(--t-text-secondary)", margin: "0 0 12px" }}>
          Hoje
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {SLOTS.map(slot => {
            const entry = slotMap[slot.label];
            const kcal = entry ? Math.round(entry.nutrition.calories * entry.servings) : 0;
            const p    = entry ? Math.round(entry.nutrition.protein   * entry.servings) : 0;
            const c    = entry ? Math.round(entry.nutrition.carbs     * entry.servings) : 0;
            const f    = entry ? Math.round(entry.nutrition.fat       * entry.servings) : 0;
            return (
              <button
                key={slot.label}
                type="button"
                onClick={() => handleSlotClick(slot.label, entry)}
                style={{
                  background: "var(--t-bg-card)", border: "1px solid var(--t-bd-card)", borderRadius: 18,
                  padding: "14px 16px", display: "flex", alignItems: "center", gap: 13,
                  cursor: "pointer", boxShadow: "0 3px 10px -6px rgba(22,47,37,.12)",
                  transition: "transform .12s ease, box-shadow .12s ease",
                  width: "100%", textAlign: "left", touchAction: "pan-y",
                }}
                onMouseDown={e => (e.currentTarget.style.transform = "scale(.985)")}
                onMouseUp={e => (e.currentTarget.style.transform = "")}
                onTouchStart={e => (e.currentTarget.style.transform = "scale(.985)")}
                onTouchEnd={e => (e.currentTarget.style.transform = "")}
              >
                <div style={{
                  width: 40, height: 40, borderRadius: 12,
                  background: slot.iconBg,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 18, flexShrink: 0,
                }}>
                  {slot.icon}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: "var(--t-text-secondary)", fontWeight: 600 }}>{slot.label}</div>
                  <div style={{
                    fontSize: 14, color: "var(--t-text-primary)", fontWeight: 600,
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}>
                    {entry ? entry.title : "Toque para adicionar"}
                  </div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  {entry ? (
                    <>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--t-text-title)", fontVariantNumeric: "tabular-nums" }}>
                        {kcal} kcal
                      </div>
                      <div style={{ fontSize: 11, color: "var(--t-text-muted)", fontVariantNumeric: "tabular-nums" }}>
                        P {p}g · C {c}g · G {f}g
                      </div>
                    </>
                  ) : (
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#d4644a" }}>+ Registrar</div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ── Suggestion Carousel ─────────────────────────────────────── */
function SuggestionCarousel({
  suggestions,
  nextSlot,
  onNavigate,
  onEmpty,
}: {
  suggestions: Suggestion[];
  nextSlot: string;
  onNavigate: (id: string) => void;
  onEmpty: () => void;
}) {
  const count = suggestions.length;
  const [index, setIndex]     = useState(0);
  const [progress, setProgress] = useState(0);
  const [dragX, setDragX]     = useState(0);

  const touchActiveRef  = useRef(false);
  const idleTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef          = useRef<number | null>(null);
  const progressStartRef = useRef(0);
  const startXRef       = useRef<number | null>(null);
  const startYRef       = useRef<number | null>(null);
  const lockedRef       = useRef<"h" | "v" | null>(null);
  const didMoveRef      = useRef(false);

  function stopAuto() {
    if (idleTimerRef.current) { clearTimeout(idleTimerRef.current); idleTimerRef.current = null; }
    if (rafRef.current)       { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    setProgress(0);
  }

  function startAuto() {
    stopAuto();
    if (count <= 1 || touchActiveRef.current) return;
    idleTimerRef.current = setTimeout(() => {
      idleTimerRef.current = null;
      if (touchActiveRef.current) return;
      progressStartRef.current = Date.now();
      function tick() {
        if (touchActiveRef.current) return;
        const p = Math.min(1, (Date.now() - progressStartRef.current) / 4000);
        setProgress(p);
        if (p < 1) {
          rafRef.current = requestAnimationFrame(tick);
        } else {
          rafRef.current = null;
          setProgress(0);
          setIndex(i => (i + 1) % count);
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    }, 1000);
  }

  // Reinicia o ciclo a cada mudança de índice
  useEffect(() => {
    startAuto();
    return stopAuto;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, count]);

  function onPointerDown(e: React.PointerEvent) {
    touchActiveRef.current = true;
    stopAuto();
    startXRef.current  = e.clientX;
    startYRef.current  = e.clientY;
    lockedRef.current  = null;
    didMoveRef.current = false;
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (startXRef.current === null) return;
    const dx = e.clientX - startXRef.current;
    const dy = e.clientY - (startYRef.current ?? e.clientY);

    // Bloqueia direção na primeira vez que ultrapassar 8px
    if (!lockedRef.current) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      lockedRef.current = Math.abs(dx) >= Math.abs(dy) ? "h" : "v";
    }
    if (lockedRef.current !== "h") return;

    didMoveRef.current = true;
    setDragX(dx);
  }

  function onPointerUp(e: React.PointerEvent) {
    touchActiveRef.current = false;
    if (startXRef.current === null) return;
    const dx = e.clientX - startXRef.current;
    startXRef.current = null;
    setDragX(0);

    if (lockedRef.current === "h" && Math.abs(dx) > 50) {
      setIndex(i => dx < 0 ? (i + 1) % count : (i - 1 + count) % count);
    } else if (!didMoveRef.current) {
      // Tap sem arrasto
      if (count > 0) onNavigate(suggestions[index]._id);
      else onEmpty();
    } else {
      startAuto();
    }
    lockedRef.current  = null;
    didMoveRef.current = false;
  }

  function onPointerCancel() {
    touchActiveRef.current = false;
    startXRef.current = null;
    setDragX(0);
    lockedRef.current  = null;
    didMoveRef.current = false;
    startAuto();
  }

  const s = count > 0 ? suggestions[index] : null;

  return (
    <>
      <style>{`@keyframes sgFade{from{opacity:0;transform:translateX(12px)}to{opacity:1;transform:none}}`}</style>
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        style={{
          borderRadius: 22, overflow: "hidden", background: "var(--t-bg-card)",
          boxShadow: "0 8px 22px -12px rgba(22,47,37,.22)",
          border: "1px solid var(--t-bd-card)",
          transform: `translateX(${dragX * 0.25}px)`,
          transition: dragX === 0 ? "transform .2s ease" : "none",
          touchAction: "pan-y",
          userSelect: "none",
          cursor: count > 0 ? "pointer" : "default",
        }}
      >
        {/* Imagem */}
        <div
          key={index}
          style={{
            height: 142, position: "relative",
            background: s?.thumbnailUrl
              ? `url(${s.thumbnailUrl}) center/cover no-repeat`
              : "repeating-linear-gradient(135deg,#e9ddc7 0 11px,#e2d4ba 11px 22px)",
            display: "flex", alignItems: "flex-end",
            animation: "sgFade .22s ease both",
          }}
        >
          {s?.fits && (
            <span style={{
              position: "absolute", top: 12, left: 12,
              background: "rgba(45,125,78,.95)", color: "#fff",
              fontSize: 11, fontWeight: 700, padding: "5px 10px", borderRadius: 20,
            }}>✓ Cabe no plano</span>
          )}

          {/* Indicadores de ponto */}
          {count > 1 && (
            <div style={{
              position: "absolute", top: 12, right: 12,
              display: "flex", gap: 5, alignItems: "center",
            }}>
              {suggestions.map((_, i) => (
                <div key={i} style={{
                  width: i === index ? 18 : 6, height: 6, borderRadius: 3,
                  background: i === index ? "rgba(255,255,255,1)" : "rgba(255,255,255,.4)",
                  transition: "width .25s ease, background .25s ease",
                }} />
              ))}
            </div>
          )}

          <div style={{
            width: "100%", padding: "14px 16px",
            background: "linear-gradient(to top,rgba(0,0,0,.34),transparent)",
          }}>
            <span style={{ color: "#fff", fontFamily: "var(--font-display)", fontSize: 21, lineHeight: 1.2 }}>
              {s?.title ?? `Encontrar receita para ${nextSlot}`}
            </span>
          </div>

          {/* Barra de progresso do auto-advance */}
          {count > 1 && progress > 0 && (
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 3, background: "rgba(255,255,255,.18)" }}>
              <div style={{ height: "100%", width: `${progress * 100}%`, background: "rgba(255,255,255,.85)" }} />
            </div>
          )}
        </div>

        {/* Info bar */}
        <div key={`info-${index}`} style={{
          padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between",
          animation: "sgFade .22s ease both",
        }}>
          {s?.kcal ? (
            <div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                <span style={{ fontSize: 22, fontWeight: 800, color: "var(--t-text-title)", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
                  {s.kcal}
                </span>
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--t-text-secondary)" }}>kcal</span>
              </div>
              <div style={{ fontSize: 13, color: "var(--t-text-body)", fontWeight: 600, marginTop: 5, fontVariantNumeric: "tabular-nums" }}>
                P {s.protein}g · C {s.carbs}g · G {s.fat}g
              </div>
            </div>
          ) : (
            <span style={{ fontSize: 13, color: "var(--t-text-body)", fontWeight: 600 }}>
              {s ? "Ver receitas que cabem no plano" : `Encontrar receita para ${nextSlot}`}
            </span>
          )}
          {s?.prepTimeMin ? (
            <span style={{ fontSize: 13, color: "var(--t-text-secondary)", fontWeight: 600, flexShrink: 0 }}>
              ⏱ {s.prepTimeMin} min
            </span>
          ) : null}
        </div>
      </div>
    </>
  );
}

/* ── Skeleton ────────────────────────────────────────────────── */
function HojeSkeleton() {
  return (
    <div className="flex flex-col gap-6 animate-pulse pt-2">
      <div className="h-8 w-48 rounded-full bg-areia/40" />
      <div className="h-48 rounded-[26px] bg-forest/10" />
      <div className="h-16 rounded-[18px] bg-areia/30" />
      <div className="h-44 rounded-[22px] bg-areia/30" />
      <div className="flex flex-col gap-3">
        {[0,1,2,3].map(i => <div key={i} className="h-16 rounded-[18px] bg-areia/30" />)}
      </div>
    </div>
  );
}
