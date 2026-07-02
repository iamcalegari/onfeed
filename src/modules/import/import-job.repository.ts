import { ObjectId } from "mongodb";

import { ImportJobModel } from "./import-job.model.js";
import type { ImportJob } from "./import-job.types.js";

/**
 * Cria o ImportJob inicial (status "queued", retryCount 0 via documentDefaults).
 * O _id gerado pelo Mongo é a fonte da verdade referenciada pela mensagem SQS
 * (PIPE-06) — o worker relê o doc em vez de confiar no payload.
 */
export async function createImportJob(
  userId: string,
  sourceUrl: string,
  normalizedUrl: string,
  platform: ImportJob["platform"],
): Promise<ImportJob> {
  return ImportJobModel.insert({
    userId,
    sourceUrl,
    normalizedUrl,
    platform,
  } as never) as unknown as Promise<ImportJob>;
}

/**
 * Busca um ImportJob por id.
 *
 * Quando `userId` é informado, a query é escopada por AMBOS os campos
 * (`_id` + `userId`) no próprio filtro Mongo — não busca-e-compara depois.
 * Isso é a mitigação de IDOR de GET /import/:jobId (T-04-02): um usuário
 * que não é dono recebe o mesmo `null` de "não existe", sem vazar a
 * existência do job de outro usuário.
 */
export async function getImportJob(
  jobId: string,
  userId?: string,
): Promise<ImportJob | null> {
  if (userId) {
    const job = await ImportJobModel.find({ _id: new ObjectId(jobId), userId } as never);
    return (job as ImportJob | null) ?? null;
  }
  const job = await ImportJobModel.findById(jobId);
  return (job as ImportJob | null) ?? null;
}

/**
 * Aplica uma transição de status/patch parcial no ImportJob, sempre
 * atualizando updatedAt. Usado em cada fronteira de etapa do pipeline
 * (queued -> downloading -> transcribing -> extracting -> ready_for_review/failed).
 */
export async function updateImportJobStatus(
  jobId: string,
  patch: Partial<ImportJob>,
): Promise<void> {
  await ImportJobModel.update(
    { _id: new ObjectId(jobId) } as never,
    { $set: { ...patch, updatedAt: new Date() } },
  );
}
