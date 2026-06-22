"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { addToPantryAction, removeFromPantryAction } from "@/app/actions";
import type { PantryIngredient } from "@/lib/types";

/* ── Tipos da feature de NF ─────────────────────────────────── */

interface ReceiptItem {
  rawName: string;
  quantity: string | null;
  ingredientId: string | null;
  displayName: string;
  matched: boolean;
}

/* ── Comprime imagem via canvas antes de enviar ─────────────── */

async function compressImage(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX = 1600;
      const scale = Math.min(1, MAX / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.88);
      resolve({ base64: dataUrl.split(",")[1]!, mimeType: "image/jpeg" });
    };
    img.onerror = reject;
    img.src = url;
  });
}

/* ── Bottom sheet de revisão dos itens da NF ────────────────── */

function ReceiptReview({
  items,
  onConfirm,
  onClose,
}: {
  items: ReceiptItem[];
  onConfirm: (selected: ReceiptItem[]) => void;
  onClose: () => void;
}) {
  const matched = items.filter((i) => i.matched);
  const unmatched = items.filter((i) => !i.matched);
  const [checked, setChecked] = useState(() => new Set(matched.map((i) => i.ingredientId!)));

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setChecked((prev) =>
      prev.size === matched.length ? new Set() : new Set(matched.map((i) => i.ingredientId!)),
    );
  }

  const selectedCount = checked.size;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-carvao/40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] flex-col rounded-t-3xl bg-surface pb-safe shadow-lift animate-in slide-in-from-bottom duration-300">
        {/* Handle */}
        <div className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-areia" />

        {/* Header */}
        <div className="flex shrink-0 items-center justify-between px-5 pt-4 pb-3">
          <div>
            <h2 className="text-base font-bold text-carvao">Ingredientes na nota</h2>
            <p className="text-xs text-carvao/45">
              {items.length === 0
                ? "Nenhum ingrediente reconhecido"
                : `${matched.length} reconhecido${matched.length !== 1 ? "s" : ""}${unmatched.length ? ` · ${unmatched.length} não identificado${unmatched.length !== 1 ? "s" : ""}` : ""}`}
            </p>
          </div>
          {matched.length > 1 && (
            <button
              type="button"
              onClick={toggleAll}
              className="text-xs font-semibold text-forest"
            >
              {checked.size === matched.length ? "Desmarcar todos" : "Marcar todos"}
            </button>
          )}
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto px-5 pb-2">
          {items.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <span className="text-4xl">🧾</span>
              <p className="text-sm text-carvao/55">
                Não conseguimos identificar ingredientes nesta nota.
              </p>
              <p className="text-xs text-carvao/35">
                Tente tirar a foto com mais luz e enquadrar bem os itens.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {matched.length > 0 && (
                <section className="flex flex-col gap-1">
                  {matched.map((item) => (
                    <label
                      key={item.ingredientId}
                      className="flex cursor-pointer items-center gap-3 rounded-xl px-1 py-2.5 transition-colors hover:bg-forest/5"
                    >
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                          checked.has(item.ingredientId!)
                            ? "border-forest bg-forest"
                            : "border-areia bg-surface"
                        }`}
                      >
                        {checked.has(item.ingredientId!) && (
                          <svg viewBox="0 0 10 10" className="h-2.5 w-2.5" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M1.5 5l2.5 2.5 4.5-4.5" />
                          </svg>
                        )}
                      </span>
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={checked.has(item.ingredientId!)}
                        onChange={() => toggle(item.ingredientId!)}
                      />
                      <span className="flex-1 text-sm font-medium text-carvao">{item.displayName}</span>
                      {item.quantity && (
                        <span className="shrink-0 text-xs text-carvao/40">{item.quantity}</span>
                      )}
                    </label>
                  ))}
                </section>
              )}

              {unmatched.length > 0 && (
                <section>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-carvao/35">
                    Não identificados — adicione manualmente
                  </p>
                  <div className="flex flex-col gap-1">
                    {unmatched.map((item, i) => (
                      <div key={i} className="flex items-center gap-3 px-1 py-2">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-areia/60 text-[10px] text-carvao/30">?</span>
                        <span className="flex-1 text-sm text-carvao/45">{item.rawName}</span>
                        {item.quantity && (
                          <span className="shrink-0 text-xs text-carvao/30">{item.quantity}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-areia/60 px-5 pt-3 pb-5">
          {selectedCount > 0 ? (
            <button
              type="button"
              onClick={() => onConfirm(matched.filter((i) => checked.has(i.ingredientId!)))}
              className="w-full rounded-2xl bg-forest py-3.5 text-sm font-bold text-creme shadow-card transition-all hover:bg-forest/90 active:scale-[0.98]"
            >
              Adicionar {selectedCount} ingrediente{selectedCount !== 1 ? "s" : ""} à despensa
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-2xl border border-areia py-3.5 text-sm font-medium text-carvao/60"
            >
              Fechar
            </button>
          )}
        </div>
      </div>
    </>
  );
}

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

async function fetchSuggestions(q: string): Promise<PantryIngredient[]> {
  if (!q.trim()) return [];
  try {
    const res = await fetch(`/api/v1/ingredients/search?q=${encodeURIComponent(q)}`, { cache: "no-store" });
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

const DRAG_THRESHOLD = 6; // px antes de ativar o drag

export function PantryManager({ initial }: { initial: PantryIngredient[] }) {
  const router = useRouter();
  const [items,       setItems]       = useState<PantryIngredient[]>(initial);
  const [shortcuts,   setShortcuts]   = useState<Shortcut[]>(DEFAULTS);
  const [editMode,    setEditMode]    = useState(false);
  const [editingIdx,  setEditingIdx]  = useState<number | null>(null);
  const [showEditor,  setShowEditor]  = useState(false);
  const [query,       setQuery]       = useState("");
  const [suggestions, setSuggestions] = useState<PantryIngredient[]>([]);
  const [showSug,     setShowSug]     = useState(false);
  // estado visual do drag
  const [liftedIdx,   setLiftedIdx]   = useState<number | null>(null);
  const [dragOffset,  setDragOffset]  = useState({ dx: 0, dy: 0 });
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [, startTransition] = useTransition();

  const [receiptItems,   setReceiptItems]   = useState<ReceiptItem[] | null>(null);
  const [receiptLoading, setReceiptLoading] = useState(false);
  const [receiptError,   setReceiptError]   = useState<string | null>(null);

  const debounceRef      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef         = useRef<HTMLInputElement>(null);
  const fileInputRef     = useRef<HTMLInputElement>(null);
  // refs para cálculo de slot durante o drag
  const cardRefs         = useRef<(HTMLDivElement | null)[]>([]);
  const dragStartRef     = useRef<{ x: number; y: number } | null>(null);
  const dragOrigIdxRef   = useRef<number>(-1);
  const dragOverIdxRef   = useRef<number>(-1);
  const didDragRef       = useRef(false);
  const origPositionsRef = useRef<{ left: number; top: number }[]>([]);
  // ref para shortcuts atual (evita stale closure no pointermove)
  const shortcutsRef   = useRef(shortcuts);
  useEffect(() => { shortcutsRef.current = shortcuts; }, [shortcuts]);

  useEffect(() => { setShortcuts(loadShortcuts()); }, []);

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
    setQuery(""); setSuggestions([]); setShowSug(false);
    startTransition(() => addToPantryAction(ingredient.ingredientId));
    inputRef.current?.focus();
  }

  function handleRemoveItem(ingredientId: string) {
    setItems((p) => p.filter((i) => i.ingredientId !== ingredientId));
    startTransition(() => removeFromPantryAction(ingredientId));
  }

  async function handleReceiptFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setReceiptLoading(true);
    setReceiptError(null);
    try {
      const { base64, mimeType } = await compressImage(file);
      const res = await fetch("/api/v1/pantry/receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, mimeType }),
      });
      if (!res.ok) throw new Error("Falha ao processar a nota");
      const data = (await res.json()) as { items: ReceiptItem[] };
      setReceiptItems(data.items);
    } catch {
      setReceiptError("Não foi possível ler a nota. Tente novamente com melhor iluminação.");
    } finally {
      setReceiptLoading(false);
    }
  }

  function handleReceiptConfirm(selected: ReceiptItem[]) {
    const alreadyIds = new Set(items.map((i) => i.ingredientId));
    const toAdd = selected.filter((s) => s.ingredientId && !alreadyIds.has(s.ingredientId));
    toAdd.forEach((s) => {
      const ingredient: PantryIngredient = {
        ingredientId: s.ingredientId!,
        displayName: s.displayName,
        category: "outros",
      };
      setItems((p) => [...p, ingredient]);
      startTransition(() => addToPantryAction(s.ingredientId!));
    });
    setReceiptItems(null);
  }

  /* ── Atalhos ─────────────────────────────────────────────── */

  function searchWith(s: Shortcut) {
    if (items.length === 0) return;
    const qs = new URLSearchParams();
    qs.set("ingredients", items.map((i) => i.displayName).join(","));
    for (const [k, v] of Object.entries(s.params)) { if (v) qs.set(k, v); }
    router.push(`/results?${qs.toString()}`);
  }

  function openEditor(index: number | null) {
    setEditingIdx(index);
    setShowEditor(true);
  }

  function handleEditorSave(updated: Shortcut) {
    setShortcuts((prev) => {
      const next = [...prev];
      if (editingIdx === null) next.push(updated);
      else next[editingIdx] = updated;
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

  function handleRestoreDefaults() {
    saveShortcuts(DEFAULTS);
    setShortcuts(DEFAULTS);
  }

  /* ── Drag por pointer events (funciona em touch e mouse) ──── */

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>, index: number) {
    if (!editMode) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStartRef.current   = { x: e.clientX, y: e.clientY };
    dragOrigIdxRef.current = index;
    dragOverIdxRef.current = index;
    didDragRef.current     = false;
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!editMode || !dragStartRef.current) return;

    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;

    if (!didDragRef.current && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    if (!didDragRef.current) {
      didDragRef.current = true;
      const oIdx = dragOrigIdxRef.current;
      setLiftedIdx(oIdx);
      setDragOverIdx(oIdx);
      dragOverIdxRef.current = oIdx;
      // Captura centros originais de todos os cards uma única vez
      origPositionsRef.current = cardRefs.current.map((el) => {
        if (!el) return { left: 0, top: 0 };
        const r = el.getBoundingClientRect();
        return { left: r.left, top: r.top };
      });
    }

    setDragOffset({ dx, dy });

    // Encontra o slot cujo centro original está mais próximo do ponteiro
    const origIdx = dragOrigIdxRef.current;
    const n       = shortcutsRef.current.length;
    const sampleEl = cardRefs.current.find(Boolean);
    const cardW   = sampleEl ? sampleEl.offsetWidth  : 150;
    const cardH   = sampleEl ? sampleEl.offsetHeight : 60;

    let bestIdx  = origIdx;
    let bestDist = Infinity;

    for (let idx = 0; idx < n; idx++) {
      const op = origPositionsRef.current[idx];
      if (!op) continue;
      const cx   = op.left + cardW / 2;
      const cy   = op.top  + cardH / 2;
      const dist = Math.hypot(e.clientX - cx, e.clientY - cy);
      if (dist < bestDist) { bestDist = dist; bestIdx = idx; }
    }

    if (bestIdx !== dragOverIdxRef.current) {
      dragOverIdxRef.current = bestIdx;
      setDragOverIdx(bestIdx);
    }
  }

  function handlePointerUp() {
    if (!editMode || !dragStartRef.current) return;

    if (didDragRef.current) {
      const origIdx = dragOrigIdxRef.current;
      const overIdx = dragOverIdxRef.current;
      if (origIdx !== overIdx && origIdx >= 0 && overIdx >= 0) {
        setShortcuts((prev) => {
          const next = [...prev];
          const [moved] = next.splice(origIdx, 1);
          next.splice(overIdx, 0, moved);
          saveShortcuts(next);
          return next;
        });
      } else {
        saveShortcuts(shortcutsRef.current);
      }
    }

    dragStartRef.current     = null;
    dragOrigIdxRef.current   = -1;
    dragOverIdxRef.current   = -1;
    origPositionsRef.current = [];
    setLiftedIdx(null);
    setDragOffset({ dx: 0, dy: 0 });
    setDragOverIdx(null);
  }

  /* ── Render ──────────────────────────────────────────────── */

  const pantryDisabled = items.length === 0;
  const editorShortcut = showEditor
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

          <div
            className="grid grid-cols-2 gap-2"
            style={editMode ? { touchAction: "none" } : undefined}
          >
            {shortcuts.map((s, i) => {
              const isLifted = liftedIdx === i;
              const isOdd    = shortcuts.length % 2 !== 0;
              const isLast   = i === shortcuts.length - 1;

              return (
                <div
                  key={`${s.label}-${i}`}
                  ref={(el) => { cardRefs.current[i] = el; }}
                  className={[
                    "relative select-none",
                    editMode && !isLifted ? "jiggle" : "",
                    isLast && isOdd ? "col-span-2" : "",
                  ].join(" ")}
                  style={(() => {
                    const base: React.CSSProperties = {
                      animationDelay: editMode ? `${(i % 3) * 0.05}s` : undefined,
                    };
                    if (isLifted) {
                      return {
                        ...base,
                        transform: `translate(${dragOffset.dx}px, ${dragOffset.dy}px) scale(1.07) rotate(1.5deg)`,
                        boxShadow: "var(--shadow-lift)",
                        opacity: 0.92,
                        zIndex: 50,
                        transition: "none",
                      };
                    }
                    // Outros cards deslizam para abrir espaço (estilo iPhone)
                    if (liftedIdx !== null && dragOverIdx !== null && origPositionsRef.current.length > 0) {
                      const oIdx = liftedIdx;
                      let visIdx = i;
                      if (oIdx < dragOverIdx) {
                        if (i > oIdx && i <= dragOverIdx) visIdx = i - 1;
                      } else if (oIdx > dragOverIdx) {
                        if (i >= dragOverIdx && i < oIdx) visIdx = i + 1;
                      }
                      if (visIdx !== i) {
                        const from = origPositionsRef.current[i];
                        const to   = origPositionsRef.current[visIdx];
                        if (from && to) {
                          return {
                            ...base,
                            transform: `translate(${to.left - from.left}px, ${to.top - from.top}px)`,
                            transition: "transform 0.22s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
                          };
                        }
                      }
                      return { ...base };
                    }
                    return { ...base, transition: "transform 0.18s ease, box-shadow 0.18s ease, opacity 0.18s ease" };
                  })()}
                  onPointerDown={(e) => handlePointerDown(e, i)}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                >
                  {/* Botão do atalho */}
                  <button
                    type="button"
                    onClick={() => {
                      if (didDragRef.current) { didDragRef.current = false; return; }
                      editMode ? openEditor(i) : searchWith(s);
                    }}
                    disabled={!editMode && pantryDisabled}
                    className={[
                      "flex w-full items-center gap-3 rounded-2xl border border-areia bg-surface px-4 py-3 text-left",
                      "transition-all disabled:opacity-30 disabled:pointer-events-none",
                      editMode ? "cursor-grab active:cursor-grabbing" : "hover:border-forest/30 hover:bg-forest/5 hover:-translate-y-px active:translate-y-0",
                    ].join(" ")}
                  >
                    <span className="text-xl leading-none">{s.emoji}</span>
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-semibold text-carvao">{s.label}</span>
                      <span className="truncate text-[10px] text-carvao/45">{s.sublabel}</span>
                    </span>
                  </button>

                  {/* Badge de delete */}
                  {editMode && (
                    <button
                      type="button"
                      onPointerDown={(e) => e.stopPropagation()}
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
              );
            })}

            {/* Adicionar novo (edit mode, máx 6) */}
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

          {/* Restaurar padrões (edit mode) */}
          {editMode && (
            <button
              type="button"
              onClick={handleRestoreDefaults}
              className="mt-1 self-center text-xs text-carvao/35 underline underline-offset-2 transition-colors hover:text-terracota"
            >
              Restaurar padrões
            </button>
          )}
        </div>

        {/* ── Campo de busca para adicionar ingrediente ─────── */}
        <div className="relative flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm font-semibold text-forest">
              <LeafIcon />
              Adicionar ingrediente
            </label>

            {/* Botão PRO — Escanear NF */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={receiptLoading}
              className="flex items-center gap-1.5 rounded-full border border-amber-300/60 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 transition-all hover:bg-amber-100 disabled:opacity-50"
            >
              {receiptLoading ? (
                <>
                  <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
                  Lendo…
                </>
              ) : (
                <>
                  <span>📷</span>
                  Nota fiscal
                  <span className="rounded-full bg-amber-400 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
                    PRO
                  </span>
                </>
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              onChange={handleReceiptFile}
            />
          </div>

          {receiptError && (
            <p className="text-xs text-terracota">{receiptError}</p>
          )}

          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setShowSug(true); }}
            onFocus={() => setShowSug(true)}
            onBlur={() => setTimeout(() => setShowSug(false), 150)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && suggestions.length > 0) {
                e.preventDefault();
                handleAdd(suggestions[0]!);
              }
            }}
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

      {/* ── Revisão de nota fiscal ────────────────────────── */}
      {receiptItems !== null && (
        <ReceiptReview
          items={receiptItems}
          onConfirm={handleReceiptConfirm}
          onClose={() => setReceiptItems(null)}
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
