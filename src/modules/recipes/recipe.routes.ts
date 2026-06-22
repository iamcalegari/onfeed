import Anthropic from "@anthropic-ai/sdk";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";
import type { FastifyPluginAsync } from "fastify";

import { env } from "@/config/env.js";
import {
  createUploadUrl,
  ensureThumbnail,
} from "@/infra/images/image.service.js";
import { enqueueIngestJob } from "@/infra/queue/ingest-queue.js";
import { getUserId, requireAuth } from "@/modules/auth/auth.guard.js";
import { consumeDailyAdaptQuota } from "@/modules/usage/usage.repository.js";
import { adaptRecipe } from "./recipe.generation.js";
import {
  getRecipeById,
  getVariantCount,
  getVariantsByParentId,
  rejectVariant,
  setThumbnail,
  setTranslation,
} from "./recipe.repository.js";
import { translateRecipeToEnglish } from "./recipe.translation.js";

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
    lang: Type.Optional(Type.Union([Type.Literal("pt"), Type.Literal("en")])),
    username: Type.Optional(Type.String({ maxLength: 100 })),
  },
  { additionalProperties: false },
);

const SubmitRecipeSchema = Type.Object(
  {
    title: Type.String({ minLength: 1, maxLength: 200 }),
    rawIngredients: Type.Array(Type.String({ minLength: 1 }), {
      minItems: 1,
      maxItems: 50,
    }),
    steps: Type.Array(Type.String({ minLength: 1 }), {
      minItems: 1,
      maxItems: 30,
    }),
    servings: Type.Integer({ minimum: 1, maximum: 100 }),
    prepTimeMin: Type.Optional(Type.Integer({ minimum: 1 })),
  },
  { additionalProperties: false },
);

