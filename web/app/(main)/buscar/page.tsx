"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { clearHistory, getHistory, saveSearch } from "@/lib/searchHistory";
import { getGoals, getTodayTotals } from "@/lib/nutritionPlan";
import { clearPendingSlot, getPendingSlot, type PendingSlot } from "@/lib/planStorage";
import { consumeSearch, SEARCH_FREE } from "@/lib/proStorage";
import { usePro } from "@/lib/usePro";
import { showToast } from "@/lib/toast";

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
const OC_API: Record<string, string> = { cafe: "breakfast", almoco: "weeknight", jantar: "weeknight", lanche: "quick", sobremesa: "dessert", drinks: "drinks" };

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
interface ExploreCategory { label: string; bg: string; fg: string; pool: string[]; fallback: string[]; occasion?: string }
const EXPLORE_CATEGORIES: ExploreCategory[] = [
  { label: "💪 Alta proteína",    bg: "var(--t-protein-bg)", fg: "var(--t-protein-fg)",
    pool: ["frango","peito de frango","ovo","atum","salmão","carne","carne moída","queijo cottage","iogurte grego","grão-de-bico","lentilha","tofu","camarão","sardinha","tilápia","proteína"],
    fallback: ["frango","ovo","atum","grão-de-bico"] },
  { label: "🥗 Café da manhã fit", bg: "var(--t-ok-bg)", fg: "var(--t-ok-fg)",
    pool: ["aveia","ovo","banana","iogurte","granola","linhaça","chia","mel","mamão","morango","abacate","queijo","tapioca","açaí","whey"],
    fallback: ["aveia","ovo","banana","iogurte"],
    occasion: "breakfast" },
  { label: "🌿 Low-carb",          bg: "var(--t-ok-bg)", fg: "var(--t-ok-fg)",
    pool: ["frango","azeite","ovo","abacate","brócolis","espinafre","queijo","salmão","couve-flor","abobrinha","pepino","tomate","alface","cogumelo","ricota"],
    fallback: ["frango","azeite","ovo","brócolis"] },
  { label: "🍹 Drinks fit",         bg: "var(--t-fat-bg)", fg: "var(--t-fat-fg)",
    pool: ["limão","gengibre","menta","hortelã","pepino","maracujá","abacaxi","morango","kiwi","laranja","beterraba","cenoura","açaí","manga"],
    fallback: ["limão","gengibre","menta","maracujá"],
    occasion: "drinks" },
  { label: "⚡ Pós-treino",         bg: "var(--t-warn-bg)", fg: "var(--t-warn-fg)",
    pool: ["banana","aveia","ovo","iogurte","frango","batata doce","arroz","mel","whey","amendoim","pasta de amendoim","granola","proteína"],
    fallback: ["banana","aveia","ovo","batata doce"] },
];

/**
 * Monta a URL de resultados para uma categoria do Explorar.
 * - `ingredients`: somente o que o usuário REALMENTE tem na despensa (garante score correto)
 * - `note`: fallback da categoria passado apenas como contexto semântico quando o usuário
 *   tem < 2 matches — influencia o vetor de busca sem inflar o scoreI
 * - `occasions`: filtro duro de ocasião quando a categoria mapeia para uma
 */
function buildExploreUrl(cat: ExploreCategory, pantry: string[]): string {
  const matched = cat.pool.filter(item =>
    pantry.some(p => p.includes(item.split(" ")[0]) || item.includes(p.split(" ")[0]))
  );

  const qs = new URLSearchParams();
  if (matched.length > 0) qs.set("ingredients", matched.slice(0, 5).join(","));
  if (cat.occasion) qs.set("occasions", cat.occasion);
  // Se o usuário tem < 2 itens da categoria, usa o fallback só como dica semântica
  if (matched.length < 2) qs.set("note", cat.fallback.join(", "));

  return `/results?${qs.toString()}`;
}

/* ── Helpers ──────────────────────────────────────────────────── */
function chip(on: boolean) {
  return on
    ? { bg: "var(--t-chip-on-bg)", fg: "var(--t-hero-fg)", bd: "var(--t-chip-on-bd)" }
    : { bg: "var(--t-chip-off-bg)",    fg: "var(--t-text-body)", bd: "var(--t-bd-strong)" };
}
function pillStyle(open: boolean, set: boolean) {
  return open ? { bg: "var(--t-chip-on-bg)", fg: "var(--t-hero-fg)", bd: "var(--t-chip-on-bd)" }
       : set  ? { bg: "var(--t-chip-off-bg)",    fg: "var(--t-text-title)", bd: "var(--t-bd-strong)" }
              : { bg: "var(--t-chip-off-bg)",    fg: "var(--t-text-body)", bd: "var(--t-bd-strong)" };
}

