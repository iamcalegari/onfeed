import { type NextRequest } from "next/server";

import { generateMealPlan } from "@/lib/api";

/** POST /api/mealplan — proxy server-side: injeta o auth do Clerk e chama o backend. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const plan = await generateMealPlan(body);
    return Response.json(plan);
  } catch (e) {
    return Response.json(
      { error: (e as Error).message || "Falha ao gerar o plano" },
      { status: 400 },
    );
  }
}
