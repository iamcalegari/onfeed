import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";
import type { FastifyPluginAsync } from "fastify";

import { env } from "@/config/env.js";
import { getUserId, requireAuth } from "@/modules/auth/auth.guard.js";

import { getEntitlement, setPlan } from "./entitlement.repository.js";
import {
  createPreapproval,
  getPreapproval,
  verifyWebhookSignature,
} from "./mercadopago.js";

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
 * - /billing/grant    grant manual de admin (operação/teste).
 * - /billing/subscribe cria a assinatura PRO no Mercado Pago (devolve checkout).
 * - /billing/webhook   o MP notifica mudanças; aqui chamamos setPlan().
 * O gate (isProUser) e o /me refletem automaticamente — nada mais muda.
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

  // Cria a assinatura PRO no Mercado Pago e devolve o checkout (init_point).
  fastify.post(
    "/billing/subscribe",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["billing"],
        body: Type.Object(
          { email: Type.String({ minLength: 3, maxLength: 254 }) },
          { additionalProperties: false },
        ),
        response: { 200: Type.Object({ initPoint: Type.String() }) },
      },
    },
    async (request, reply) => {
      if (!env.mp.enabled) {
        return reply.serviceUnavailable("Pagamentos não configurados.");
      }
      const userId = getUserId(request)!;
      try {
        const pre = await createPreapproval({
          userId,
          payerEmail: request.body.email,
          reason: "onFeed Pro",
          amount: env.mp.proPrice,
          backUrl: `${env.app.url}/perfil?assinatura=ok`,
        });
        return { initPoint: pre.init_point };
      } catch (err) {
        request.log.error({ err }, "Falha ao criar assinatura no Mercado Pago");
        return reply.serviceUnavailable("Não foi possível iniciar a assinatura.");
      }
    },
  );

  // Webhook do Mercado Pago: notifica criação/alteração da assinatura. Sem auth
  // (é o MP que chama) — a autenticidade vem da validação do x-signature.
  fastify.post("/billing/webhook", async (request, reply) => {
    const headers = request.headers;
    const query = request.query as Record<string, string | undefined>;
    const body = (request.body ?? {}) as {
      type?: string;
      data?: { id?: string };
    };
    const dataId = query["data.id"] ?? body.data?.id;

    const valid = verifyWebhookSignature({
      signatureHeader: headers["x-signature"] as string | undefined,
      requestId: headers["x-request-id"] as string | undefined,
      dataId,
    });
    if (!valid) return reply.code(401).send({ error: "assinatura inválida" });

    const type = query["type"] ?? body.type;
    if (type === "subscription_preapproval" && dataId) {
      try {
        const pre = await getPreapproval(dataId);
        const userId = pre.external_reference;
        if (userId) {
          if (pre.status === "authorized") {
            // Sem expiração por data: enquanto a assinatura estiver "authorized"
            // o acesso vale. O MP dispara este webhook em paused/cancelled, e aí
            // rebaixamos. (Evita o bug de expirar no next_payment_date sem tratar
            // cada cobrança recorrente.)
            await setPlan(userId, "pro", { source: "mercadopago" });
          } else if (pre.status === "cancelled" || pre.status === "paused") {
            await setPlan(userId, "free", { source: "mercadopago" });
          }
        }
      } catch (err) {
        // Responde 200 mesmo assim para o MP não re-tentar em loop; o próximo
        // evento (ou um reconcile) corrige o estado.
        request.log.error({ err }, "Falha ao processar webhook do MP");
      }
    }
    return reply.code(200).send({ received: true });
  });
};
