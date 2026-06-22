"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { getWeekIngredients } from "@/lib/planStorage";

const STORES = [
  { name: "Rappi",          tag: "R",  bg: "#fa4a5b" },
  { name: "iFood Market",   tag: "iF", bg: "#ea1d2c" },
  { name: "Pão de Açúcar",  tag: "PA", bg: "#e30613" },
];

interface Item {
  name:    string;
  checked: boolean;
}

export default function ComprasPage() {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const ingredients = getWeekIngredients();
    if (ingredients.length === 0) {
      setItems([]);
    } else {
      // deduplica case-insensitive
      const seen = new Set<string>();
      const unique: string[] = [];
      for (const ing of ingredients) {
        const key = ing.toLowerCase().trim();
        if (!seen.has(key)) { seen.add(key); unique.push(ing); }
      }
      setItems(unique.map(name => ({ name, checked: false })));
    }
    setMounted(true);
  }, []);

  function toggle(i: number) {
    setItems(prev => prev.map((item, idx) => idx === i ? { ...item, checked: !item.checked } : item));
  }

  const pendingCount = items.filter(i => !i.checked).length;

  return (
    <div className="flex flex-col gap-0 pb-4">

      {/* ── Header ─────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
        <button
          type="button"
          onClick={() => router.back()}
          style={{
            width: 36, height: 36, borderRadius: "50%",
            background: "#fff", border: "1px solid #ecdcc4",
            display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0,
          }}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#162f25" strokeWidth="2.4">
            <path d="m15 5-7 7 7 7" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, color: "#162f25" }}>
          Lista da semana
        </h1>
      </div>

      {mounted && items.length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "48px 0", textAlign: "center" }}>
          <span style={{ fontSize: 48 }}>🛒</span>
          <p style={{ fontSize: 14, color: "#7a9e94", fontWeight: 600 }}>
            Nenhuma receita no plano ainda.
          </p>
          <button
            type="button"
            onClick={() => router.push("/plano")}
            style={{
              background: "#162f25", color: "#faf4e8", borderRadius: 14,
              padding: "12px 20px", fontSize: 14, fontWeight: 700,
              border: "none", cursor: "pointer",
            }}
          >
            Montar o plano →
          </button>
        </div>
      ) : (
        <>
          {mounted && pendingCount > 0 && (
            <p style={{ fontSize: 13, color: "#7a9e94", fontWeight: 600, marginBottom: 14, marginTop: -8 }}>
              {pendingCount} {pendingCount === 1 ? "item faltando" : "itens faltando"}
            </p>
          )}

          {/* ── Itens ─────────────────────────────────────────── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {items.map((item, i) => (
              <button
                key={item.name}
                type="button"
                onClick={() => toggle(i)}
                style={{
                  display: "flex", alignItems: "center", gap: 13,
                  background: "#fff", border: "1px solid #f2e6d6",
                  borderRadius: 14, padding: "14px 16px", cursor: "pointer", textAlign: "left",
                }}
              >
                <span style={{
                  width: 22, height: 22, borderRadius: 7,
                  border: `2px solid ${item.checked ? "#2d7d4e" : "#cbd3c8"}`,
                  background: item.checked ? "#2d7d4e" : "#fff",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0, fontSize: 12, color: "#fff", fontWeight: 700,
                }}>
                  {item.checked ? "✓" : ""}
                </span>
                <span style={{
                  flex: 1, fontSize: 14.5, fontWeight: 600,
                  color: item.checked ? "#9aa39b" : "#232320",
                  textDecoration: item.checked ? "line-through" : "none",
                  textTransform: "capitalize",
                }}>
                  {item.name}
                </span>
              </button>
            ))}
          </div>

          {/* ── Pedir agora ───────────────────────────────────── */}
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.1, textTransform: "uppercase", color: "#7a9e94", marginTop: 24, marginBottom: 12 }}>
            Pedir agora
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {STORES.map(s => (
              <div
                key={s.name}
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  background: "#fff", border: "1px solid #f2e6d6",
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
                <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: "#232320" }}>{s.name}</span>
                <span style={{ fontSize: 13, color: "#d4644a", fontWeight: 700 }}>Abrir →</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
