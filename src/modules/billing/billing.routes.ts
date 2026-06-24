import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";
import type { FastifyPluginAsync } from "fastify";

import { env } from "@/config/env.js";
import { getUserId, requireAuth } from "@/modules/auth/auth.guard.js";

import { getEntitlement, setPlan } from "./entitlement.repository.js";

const GrantSchema = Type.Object(
  {
    userId: Type.String({ minLength: 1 }),
    plan: Type.Union([Type.Literal("free"), Type.Literal("pro")]),
    // Dias de validade. Ausente = sem expiração (grant permanente de admin).
    days: Type.Optional(Type.Integer({ minimum: 1, maximum: 3660 })),
  },
  { additionalProperties: false },
);

/**
 * Rotas de billing/entitlement.
 *
 * Hoje só o grant de admin — o caminho de operação e de teste enquanto não há
 * pagamento integrado. Quando o Stripe entrar, o webhook chama o mesmo
 * setPlan() com source:"stripe" e currentPeriodEnd vindo da assinatura; o gate
 * de quota não muda em nada.
 */
export const billingRoutes: FastifyPluginAsync = async (app) => {
  const fastify = app.withTypeProvider<TypeBoxTypeProvider>();

  fastify.post(
    "/billing/grant",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["billing"],
        body: GrantSchema,
        response: {
          200: Type.Object({
            ok: Type.Boolean(),
            userId: Type.String(),
            plan: Type.String(),
            isPro: Type.Boolean(),
          }),
        },
      },
    },
    async (request, reply) => {
      const caller = getUserId(request)!;
      if (!env.variants.adminUserIds.includes(caller)) {
        return reply.forbidden("Acesso restrito a administradores");
      }

      const { userId, plan, days } = request.body;
      const currentPeriodEnd =
        days != null ? new Date(Date.now() + days * 86_400_000) : null;

      await setPlan(userId, plan, { source: "admin", currentPeriodEnd });
      const view = await getEntitlement(userId);
      return { ok: true, userId, plan: view.plan, isPro: view.isPro };
    },
  );
};
