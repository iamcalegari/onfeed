import type { FastifyPluginAsync } from "fastify";

import { getUserId } from "./auth.guard.js";

/** Rotas de sessão. /me confirma quem está logado (útil pro front). */
export const authRoutes: FastifyPluginAsync = async (app) => {
  app.get("/me", async (request) => {
    const userId = getUserId(request);
    return { userId, authenticated: userId !== null };
  });
};
