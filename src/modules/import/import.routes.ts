import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";
import type { FastifyPluginAsync } from "fastify";

import { getUserId, requireAuth } from "@/modules/auth/auth.guard.js";
import { createImportJob, getImportJob } from "./import-job.repository.js";
import { detectPlatform, enqueueImportJob, normalizeUrl } from "./import.service.js";

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
};
