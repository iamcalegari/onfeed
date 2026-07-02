import { ImportUsageModel } from "./import-usage.model.js";
import { AdaptUsageModel } from "./usage.model.js";

export interface QuotaResult {
  allowed: boolean;
  count: number;
  limit: number;
}

/**
 * Incrementa (atômico, via upsert) o contador diário de adaptações do usuário
 * e diz se ainda está dentro do limite. Conta tentativas — a chamada ao LLM é
 * o que custa, então capamos antes de gerar.
 */
export async function consumeDailyAdaptQuota(
  userId: string,
  limit: number,
): Promise<QuotaResult> {
  const day = new Date().toISOString().slice(0, 10);
  const doc = (await AdaptUsageModel.update(
    { userId, day },
    {
      $inc: { count: 1 },
      $setOnInsert: { insertedAt: new Date() },
      $set: { updatedAt: new Date() },
    },
    { upsert: true },
  )) as { count?: number } | null;

  const count = doc?.count ?? 1;
  return { allowed: count <= limit, count, limit };
}

/** Lê (sem incrementar) quantas adaptações o usuário já fez hoje — para o /me. */
export async function getDailyAdaptCount(userId: string): Promise<number> {
  const day = new Date().toISOString().slice(0, 10);
  const doc = (await AdaptUsageModel.find({ userId, day })) as { count?: number } | null;
  return doc?.count ?? 0;
}

/**
 * Incrementa (atômico, via upsert) o contador diário de imports do usuário
 * na coleção DEDICADA import_usage (isolada de adapt_usage) e diz se ainda
 * está dentro do limite. Reserva a vaga ANTES do job entrar na fila —
 * COST-01 exige que a checagem de cota seja atômica na submissão.
 */
export async function consumeDailyImportQuota(
  userId: string,
  limit: number,
): Promise<QuotaResult> {
  const day = new Date().toISOString().slice(0, 10);
  const doc = (await ImportUsageModel.update(
    { userId, day },
    {
      $inc: { count: 1 },
      $setOnInsert: { insertedAt: new Date() },
      $set: { updatedAt: new Date() },
    },
    { upsert: true },
  )) as { count?: number } | null;

  const count = doc?.count ?? 1;
  return { allowed: count <= limit, count, limit };
}

/**
 * Devolve (decrementa) a vaga de import reservada no dia `day` — o dia em que
 * o slot foi RESERVADO, nunca "hoje" às cegas (um refund pode acontecer num
 * dia diferente do dia da reserva, ex.: job cai perto da virada). NUNCA usa
 * upsert: o doc do dia já existe obrigatoriamente, porque a cota só é
 * devolvida depois de ter sido reservada com sucesso (consumeDailyImportQuota).
 */
export async function refundDailyImportQuota(
  userId: string,
  day: string,
): Promise<void> {
  await ImportUsageModel.update(
    { userId, day },
    {
      $inc: { count: -1 },
      $set: { updatedAt: new Date() },
    },
  );
}
