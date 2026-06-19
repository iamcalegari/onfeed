"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { addToPantryAction, removeFromPantryAction } from "@/app/actions";
import type { PantryIngredient } from "@/lib/types";

/* ── Types ─────────────────────────────────────────────────── */

interface Shortcut {
  emoji: string;
  label: string;
  sublabel: string;
  params: {
    occasions?: string;
    goal?: string;
    maxPrepTimeMin?: string;
    note?: string;
  };
}

/* ── Defaults & persistence ────────────────────────────────── */

const DEFAULTS: Shortcut[] = [
  { emoji: "🍽️", label: "Almoço",    sublabel: "até 1h · completo",  params: { occasions: "almoço",    goal: "satiety", maxPrepTimeMin: "60" } },
  { emoji: "☕",  label: "Café",      sublabel: "até 20 min · manhã", params: { occasions: "brunch",                     maxPrepTimeMin: "20" } },
  { emoji: "🌙",  label: "Jantar",    sublabel: "até 45 min · noite", params: {                                           maxPrepTimeMin: "45", note: "jantar" } },
  { emoji: "🍿",  label: "Lanche",    sublabel: "até 15 min · rápido",params: {                                           maxPrepTimeMin: "15" } },
  { emoji: "🍰",  label: "Sobremesa", sublabel: "algo doce",          params: { occasions: "sobremesa"                                        } },
];

const STORAGE_KEY = "pantry-shortcuts-v1";

function loadShortcuts(): Shortcut[] {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Shortcut[];
  } catch { /* ignore */ }
  return DEFAULTS;
}

function saveShortcuts(shortcuts: Shortcut[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(shortcuts)); } catch { /* ignore */ }
}

/* ── Ingredient autocomplete ───────────────────────────────── */