/* ── Page ─────────────────────────────────────────────────────── */
export default function BuscarPage() {
  const router = useRouter();
  const pro = usePro();

  // modo: "ingredientes" (tenho na cozinha) ou "nome" (já sei o que fazer)
  const [mode, setMode] = useState<"ingredientes" | "nome">("ingredientes");
  const [titleDraft, setTitleDraft] = useState("");
  const titleInputRef = useRef<HTMLInputElement>(null);

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
    // Modo "já sei o que fazer" — busca por nome
    if (mode === "nome") {
      const q = titleDraft.trim();
      if (!q) return;
      router.push(`/results?titleSearch=${encodeURIComponent(q)}`);
      return;
    }

    // Quota FREE: busca sob medida (modo ingredientes) consome 1 por dia.
    // Sem quota e sem PRO → "anúncio" e não prossegue (igual ao design).
    if (!consumeSearch()) {
      showToast("Assistindo anúncio para liberar a busca…", "▶");
      return;
    }

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
          background: "var(--t-bg-hero)", borderRadius: 16, padding: "12px 16px",
          marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <span style={{ fontSize: 13, color: "var(--t-hero-fg)", fontWeight: 600 }}>
            📋 Escolhendo receita para <strong>{pending.slot}</strong>
          </span>
          <button type="button"
            onClick={() => { clearPendingSlot(); router.push("/plano"); }}
            style={{ fontSize: 12, color: "var(--t-hero-fg2)", background: "none", border: "none", cursor: "pointer" }}>
            Cancelar
          </button>
        </div>
      )}

      {/* ── Título ─────────────────────────────────────────── */}
      <div style={{ fontFamily: "var(--font-display)", fontSize: 27, color: "var(--t-text-title)", lineHeight: 1.08 }}>
        Bora cozinhar?
      </div>
      <div style={{ fontSize: 13, color: "var(--t-text-secondary)", fontWeight: 500, marginTop: 5, marginBottom: 16 }}>
        {recap}
      </div>

      {/* ── CheffIA (PRO) ──────────────────────────────────── */}
      <div
        onClick={() => {
          if (pro.isPro) showToast("Abrindo CheffIA…", "👩‍🍳");
          else { showToast("CheffIA é exclusivo do PRO", "✨"); router.push("/progresso"); }
        }}
        className="ofcard"
        style={{
          display: "flex", alignItems: "center", gap: 12,
          background: "var(--t-bg-chef)",
          borderRadius: 18, padding: "14px 15px", marginBottom: 18,
          cursor: "pointer", boxShadow: "0 12px 26px -14px rgba(22,47,37,.5)",
        }}
      >
        <span style={{
          width: 42, height: 42, borderRadius: 13, background: "rgba(224,201,166,.16)",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 21, flexShrink: 0,
        }}>👩‍🍳</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{ fontSize: 14.5, fontWeight: 800, color: "var(--t-hero-fg)" }}>CheffIA</span>
            <span style={{
              fontSize: 9, fontWeight: 800, letterSpacing: 0.6, borderRadius: 7, padding: "2px 6px",
              background: pro.isPro ? "var(--t-success)" : "#e0c9a6",
              color:      pro.isPro ? "var(--t-cta-fg)" : "#162f25",
            }}>
              {pro.isPro ? "ATIVO" : "PRO"}
            </span>
          </div>
          <div style={{ fontSize: 12, color: "var(--t-hero-fg2)", marginTop: 2 }}>
            Dúvidas de nutrição, troca de ingredientes e montagem de pratos
          </div>
        </div>
        <span style={{ flexShrink: 0, color: "#e0c9a6", fontSize: 17 }}>→</span>
      </div>

      {/* ── Card principal (Tenho na cozinha / Já sei o que fazer) ── */}
      <div style={{
        background: "var(--t-bg-card)", border: "1px solid var(--t-bd-soft)", borderRadius: 22, padding: 16,
        boxShadow: "0 10px 24px -16px rgba(22,47,37,.3)",
      }}>
        {/* Header com toggle */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 17 }}>{mode === "nome" ? "🔍" : "🧺"}</span>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--t-text-title)" }}>
              {mode === "nome" ? "Já sei o que fazer" : "Tenho na cozinha"}
            </span>
          </div>
          {/* Mode switch segmentado (🧺 / 🔎) — igual ao design */}
          <div style={{
            display: "flex", background: "var(--t-bg-mode-switch)", borderRadius: 11,
            padding: 3, gap: 2, flexShrink: 0,
          }}>
            {([
              { key: "ingredientes", icon: "🧺" },
              { key: "nome",         icon: "🔎" },
            ] as const).map(m => {
              const on = mode === m.key;
              return (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setMode(m.key)}
                  aria-label={m.key === "ingredientes" ? "Tenho na cozinha" : "Já sei o que fazer"}
                  aria-pressed={on}
                  style={{
                    width: 34, height: 30, display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 15, borderRadius: 8, border: "none", cursor: "pointer",
                    background: on ? "var(--t-mode-switch-active)" : "transparent",
                    boxShadow: on ? "var(--t-mode-switch-shadow)" : "none",
                    opacity: on ? 1 : 0.5,
                    transition: "background .15s ease, opacity .15s ease",
                  }}
                >
                  {m.icon}
                </button>
              );
            })}
          </div>
        </div>

        {mode === "nome" ? (
          /* ── Modo busca por nome ─────────────────────────── */
          <div style={{ marginTop: 13 }}>
            <input
              ref={titleInputRef}
              autoFocus
              value={titleDraft}
              onChange={e => setTitleDraft(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") submit(); }}
              placeholder="ex: frango grelhado, bolo de cenoura…"
              style={{
                width: "100%", fontFamily: "Inter,sans-serif", fontSize: 14, color: "var(--t-text-primary)",
                background: "var(--t-bg-input)", border: "1px solid var(--t-bd-input)", borderRadius: 13,
                padding: "12px 14px", outline: "none", boxSizing: "border-box",
              }}
            />
            <div style={{ fontSize: 11, color: "var(--t-text-hint)", marginTop: 9 }}>
              Busca pelo nome da receita no catálogo
            </div>
          </div>
        ) : (
          /* ── Modo ingredientes ────────────────────────────── */
          <>
            {/* Chips */}
            {sortedIngs.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 13 }}>
                {sortedIngs.map((g) => {
                  const i = ingredients.indexOf(g);
                  return (
                    <span
                      key={g.name}
                      onClick={() => toggleBase(i)}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 6,
                        fontSize: 13, fontWeight: 600, padding: "8px 12px", borderRadius: 18,
                        background: g.base ? "var(--t-carb-bg)" : "var(--t-bg-card)",
                        color:      g.base ? "var(--t-pro-chip-fg)" : "var(--t-text-body)",
                        border:     `1px solid ${g.base ? "var(--t-pro-chip-bd)" : "var(--t-chip-off-bd)"}`,
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

            {/* Input ingredientes */}
            <div style={{ display: "flex", gap: 9, marginTop: 13 }}>
              <input
                ref={inputRef}
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={onDraftKey}
                placeholder="adicionar ingrediente…"
                style={{
                  flex: 1, fontFamily: "Inter,sans-serif", fontSize: 14, color: "var(--t-text-primary)",
                  background: "var(--t-bg-input)", border: "1px solid var(--t-bd-input)", borderRadius: 13,
                  padding: "12px 14px", outline: "none",
                }}
              />
              <div
                onClick={addIng}
                style={{
                  width: 46, flexShrink: 0, background: "var(--t-bg-hero)", borderRadius: 13,
                  display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--t-hero-fg)" strokeWidth="2.4" strokeLinecap="round">
                  <path d="M12 5v14M5 12h14"/>
                </svg>
              </div>
            </div>

            {ingredients.length > 0 && (
              <div style={{ fontSize: 11, color: "var(--t-text-hint)", marginTop: 9 }}>
                Toque num item pra marcar como <b style={{ color: "var(--t-pro-chip-fg)", fontWeight: 700 }}>★ principal</b>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Refinar pills (apenas modo ingredientes) ───────── */}
      {mode === "ingredientes" && <div style={{ display: "flex", gap: 8, overflowX: "auto", marginTop: 16, paddingBottom: 3, scrollbarWidth: "none", msOverflowStyle: "none" } as React.CSSProperties}>
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
      </div>}

      {/* ── Tray ───────────────────────────────────────────── */}
      {mode === "ingredientes" && openFilter && trayMap[openFilter] && (
        <div style={{
          background: "var(--t-bg-tray)", border: "1px solid var(--t-bd-input)", borderRadius: 18,
          padding: 15, marginTop: 11,
          animation: "ofRise .2s ease both",
        }}>
          <style>{`@keyframes ofRise { from { transform: translateY(8px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "var(--t-text-secondary)" }}>
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

      {/* ── Buscas recentes (apenas ingredientes) ──────────── */}
      {mode === "ingredientes" && recents.length > 0 && (
        <div style={{ marginTop: 22 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "var(--t-text-secondary)" }}>
              Buscas recentes
            </span>
            <span
              onClick={() => { clearHistory(); setRecents([]); }}
              style={{ fontSize: 12, fontWeight: 600, color: "var(--t-text-hint)", cursor: "pointer" }}
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
                style={{ fontSize: 12.5, color: "var(--t-text-body)", fontWeight: 500, padding: "7px 12px", borderRadius: 18, background: "var(--t-bg-card)", border: "1px solid var(--t-bd-soft)", cursor: "pointer" }}
              >
                {r}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Quota FREE · buscas sob medida (só modo ingredientes) ── */}
      {mode === "ingredientes" && (() => {
        const left      = pro.searchesLeft;
        const quotaColor = pro.isPro ? "var(--t-success)" : left === 0 ? "#d4644a" : left <= 3 ? "var(--t-carb-fg)" : "var(--t-success)";
        const quotaLabel = pro.isPro ? "ilimitado" : `${left}/${SEARCH_FREE} grátis hoje`;
        const quotaPct   = pro.isPro ? "100%" : `${Math.round((left / SEARCH_FREE) * 100)}%`;
        const quotaNote  = pro.isPro
          ? "PRO · buscas sob medida ilimitadas, sem anúncios"
          : left > 0
            ? "No grátis: 10 buscas/dia · depois, 1 anúncio por busca"
            : "Limite grátis atingido · assista a um anúncio ou vire PRO";
        return (
          <div style={{
            display: "flex", alignItems: "center", gap: 12, marginTop: 20,
            background: "var(--t-bg-card)", border: "1px solid var(--t-bd-soft)", borderRadius: 16, padding: "12px 14px",
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--t-text-title)" }}>Buscas sob medida</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: quotaColor, fontVariantNumeric: "tabular-nums" }}>{quotaLabel}</span>
              </div>
              <div style={{ height: 6, borderRadius: 4, background: "var(--t-progress-track)", overflow: "hidden", marginTop: 7 }}>
                <div style={{ height: "100%", borderRadius: 4, width: quotaPct, background: quotaColor, transition: "width .3s ease" }} />
              </div>
              <div style={{ fontSize: 11, color: "var(--t-text-muted)", marginTop: 6, lineHeight: 1.35 }}>{quotaNote}</div>
            </div>
            {!pro.isPro && (
              <div
                onClick={() => router.push("/progresso")}
                style={{
                  flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 1,
                  background: "var(--t-carb-bg)", border: "1px solid var(--t-pro-chip-bd)", borderRadius: 12, padding: "9px 12px", cursor: "pointer",
                }}
              >
                <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.5, color: "var(--t-pro-chip-fg)" }}>PRO</span>
                <span style={{ fontSize: 9.5, color: "var(--t-pro-chip-fg)", fontWeight: 600 }}>ilimitado</span>
              </div>
            )}
          </div>
        );
      })()}

      {/* ── CTA ────────────────────────────────────────────── */}
      <div
        onClick={mode === "nome" && !titleDraft.trim() ? undefined : submit}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
          background: mode === "nome" && !titleDraft.trim()
            ? "linear-gradient(120deg,#3a3a38,#5a5a56)"
            : "var(--t-bg-match-bar)",
          borderRadius: 18,
          padding: "15px 17px", marginTop: 20,
          cursor: mode === "nome" && !titleDraft.trim() ? "default" : "pointer",
          opacity: mode === "nome" && !titleDraft.trim() ? 0.6 : 1,
          boxShadow: "0 14px 28px -12px rgba(22,47,37,.5)",
          transition: "all .15s ease",
        }}
      >
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: "var(--t-hero-fg)", fontVariantNumeric: "tabular-nums" }}>
            {mode === "nome"
              ? (titleDraft.trim() ? `Buscar "${titleDraft.trim()}"` : "Digite o nome da receita")
              : `${matchCount} receitas combinam ✨`}
          </div>
          <div style={{ fontSize: 12, color: "var(--t-hero-fg2)", marginTop: 1 }}>
            {mode === "nome"
              ? "busca no catálogo completo"
              : pro.isPro ? "PRO · sob medida ilimitado" : "com o que você tem e seu plano"}
          </div>
        </div>
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          background: "#e0c9a6", color: "var(--t-text-title)", borderRadius: 12,
          padding: "9px 14px", fontSize: 13, fontWeight: 800, flexShrink: 0, whiteSpace: "nowrap",
        }}>
          {mode === "ingredientes" && !pro.isPro && pro.searchesLeft === 0 ? "▶ Anúncio" : "Buscar"}
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--t-text-title)" strokeWidth="2.6">
            <path d="M6 12h12M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </div>

      {/* ── Cabe no seu plano ──────────────────────────────── */}
      <div style={{ marginTop: 28 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 13 }}>
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.1, textTransform: "uppercase", color: "var(--t-text-secondary)" }}>
            Cabe no seu plano
          </span>
          {remaining !== null && (
            <span style={{ fontSize: 12, color: "var(--t-text-muted)", fontVariantNumeric: "tabular-nums" }}>
              {remaining} kcal livres
            </span>
          )}
        </div>

        {loadingCards ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
            {[0, 1, 2, 3].map(i => (
              <div key={i} style={{ height: 90, borderRadius: 20, background: "var(--t-bg-section)" }} />
            ))}
          </div>
        ) : cards.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
            {cards.map(c => (
              <Link key={c._id} href={`/recipe/${c._id}`} style={{
                background: "var(--t-bg-card)", border: "1px solid var(--t-bd-card)", borderRadius: 20, overflow: "hidden",
                display: "flex", boxShadow: "0 5px 16px -10px rgba(22,47,37,.2)", textDecoration: "none",
              }}>
                {c.thumbnailUrl?.startsWith("http") ? (
                  <img src={c.thumbnailUrl} alt={c.title} style={{ width: 108, flexShrink: 0, objectFit: "cover" }} />
                ) : (
                  <div style={{ width: 108, flexShrink: 0, background: "repeating-linear-gradient(135deg,#e9ddc7 0 9px,#e2d4ba 9px 18px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ fontFamily: "ui-monospace", fontSize: 9, color: "var(--t-text-mono)", textAlign: "center", padding: 6 }}>
                      {c.title.split(" ").slice(0, 2).join(" ")}
                    </span>
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0, padding: "13px 14px" }}>
                  <div style={{ fontSize: 14.5, fontWeight: 700, color: "var(--t-text-primary)", lineHeight: 1.2 }}>{c.title}</div>
                  {c.fits !== null && (
                    <span style={{
                      display: "inline-block", marginTop: 7, fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 14,
                      background: c.fits ? "var(--t-ok-bg)" : "var(--t-warn-bg)", color: c.fits ? "var(--t-success)" : "var(--t-pro-chip-fg)",
                    }}>
                      {c.fits ? "✓ Cabe no plano" : "⚠ Acima do plano"}
                    </span>
                  )}
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 9 }}>
                    {c.kcal !== null ? (
                      <>
                        <span style={{ fontSize: 18, fontWeight: 800, color: "var(--t-text-title)", fontVariantNumeric: "tabular-nums" }}>{c.kcal}</span>
                        <span style={{ fontSize: 11, color: "var(--t-text-secondary)", fontWeight: 600 }}>kcal</span>
                      </>
                    ) : null}
                    <span style={{ fontSize: 12, color: "var(--t-text-body)", fontWeight: 600, marginLeft: "auto" }}>⏱ {c.prepTimeMin}m</span>
                  </div>
                  {c.protein !== null && (
                    <div style={{ fontSize: 12, color: "var(--t-text-secondary)", fontWeight: 600, marginTop: 4 }}>
                      P {c.protein}g · C {c.carbs}g · G {c.fat}g
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <p style={{ fontSize: 13, color: "var(--t-text-muted)", padding: "16px 0" }}>
            Configure suas metas para ver receitas personalizadas.
          </p>
        )}
      </div>

      {/* ── Explorar ───────────────────────────────────────── */}
      <div style={{ marginTop: 26 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.1, textTransform: "uppercase", color: "var(--t-text-secondary)" }}>
            Explorar
          </span>
          {pantry.length > 0 && (
            <span style={{ fontSize: 11, color: "var(--t-text-muted)", fontWeight: 600 }}>✓ da sua despensa</span>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          {EXPLORE_CATEGORIES.map(cat => {
            const exploreUrl = buildExploreUrl(cat, pantry);
            const fromPantry = pantry.filter(p =>
              cat.pool.some(item => p.includes(item.split(" ")[0]) || item.includes(p.split(" ")[0]))
            ).slice(0, 3);
            return (
              <button
                key={cat.label}
                type="button"
                onClick={() => router.push(exploreUrl)}
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
