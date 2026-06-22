"use client";

import { useEffect, useState } from "react";

import type { Nutrition } from "@/lib/types";
import { getGoals, planFitStatus } from "@/lib/nutritionPlan";

export function NutritionBadge({ nutrition }: { nutrition: Nutrition }) {
  const [status, setStatus] = useState<"fits" | "tight" | "over" | null>(null);

  useEffect(() => {
    setStatus(planFitStatus(nutrition, getGoals()));
  }, [nutrition]);

  if (status === "fits") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-forest/8 px-2 py-0.5 text-[10px] font-semibold text-forest">
        ✓ Cabe no plano
      </span>
    );
  }
  if (status === "tight") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
        ⚠ Cabe por pouco
      </span>
    );
  }
  return null;
}
