import { getAuth } from "@clerk/fastify";
import type { FastifyReply, FastifyRequest } from "fastify";

/** userId do Clerk (ou null se anônimo / Clerk desabilitado). */
export function getUserId(req: FastifyRequest): string | null {
  try {
    return getAuth(req).userId ?? null;
  } catch {
    // clerkPlugin não registrado (Clerk desabilitado) → anônimo
    return null;
  }
}

/** preHandler que exige login; responde 401 se não autenticado. */
export async function requireAuth(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (!getUserId(req)) {
    return reply.unauthorized("Autenticação necessária");
  }
}
