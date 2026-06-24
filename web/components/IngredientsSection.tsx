"use client";

import { useState } from "react";

import { addToShoppingList, getDirectShoppingList } from "@/lib/planStorage";
import { fmtNumber, convertUnit, translateUnit } from "@/lib/settings";
import { showToast } from "@/lib/toast";
import type { Language, UnitSystem } from "@/lib/settings";

export interface IngredientRow {
  name:         string;
  got:          boolean;
  base:         boolean;
  core:         boolean;
  qty:          string;
  quantityRaw?: number;
  unitRaw?:     string;
}

interface Props {
  ingredients:      IngredientRow[];
  haveCount:        number;
  recipeId:         string;
  recipeTitle:      string;
  originalServings?: number;
  unitSystem?:      UnitSystem;
  lang?:            Language;
}

function CartIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9"  cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  );
}

function scaleQty(
  row: IngredientRow,
  scale: number,
  unitSystem: UnitSystem,
  lang: Language,
): string {
  if (scale === 1 || row.quantityRaw == null) return row.qty;
  const scaled = row.quantityRaw * scale;
  const unit   = translateUnit(row.unitRaw, lang);
  const { quantity: q, unit: u } = convertUnit(scaled, unit ?? "", unitSystem);
  const qStr = fmtNumber(q);
  if (!u) return qStr;
  if (/^(g|kg|mg|ml|l|cl|dl)$/i.test(u)) return `${qStr}${u}`;
  return `${qStr} ${u}`;
}

export default function IngredientsSection({
  ingredients,
  haveCount,
  recipeId,
  recipeTitle,
  originalServings,
  unitSystem = "metric",
  lang = "pt",
}: Props) {
  const missing = ingredients.filter(i => !i.got);
  const recipe  = { id: recipeId, title: recipeTitle };

  const [servings, setServings] = useState(originalServings ?? 1);
  const scale = originalServings ? servings / originalServings : 1;

  function getAdded(): Set<string> {
    const list = getDirectShoppingList().map(n => n.name.toLowerCase());
    return new Set(list);
  }

  const [added, setAdded] = useState<Set<string>>(getAdded);

  function addOne(name: string) {
    addToShoppingList([name], recipe);
    setAdded(prev => new Set([...prev, name.toLowerCase()]));
    showToast("Adicionado à lista de compras");
  }

  function addAll() {
    const toAdd = missing.map(i => i.name).filter(n => !added.has(n.toLowerCase()));
    if (toAdd.length === 0) {
      showToast("Todos os faltantes já estão na lista");
      return;
    }
    addToShoppingList(toAdd, recipe);
    setAdded(prev => new Set([...prev, ...toAdd.map(n => n.toLowerCase())]));
    showToast(`${toAdd.length} ${toAdd.length === 1 ? "item adicionado" : "itens adicionados"} à lista`);
  }

  return (
    <div style={{ marginTop: 26 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.1, textTransform: "uppercase", color: "var(--t-text-secondary)" }}>
          Ingredientes
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {missing.length > 0 && (
            <button
              type="button"
              onClick={addAll}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                fontSize: 11, fontWeight: 700, color: "#d4644a",
                background: "none", border: "none", cursor: "pointer", padding: 0,
              }}
            >
              <CartIcon />
              Adicionar faltantes
            </button>
          )}
          <span style={{ fontSize: 12, color: "var(--t-text-muted)", fontWeight: 600 }}>
            {haveCount}/{ingredients.length} disponíveis
          </span>
        </div>
      </div>

      {/* Seletor de porções */}
      {originalServings !== undefined && (
        <div style={{
          display: "flex", alignItems: "center", gap: 10, marginBottom: 14,
          background: "var(--t-bg-section)", borderRadius: 12, padding: "8px 12px",
        }}>
          <span style={{ flex: 1, fontSize: 13, color: "var(--t-text-body)", fontWeight: 600 }}>
            Porções
          </span>
          <button
            type="button"
            onClick={() => setServings(s => Math.max(1, s - 1))}
            disabled={servings <= 1}
            style={{
              width: 28, height: 28, borderRadius: 8, border: "1.5px solid var(--t-bd-strong)",
              background: "var(--t-bg-card)", color: "var(--t-text-title)",
              fontSize: 16, fontWeight: 700, cursor: servings <= 1 ? "default" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              opacity: servings <= 1 ? 0.35 : 1,
            }}
          >−</button>
          <span style={{
            minWidth: 28, textAlign: "center",
            fontSize: 15, fontWeight: 800, color: "var(--t-text-title)",
            fontVariantNumeric: "tabular-nums",
          }}>
            {servings}
          </span>
          <button
            type="button"
            onClick={() => setServings(s => Math.min(20, s + 1))}
            disabled={servings >= 20}
            style={{
              width: 28, height: 28, borderRadius: 8, border: "1.5px solid var(--t-bd-strong)",
              background: "var(--t-bg-card)", color: "var(--t-text-title)",
              fontSize: 16, fontWeight: 700, cursor: servings >= 20 ? "default" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              opacity: servings >= 20 ? 0.35 : 1,
            }}
          >+</button>
        </div>
      )}

      {/* Lista */}
      <div style={{ display: "flex", flexDirection: "column" }}>
        {ingredients.map((ing, i) => {
          const bulletColor = ing.base
            ? "#e8a020"
            : ing.got
              ? "var(--t-text-secondary)"
              : "var(--t-text-hint)";
          const isAdded = added.has(ing.name.toLowerCase());

          return (
            <div
              key={i}
              style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "11px 2px",
                borderBottom: i < ingredients.length - 1 ? "1px solid var(--t-bd-row)" : "none",
              }}
            >
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: bulletColor, flexShrink: 0 }} />
              <span style={{
                flex: 1, fontSize: 14,
                color: ing.got ? "var(--t-text-body)" : "var(--t-text-hint)",
                fontWeight: ing.base ? 700 : ing.core ? 600 : 400,
              }}>
                {ing.base && <span style={{ color: "#e8a020", marginRight: 4 }}>★</span>}
                {ing.name}
              </span>
              {ing.got ? (
                (() => {
                  const displayQty = scaleQty(ing, scale, unitSystem, lang);
                  return displayQty ? (
                    <span style={{ fontSize: 13, color: "var(--t-text-muted)", fontWeight: 600, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
                      {displayQty}
                    </span>
                  ) : null;
                })()
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                  {(() => {
                    const displayQty = scaleQty(ing, scale, unitSystem, lang);
                    return displayQty ? (
                      <span style={{ fontSize: 12, color: "var(--t-text-hint)", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                        {displayQty}
                      </span>
                    ) : null;
                  })()}
                  <button
                    type="button"
                    onClick={() => !isAdded && addOne(ing.name)}
                    title={isAdded ? "Na lista de compras" : "Adicionar à lista de compras"}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "center",
                      width: 28, height: 28, borderRadius: 8,
                      border: `1.5px solid ${isAdded ? "var(--t-success)" : "rgba(212,100,74,.35)"}`,
                      background: isAdded ? "rgba(45,125,78,.08)" : "rgba(212,100,74,.06)",
                      color: isAdded ? "var(--t-success)" : "#d4644a",
                      cursor: isAdded ? "default" : "pointer",
                      transition: "all .18s ease",
                    }}
                  >
                    {isAdded ? <CheckIcon /> : <CartIcon />}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
