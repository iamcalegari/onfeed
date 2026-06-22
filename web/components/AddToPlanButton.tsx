"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import {
  addMealToPlan,
  clearPendingSlot,
  getPendingSlot,
} from "@/lib/planStorage";
import type { Nutrition } from "@/lib/types";

interface Props {
  recipeId:    string;
  title:       string;
  nutrition:   Nutrition;
  prepTime?:   number;
  ingredients: string[]; // nomes dos ingredientes
}

export function AddToPlanButton({ recipeId, title, nutrition, prepTime, ingredients }: Props) {
  const router = useRouter();
  const [pending, setPending]   = useState<{ slot: string; date: string } | null>(null);
  const [done, setDone]         = useState(false);

  useEffect(() => {
    setPending(getPendingSlot());
  }, []);

  if (!pending) return null;

  function handleAdd() {
    if (!pending) return;
    addMealToPlan(pending.date, {
      slot:        pending.slot,
      recipeId,
      name:        title,
      kcal:        Math.round(nutrition.calories),
      protein:     Math.round(nutrition.protein),
      carbs:       Math.round(nutrition.carbs),
      fat:         Math.round(nutrition.fat),
      prepTime,
      ingredients,
    });
    clearPendingSlot();
    setDone(true);
    setTimeout(() => router.push("/plano"), 800);
  }

  return (
    <div style={{ marginTop: 12 }}>
      <button
        type="button"
        onClick={handleAdd}
        disabled={done}
        style={{
          width: "100%", background: done ? "#2d7d4e" : "#162f25",
          color: "#faf4e8", borderRadius: 18, padding: "17px 16px",
          textAlign: "center", fontSize: 15, fontWeight: 700,
          cursor: done ? "default" : "pointer", border: "none",
          boxShadow: "0 10px 24px -10px rgba(22,47,37,.5)",
          transition: "background .2s ease",
        }}
      >
        {done ? "✓ Adicionado ao plano!" : `Adicionar ao plano · ${pending.slot}`}
      </button>
    </div>
  );
}
