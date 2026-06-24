import type { FastifyPluginAsync } from "fastify";

import { env } from "@/config/env.js";
import { getEntitlement } from "@/modules/billing/entitlement.repository.js";
import { getDailyAdaptCount } from "@/modules/usage/usage.repository.js";

import { getUserId } from "./auth.guard.js";

/**
 * Rotas de sessão. /me confirma quem está logado e devolve o entitlement + uso
 * do dia — é a fonte de verdade que o front usa para refletir PRO/quotas (o
 * localStorage do front é só projeção, não pode ser a autoridade).
 */
export const authRoutes: FastifyPluginAsync = async (app) => {
  app.get("/me", async (request) => {
    const userId = getUserId(request);
    if (!userId) {
      return { userId: null, authenticated: false, plan: "free", isPro: false };
    }

    const [ent, adaptUsed] = await Promise.all([
      getEntitlement(userId),
      getDailyAdaptCount(userId),
    ]);
    const adaptDaily = ent.isPro
      ? env.anthropic.adaptDailyLimitPro
      : env.anthropic.adaptDailyLimitFree;

    return {
      userId,
      authenticated: true,
      plan: ent.plan,
      isPro: ent.isPro,
      currentPeriodEnd: ent.currentPeriodEnd,
      limits: { adaptDaily },
      usage: { adaptUsed, adaptLeft: Math.max(0, adaptDaily - adaptUsed) },
    };
  });
};