const API_BASE =
  typeof window !== "undefined"
    ? (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000")
    : "";

async function fetchSuggestions(q: string): Promise<PantryIngredient[]> {
  if (!q.trim()) return [];
  try {
    const res = await fetch(`${API_BASE}/api/v1/ingredients/search?q=${encodeURIComponent(q)}`, { cache: "no-store" });
    if (!res.ok) return [];
    return ((await res.json()) as { results: PantryIngredient[] }).results;
  } catch { return []; }
}

/* ── Editor de atalho (bottom sheet) ───────────────────────── */

const OCCASION_OPTIONS = [
  { value: "",           label: "Nenhuma"   },
  { value: "almoço",     label: "Almoço"    },
  { value: "brunch",     label: "Café"      },
  { value: "sobremesa",  label: "Sobremesa" },
  { value: "tira-gosto", label: "Tira-gosto"},
];

const GOAL_OPTIONS = [
  { value: "",        label: "Qualquer"     },
  { value: "satiety", label: "Matar a fome" },
  { value: "macros",  label: "Macros"       },
];

const TIME_OPTIONS = [
  { value: "",   label: "Qualquer" },
  { value: "15", label: "15 min"   },
  { value: "20", label: "20 min"   },
  { value: "45", label: "45 min"   },
  { value: "60", label: "1 hora"   },
];

function ShortcutEditor({
  shortcut,
  onSave,
  onClose,
}: {
  shortcut: Shortcut;
  onSave: (s: Shortcut) => void;
  onClose: () => void;
}) {
  const [emoji,    setEmoji]    = useState(shortcut.emoji);
  const [label,    setLabel]    = useState(shortcut.label);
  const [sublabel, setSublabel] = useState(shortcut.sublabel);
  const [occasion, setOccasion] = useState(shortcut.params.occasions ?? "");
  const [goal,     setGoal]     = useState(shortcut.params.goal ?? "");
  const [time,     setTime]     = useState(shortcut.params.maxPrepTimeMin ?? "");

  function handleSave() {
    if (!label.trim()) return;
    onSave({
      emoji: emoji || "🍽️",
      label: label.trim(),
      sublabel: sublabel.trim(),
      params: {
        ...(occasion ? { occasions: occasion } : {}),
        ...(goal     ? { goal }                : {}),
        ...(time     ? { maxPrepTimeMin: time } : {}),
      },
    });
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-carvao/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Sheet */}
      <div className="fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-3xl bg-surface pb-safe shadow-lift animate-in slide-in-from-bottom duration-300">
        {/* Handle */}
        <div className="mx-auto mt-3 h-1 w-10 rounded-full bg-areia" />

        <div className="flex flex-col gap-5 overflow-y-auto px-5 pt-4 pb-6">
          <h2 className="text-base font-bold text-carvao">Editar atalho</h2>

          {/* Emoji + label */}
          <div className="flex items-center gap-3">
            <input
              value={emoji}
              onChange={(e) => setEmoji(e.target.value)}
              maxLength={2}
              className="w-14 rounded-xl border border-areia bg-creme text-center text-2xl leading-none py-3 outline-none focus:border-salvia"
            />
            <div className="flex flex-1 flex-col gap-1.5">
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Nome do atalho"
                className="w-full rounded-xl border border-areia bg-surface px-3 py-2.5 text-sm font-semibold outline-none focus:border-salvia focus:ring-2 focus:ring-salvia/20"
              />
              <input
                value={sublabel}
                onChange={(e) => setSublabel(e.target.value)}
                placeholder="Descrição curta (opcional)"
                className="w-full rounded-xl border border-areia bg-surface px-3 py-2 text-xs text-carvao/60 outline-none focus:border-salvia"
              />
            </div>
          </div>

          {/* Ocasião */}
          <section className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-carvao/40">Ocasião</p>
            <div className="flex flex-wrap gap-2">
              {OCCASION_OPTIONS.map((o) => (
                <Chip key={o.value} active={occasion === o.value} onClick={() => setOccasion(o.value)}>
                  {o.label}
                </Chip>
              ))}
            </div>
          </section>

          {/* Objetivo */}
          <section className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-carvao/40">Objetivo</p>
            <div className="flex flex-wrap gap-2">
              {GOAL_OPTIONS.map((o) => (
                <Chip key={o.value} active={goal === o.value} onClick={() => setGoal(o.value)}>
                  {o.label}
                </Chip>
              ))}
            </div>
          </section>

          {/* Tempo */}
          <section className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-carvao/40">Tempo máximo</p>
            <div className="flex flex-wrap gap-2">
              {TIME_OPTIONS.map((o) => (
                <Chip key={o.value} active={time === o.value} onClick={() => setTime(o.value)}>
                  {o.label}
                </Chip>
              ))}
            </div>
          </section>

          {/* Ações */}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-areia py-3 text-sm font-medium text-carvao/60 transition-all hover:bg-areia/40"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!label.trim()}
              className="flex-1 rounded-xl bg-forest py-3 text-sm font-semibold text-creme transition-all hover:bg-forest/90 disabled:opacity-40 disabled:pointer-events-none"
            >
              Salvar
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

/* ── Componente principal ───────────────────────────────────── */

export function PantryManager({ initial }: { initial: PantryIngredient[] }) {
  const router = useRouter();
  const [items,       setItems]       = useState<PantryIngredient[]>(initial);
  const [shortcuts,   setShortcuts]   = useState<Shortcut[]>(DEFAULTS);
  const [editMode,    setEditMode]    = useState(false);
  const [editingIdx,  setEditingIdx]  = useState<number | null>(null);   // null = novo
  const [showEditor,  setShowEditor]  = useState(false);
  const [query,       setQuery]       = useState("");
  const [suggestions, setSuggestions] = useState<PantryIngredient[]>([]);
  const [showSug,     setShowSug]     = useState(false);
  const [, startTransition] = useTransition();

  const debounceRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef      = useRef<HTMLInputElement>(null);
  const dragIdxRef    = useRef<number>(-1);

  // Carrega atalhos do localStorage no cliente
  useEffect(() => { setShortcuts(loadShortcuts()); }, []);

  // Autocomplete debounced
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) { setSuggestions([]); return; }
    debounceRef.current = setTimeout(async () => {
      const res = await fetchSuggestions(query);
      const ids = new Set(items.map((i) => i.ingredientId));
      setSuggestions(res.filter((r) => !ids.has(r.ingredientId)));
    }, 250);
  }, [query, items]);

  /* ── Pantry CRUD ─────────────────────────────────────────── */

  function handleAdd(ingredient: PantryIngredient) {
    setItems((p) => [...p, ingredient]);
    setQuery("");
    setSuggestions([]);
    setShowSug(false);
    startTransition(() => addToPantryAction(ingredient.ingredientId));
    inputRef.current?.focus();
  }

  function handleRemoveItem(ingredientId: string) {
    setItems((p) => p.filter((i) => i.ingredientId !== ingredientId));
    startTransition(() => removeFromPantryAction(ingredientId));
  }

  /* ── Atalhos ─────────────────────────────────────────────── */

  function searchWith(s: Shortcut) {
    if (items.length === 0) return;
    const qs = new URLSearchParams();
    qs.set("ingredients", items.map((i) => i.displayName).join(","));
    for (const [k, v] of Object.entries(s.params)) {
      if (v) qs.set(k, v);
    }
    router.push(`/results?${qs.toString()}`);
  }

  function openEditor(index: number | null) {
    setEditingIdx(index);
    setShowEditor(true);
  }

  function handleEditorSave(updated: Shortcut) {
    setShortcuts((prev) => {
      const next = [...prev];
      if (editingIdx === null) {
        next.push(updated);            // novo
      } else {
        next[editingIdx] = updated;    // editar existente
      }
      saveShortcuts(next);
      return next;
    });
    setShowEditor(false);
  }

  function handleEditorClose() {
    setShowEditor(false);
  }

  function handleDelete(index: number) {
    setShortcuts((prev) => {
      const next = prev.filter((_, i) => i !== index);
      saveShortcuts(next);
      return next;
    });
  }

  /* ── Drag-and-drop (HTML5) ───────────────────────────────── */

  function onDragStart(index: number) {
    dragIdxRef.current = index;
  }

  function onDragEnter(targetIndex: number) {
    const from = dragIdxRef.current;
    if (from === -1 || from === targetIndex) return;
    setShortcuts((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(targetIndex, 0, moved);
      dragIdxRef.current = targetIndex;
      return next;
    });
  }

  function onDragEnd() {
    dragIdxRef.current = -1;
    saveShortcuts(shortcuts);
  }

  /* ── Render ──────────────────────────────────────────────── */

  const pantryDisabled = items.length === 0;

  const editorShortcut =
    showEditor
      ? (editingIdx !== null ? shortcuts[editingIdx] : { emoji: "✨", label: "", sublabel: "", params: {} })
      : null;

  return (
    <>
      <div className="flex flex-col gap-6">

        {/* ── Atalhos ──────────────────────────────────────── */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <p className={`text-xs font-semibold uppercase tracking-wider transition-colors ${pantryDisabled ? "text-carvao/25" : "text-carvao/40"}`}>
              O que você quer fazer?
            </p>
            <button
              type="button"
              onClick={() => setEditMode((v) => !v)}
              className={`text-xs font-semibold transition-colors ${editMode ? "text-terracota" : "text-salvia hover:text-forest"}`}
            >
              {editMode ? "Concluído" : "Editar"}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {shortcuts.map((s, i) => (
              <div
                key={`${s.label}-${i}`}
                className={[
                  "relative",
                  editMode ? "jiggle cursor-grab active:cursor-grabbing" : "",
                  i === shortcuts.length - 1 && shortcuts.length % 2 !== 0 ? "col-span-2" : "",
                ].join(" ")}
                style={editMode ? { animationDelay: `${(i % 3) * 0.07}s` } : undefined}
                draggable={editMode}
                onDragStart={() => onDragStart(i)}
                onDragEnter={() => onDragEnter(i)}
                onDragOver={(e) => e.preventDefault()}
                onDragEnd={onDragEnd}
              >
                {/* Botão do atalho */}
                <button
                  type="button"
                  onClick={() => editMode ? openEditor(i) : searchWith(s)}
                  disabled={!editMode && pantryDisabled}
                  className="flex w-full items-center gap-3 rounded-2xl border border-areia bg-surface px-4 py-3 text-left transition-all hover:border-forest/30 hover:bg-forest/5 hover:-translate-y-px active:translate-y-0 disabled:opacity-30 disabled:pointer-events-none"
                >
                  <span className="text-xl leading-none">{s.emoji}</span>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-semibold text-carvao">{s.label}</span>
                    <span className="truncate text-[10px] text-carvao/45">{s.sublabel}</span>
                  </span>
                </button>

                {/* Badge de delete (edit mode) */}
                {editMode && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleDelete(i); }}
                    className="absolute -left-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-carvao text-creme shadow-sm transition-transform hover:scale-110"
                    aria-label={`Remover ${s.label}`}
                  >
                    <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                      <path d="M2 2l8 8M10 2l-8 8" />
                    </svg>
                  </button>
                )}
              </div>
            ))}

            {/* Botão de adicionar novo atalho (edit mode, máx 6) */}
            {editMode && shortcuts.length < 6 && (
              <button
                type="button"
                onClick={() => openEditor(null)}
                className={[
                  "flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-areia py-3 text-sm font-medium text-carvao/40 transition-all hover:border-salvia hover:text-salvia",
                  shortcuts.length % 2 === 0 ? "" : "col-span-2",
                ].join(" ")}
              >
                <span className="text-lg leading-none">+</span>
                Novo atalho
              </button>
            )}
          </div>
        </div>

        {/* ── Campo de busca para adicionar ingrediente ─────── */}
        <div className="relative flex flex-col gap-1.5">
          <label className="flex items-center gap-2 text-sm font-semibold text-forest">
            <LeafIcon />
            Adicionar ingrediente
          </label>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setShowSug(true); }}
            onFocus={() => setShowSug(true)}
            onBlur={() => setTimeout(() => setShowSug(false), 150)}
            placeholder="Digite um ingrediente..."
            className="w-full rounded-xl border border-areia bg-surface px-4 py-3 text-sm shadow-sm outline-none placeholder:text-carvao/35 focus:border-salvia focus:ring-2 focus:ring-salvia/20 transition-all"
          />
          {showSug && suggestions.length > 0 && (
            <ul className="absolute top-full z-30 mt-1.5 w-full overflow-hidden rounded-xl border border-areia bg-surface shadow-lift">
              {suggestions.map((s) => (
                <li key={s.ingredientId}>
                  <button
                    type="button"
                    onMouseDown={() => handleAdd(s)}
                    className="flex w-full items-center justify-between px-4 py-3 text-left text-sm hover:bg-forest/5 transition-colors"
                  >
                    <span className="font-medium text-carvao">{s.displayName}</span>
                    <span className="text-xs text-carvao/40">{s.category}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* ── Itens da despensa ────────────────────────────── */}
        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-areia py-12 text-center">
            <span className="text-3xl">🥫</span>
            <p className="text-sm font-medium text-carvao/60">Sua despensa está vazia</p>
            <p className="text-xs text-carvao/40">Adicione o que você tem em casa para encontrar receitas na hora</p>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {Object.entries(
              items.reduce<Record<string, PantryIngredient[]>>((acc, item) => {
                const cat = item.category || "outros";
                (acc[cat] ??= []).push(item);
                return acc;
              }, {}),
            )
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([cat, catItems]) => (
                <section key={cat}>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-carvao/40">{cat}</h3>
                  <div className="flex flex-wrap gap-2">
                    {catItems.map((item) => (
                      <button
                        key={item.ingredientId}
                        type="button"
                        onClick={() => handleRemoveItem(item.ingredientId)}
                        title="Remover da despensa"
                        className="flex items-center gap-1.5 rounded-full bg-forest px-3 py-1.5 text-xs font-medium text-creme transition-all hover:bg-terracota"
                      >
                        {item.displayName}
                        <XIcon />
                      </button>
                    ))}
                  </div>
                </section>
              ))}
          </div>
        )}
      </div>

      {/* ── Editor bottom sheet ───────────────────────────── */}
      {showEditor && editorShortcut && (
        <ShortcutEditor
          shortcut={editorShortcut}
          onSave={handleEditorSave}
          onClose={handleEditorClose}
        />
      )}
    </>
  );
}

/* ── Shared sub-components ──────────────────────────────────── */

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all ${
        active
          ? "border-forest bg-forest text-creme shadow-sm"
          : "border-areia bg-surface text-carvao/70 hover:border-salvia hover:text-forest"
      }`}
    >
      {children}
    </button>
  );
}

function LeafIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 shrink-0">
      <path d="M11 20A7 7 0 0 1 4 13c0-5 5-9 16-9 0 11-4 16-9 16Z" strokeLinejoin="round" />
      <path d="M4 20c3-3 6-5 9-6" strokeLinecap="round" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M2 2l8 8M10 2l-8 8" />
    </svg>
  );
}
