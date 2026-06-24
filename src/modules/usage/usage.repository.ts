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
