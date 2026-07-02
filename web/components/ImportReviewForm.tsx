"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState, useTransition } from "react";

import { confirmImportRecipeAction } from "@/app/actions";
import { GroundingBadge } from "@/components/GroundingBadge";
import type { GroundingLevel, ImportRecipeEditPatch, Recipe } from "@/lib/types";

interface EditableIngredient {
  name: string;
  quantity: string;
  unit: string;
  grounding: GroundingLevel;
}

interface EditableStep {
  text: string;
  grounding: GroundingLevel;
}

const inputClass =
  "w-full rounded-xl border border-areia bg-surface px-4 py-3 text-sm shadow-sm outline-none placeholder:text-carvao/35 focus:border-salvia focus:ring-2 focus:ring-salvia/20 transition-all";

export function ImportReviewForm({
  jobId,
  initialRecipe,
}: {
  jobId: string;
  initialRecipe: Recipe;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Zip do grounding com ingredients/steps UMA ÚNICA VEZ aqui, antes de
  // entrar no estado local — nunca indexar groundingArray[i] dentro de um
  // .map() de render (Pitfall 4 do RESEARCH.md).
  const [title, setTitle] = useState(initialRecipe.title);
  const [intro, setIntro] = useState(initialRecipe.intro);
  const [ingredients, setIngredients] = useState<EditableIngredient[]>(() =>
    initialRecipe.ingredients.map((ing, i) => ({
      name: ing.name,
      quantity: ing.quantity != null ? String(ing.quantity) : "",
      unit: ing.unit ?? "",
      grounding: initialRecipe.grounding?.quantityGrounding[i] ?? "grounded",
    })),
  );
  const [steps, setSteps] = useState<EditableStep[]>(() =>
    initialRecipe.steps.map((step, i) => ({
      text: step.text,
      grounding: initialRecipe.grounding?.stepGrounding[i] ?? "grounded",
    })),
  );

  const titleGrounding: GroundingLevel = initialRecipe.grounding?.titleGrounding ?? "grounded";

  function updateIngredient(index: number, patch: Partial<EditableIngredient>) {
    setIngredients((prev) =>
      prev.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  }

  function updateStep(index: number, text: string) {
    setSteps((prev) => prev.map((row, i) => (i === index ? { ...row, text } : row)));
  }

  function confirm() {
    setError(null);
    const patch: ImportRecipeEditPatch = {
      title,
      intro,
      ingredients: ingredients.map((row) => ({
        name: row.name,
        ...(row.quantity.trim() !== "" && { quantity: Number(row.quantity) }),
        ...(row.unit.trim() !== "" && { unit: row.unit }),
      })),
      steps: steps.map((row) => ({ text: row.text })),
    };
    startTransition(async () => {
      const res = await confirmImportRecipeAction(jobId, patch);
      if (res.ok) {
        router.push(`/recipe/${res.recipeId}`);
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-7">
      <header className="pt-2">
        <h1 className="font-display text-[2rem] font-bold leading-tight text-forest">
          Revisar receita
        </h1>
        <p className="mt-1.5 text-sm text-carvao/55 leading-relaxed">
          Revise a receita antes de salvar. Campos marcados em amarelo foram
          inferidos ou ficaram imprecisos — confira e corrija se precisar.
        </p>
      </header>

      {/* Título */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold uppercase tracking-wide text-carvao/50">
            Título
          </label>
          <GroundingBadge level={titleGrounding} />
        </div>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={inputClass}
        />
      </div>

      {/* Intro / dica */}
      <div className="flex flex-col gap-2">
        <label className="text-xs font-semibold uppercase tracking-wide text-carvao/50">
          Introdução
        </label>
        <textarea
          value={intro}
          onChange={(e) => setIntro(e.target.value)}
          rows={3}
          className={inputClass}
        />
      </div>

      {/* Ingredientes */}
      <div className="flex flex-col gap-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-carvao/50">
          Ingredientes
        </span>
        <div className="flex flex-col gap-3">
          {ingredients.map((row, i) => (
            <div
              key={i}
              className="flex flex-col gap-2 rounded-2xl border border-areia bg-surface p-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-carvao/40">
                  Ingrediente {i + 1}
                </span>
                <GroundingBadge level={row.grounding} />
              </div>
              <input
                type="text"
                value={row.name}
                onChange={(e) => updateIngredient(i, { name: e.target.value })}
                placeholder="Nome"
                className={inputClass}
              />
              <div className="flex gap-2">
                <input
                  type="text"
                  inputMode="decimal"
                  value={row.quantity}
                  onChange={(e) => updateIngredient(i, { quantity: e.target.value })}
                  placeholder="Qtd."
                  className={`${inputClass} w-1/2`}
                />
                <input
                  type="text"
                  value={row.unit}
                  onChange={(e) => updateIngredient(i, { unit: e.target.value })}
                  placeholder="Unidade"
                  className={`${inputClass} w-1/2`}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Passos */}
      <div className="flex flex-col gap-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-carvao/50">
          Modo de preparo
        </span>
        <div className="flex flex-col gap-3">
          {steps.map((row, i) => (
            <div
              key={i}
              className="flex flex-col gap-2 rounded-2xl border border-areia bg-surface p-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-carvao/40">
                  Passo {i + 1}
                </span>
                <GroundingBadge level={row.grounding} />
              </div>
              <textarea
                value={row.text}
                onChange={(e) => updateStep(i, e.target.value)}
                rows={2}
                className={inputClass}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Ações */}
      <div className="flex flex-col gap-3 pb-4">
        {error && <p className="text-sm text-fat">{error}</p>}
        <button
          type="button"
          onClick={pending ? undefined : confirm}
          disabled={pending}
          className="w-full rounded-2xl bg-terracota py-3.5 text-center text-sm font-bold text-creme disabled:opacity-60"
        >
          {pending ? "Confirmando…" : "Confirmar receita"}
        </button>
        <Link
          href="/import/mine"
          className="w-full rounded-2xl border border-areia bg-surface py-3.5 text-center text-sm font-semibold text-carvao/70"
        >
          Cancelar
        </Link>
      </div>
    </div>
  );
}
