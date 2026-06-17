"use client";

import { useEffect, useRef, useState } from "react";

/** Countdown utilitário por passo (o "CD utilitário" do esboço). */
export function StepTimer({ minutes }: { minutes: number }) {
  const total = Math.round(minutes * 60);
  const [left, setLeft] = useState(total);
  const [running, setRunning] = useState(false);
  const ref = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!running) return;
    ref.current = setInterval(() => {
      setLeft((s) => {
        if (s <= 1) {
          setRunning(false);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => {
      if (ref.current) clearInterval(ref.current);
    };
  }, [running]);

  const mm = String(Math.floor(left / 60)).padStart(2, "0");
  const ss = String(left % 60).padStart(2, "0");
  const done = left === 0;

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => {
          if (done) {
            setLeft(total);
            setRunning(true);
          } else {
            setRunning((r) => !r);
          }
        }}
        className={`rounded-full px-3 py-1 text-xs font-medium ${
          done
            ? "bg-stone-200 text-stone-600"
            : running
              ? "bg-amber-500 text-white"
              : "bg-emerald-600 text-white"
        }`}
      >
        {done ? "↻ reiniciar" : running ? "⏸ pausar" : "▶ iniciar"}
      </button>
      <span
        className={`font-mono text-xs tabular-nums ${
          done ? "text-emerald-700" : "text-stone-500"
        }`}
      >
        {done ? "pronto!" : `${mm}:${ss}`}
      </span>
    </div>
  );
}
