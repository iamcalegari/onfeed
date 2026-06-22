"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { clearHistory, getHistory, saveSearch } from "@/lib/searchHistory";
import { getGoals, getTodayTotals } from "@/lib/nutritionPlan";
import { clearPendingSlot, getPendingSlot, type PendingSlot } from "@/lib/planStorage";

/* ── Types ────────────────────────────────────────────────────── */
interface Ingredient { name: string; base: boolean }
type Tempo     = "qualquer" | "30" | "1h";
type FilterKey = "ocasiao" | "tempo" | "equip" | "objetivo" | "foco" | "restricao";

interface SuggestedCard {
  _id: string; title: string; thumbnailUrl: string;
  prepTimeMin: number; kcal: number | null; protein: number | null; carbs: number | null; fat: number | null; fits: boolean | null;
}

/* ── Static defs ──────────────────────────────────────────────── */
const OCASIAO_DEFS = [
  { key: "cafe",      icon: "☕", label: "Café" },
  { key: "almoco",    icon: "🍽", label: "Almoço" },
  { key: "jantar",    icon: "🌙", label: "Jantar" },
  { key: "lanche",    icon: "🍎", label: "Lanche" },
  { key: "sobremesa", icon: "🍰", label: "Sobremesa" },
  { key: "drinks",    icon: "🍹", label: "Drinks" },
];
const OC_API: Record<string, string> = { cafe: "café", almoco: "almoço", jantar: "jantar", lanche: "lanche", sobremesa: "sobremesa", drinks: "drinks" };

const TEMPO_DEFS = [
  { key: "qualquer", icon: "♾️", label: "Qualquer" },
  { key: "30",       icon: "⚡",  label: "Até 30 min" },
  { key: "1h",       icon: "⏱",  label: "Até 1h" },
];

const EQUIP_DEFS = [
  { key: "fogao",  api: "stovetop",  icon: "🔥", label: "Fogão" },
  { key: "forno",  api: "oven",      icon: "🍞", label: "Forno" },
  { key: "micro",  api: "microwave", icon: "📡", label: "Micro-ondas" },
  { key: "liquid", api: "blender",   icon: "🌀", label: "Liquidificador" },
];

const OBJETIVO_DEFS = [
  { key: "proteina", icon: "💪", label: "Alta proteína", goal: "macros"  },
  { key: "leve",     icon: "🥗", label: "Refeição leve", goal: "satiety" },
  { key: "fome",     icon: "🍽", label: "Matar a fome",  goal: "satiety" },
];

const FOCO_DEFS = [
  { key: "proteina", icon: "💪", label: "Alta proteína"  },
  { key: "lowcarb",  icon: "🥬", label: "Low-carb"       },
  { key: "rapido",   icon: "⚡",  label: "< 30 min"       },
  { key: "fazer",    icon: "🍳", label: "Posso fazer"    },
];

const RESTRICAO_DEFS = [
  { key: "semgluten",  label: "Sem glúten"  },
  { key: "vegetariano",label: "Vegetariano" },
  { key: "vegano",     label: "Vegano"      },
  { key: "semlactose", label: "Sem lactose" },
  { key: "semacucar",  label: "Sem açúcar"  },
  { key: "lowcarb",    label: "Low-carb"    },
];
const RESTRICAO_LABEL: Record<string, string> = {
  semgluten: "sem glúten", vegetariano: "vegetariano", vegano: "vegano",
  semlactose: "sem lactose", semacucar: "sem açúcar", lowcarb: "low-carb",
};

