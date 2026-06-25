import { type NextRequest } from "next/server";

import { subscribePro } from "@/lib/api";

/** POST /api/billing/subscribe — proxy: injeta auth e cria o checkout do MP. */
export async function POST(req: NextRequest) {
  try {
    const { email } = (await req.json()) as { email?: string };
    if (!email) {
      return Response.json({ error: "email obrigatório" }, { status: 400 });
    }
    const out = await subscribePro(email);
    return Response.json(out);
  } catch (e) {
    return Response.json(
      { error: (e as Error).message || "Falha ao assinar" },
      { status: 400 },
    );
  }
}
