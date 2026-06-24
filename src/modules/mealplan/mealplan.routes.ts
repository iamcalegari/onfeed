import Anthropic from "@anthropic-ai/sdk";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";
import type { FastifyPluginAsync } from "fastify";

import { env } from "@/config/env.js";
import { getUserId, requireAuth } from "@/modules/auth/auth.guard.js";
import { isProUser } from "@/modules/billing/entitlement.repository.js";

import { generateMealPlan } from "./mealplan.generation.js";
import { consumeMonthlyPlanQuota, saveCurrentPlan } from "./mealplan.repository.js";

const SlotEnum = Type.Union([
  Type.Literal("breakfast"),
  Type.Literal("lunch"),
  Type.Literal("snack"),
  Type.Literal("dinner"),
]);

const GeneratePlanSchema = Type.Object(
  {
    days: Type.Integer({ minimum: 1, maximum: 7 }),
    slots: Type.Array(SlotEnum, { minItems: 1, maxItems: 4 }),
    goals: Type.Object({
      calories: Type.Integer({ minimum: 500, maximum: 6000 }),
      protein: Type.Integer({ minimum: 0, maximum: 1000 }),
      carbs: Type.Integer({ minimum: 0, maximum: 2000 }),
      fat: Type.Integer({ minimum: 0, maximum: 1000 }),
    }),
    usePantry: Type.Optional(Type.Boolean()),
    dietaryTags: Type.Optional(Type.Array(Type.String())),
    maxPrepTimeMin: Type.Optional(Type.Integer({ minimum: 1 })),
    note: Type.Optional(Type.String({ maxLength: 200 })),
  },
  { additionalProperties: false },
);

/**
 * CheffIA — gerador de plano alimentar. Feature PRO (a mais cara em IA do app),
 * por isso o gate é duplo: exige PRO e ainda tem teto mensal anti-abuso.
 */
export const mealplanRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<TypeBoxTypeProvider>();

  app.post(
    "/mealplan/generate",
    {
      preHandler: requireAuth,
      schema: { tags: ["mealplan"], body: GeneratePlanSchema },
    },
    async (request, reply) => {
      const userId = getUserId(request)!;

      if (!(await isProUser(userId))) {
        return reply.forbidden(
          "Planos com IA são exclusivos do onFeed Pro.",
        );
      }

      const quota = await consumeMonthlyPlanQuota(
        userId,
        env.anthropic.planMonthlyLimitPro,
      );
      if (!quota.allowed) {
        return reply.tooManyRequests(
          `Limite mensal de planos atingido (${quota.limit}/mês).`,
        );
      }

      try {
        const plan = await generateMealPlan({ userId, ...request.body });
        // Persistência é só para sync multi-device: se falhar, ainda devolvemos
        // o plano gerado em vez de derrubar a request (e perder a chamada de IA).
        try {
          await saveCurrentPlan(userId, plan);
        } catch (saveErr) {
          request.log.error(
            { err: saveErr },
            "Falha ao persistir o plano — seguindo com o retorno",
          );
        }
        return plan;
      } catch (err) {
        if (err instanceof Anthropic.APIError) {
          request.log.error({ err }, "Geração de plano via LLM falhou");
          const semCredito = /credit|billing/i.test(err.message);
          return reply.serviceUnavailable(
            semCredito
              ? "Geração indisponível: a conta da API de IA está sem créditos."
              : "Geração indisponível no momento (falha na API de IA). Tente novamente em instantes.",
          );
        }
        // erro de regra (ex: poucas receitas) → 422 com a mensagem
        if (err instanceof Error && /receitas suficientes/.test(err.message)) {
          return reply.unprocessableEntity(err.message);
        }
        throw err;
      }
    },
  );
};
