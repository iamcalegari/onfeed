import { RatingModel } from "./rating.model.js";

export interface RatingStats {
  /** média 0..5, arredondada a 1 casa (0 = sem avaliações) */
  avg: number;
  /** total de avaliações */
  count: number;
  /** a nota do usuário atual, ou null se não avaliou / anônimo */
  mine: number | null;
}

/**
 * Registra (ou atualiza) a avaliação do usuário para a receita. Upsert manual
 * pelo par (userId, recipeId) — espelha o padrão do toggleLike.
 */
export async function rateRecipe(
  userId: string,
  recipeId: string,
  rating: number,
): Promise<RatingStats> {
  const existing = await RatingModel.find({ userId, recipeId });

  if (existing) {
    await RatingModel.update(
      { userId, recipeId },
      { $set: { rating, updatedAt: new Date() } },
    );
  } else {
    await RatingModel.insert({
      userId,
      recipeId,
      rating,
      insertedAt: new Date(),
      updatedAt: new Date(),
    });
  }

  return getRatingStats(recipeId, userId);
}

/** Média + contagem da receita (e a nota do usuário, se informado). */
export async function getRatingStats(
  recipeId: string,
  userId?: string,
): Promise<RatingStats> {
  const agg = (await RatingModel.aggregate([
    { $match: { recipeId } },
    { $group: { _id: null, avg: { $avg: "$rating" }, count: { $sum: 1 } } },
  ])) as { avg: number; count: number }[];

  const stats = agg[0] ?? { avg: 0, count: 0 };

  let mine: number | null = null;
  if (userId) {
    const doc = await RatingModel.find({ userId, recipeId });
    mine = doc?.rating ?? null;
  }

  return {
    avg: stats.avg ? Math.round(stats.avg * 10) / 10 : 0,
    count: stats.count ?? 0,
    mine,
  };
}
