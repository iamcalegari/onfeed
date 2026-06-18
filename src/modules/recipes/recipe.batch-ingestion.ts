import { anthropic } from "@/infra/llm/anthropic.client.js";
import {
  buildExtractionParams,
  ExtractedRecipeSchema,
} from "./recipe.extraction.js";
import {
  persistExtractedRecipesBatch,
  type IngestOptions,
  type IngestRecipeInput,
} from "./recipe.ingestion.js";
import type { ExtractedRecipe } from "./recipe.extraction.js";

/**
 * Ingestão em lote do seed inicial usando a Batches API da Anthropic — a fase
 * de extração roda assíncrona a 50% do custo. O pós-processamento (canonicalizar
 * → embeddar com Voyage → persistir) é feito localmente sobre cada resultado.
 *
 * Fluxo:
 *   1. divide as receitas em chunks de BATCH_CHUNK_SIZE (evita 502 por payload
 *      grande no Cloudflare que fica na frente da Anthropic)
 *   2. submete um batch por chunk (com retry em 5xx)
 *   3. faz polling de todos os batches em paralelo até todos encerrarem
 *   4. para cada resultado bem-sucedido: parseia → persistExtractedRecipe
 */

export interface BatchIngestionReport {
  batchId: string;
  succeeded: number;
  failed: { customId: string; reason: string }[];
}

/** Máximo de requests por chamada a batches.create (limite de payload). */
const BATCH_CHUNK_SIZE = 100;
const POLL_INTERVAL_MS = 30_000;
const MAX_RETRIES = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function isRetryable(err: unknown): boolean {
  const status = (err as { status?: number })?.status;
  return status !== undefined && status >= 500;
}

type BatchRequest = { custom_id: string; params: ReturnType<typeof buildExtractionParams> };
type BatchStatus = Awaited<ReturnType<typeof anthropic.messages.batches.retrieve>>;

/** Cria um batch com retry exponencial em erros 5xx. */
async function createBatchWithRetry(
  requests: BatchRequest[],
): Promise<BatchStatus> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await anthropic.messages.batches.create({ requests });
    } catch (err) {
      if (attempt < MAX_RETRIES - 1 && isRetryable(err)) {
        const delay = 2_000 * 2 ** attempt; // 2s, 4s, 8s
        console.warn(
          `[batch] tentativa ${attempt + 1} falhou (${(err as { status?: number }).status}),` +
            ` aguardando ${delay / 1000}s...`,
        );
        await sleep(delay);
        continue;
      }
      throw err;
    }
  }
  throw new Error("unreachable");
}

/** Aguarda todos os batches encerrarem, exibindo progresso agregado. */
async function pollUntilAllEnded(ids: string[]): Promise<void> {
  const pending = new Set(ids);
  while (pending.size > 0) {
    await sleep(POLL_INTERVAL_MS);
    let succeeded = 0, errored = 0, processing = 0;
    for (const id of [...pending]) {
      const s = await anthropic.messages.batches.retrieve(id);
      succeeded += s.request_counts.succeeded;
      errored += s.request_counts.errored;
      processing += s.request_counts.processing;
      if (s.processing_status === "ended") pending.delete(id);
    }
    console.log(
      `[batch] ok:${succeeded} erro:${errored} processando:${processing}` +
        ` (${pending.size}/${ids.length} batches ativos)`,
    );
  }
}

export async function runBatchIngestion(
  recipes: IngestRecipeInput[],
  opts: IngestOptions,
): Promise<BatchIngestionReport> {
  if (recipes.length === 0) {
    throw new Error("Nenhuma receita para ingerir");
  }

  // custom_id determinístico → índice na lista original
  const byCustomId = new Map<string, IngestRecipeInput>();
  const allRequests: BatchRequest[] = recipes.map((recipe, i) => {
    const customId = `recipe-${i}`;
    byCustomId.set(customId, recipe);
    return { custom_id: customId, params: buildExtractionParams(recipe) };
  });

  // 1. divide em chunks e cria um batch por chunk
  const chunks = chunkArray(allRequests, BATCH_CHUNK_SIZE);
  console.log(
    `[batch] ${recipes.length} receitas → ${chunks.length} batch(es) de até ${BATCH_CHUNK_SIZE}`,
  );
  const batches: BatchStatus[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const b = await createBatchWithRetry(chunks[i]!);
    batches.push(b);
    console.log(
      `[batch] ${i + 1}/${chunks.length} criado: ${b.id} (${chunks[i]!.length} requests)`,
    );
  }

  // 2. polling de todos os batches em paralelo
  await pollUntilAllEnded(batches.map((b) => b.id));

  // 3. coleta resultados de todos os batches
  const failed: { customId: string; reason: string }[] = [];
  const parsed: { input: IngestRecipeInput; extracted: ExtractedRecipe }[] = [];

  for (const batch of batches) {
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
        parsed.push({ input: recipe, extracted });
      } catch (err) {
        failed.push({
          customId: entry.custom_id,
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  // 4. persiste em lote: canonicalização deduplicada + embeddings em chunks
  let succeeded = 0;
  if (parsed.length > 0) {
    const { saved, failed: persistFailed } = await persistExtractedRecipesBatch(
      parsed,
      opts,
    );
    succeeded = saved.length;
    for (const f of persistFailed) {
      failed.push({ customId: f.title, reason: f.reason });
    }
  }

  // ID representativo: o primeiro batch (ou todos separados por vírgula)
  const batchId = batches.map((b) => b.id).join(",");
  console.log(`[batch] concluído: ${succeeded} ok, ${failed.length} falhas`);
  return { batchId, succeeded, failed };
}
