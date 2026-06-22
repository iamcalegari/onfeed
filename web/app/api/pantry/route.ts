import { auth } from "@clerk/nextjs/server";

import { getPantry } from "@/lib/api";

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) return Response.json({ items: [] });
    const items = await getPantry();
    return Response.json({ items: items.map(i => i.displayName.toLowerCase()) });
  } catch {
    return Response.json({ items: [] });
  }
}
