import Anthropic from "@anthropic-ai/sdk";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";
import type { FastifyPluginAsync } from "fastify";

import { env } from "@/config/env.js";
import {
  createUploadUrl,
  ensureThumbnail,
} from "@/infra/images/image.service.js";
import { getUserId, requireAuth } from "@/modules/auth/auth.guard.js";
import { consumeDailyAdaptQuota } from "@/modules/usage/usage.repository.js";
import { adaptRecipe } from "./recipe.generation.js";
import { getRecipeById, setThumbnail } from "./recipe.repository.js";

const EquipmentEnum = Type.Union([
  Type.Literal("stovetop"),
  Type.Literal("oven"),
  Type.Literal("microwave"),
  Type.Literal("blender"),
  Type.Literal("none"),
]);

const AdaptRequestSchema = Type.Object(
  {
    haveIds: Type.Array(Type.String()),
    equipment: Type.Optional(Type.Array(EquipmentEnum)),
    maxPrepTimeMin: Type.Optional(Type.Integer({ minimum: 1 })),
    goal: Type.Optional(
      Type.Union([Type.Literal("satiety"), Type.Literal("macros")]),
    ),
    note: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

/** Rotas de receita: detalhe + geração híbrida (adaptação). */
export const recipeRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<TypeBoxTypeProvider>();

  app.get(
    "/recipes/:id",
    {
      schema: {
        tags: ["recipes"],
        params: Type.Object({ id: Type.String() }),
      },
    },
    async (request, reply) => {
      const recipe = await getRecipeById(request.params.id);
      if (!recipe) return reply.notFound("Receita não encontrada");
      return recipe;
    },
  );

  // "Adaptar pro que eu tenho" — gera uma variação ancorada na receita base.
  // Exige login (é a chamada cara de LLM) e tem teto diário por usuário.
  app.post(
    "/recipes/:id/adapt",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["recipes"],
        params: Type.Object({ id: Type.String() }),
        body: AdaptRequestSchema,
      },
    },
    async (request, reply) => {
      const body = request.body;

      const quota = await consumeDailyAdaptQuota(
        getUserId(request)!,
        env.anthropic.adaptDailyLimit,
      );
      if (!quota.allowed) {
        return reply.tooManyRequests(
          `Limite diário de adaptações atingido (${quota.limit}/dia). Tente amanhã.`,
        );
      }

      try {
        const recipe = await adaptRecipe(request.params.id, {
          haveIds: body.haveIds,
          ...(body.equipment !== undefined && {
            availableEquipment: body.equipment,
          }),
          ...(body.maxPrepTimeMin !== undefined && {
            maxPrepTimeMin: body.maxPrepTimeMin,
          }),
          ...(body.goal !== undefined && { goal: body.goal }),
          ...(body.note !== undefined && { note: body.note }),
        });
        if (!recipe) return reply.notFound("Receita base não encontrada");
        return recipe;
      } catch (err) {
        // Falha na API de IA (sem crédito, rate limit, overload) vira um 503
        // claro em vez de 500 cru — o front mostra a mensagem ao usuário.
        if (err instanceof Anthropic.APIError) {
          request.log.error({ err }, "Adaptação via LLM falhou");
          const semCredito = /credit|billing/i.test(err.message);
          return reply.serviceUnavailable(
            semCredito
              ? "Geração indisponível: a conta da API de IA está sem créditos."
              : "Geração indisponível no momento (falha na API de IA). Tente novamente em instantes.",
          );
        }
        throw err;
      }
    },
  );

  // Thumbnail lazy: gera no primeiro acesso (Bedrock→S3) e persiste.
  // Retorna { thumbnailUrl: null } quando imagens estão desabilitadas.
  app.post(
    "/recipes/:id/thumbnail",
    {
      schema: {
        tags: ["recipes"],
        params: Type.Object({ id: Type.String() }),
        response: {
          200: Type.Object({
            thumbnailUrl: Type.Union([Type.String(), Type.Null()]),
          }),
        },
      },
    },
    async (request, reply) => {
      const recipe = await getRecipeById(request.params.id);
      if (!recipe) return reply.notFound("Receita não encontrada");
      const url = await ensureThumbnail(recipe);
      if (url && url !== recipe.thumbnailUrl) {
        await setThumbnail(request.params.id, url);
      }
      return { thumbnailUrl: url };
    },
  );

  // URL pré-assinada p/ upload do usuário (user-generated). 503 se desabilitado.
  app.post(
    "/recipes/:id/upload-url",
    {
      schema: {
        tags: ["recipes"],
        params: Type.Object({ id: Type.String() }),
        body: Type.Object({
          contentType: Type.Union([
            Type.Literal("image/png"),
            Type.Literal("image/jpeg"),
          ]),
        }),
      },
    },
    async (request, reply) => {
      const out = await createUploadUrl(
        request.params.id,
        request.body.contentType,
      );
      if (!out) return reply.serviceUnavailable("Imagens desabilitadas");
      // set otimista: a URL passa a valer assim que o upload concluir
      await setThumbnail(request.params.id, out.publicUrl);
      return out;
    },
  );
};
