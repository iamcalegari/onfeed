"use client";

import { useState } from "react";

import { addToShoppingList, getDirectShoppingList } from "@/lib/planStorage";
import { showToast } from "@/lib/toast";

export interface IngredientRow {
  name: string;
  got:  boolean;
  base: boolean;
  core: boolean;
  qty:  string;
}

interface Props {
  ingredients:  IngredientRow[];
  haveCount:    number;
  recipeId:     string;
  recipeTitle:  string;
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

export default function IngredientsSection({ ingredients, haveCount, recipeId, recipeTitle }: Props) {
  const missing = ingredients.filter(i => !i.got);
  const recipe  = { id: recipeId, title: recipeTitle };

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
                ing.qty ? (
                  <span style={{ fontSize: 13, color: "var(--t-text-muted)", fontWeight: 600, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
                    {ing.qty}
                  </span>
                ) : null
              ) : (
                <button
                  type="button"
                  onClick={() => !isAdded && addOne(ing.name)}
                  title={isAdded ? "Na lista de compras" : "Adicionar à lista de compras"}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center",
                    width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                    border: `1.5px solid ${isAdded ? "var(--t-success)" : "rgba(212,100,74,.35)"}`,
                    background: isAdded ? "rgba(45,125,78,.08)" : "rgba(212,100,74,.06)",
                    color: isAdded ? "var(--t-success)" : "#d4644a",
                    cursor: isAdded ? "default" : "pointer",
                    transition: "all .18s ease",
                  }}
                >
                  {isAdded ? <CheckIcon /> : <CartIcon />}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
