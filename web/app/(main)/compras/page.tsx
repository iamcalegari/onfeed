"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import {
  getDirectShoppingList,
  getWeekIngredients,
  removeFromShoppingList,
} from "@/lib/planStorage";

const STORES = [
  { name: "Rappi",          tag: "R",  bg: "#fa4a5b" },
  { name: "iFood Market",   tag: "iF", bg: "#ea1d2c" },
  { name: "Pão de Açúcar",  tag: "PA", bg: "#e30613" },
];

interface Item {
  name:         string;
  checked:      boolean;
  recipeId?:    string;
  recipeTitle?: string;
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>
      <path d="M9 6V4h6v2"/>
    </svg>
  );
}

export default function ComprasPage() {
  const router = useRouter();
  const [planItems,   setPlanItems]   = useState<Item[]>([]);
  const [directItems, setDirectItems] = useState<Item[]>([]);
  const [mounted, setMounted] = useState(false);

  function loadAll() {
    const ingredients = getWeekIngredients();
    const seen = new Set<string>();
    const plan: Item[] = [];
    for (const ing of ingredients) {
      const key = ing.toLowerCase().trim();
      if (!seen.has(key)) { seen.add(key); plan.push({ name: ing, checked: false }); }
    }
    setPlanItems(plan);

    const direct = getDirectShoppingList();
    setDirectItems(direct.map(i => ({
      name:        i.name,
      checked:     false,
      recipeId:    i.recipeId   || undefined,
      recipeTitle: i.recipeTitle || undefined,
    })));
  }

  useEffect(() => {
    loadAll();
    setMounted(true);
  }, []);

  function togglePlan(i: number) {
    setPlanItems(prev => prev.map((item, idx) => idx === i ? { ...item, checked: !item.checked } : item));
  }

  function toggleDirect(i: number) {
    setDirectItems(prev => prev.map((item, idx) => idx === i ? { ...item, checked: !item.checked } : item));
  }

  function removeDirect(name: string) {
    removeFromShoppingList(name);
    setDirectItems(prev => prev.filter(i => i.name !== name));
  }

  const totalPending = planItems.filter(i => !i.checked).length + directItems.filter(i => !i.checked).length;
  const hasAny = planItems.length > 0 || directItems.length > 0;

  return (
    <div className="flex flex-col gap-0 pb-4">

      {/* ── Header ─────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
        <button
          type="button"
          onClick={() => router.back()}
          style={{
            width: 36, height: 36, borderRadius: "50%",
            background: "var(--t-bg-card)", border: "1px solid var(--t-bd-strong)",
            display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0,
          }}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--t-text-title)" strokeWidth="2.4">
            <path d="m15 5-7 7 7 7" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, color: "var(--t-text-title)" }}>
          Lista de compras
        </h1>
      </div>

      {mounted && !hasAny ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "48px 0", textAlign: "center" }}>
          <span style={{ fontSize: 48 }}>🛒</span>
          <p style={{ fontSize: 14, color: "var(--t-text-secondary)", fontWeight: 600 }}>
            Nenhum item na lista ainda.
          </p>
          <p style={{ fontSize: 13, color: "var(--t-text-hint)", maxWidth: 240 }}>
            Adicione receitas ao plano ou clique no carrinho nos ingredientes que faltam.
          </p>
          <button
            type="button"
            onClick={() => router.push("/plano")}
            style={{
              background: "var(--t-bg-hero)", color: "var(--t-hero-fg)", borderRadius: 14,
              padding: "12px 20px", fontSize: 14, fontWeight: 700,
              border: "none", cursor: "pointer",
            }}
          >
            Montar o plano →
          </button>
        </div>
      ) : (
        <>
          {mounted && totalPending > 0 && (
            <p style={{ fontSize: 13, color: "var(--t-text-secondary)", fontWeight: 600, marginBottom: 14, marginTop: -8 }}>
              {totalPending} {totalPending === 1 ? "item faltando" : "itens faltando"}
            </p>
          )}

          {/* ── Adicionados de receitas ──────────────────────── */}
          {directItems.length > 0 && (
            <>
              <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.1, textTransform: "uppercase", color: "var(--t-text-secondary)", marginBottom: 10 }}>
                De receitas
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 9, marginBottom: 20 }}>
                {directItems.map((item, i) => (
                  <div
                    key={item.name}
                    style={{
                      display: "flex", alignItems: "center", gap: 13,
                      background: "var(--t-bg-card)", border: "1px solid var(--t-bd-card)",
                      borderRadius: 14, padding: "12px 14px",
                    }}
                  >
                    {/* Checkbox */}
                    <button
                      type="button"
                      onClick={() => toggleDirect(i)}
                      style={{
                        width: 22, height: 22, borderRadius: 7, flexShrink: 0,
                        border: `2px solid ${item.checked ? "var(--t-success)" : "var(--t-chip-off-bd)"}`,
                        background: item.checked ? "var(--t-success)" : "var(--t-bg-card)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 12, color: "#fff", fontWeight: 700, cursor: "pointer",
                      }}
                    >
                      {item.checked ? "✓" : ""}
                    </button>

                    {/* Nome + receita de origem */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{
                        fontSize: 14.5, fontWeight: 600, display: "block",
                        color: item.checked ? "var(--t-text-muted)" : "var(--t-text-primary)",
                        textDecoration: item.checked ? "line-through" : "none",
                        textTransform: "capitalize",
                      }}>
                        {item.name}
                      </span>
                      {item.recipeTitle && (
                        item.recipeId ? (
                          <Link
                            href={`/recipe/${item.recipeId}`}
                            style={{
                              fontSize: 11, fontWeight: 600,
                              color: "var(--t-text-hint)",
                              textDecoration: "none",
                              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "block",
                            }}
                          >
                            → {item.recipeTitle}
                          </Link>
                        ) : (
                          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--t-text-hint)" }}>
                            → {item.recipeTitle}
                          </span>
                        )
                      )}
                    </div>

                    {/* Remover */}
                    <button
                      type="button"
                      onClick={() => removeDirect(item.name)}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "center",
                        width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                        border: "1.5px solid var(--t-bd-card)",
                        background: "none", color: "var(--t-text-hint)", cursor: "pointer",
                      }}
                    >
                      <TrashIcon />
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ── Do plano semanal ──────────────────────────────── */}
          {planItems.length > 0 && (
            <>
              <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.1, textTransform: "uppercase", color: "var(--t-text-secondary)", marginBottom: 10 }}>
                Do plano da semana
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                {planItems.map((item, i) => (
                  <button
                    key={item.name}
                    type="button"
                    onClick={() => togglePlan(i)}
                    style={{
                      display: "flex", alignItems: "center", gap: 13,
                      background: "var(--t-bg-card)", border: "1px solid var(--t-bd-card)",
                      borderRadius: 14, padding: "14px 16px", cursor: "pointer", textAlign: "left",
                    }}
                  >
                    <span style={{
                      width: 22, height: 22, borderRadius: 7,
                      border: `2px solid ${item.checked ? "var(--t-success)" : "var(--t-chip-off-bd)"}`,
                      background: item.checked ? "var(--t-success)" : "var(--t-bg-card)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      flexShrink: 0, fontSize: 12, color: "#fff", fontWeight: 700,
                    }}>
                      {item.checked ? "✓" : ""}
                    </span>
                    <span style={{
                      flex: 1, fontSize: 14.5, fontWeight: 600,
                      color: item.checked ? "var(--t-text-muted)" : "var(--t-text-primary)",
                      textDecoration: item.checked ? "line-through" : "none",
                      textTransform: "capitalize",
                    }}>
                      {item.name}
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}

          {/* ── Pedir agora ───────────────────────────────────── */}
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.1, textTransform: "uppercase", color: "var(--t-text-secondary)", marginTop: 24, marginBottom: 12 }}>
            Pedir agora
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {STORES.map(s => (
              <div
                key={s.name}
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  background: "var(--t-bg-card)", border: "1px solid var(--t-bd-card)",
                  borderRadius: 16, padding: "14px 16px", cursor: "pointer",
                }}
              >
                <span style={{
                  width: 34, height: 34, borderRadius: 10,
                  background: s.bg, display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 14, fontWeight: 800, color: "#fff", flexShrink: 0,
                }}>
                  {s.tag}
                </span>
                <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: "var(--t-text-primary)" }}>{s.name}</span>
                <span style={{ fontSize: 13, color: "#d4644a", fontWeight: 700 }}>Abrir →</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
