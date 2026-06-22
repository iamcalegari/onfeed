import { createReadStream } from "node:fs";

import { parse } from "csv-parse";

import type { DatasetRow } from "./dataset.adapter.js";

export interface RecipeRank {
  recipeId: string;
  reviewCount: number;
  avgRating: number;
  score: number; // reviewCount × avgRating
}

/**
 * Lê RAW_interactions.csv e calcula um ranking por receita.
 *
 * Colunas esperadas: user_id, recipe_id, date, rating, review
 * Fonte: Kaggle "Food.com Recipes and Interactions"
 *
 * Score = reviewCount × avgRating — favorece receitas muito avaliadas E bem
 * avaliadas. Receitas com poucas avaliações (< minReviews) são descartadas
 * para evitar ruído de receitas novas com 1 review nota 5.
 */
export async function rankRecipesByInteractions(
  interactionsFile: string,
  opts: {
    topN?: number;
    minReviews?: number;
    onProgress?: (linesProcessed: number) => void;
  } = {},
): Promise<string[]> {
  const minReviews = opts.minReviews ?? 5;

  const parser = createReadStream(interactionsFile).pipe(
    parse({
      columns: true,
      skip_empty_lines: true,
      relax_quotes: true,
      relax_column_count: true,
    }),
  );

  const stats = new Map<string, { sum: number; count: number }>();
  let lines = 0;

  for await (const row of parser as AsyncIterable<DatasetRow>) {
    const id = row.recipe_id?.trim();
    const rating = Number(row.rating);
    lines++;
    if (lines % 10_000 === 0) opts.onProgress?.(lines);
    if (!id || !Number.isFinite(rating) || rating <= 0) continue;

    const s = stats.get(id) ?? { sum: 0, count: 0 };
    s.sum += rating;
    s.count += 1;
    stats.set(id, s);
  }
  opts.onProgress?.(lines);

  const ranked: RecipeRank[] = [];
  for (const [recipeId, { sum, count }] of stats) {
    if (count < minReviews) continue;
    const avgRating = sum / count;
    ranked.push({ recipeId, reviewCount: count, avgRating, score: count * avgRating });
  }

  ranked.sort((a, b) => b.score - a.score);

  const topN = opts.topN ?? ranked.length;
  return ranked.slice(0, topN).map((r) => r.recipeId);
}
