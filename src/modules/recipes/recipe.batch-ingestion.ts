import { anthropic } from "@/infra/llm/anthropic.client.js";
import {
  buildExtractionParams,
  ExtractedRecipeSchema,
} from "./recipe.extraction.js";
import {
  persistExtractedRecipe,
  type IngestOptions,
  type IngestRecipeInput,
} from "./recipe.ingestion.js";

/**
 * Ingestão em lote do seed inicial usando a Batches API da Anthropic — a fase
 * de extração roda assíncrona a 50% do custo. O pós-processamento (canonicalizar
 * → embeddar com Voyage → persistir) é feito localmente sobre cada resultado.
 *
 * Fluxo:
 *   1. submete um request de extração por receita (custom_id = índice)
 *   2. faz polling até o batch terminar (pode levar de minutos a ~24h)
 *   3. para cada resultado bem-sucedido: parseia → persistExtractedRecipe
 */

export interface BatchIngestionReport {
  batchId: string;
  succeeded: number;
  failed: { customId: string; reason: string }[];
}

const POLL_INTERVAL_MS = 30_000;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function runBatchIngestion(
  recipes: IngestRecipeInput[],
  opts: IngestOptions,
): Promise<BatchIngestionReport> {
  if (recipes.length === 0) {
    throw new Error("Nenhuma receita para ingerir");
  }

  // custom_id determinístico -> índice na lista original
  const byCustomId = new Map<string, IngestRecipeInput>();
  const requests = recipes.map((recipe, i) => {
    const customId = `recipe-${i}`;
    byCustomId.set(customId, recipe);
    return { custom_id: customId, params: buildExtractionParams(recipe) };
  });

  const batch = await anthropic.messages.batches.create({ requests });
  console.log(`[batch] criado ${batch.id} com ${requests.length} requests`);

  // 2. polling até terminar
  let status = batch;
  while (status.processing_status !== "ended") {
    await sleep(POLL_INTERVAL_MS);
    status = await anthropic.messages.batches.retrieve(batch.id);
    const c = status.request_counts;
    console.log(
      `[batch] ${status.processing_status} — ok:${c.succeeded} erro:${c.errored} processando:${c.processing}`,
    );
  }

  // 3. processa resultados
  const failed: { customId: string; reason: string }[] = [];
  let succeeded = 0;

  for await (const entry of await anthropic.messages.batches.results(batch.id)) {
    const recipe = byCustomId.get(entry.custom_id);
    if (!recipe) {
      failed.push({ customId: entry.custom_id, reason: "custom_id sem receita" });
      continue;
    }

    if (entry.result.type !== "succeeded") {
      failed.push({ customId: entry.custom_id, reason: entry.result.type });
      continue;
    }

    try {
      const textBlock = entry.result.message.content.find(
        (b) => b.type === "text",
      );
      if (!textBlock || textBlock.type !== "text") {
        throw new Error("resposta sem bloco de texto");
      }
      const extracted = ExtractedRecipeSchema.parse(JSON.parse(textBlock.text));
      await persistExtractedRecipe(recipe, extracted, opts);
      succeeded++;
    } catch (err) {
      failed.push({
        customId: entry.custom_id,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  console.log(`[batch] concluído: ${succeeded} ok, ${failed.length} falhas`);
  return { batchId: batch.id, succeeded, failed };
}