/** Rotas de receita: detalhe + geração híbrida (adaptação). */
export const recipeRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<TypeBoxTypeProvider>();

  // Submissão de receita pelo usuário ou integração externa: enfileira no SQS
  // para processamento assíncrono (extração → canonicalização → embed → save).
  // Retorna 202 imediatamente; a receita aparece no catálogo em ~1-2 minutos.
  app.post(
    "/recipes",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["recipes"],
        body: SubmitRecipeSchema,
        response: {
          202: Type.Object({
            jobId: Type.String(),
            message: Type.String(),
          }),
        },
      },
    },
    async (request, reply) => {
      if (!env.sqs.enabled) {
        return reply.serviceUnavailable(
          "Submissão de receitas não está habilitada no momento.",
        );
      }

      const { title, rawIngredients, steps, servings, prepTimeMin } =
        request.body;

      const jobId = await enqueueIngestJob(
        {
          title,
          rawIngredients,
          steps,
          thumbnailUrl: "",
          servings,
          ...(prepTimeMin !== undefined && { prepTimeMin }),
        },
        { source: "user" },
      );

      return reply.status(202).send({
        jobId,
        message: "Receita recebida e será processada em instantes.",
      });
    },
  );

  app.get(
    "/recipes/:id",
    {
      schema: {
        tags: ["recipes"],
        params: Type.Object({ id: Type.String() }),
        querystring: Type.Object({
          lang: Type.Optional(
            Type.Union([Type.Literal("pt"), Type.Literal("en")]),
          ),
        }),
      },
    },
    async (request, reply) => {
      const recipe = await getRecipeById(request.params.id);
      if (!recipe) return reply.notFound("Receita não encontrada");

      if (request.query.lang !== "en") return recipe;

      // Tradução já existe → aplica overlay e retorna
      if (recipe.introEn) {
        return {
          ...recipe,
          intro: recipe.introEn,
          steps: recipe.steps.map((s) => ({ ...s, text: s.textEn ?? s.text })),
          ingredients: recipe.ingredients.map((i) => ({
            ...i,
            name: i.nameEn ?? i.name,
          })),
        };
      }

      // Tradução ainda não existe: chama Haiku (síncrono) e persiste
      if (!translating.has(recipe._id!)) {
        translating.add(recipe._id!);
        try {
          const { introEn, steps, ingredients } =
            await translateRecipeToEnglish(recipe);
          await setTranslation(recipe._id!, introEn, steps, ingredients);
          return {
            ...recipe,
            intro: introEn,
            steps: steps.map((s) => ({ ...s, text: s.textEn ?? s.text })),
            ingredients: ingredients.map((i) => ({
              ...i,
              name: i.nameEn ?? i.name,
            })),
          };
        } finally {
          translating.delete(recipe._id!);
        }
      }

      // Outra requisição já está traduzindo: devolve pt-BR enquanto isso
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
        const userId = getUserId(request)!;
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
          ...(body.lang !== undefined && { lang: body.lang }),
          creator: { userId, username: body.username ?? userId },
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

  // IDs cuja tradução EN está em andamento — evita chamar Haiku duas vezes se o
  // usuário recarregar antes de terminar.
  const translating = new Set<string>();

  // IDs em geração no momento — evita disparar Bedrock duas vezes para a mesma
  // receita se o usuário recarregar antes de terminar.
  const generating = new Set<string>();

  // POST: dispara geração em background e retorna 202 imediatamente.
  // O front faz polling no GET abaixo até a URL aparecer no DB.
  app.post(
    "/recipes/:id/thumbnail",
    {
      schema: {
        tags: ["recipes"],
        params: Type.Object({ id: Type.String() }),
        response: { 202: Type.Object({ status: Type.String() }) },
      },
    },
    async (request, reply) => {
      const id = request.params.id;
      const recipe = await getRecipeById(id);
      if (!recipe) return reply.notFound("Receita não encontrada");
      if (recipe.thumbnailUrl) return reply.status(202).send({ status: "ready" });
      if (generating.has(id)) return reply.status(202).send({ status: "generating" });

      generating.add(id);
      // fire-and-forget: não bloqueia a resposta
      ensureThumbnail(recipe)
        .then(async (url) => {
          if (url && url !== recipe.thumbnailUrl) await setThumbnail(id, url);
        })
        .catch((err) => {
          app.log.error({ err, recipeId: id }, "thumbnail generation failed");
        })
        .finally(() => generating.delete(id));

      return reply.status(202).send({ status: "generating" });
    },
  );

  // GET: retorna a URL atual do DB (null = ainda gerando ou imagens desabilitadas).
  app.get(
    "/recipes/:id/thumbnail",
    {
      schema: {
        tags: ["recipes"],
        params: Type.Object({ id: Type.String() }),
        response: {
          200: Type.Object({
            thumbnailUrl: Type.Union([Type.String(), Type.Null()]),
            generating: Type.Boolean(),
          }),
        },
      },
    },
    async (request, reply) => {
      const id = request.params.id;
      const recipe = await getRecipeById(id);
      if (!recipe) return reply.notFound("Receita não encontrada");
      return {
        thumbnailUrl: recipe.thumbnailUrl || null,
        generating: generating.has(id),
      };
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
      await setThumbnail(request.params.id, out.publicUrl);
      return out;
    },
  );

  // Variantes de uma receita — lista os filhos diretos (variant ou pending).
  app.get(
    "/recipes/:id/variants",
    {
      schema: {
        tags: ["recipes"],
        params: Type.Object({ id: Type.String() }),
        response: {
          200: Type.Object({
            count: Type.Integer(),
            variants: Type.Array(Type.Any()),
          }),
        },
      },
    },
    async (request, reply) => {
      const recipe = await getRecipeById(request.params.id);
      if (!recipe) return reply.notFound("Receita não encontrada");

      const [variants, count] = await Promise.all([
        getVariantsByParentId(request.params.id),
        getVariantCount(request.params.id),
      ]);

      return { count, variants };
    },
  );

  // Admin: promover generated_pending → variant manualmente (além do auto por likes).
  app.post(
    "/recipes/:id/promote",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["recipes"],
        params: Type.Object({ id: Type.String() }),
        response: { 200: Type.Object({ ok: Type.Boolean() }) },
      },
    },
    async (request, reply) => {
      const userId = getUserId(request)!;
      if (!env.variants.adminUserIds.includes(userId)) {
        return reply.forbidden("Acesso restrito a administradores");
      }

      const recipe = await getRecipeById(request.params.id);
      if (!recipe) return reply.notFound("Receita não encontrada");
      if (recipe.source !== "generated_pending") {
        return reply.badRequest("Receita não está em generated_pending");
      }

      const { promoteToVariant } = await import("./recipe.repository.js");
      await promoteToVariant(request.params.id);
      return { ok: true };
    },
  );

  // Admin: rejeitar uma receita gerada.
  app.post(
    "/recipes/:id/reject",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["recipes"],
        params: Type.Object({ id: Type.String() }),
        response: { 200: Type.Object({ ok: Type.Boolean() }) },
      },
    },
    async (request, reply) => {
      const userId = getUserId(request)!;
      if (!env.variants.adminUserIds.includes(userId)) {
        return reply.forbidden("Acesso restrito a administradores");
      }

      const recipe = await getRecipeById(request.params.id);
      if (!recipe) return reply.notFound("Receita não encontrada");

      await rejectVariant(request.params.id);
      return { ok: true };
    },
  );
};
