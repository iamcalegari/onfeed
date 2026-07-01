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

/** Busca um ImportJob por id; retorna null se não existir. */
export async function getImportJob(jobId: string): Promise<ImportJob | null> {
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