/* ── Explore ──────────────────────────────────────────────────── */
interface ExploreCategory { label: string; bg: string; fg: string; pool: string[]; fallback: string[] }
const EXPLORE_CATEGORIES: ExploreCategory[] = [
  { label: "💪 Alta proteína",    bg: "#eef3fb", fg: "#2f4f7a",
    pool: ["frango","peito de frango","ovo","atum","salmão","carne","carne moída","queijo cottage","iogurte grego","grão-de-bico","lentilha","tofu","camarão","sardinha","tilápia","proteína"],
    fallback: ["frango","ovo","atum","grão-de-bico"] },
  { label: "🥗 Café da manhã fit", bg: "#e4f1e9", fg: "#2d6b48",
    pool: ["aveia","ovo","banana","iogurte","granola","linhaça","chia","mel","mamão","morango","abacate","queijo","tapioca","açaí","whey"],
    fallback: ["aveia","ovo","banana","iogurte"] },
  { label: "🌿 Low-carb",          bg: "#f0f7ee", fg: "#3a6b30",
    pool: ["frango","azeite","ovo","abacate","brócolis","espinafre","queijo","salmão","couve-flor","abobrinha","pepino","tomate","alface","cogumelo","ricota"],
    fallback: ["frango","azeite","ovo","brócolis"] },
  { label: "🍹 Drinks fit",         bg: "#fbeae6", fg: "#a8543c",
    pool: ["limão","gengibre","menta","hortelã","pepino","maracujá","abacaxi","morango","kiwi","laranja","beterraba","cenoura","açaí","manga"],
    fallback: ["limão","gengibre","menta","maracujá"] },
  { label: "⚡ Pós-treino",         bg: "#fff8e6", fg: "#8a6200",
    pool: ["banana","aveia","ovo","iogurte","frango","batata doce","arroz","mel","whey","amendoim","pasta de amendoim","granola","proteína"],
    fallback: ["banana","aveia","ovo","batata doce"] },
];
function buildExploreQuery(cat: ExploreCategory, pantry: string[]): string {
  const m = cat.pool.filter(item => pantry.some(p => p.includes(item.split(" ")[0]) || item.includes(p.split(" ")[0])));
  return (m.length >= 2 ? m.slice(0, 5) : cat.fallback).join(",");
}

/* ── Helpers ──────────────────────────────────────────────────── */
function chip(on: boolean) {
  return on
    ? { bg: "#162f25", fg: "#faf4e8", bd: "#162f25" }
    : { bg: "#fff",    fg: "#6c726a", bd: "#ecdcc4" };
}
function pillStyle(open: boolean, set: boolean) {
  return open ? { bg: "#162f25", fg: "#faf4e8", bd: "#162f25" }
       : set  ? { bg: "#fff",    fg: "#162f25", bd: "#cdbf9f" }
              : { bg: "#fff",    fg: "#6c726a", bd: "#ecdcc4" };
}

