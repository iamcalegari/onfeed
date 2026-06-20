"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import type { Recipe, RecipeIngredient } from "@/lib/types";

/* ── Helpers ─────────────────────────────────────────────────── */

function getStepIngredients(text: string, ingredients: RecipeIngredient[]): RecipeIngredient[] {
  const lower = text.toLowerCase();
  return ingredients.filter((ing) => {
    if (lower.includes(ing.name.toLowerCase())) return true;
    // fallback: palavras com mais de 4 letras do texto bruto
    return ing.raw
      .toLowerCase()
      .split(/[\s,.()+]+/)
      .filter((w) => w.length > 4)
      .some((w) => lower.includes(w));
  });
}

function playAlarm(ctx: AudioContext) {
  [0, 0.5, 1.0].forEach((offset) => {
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    osc.type = "sine";
    const t = ctx.currentTime + offset;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.7, t + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    osc.start(t);
    osc.stop(t + 0.45);
  });
}

function fmt(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/* ── Componente principal ────────────────────────────────────── */

export function CookMode({ recipe }: { recipe: Recipe }) {
  const router = useRouter();

  const [stepIdx,       setStepIdx]       = useState(0);
  const [timerLeft,     setTimerLeft]     = useState(0);
  const [timerRunning,  setTimerRunning]  = useState(false);
  const [timerDone,     setTimerDone]     = useState(false);
  const [showIngr,      setShowIngr]      = useState(false);
  const [done,          setDone]          = useState(false);

  const intervalRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioCtxRef  = useRef<AudioContext | null>(null);

  const step         = recipe.steps[stepIdx]!;
  const totalSeconds = Math.round((step.minutes ?? 0) * 60);
  const hasTimer     = totalSeconds > 0;
  const isLastStep   = stepIdx === recipe.steps.length - 1;
  const stepIngr     = getStepIngredients(step.text, recipe.ingredients);
  const progress     = (stepIdx / recipe.steps.length) * 100;

  // Desbloqueia AudioContext em qualquer gesto do usuário
  function touchAudio() {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioContext();
      } else if (audioCtxRef.current.state === "suspended") {
        audioCtxRef.current.resume();
      }
    } catch { /* não suportado */ }
  }

  // Reseta timer ao trocar de step
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setTimerLeft(totalSeconds);
    setTimerDone(false);
    setTimerRunning(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIdx]);

  // Tick do timer
  useEffect(() => {
    if (!timerRunning) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    intervalRef.current = setInterval(() => {
      setTimerLeft((prev) => {
        if (prev <= 1) {
          setTimerRunning(false);
          setTimerDone(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [timerRunning]);

  // Som + vibração ao fim do timer
  useEffect(() => {
    if (!timerDone) return;
    navigator.vibrate?.([400, 150, 400, 150, 600]);
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume().then(() => playAlarm(ctx));
    else playAlarm(ctx);
  }, [timerDone]);

  function goNext() {
    touchAudio();
    if (isLastStep) { setDone(true); return; }
    setStepIdx((i) => i + 1);
  }

  function goPrev() {
    touchAudio();
    if (stepIdx > 0) setStepIdx((i) => i - 1);
  }

  // ── Tela de conclusão ──────────────────────────────────────
  if (done) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-creme px-8 text-center">
        <span className="text-6xl">🎉</span>
        <h1 className="font-display text-2xl font-bold text-forest">
          Receita concluída!
        </h1>
        <p className="text-sm text-carvao/60">
          Bom apetite. Esperamos que tenha ficado uma delícia.
        </p>
        <button
          type="button"
          onClick={() => router.back()}
          className="mt-2 rounded-2xl bg-forest px-8 py-3.5 text-sm font-bold text-creme hover:bg-forest/90 transition-colors"
        >
          Voltar à receita
        </button>
      </div>
    );
  }

  // ── Modo cozinha ───────────────────────────────────────────
  return (
    <div className="flex min-h-dvh flex-col bg-creme">

      {/* Barra de progresso */}
      <div className="fixed inset-x-0 top-0 z-20 h-0.5 bg-areia/50">
        <div
          className="h-full bg-terracota transition-all duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Header */}
      <header
        className="flex shrink-0 items-center gap-3 px-5 pb-3"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 1.25rem)" }}
      >
        <button
          type="button"
          onClick={() => router.back()}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-areia/50 text-carvao/70 transition-colors hover:bg-areia active:scale-90"
        >
          <BackIcon />
        </button>
        <p className="flex-1 truncate text-center text-xs font-semibold uppercase tracking-wider text-carvao/40">
          {recipe.title}
        </p>
        {/* Contador de passos */}
        <span className="shrink-0 rounded-full bg-areia/50 px-2.5 py-1 text-[10px] font-bold text-carvao/50">
          {stepIdx + 1}/{recipe.steps.length}
        </span>
      </header>

      {/* Conteúdo principal */}
      <main className="flex flex-1 flex-col items-center justify-center gap-8 overflow-y-auto px-6 py-6">

        {/* Texto do passo */}
        <p className="text-center text-xl font-medium leading-relaxed text-carvao">
          {step.text}
        </p>

        {/* Ingredientes deste passo */}
        {stepIngr.length > 0 && (
          <div className="flex w-full flex-col items-center gap-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-carvao/30">
              ingredientes neste passo
            </p>
            <div className="flex flex-wrap justify-center gap-1.5">
              {stepIngr.map((ing) => (
                <span
                  key={ing.canonicalId}
                  className="rounded-full bg-forest/10 px-3 py-1 text-xs font-semibold text-forest"
                >
                  {ing.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Timer */}
        {hasTimer && (
          <div className="flex flex-col items-center gap-4">
            {/* Display */}
            <div
              className={[
                "flex min-w-[10rem] flex-col items-center rounded-3xl px-10 py-6 transition-all duration-300",
                timerDone
                  ? "bg-terracota/12 ring-2 ring-terracota/40"
                  : "bg-surface shadow-card ring-1 ring-areia/60",
              ].join(" ")}
            >
              {timerDone ? (
                <>
                  <span className="font-display text-4xl font-bold text-terracota">✓</span>
                  <p className="mt-1 text-sm font-semibold text-terracota">Pronto!</p>
                </>
              ) : (
                <span className="font-mono text-5xl font-bold tabular-nums text-carvao">
                  {fmt(timerLeft)}
                </span>
              )}
            </div>

            {/* Controles */}
            {timerDone ? (
              <button
                type="button"
                onClick={() => {
                  setTimerLeft(totalSeconds);
                  setTimerDone(false);
                  setTimerRunning(false);
                }}
                className="text-xs text-carvao/35 underline underline-offset-2 transition-colors hover:text-carvao/60"
              >
                ↺ reiniciar timer
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  touchAudio();
                  setTimerRunning((r) => !r);
                }}
                className={[
                  "flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-semibold transition-all active:scale-95",
                  timerRunning
                    ? "bg-areia/70 text-carvao/70"
                    : "bg-forest text-creme shadow-sm",
                ].join(" ")}
              >
                {timerRunning ? <PauseIcon /> : <PlayIcon />}
                {timerRunning ? "Pausar" : "Iniciar"}
              </button>
            )}
          </div>
        )}
      </main>

      {/* Rodapé fixo */}
      <footer
        className="flex shrink-0 flex-col gap-2.5 border-t border-areia/50 bg-creme/95 px-5 pt-3 backdrop-blur-sm"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}
      >
        {/* Ver ingredientes */}
        <button
          type="button"
          onClick={() => setShowIngr(true)}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-areia bg-surface py-3 text-sm font-medium text-carvao/60 transition-colors hover:bg-areia/20 active:scale-[0.98]"
        >
          <LeafIcon />
          Ver ingredientes
        </button>

        {/* Navegação secundária: Voltar / Pular */}
        <div className="flex items-center justify-between">
          {stepIdx > 0 ? (
            <button
              type="button"
              onClick={goPrev}
              className="flex items-center gap-1 text-xs font-semibold text-carvao/40 transition-colors hover:text-carvao/70 active:scale-90"
            >
              <BackIcon />
              Voltar
            </button>
          ) : (
            <span />
          )}
          {!isLastStep && (
            <button
              type="button"
              onClick={goNext}
              className="flex items-center gap-1 text-xs font-semibold text-carvao/40 transition-colors hover:text-carvao/70 active:scale-90"
            >
              Pular
              <ForwardIcon />
            </button>
          )}
        </div>

        {/* CTA principal */}
        <button
          type="button"
          onClick={goNext}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-forest py-3.5 text-sm font-bold text-creme transition-all hover:bg-forest/90 active:scale-[0.98]"
        >
          {isLastStep ? "🎉 Concluído!" : (
            <>
              Próximo passo
              <ForwardIcon />
            </>
          )}
        </button>
      </footer>

      {/* Bottom sheet de ingredientes */}
      {showIngr && (
        <IngredientsSheet
          recipe={recipe}
          stepIngr={stepIngr}
          onClose={() => setShowIngr(false)}
        />
      )}
    </div>
  );
}

/* ── Bottom sheet ────────────────────────────────────────────── */

function IngredientsSheet({
  recipe,
  stepIngr,
  onClose,
}: {
  recipe: Recipe;
  stepIngr: RecipeIngredient[];
  onClose: () => void;
}) {
  const stepIds = new Set(stepIngr.map((i) => i.canonicalId));

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-carvao/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="fixed inset-x-0 bottom-0 z-50 flex max-h-[75dvh] flex-col rounded-t-3xl bg-surface shadow-lift animate-in slide-in-from-bottom duration-300">
        <div className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-areia" />

        <div className="overflow-y-auto px-5 pt-4 pb-safe">
          <h2 className="mb-4 font-display text-lg font-bold text-forest">
            Ingredientes
          </h2>

          {/* Ingredientes do passo atual em destaque */}
          {stepIngr.length > 0 && (
            <div className="mb-4 rounded-2xl bg-forest/6 p-3">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-forest/60">
                neste passo
              </p>
              <div className="flex flex-col gap-1">
                {stepIngr.map((ing) => (
                  <div key={ing.canonicalId} className="flex items-center gap-2 py-0.5">
                    <span className="text-forest/60 text-xs">●</span>
                    <span className="text-sm font-semibold text-forest">{ing.raw}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Lista completa */}
          <ul className="flex flex-col divide-y divide-areia/40 pb-6">
            {recipe.ingredients.map((ing, i) => {
              const active = stepIds.has(ing.canonicalId);
              return (
                <li
                  key={i}
                  className={`flex items-center gap-3 py-2.5 first:pt-0 ${active ? "opacity-40" : ""}`}
                >
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                      ing.core ? "bg-forest/10 text-forest" : "bg-areia/60 text-carvao/40"
                    }`}
                  >
                    {ing.core ? "✓" : "·"}
                  </span>
                  <span className={`flex-1 text-sm ${ing.core ? "font-semibold text-carvao" : "text-carvao/70"}`}>
                    {ing.raw}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </>
  );
}

/* ── Ícones ──────────────────────────────────────────────────── */

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

function ForwardIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5">
      <path d="M5 3l14 9-14 9V3z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5">
      <rect x="6" y="4" width="4" height="16" rx="1" />
      <rect x="14" y="4" width="4" height="16" rx="1" />
    </svg>
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
