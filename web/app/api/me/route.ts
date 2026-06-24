import { getMe } from "@/lib/api";

/** Proxy server-side: expõe o entitlement do backend ao front client (usePro). */
export async function GET() {
  try {
    const me = await getMe();
    return Response.json(me);
  } catch {
    return Response.json({
      userId: null,
      authenticated: false,
      plan: "free",
      isPro: false,
    });
  }
}
