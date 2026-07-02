import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { type Static, Type } from "@sinclair/typebox";
import type { FastifyPluginAsync } from "fastify";

import { getUserId, requireAuth } from "@/modules/auth/auth.guard.js";
import { createImportJob, getImportJob } from "./import-job.repository.js";
import {
  confirmImportedRecipe,
  detectPlatform,
  enqueueImportJob,
  listMyImportedRecipes,
  normalizeUrl,
} from "./import.service.js";

/**
 * Corpo do PATCH de confirmação — SOMENTE campos de conteúdo editáveis
 * (title/intro/ingredients[].{name,quantity,unit}/steps[].text).
 * `additionalProperties: false` rejeita explicitamente grounding/
 * reviewRequired/confidenceScore/canonicalId/recipeId enviados pelo client
 * (Pitfall 5, T-03-02) — o servidor é o único a setar reviewRequired/
 * confirmedAt (REV-04); grounding é proveniência imutável da extração.
 */
export const ImportRecipeEditSchema = Type.Object(
  {
    title: Type.String({ minLength: 1, maxLength: 200 }),
    intro: Type.String({ maxLength: 2000 }),
    ingredients: Type.Array(
      Type.Object(
        {
          name: Type.String({ minLength: 1 }),
          quantity: Type.Optional(Type.Number()),
          unit: Type.Optional(Type.String()),
        },
        { additionalProperties: false },
      ),
      { minItems: 1 },
    ),
    steps: Type.Array(
      Type.Object(
        { text: Type.String({ minLength: 1 }) },
        { additionalProperties: false },
      ),
      { minItems: 1 },
    ),
  },
  { additionalProperties: false },
);

export type ImportRecipeEditPatch = Static<typeof ImportRecipeEditSchema>;

/**
 * Distingue "não é uma URL válida" de "é uma URL válida mas de uma
 * plataforma não suportada" quando determinável, para a mensagem de erro
 * de POST /import ser específica (CAP-02) em vez de genérica.
 */
function classifyRejectionReason(url: string): "invalid_url" | "unsupported_platform" {
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) return "invalid_url";
    return "unsupported_platform";
  } catch {
    return "invalid_url";
  }
}

/** Import de vídeo (Instagram/TikTok/YouTube) → ImportJob (todas as rotas exigem login). */
export const importRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<TypeBoxTypeProvider>();

  app.post(
    "/import",
    {
      preHandler: requireAuth,
      schema: { body: Type.Object({ url: Type.String() }) },
    },
    async (request, reply) => {
      const userId = getUserId(request)!;
      const { url } = request.body;

      // Fronteira de segurança SSRF (CAP-02, T-04-01): detectPlatform rejeita
      // ANTES de o job ser criado ou de a URL alcançar o yt-dlp — allowlist
      // estrita de domínio, não uma checagem de "parece uma URL".
      const platform = detectPlatform(url);
      if (!platform) {
        return reply.code(400).send({ error: classifyRejectionReason(url) });
      }

      const normalizedUrl = normalizeUrl(url);
      const job = await createImportJob(userId, url, normalizedUrl, platform);
      await enqueueImportJob(job._id!);

      return reply.code(202).send({ jobId: job._id });
    },
  );

  app.get(
    "/import/:jobId",
    {
      preHandler: requireAuth,
      schema: { params: Type.Object({ jobId: Type.String() }) },
    },
    async (request, reply) => {
      const userId = getUserId(request)!;

      // Ownership escopado na própria query Mongo (getImportJob(jobId, userId))
      // em vez de buscar-e-comparar — um não-dono recebe o mesmo notFound de
      // "não existe", sem vazar a existência do job de outro usuário (IDOR,
      // T-04-02).
      const job = await getImportJob(request.params.jobId, userId);
      if (!job) return reply.notFound();

      return job;
    },
  );

  // Confirmação explícita do usuário (REV-04): flip reviewRequired:false +
  // confirmedAt + aplica as edições de conteúdo. O id da receita a editar
  // vem SEMPRE de job.recipeId (derivado do job owner-scoped) — nunca do
  // corpo da request (T-03-01, IDOR-safe como GET /import/:jobId).
  app.patch(
    "/import/:jobId/recipe",
    {
      preHandler: requireAuth,
      schema: {
        params: Type.Object({ jobId: Type.String() }),
        body: ImportRecipeEditSchema,
      },
    },
    async (request, reply) => {
      const userId = getUserId(request)!;

      const job = await getImportJob(request.params.jobId, userId);
      if (!job) return reply.notFound();

      // Pitfall 3: PATCH só é aceito com o job no terminal pré-confirmação
      // ready_for_review — qualquer outro status (queued/downloading/
      // transcribing/extracting/failed) é rejeitado com 409, sem escrita.
      if (job.status !== "ready_for_review") {
        return reply.code(409).send({ error: "job_not_ready_for_review" });
      }
      if (!job.recipeId) return reply.internalServerError();

      const result = await confirmImportedRecipe(job.recipeId, userId, request.body);
      if (result.alreadyConfirmed) {
        // Idempotente: segunda confirmação da mesma receita já confirmada —
        // 409 em vez de reaplicar silenciosamente um novo conjunto de edições
        // (Pitfall 3).
        return reply.code(409).send({ error: "already_confirmed" });
      }

      return reply.send({ recipeId: job.recipeId });
    },
  );

  // "Minhas importações" (D-09): SEMPRE via listMyImportedRecipes(userId) —
  // nunca uma chamada direta a hybridSearch com sources:['imported'], que
  // poderia esquecer ownerId e vazar imports privados de outro usuário
  // (D-14, Anti-pattern).
  app.get(
    "/import/mine",
    { preHandler: requireAuth },
    async (request) => listMyImportedRecipes(getUserId(request)!),
  );
};