/* ── Page ─────────────────────────────────────────────────────── */
export default function BuscarPage() {
  const router = useRouter();

  // core search state
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [draft, setDraft]             = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // filter state
  const [openFilter, setOpenFilter] = useState<FilterKey | null>(null);
  const [ocasiao, setOcasiao]       = useState<Record<string, boolean>>({});
  const [tempo, setTempo]           = useState<Tempo>("qualquer");
  const [equip, setEquip]           = useState<Record<string, boolean>>({});
  const [objetivo, setObjetivo]     = useState<string | null>(null);
  const [foco, setFoco]             = useState<string | null>(null);
  const [restricao, setRestricao]   = useState<Record<string, boolean>>({});

  // ui state
  const [recents, setRecents]       = useState<string[]>([]);
  const [pending, setPending]       = useState<PendingSlot | null>(null);
  const [remaining, setRemaining]   = useState<number | null>(null);
  const [cards, setCards]           = useState<SuggestedCard[]>([]);
  const [loadingCards, setLoadingCards] = useState(true);
  const [pantry, setPantry]         = useState<string[]>([]);

  useEffect(() => {
    setPending(getPendingSlot());
    setRecents(getHistory().slice(0, 5).map(h => h.query).filter(Boolean));

    const goals = getGoals();
    let rem = 9999;
    if (goals) {
      const t = getTodayTotals();
      rem = Math.max(0, Math.round(goals.calories - (t.protein * 4 + t.carbs * 4 + t.fat * 9)));
      setRemaining(rem);
    }
    fetch("/api/pantry")
      .then(r => r.json())
      .then((d: { items: string[] }) => setPantry(d.items ?? []))
      .catch(() => {});
    fetch(`/api/suggest?kcal=${rem}`)
      .then(r => r.json())
      .then((d: SuggestedCard[]) => setCards(d))
      .catch(() => setCards([]))
      .finally(() => setLoadingCards(false));
  }, []);

  /* ── Ingredient ops ─────────────────────────────────────────── */
  function addIng() {
    const parts = draft.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
    if (!parts.length) return;
    setIngredients(prev => {
      const existing = new Set(prev.map(g => g.name));
      return [...prev, ...parts.filter(p => !existing.has(p)).map(name => ({ name, base: false }))];
    });
    setDraft("");
    inputRef.current?.focus();
  }
  function onDraftKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addIng(); }
  }
  function toggleBase(i: number) {
    setIngredients(prev => prev.map((g, j) => j === i ? { ...g, base: !g.base } : g));
  }
  function removeIng(i: number) {
    setIngredients(prev => prev.filter((_, j) => j !== i));
  }

  /* ── Filter ops ──────────────────────────────────────────────── */
  function toggleFilter(k: FilterKey) {
    setOpenFilter(prev => prev === k ? null : k);
  }

  /* ── Submit ──────────────────────────────────────────────────── */
  function submit() {
    // Inclui ingrediente que está no campo mas ainda não foi confirmado
    const draftParts = draft.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
    const existing = new Set(ingredients.map(g => g.name));
    const extra = draftParts.filter(p => !existing.has(p)).map(name => ({ name, base: false }));
    const allIngs = [...ingredients, ...extra];
    if (extra.length) { setIngredients(allIngs); setDraft(""); }

    const qs = new URLSearchParams();
    const ingNames = allIngs.map(g => g.name);
    if (ingNames.length) qs.set("ingredients", ingNames.join(","));

    const eqList = EQUIP_DEFS.filter(e => equip[e.key]).map(e => e.api);
    if (eqList.length) qs.set("equipment", eqList.join(","));

    if (tempo !== "qualquer") qs.set("maxPrepTimeMin", tempo === "30" ? "30" : "60");

    const obj = OBJETIVO_DEFS.find(o => o.key === objetivo);
    if (obj) qs.set("goal", obj.goal);

    const ocList = OCASIAO_DEFS.filter(o => ocasiao[o.key]).map(o => OC_API[o.key]);
    const rList  = RESTRICAO_DEFS.filter(r => restricao[r.key]).map(r => RESTRICAO_LABEL[r.key]);
    const allOc  = [...ocList, ...rList];
    if (allOc.length) qs.set("occasions", allOc.join(","));

    const base = ingredients.filter(g => g.base).map(g => g.name);
    if (base.length) qs.set("base", base.join(","));

    saveSearch(ingNames, qs);
    router.push(`/results?${qs.toString()}`);
  }

  /* ── Derived ─────────────────────────────────────────────────── */
  const ocKeys     = Object.keys(ocasiao).filter(k => ocasiao[k]);
  const eqCount    = Object.keys(equip).filter(k => equip[k]).length;
  const rCount     = Object.keys(restricao).filter(k => restricao[k]).length;

  const ocLabel    = ocKeys.length === 0 ? "Ocasião"
    : ocKeys.length === 1 ? OCASIAO_DEFS.find(o => o.key === ocKeys[0])!.label
    : `${ocKeys.length} ocasiões`;
  const tempoShort = { qualquer: "Qualquer", "30": "30 min", "1h": "Até 1h" }[tempo];
  const objLabel   = OBJETIVO_DEFS.find(o => o.key === objetivo);
  const focoLabel  = FOCO_DEFS.find(f => f.key === foco);

  const pills = [
    { key: "ocasiao"  as FilterKey, icon: "🍽", label: ocLabel,                                  set: ocKeys.length > 0 },
    { key: "tempo"    as FilterKey, icon: "⏱",  label: tempoShort,                               set: tempo !== "qualquer" },
    { key: "equip"    as FilterKey, icon: "🔥", label: eqCount ? `${eqCount} equip.` : "Equip.", set: eqCount > 0 },
    { key: "objetivo" as FilterKey, icon: "🎯", label: objLabel ? objLabel.label : "Objetivo",   set: !!objetivo },
    { key: "foco"     as FilterKey, icon: "💪", label: focoLabel ? focoLabel.label : "Foco",     set: !!foco },
    { key: "restricao"as FilterKey, icon: "⚠️", label: rCount ? `${rCount} restrição` : "Restrições", set: rCount > 0 },
  ];

  const trayMap: Record<FilterKey, [string, { key: string; icon?: string; label: string; on: boolean; toggle: () => void }[]]> = {
    ocasiao:   ["Ocasião · escolha um ou mais",
      OCASIAO_DEFS.map(o => ({ key: o.key, icon: o.icon, label: o.label, on: !!ocasiao[o.key], toggle: () => setOcasiao(p => ({ ...p, [o.key]: !p[o.key] })) }))],
    tempo:     ["Tempo disponível",
      TEMPO_DEFS.map(t => ({ key: t.key, icon: t.icon, label: t.label, on: tempo === t.key, toggle: () => setTempo(t.key as Tempo) }))],
    equip:     ["Equipamentos disponíveis",
      EQUIP_DEFS.map(e => ({ key: e.key, icon: e.icon, label: e.label, on: !!equip[e.key], toggle: () => setEquip(p => ({ ...p, [e.key]: !p[e.key] })) }))],
    objetivo:  ["Objetivo",
      OBJETIVO_DEFS.map(o => ({ key: o.key, icon: o.icon, label: o.label, on: objetivo === o.key, toggle: () => setObjetivo(p => p === o.key ? null : o.key) }))],
    foco:      ["Foco nutricional",
      FOCO_DEFS.map(f => ({ key: f.key, icon: f.icon, label: f.label, on: foco === f.key, toggle: () => setFoco(p => p === f.key ? null : f.key) }))],
    restricao: ["Restrições alimentares",
      RESTRICAO_DEFS.map(r => ({ key: r.key, label: r.label, on: !!restricao[r.key], toggle: () => setRestricao(p => ({ ...p, [r.key]: !p[r.key] })) }))],
  };

  // live match count
  let mc = 6 + ingredients.length * 4;
  if (tempo === "30") mc = Math.round(mc * 0.65);
  if (tempo === "qualquer") mc += 5;
  if (ocKeys.length) mc = Math.round(mc * (0.55 + 0.13 * ocKeys.length));
  if (eqCount <= 1) mc = Math.round(mc * 0.7);
  if (foco) mc = Math.round(mc * 0.85);
  const matchCount = Math.max(3, Math.min(48, mc));

  const recapParts: string[] = [];
  if (ocKeys.length) recapParts.push(ocLabel);
  if (tempo !== "qualquer") recapParts.push(tempoShort.toLowerCase());
  const recap = recapParts.length ? recapParts.join(" · ") : "Monte do seu jeito 👇";

  // Ingredient chips sorted: base first
  const sortedIngs = [
    ...ingredients.filter(g => g.base),
    ...ingredients.filter(g => !g.base),
  ];

  return (
    <div className="flex flex-col gap-0 pb-4" style={{ padding: "0 0 24px" }}>

      {/* ── Banner modo plano ──────────────────────────────── */}
      {pending && (
        <div style={{
          background: "#162f25", borderRadius: 16, padding: "12px 16px",
          marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <span style={{ fontSize: 13, color: "#faf4e8", fontWeight: 600 }}>
            📋 Escolhendo receita para <strong>{pending.slot}</strong>
          </span>
          <button type="button"
            onClick={() => { clearPendingSlot(); router.push("/plano"); }}
            style={{ fontSize: 12, color: "#9db8ad", background: "none", border: "none", cursor: "pointer" }}>
            Cancelar
          </button>
        </div>
      )}

      {/* ── Título ─────────────────────────────────────────── */}
      <div style={{ fontFamily: "var(--font-display)", fontSize: 27, color: "#162f25", lineHeight: 1.08 }}>
        Bora cozinhar?
      </div>
      <div style={{ fontSize: 13, color: "#7a9e94", fontWeight: 500, marginTop: 5, marginBottom: 18 }}>
        {recap}
      </div>

      {/* ── Tenho na cozinha ───────────────────────────────── */}
      <div style={{
        background: "#fff", border: "1px solid #f0e4d2", borderRadius: 22, padding: 16,
        boxShadow: "0 10px 24px -16px rgba(22,47,37,.3)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 17 }}>🧺</span>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: "#162f25" }}>Tenho na cozinha</span>
          </div>
          <span style={{ fontSize: 12, color: "#9aa39b", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
            {ingredients.length} {ingredients.length === 1 ? "item" : "itens"}
          </span>
        </div>

        {/* Chips */}
        {sortedIngs.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 13 }}>
            {sortedIngs.map((g, origIdx) => {
              const i = ingredients.indexOf(g);
              return (
                <span
                  key={g.name}
                  onClick={() => toggleBase(i)}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    fontSize: 13, fontWeight: 600, padding: "8px 12px", borderRadius: 18,
                    background: g.base ? "#fbf1de" : "#fff",
                    color:      g.base ? "#a76a00" : "#3a3a36",
                    border:     `1px solid ${g.base ? "#eccf95" : "#e6d8c2"}`,
                    cursor: "pointer", userSelect: "none",
                  }}
                >
                  {g.base && <span style={{ color: "#e8a020" }}>★</span>}
                  {g.name}
                  <span
                    onClick={e => { e.stopPropagation(); removeIng(i); }}
                    style={{ marginLeft: 1, fontSize: 12, lineHeight: 1, opacity: 0.5, cursor: "pointer" }}
                  >✕</span>
                </span>
              );
            })}
          </div>
        )}

        {/* Input */}
        <div style={{ display: "flex", gap: 9, marginTop: 13 }}>
          <input
            ref={inputRef}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={onDraftKey}
            placeholder="adicionar ingrediente…"
            style={{
              flex: 1, fontFamily: "Inter,sans-serif", fontSize: 14, color: "#232320",
              background: "#faf6ee", border: "1px solid #efe2cd", borderRadius: 13,
              padding: "12px 14px", outline: "none",
            }}
          />
          <div
            onClick={addIng}
            style={{
              width: 46, flexShrink: 0, background: "#162f25", borderRadius: 13,
              display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#faf4e8" strokeWidth="2.4" strokeLinecap="round">
              <path d="M12 5v14M5 12h14"/>
            </svg>
          </div>
        </div>

        {ingredients.length > 0 && (
          <div style={{ fontSize: 11, color: "#b4b9ad", marginTop: 9 }}>
            Toque num item pra marcar como <b style={{ color: "#a76a00", fontWeight: 700 }}>★ principal</b>
          </div>
        )}
      </div>

      {/* ── Refinar pills ──────────────────────────────────── */}
      <div style={{ display: "flex", gap: 8, overflowX: "auto", marginTop: 16, paddingBottom: 3 }}>
        {pills.map(p => {
          const s = pillStyle(openFilter === p.key, p.set);
          return (
            <div
              key={p.key}
              onClick={() => toggleFilter(p.key)}
              style={{
                flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 7,
                fontSize: 13, fontWeight: 600, padding: "10px 13px", borderRadius: 14,
                background: s.bg, color: s.fg, border: `1px solid ${s.bd}`,
                cursor: "pointer", whiteSpace: "nowrap",
              }}
            >
              <span>{p.icon}</span>
              <span>{p.label}</span>
              <span style={{ opacity: 0.55, fontSize: 10 }}>{openFilter === p.key ? "▴" : "▾"}</span>
            </div>
          );
        })}
      </div>

      {/* ── Tray ───────────────────────────────────────────── */}
      {openFilter && trayMap[openFilter] && (
        <div style={{
          background: "#fbf7ef", border: "1px solid #efe2cd", borderRadius: 18,
          padding: 15, marginTop: 11,
          animation: "ofRise .2s ease both",
        }}>
          <style>{`@keyframes ofRise { from { transform: translateY(8px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "#7a9e94" }}>
            {trayMap[openFilter][0]}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
            {trayMap[openFilter][1].map(o => {
              const c = chip(o.on);
              return (
                <span
                  key={o.key}
                  onClick={o.toggle}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    fontSize: 12.5, fontWeight: 600, padding: "8px 13px", borderRadius: 18,
                    background: c.bg, color: c.fg, border: `1px solid ${c.bd}`, cursor: "pointer",
                  }}
                >
                  {o.icon && <span>{o.icon}</span>}
                  {o.label}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Buscas recentes ────────────────────────────────── */}
      {recents.length > 0 && (
        <div style={{ marginTop: 22 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "#7a9e94" }}>
              Buscas recentes
            </span>
            <span
              onClick={() => { clearHistory(); setRecents([]); }}
              style={{ fontSize: 12, fontWeight: 600, color: "#c4cabf", cursor: "pointer" }}
            >
              limpar
            </span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 11 }}>
            {recents.map(r => (
              <span
                key={r}
                onClick={() => {
                  const parts = r.split(",").map(s => s.trim()).filter(Boolean);
                  setIngredients(prev => {
                    const ex = new Set(prev.map(g => g.name));
                    return [...prev, ...parts.filter(p => !ex.has(p)).map(name => ({ name, base: false }))];
                  });
                }}
                style={{ fontSize: 12.5, color: "#5c5c57", fontWeight: 500, padding: "7px 12px", borderRadius: 18, background: "#fff", border: "1px solid #f0e4d2", cursor: "pointer" }}
              >
                {r}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Live match bar ─────────────────────────────────── */}
      <div
        onClick={submit}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
          background: "linear-gradient(120deg,#1d3a2c,#2a5440)", borderRadius: 18,
          padding: "15px 17px", marginTop: 20, cursor: "pointer",
          boxShadow: "0 14px 28px -12px rgba(22,47,37,.5)",
          transition: "transform .12s ease, box-shadow .12s ease",
        }}
      >
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: "#faf4e8", fontVariantNumeric: "tabular-nums" }}>
            {matchCount} receitas combinam ✨
          </div>
          <div style={{ fontSize: 12, color: "#9db8ad", marginTop: 1 }}>
            com o que você tem e seu plano
          </div>
        </div>
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          background: "#e0c9a6", color: "#162f25", borderRadius: 12,
          padding: "9px 14px", fontSize: 13, fontWeight: 800, flexShrink: 0,
        }}>
          Buscar
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#162f25" strokeWidth="2.6">
            <path d="M6 12h12M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </div>

      {/* ── Cabe no seu plano ──────────────────────────────── */}
      <div style={{ marginTop: 28 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 13 }}>
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.1, textTransform: "uppercase", color: "#7a9e94" }}>
            Cabe no seu plano
          </span>
          {remaining !== null && (
            <span style={{ fontSize: 12, color: "#9aa39b", fontVariantNumeric: "tabular-nums" }}>
              {remaining} kcal livres
            </span>
          )}
        </div>

        {loadingCards ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
            {[0, 1, 2, 3].map(i => (
              <div key={i} style={{ height: 90, borderRadius: 20, background: "#f3ede1" }} />
            ))}
          </div>
        ) : cards.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
            {cards.map(c => (
              <Link key={c._id} href={`/recipe/${c._id}`} style={{
                background: "#fff", border: "1px solid #f2e6d6", borderRadius: 20, overflow: "hidden",
                display: "flex", boxShadow: "0 5px 16px -10px rgba(22,47,37,.2)", textDecoration: "none",
              }}>
                {c.thumbnailUrl?.startsWith("http") ? (
                  <img src={c.thumbnailUrl} alt={c.title} style={{ width: 108, flexShrink: 0, objectFit: "cover" }} />
                ) : (
                  <div style={{ width: 108, flexShrink: 0, background: "repeating-linear-gradient(135deg,#e9ddc7 0 9px,#e2d4ba 9px 18px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ fontFamily: "ui-monospace", fontSize: 9, color: "#9c8a68", textAlign: "center", padding: 6 }}>
                      {c.title.split(" ").slice(0, 2).join(" ")}
                    </span>
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0, padding: "13px 14px" }}>
                  <div style={{ fontSize: 14.5, fontWeight: 700, color: "#232320", lineHeight: 1.2 }}>{c.title}</div>
                  {c.fits !== null && (
                    <span style={{
                      display: "inline-block", marginTop: 7, fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 14,
                      background: c.fits ? "#e4f1e9" : "#fbf0d9", color: c.fits ? "#2d7d4e" : "#a76a00",
                    }}>
                      {c.fits ? "✓ Cabe no plano" : "⚠ Acima do plano"}
                    </span>
                  )}
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 9 }}>
                    {c.kcal !== null ? (
                      <>
                        <span style={{ fontSize: 18, fontWeight: 800, color: "#162f25", fontVariantNumeric: "tabular-nums" }}>{c.kcal}</span>
                        <span style={{ fontSize: 11, color: "#7a9e94", fontWeight: 600 }}>kcal</span>
                      </>
                    ) : null}
                    <span style={{ fontSize: 12, color: "#5c5c57", fontWeight: 600, marginLeft: "auto" }}>⏱ {c.prepTimeMin}m</span>
                  </div>
                  {c.protein !== null && (
                    <div style={{ fontSize: 12, color: "#7a9e94", fontWeight: 600, marginTop: 4 }}>
                      P {c.protein}g · C {c.carbs}g · G {c.fat}g
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <p style={{ fontSize: 13, color: "#9aa39b", padding: "16px 0" }}>
            Configure suas metas para ver receitas personalizadas.
          </p>
        )}
      </div>

      {/* ── Explorar ───────────────────────────────────────── */}
      <div style={{ marginTop: 26 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.1, textTransform: "uppercase", color: "#7a9e94" }}>
            Explorar
          </span>
          {pantry.length > 0 && (
            <span style={{ fontSize: 11, color: "#9aa39b", fontWeight: 600 }}>✓ da sua despensa</span>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          {EXPLORE_CATEGORIES.map(cat => {
            const q = buildExploreQuery(cat, pantry);
            const fromPantry = pantry.filter(p =>
              cat.pool.some(item => p.includes(item.split(" ")[0]) || item.includes(p.split(" ")[0]))
            ).slice(0, 3);
            return (
              <button
                key={cat.label}
                type="button"
                onClick={() => router.push(`/results?ingredients=${encodeURIComponent(q)}`)}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  background: cat.bg, borderRadius: 16, padding: "14px 16px",
                  cursor: "pointer", border: "none", textAlign: "left",
                }}
              >
                <div>
                  <span style={{ fontSize: 14, fontWeight: 700, color: cat.fg }}>{cat.label}</span>
                  {fromPantry.length > 0 && (
                    <div style={{ fontSize: 11, color: cat.fg, opacity: 0.7, marginTop: 2 }}>
                      da despensa: {fromPantry.join(", ")}
                    </div>
                  )}
                </div>
                <span style={{ fontSize: 15, color: cat.fg, flexShrink: 0, marginLeft: 8 }}>→</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
