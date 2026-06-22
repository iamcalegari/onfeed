import { readFileSync, writeFileSync, existsSync } from "node:fs";

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
 * Ingestão em lote usando a Batches API da Anthropic — 50% mais barato,
 * tolerante a falhas via checkpoint em disco.
 *
 * Checkpoint: salvo após cada batches.create. Se o processo cair (crédito
 * esgotado, rede, Ctrl-C), repassar --resume <arquivo> retoma exatamente
 * de onde parou sem re-submeter batches já criados nem re-persistir receitas
 * que já foram salvas no DB.
 *
 * No estouro de crédito: tenta imediatamente persistir os batches já prontos
 * antes de encerrar — minimiza perda de trabalho já processado pela Anthropic.
 */

export interface BatchIngestionReport {
  batchId: string;
  succeeded: number;
  failed: { customId: string; reason: string }[];
}

export interface IngestOptionsWithCheckpoint extends IngestOptions {
  checkpointPath?: string;
  onBatchCreated?: (index: number, total: number, batchId: string) => void;
  onPollUpdate?: (ok: number, errored: number, processing: number, pendingBatches: number) => void;
}

interface BatchMeta {
  id: string;
  start: number;
  end: number;
}

interface CheckpointData {
  createdAt: string;
  source: string;
  recipes: IngestRecipeInput[];
  batches: BatchMeta[];
  /** IDs de batches cujos resultados já foram persistidos no DB. */
  persistedBatches: string[];
}

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

function isCreditExhausted(err: unknown): boolean {
  const msg = (
    (err as { error?: { message?: string } })?.error?.message ?? ""
  ).toLowerCase();
  return msg.includes("credit balance") || msg.includes("credits");
}

// ---------------------------------------------------------------------------
// Checkpoint I/O
// ---------------------------------------------------------------------------

function loadCheckpoint(path: string): CheckpointData | null {
  if (!path || !existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as CheckpointData;
  } catch {
    return null;
  }
}

function saveCheckpoint(path: string, data: CheckpointData): void {
  writeFileSync(path, JSON.stringify(data, null, 2), "utf-8");
}

// ---------------------------------------------------------------------------
// Batch creation com retry
// ---------------------------------------------------------------------------

type BatchRequest = {
  custom_id: string;
  params: ReturnType<typeof buildExtractionParams>;
};
type BatchStatus = Awaited<
  ReturnType<typeof anthropic.messages.batches.retrieve>
>;

async function createBatchWithRetry(
  requests: BatchRequest[],
): Promise<BatchStatus> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await anthropic.messages.batches.create({ requests });
    } catch (err) {
      if (isCreditExhausted(err)) throw err; // não retria crédito
      if (attempt < MAX_RETRIES - 1 && isRetryable(err)) {
        const delay = 2_000 * 2 ** attempt;
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

// ---------------------------------------------------------------------------
// Coleta + persistência de um único batch
// ---------------------------------------------------------------------------

async function collectAndPersistBatch(
  batchId: string,
  byCustomId: Map<string, IngestRecipeInput>,
  opts: IngestOptions,
): Promise<{ saved: number; failed: { customId: string; reason: string }[] }> {
  const failed: { customId: string; reason: string }[] = [];
  const parsed: { input: IngestRecipeInput; extracted: ExtractedRecipe }[] = [];

  for await (const entry of await anthropic.messages.batches.results(batchId)) {
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

  let saved = 0;
  if (parsed.length > 0) {
    const result = await persistExtractedRecipesBatch(parsed, opts);
    saved = result.saved.length;
    for (const f of result.failed) {
      failed.push({ customId: f.title, reason: f.reason });
    }
  }

  return { saved, failed };
}

// ---------------------------------------------------------------------------
// Polling paralelo
// ---------------------------------------------------------------------------

async function pollUntilAllEnded(
  ids: string[],
  onPollUpdate?: IngestOptionsWithCheckpoint["onPollUpdate"],
): Promise<void> {
  if (ids.length === 0) return;
  const pending = new Set(ids);
  while (pending.size > 0) {
    await sleep(POLL_INTERVAL_MS);
    let succeeded = 0,
      errored = 0,
      processing = 0;
    for (const id of [...pending]) {
      const s = await anthropic.messages.batches.retrieve(id);
      succeeded += s.request_counts.succeeded;
      errored += s.request_counts.errored;
      processing += s.request_counts.processing;
      if (s.processing_status === "ended") pending.delete(id);
    }
    if (onPollUpdate) {
      onPollUpdate(succeeded, errored, processing, pending.size);
    } else {
      console.log(
        `[batch] ok:${succeeded} erro:${errored} processando:${processing}` +
          ` (${pending.size}/${ids.length} batches ativos)`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Persistência de tudo que já está pronto (usado no estouro de crédito)
// ---------------------------------------------------------------------------

async function persistReadyBatches(
  checkpoint: CheckpointData,
  byCustomId: Map<string, IngestRecipeInput>,
  opts: IngestOptions,
  checkpointPath: string | undefined,
): Promise<number> {
  let totalSaved = 0;

  for (const bm of checkpoint.batches) {
    if (checkpoint.persistedBatches.includes(bm.id)) continue;

    let status: BatchStatus;
    try {
      status = await anthropic.messages.batches.retrieve(bm.id);
    } catch {
      continue; // falha ao verificar status — pula
    }

    if (status.processing_status !== "ended") continue;

    try {
      const { saved, failed } = await collectAndPersistBatch(
        bm.id,
        byCustomId,
        opts,
      );
      totalSaved += saved;
      checkpoint.persistedBatches.push(bm.id);
      if (checkpointPath) saveCheckpoint(checkpointPath, checkpoint);
      if (failed.length > 0) {
        console.warn(`[batch] ${bm.id}: ${failed.length} falhas de parse/persistência`);
      }
    } catch (err) {
      console.warn(
        `[batch] falha ao persistir ${bm.id}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  return totalSaved;
}

// ---------------------------------------------------------------------------
// Erro público para crédito esgotado
// ---------------------------------------------------------------------------

export class CreditExhaustedError extends Error {
  constructor(public readonly checkpointPath: string | undefined) {
    super("CREDIT_EXHAUSTED");
    this.name = "CreditExhaustedError";
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function runBatchIngestion(
  recipes: IngestRecipeInput[],
  opts: IngestOptionsWithCheckpoint,
): Promise<BatchIngestionReport> {
  if (recipes.length === 0) throw new Error("Nenhuma receita para ingerir");

  const { checkpointPath } = opts;

  const checkpoint: CheckpointData = loadCheckpoint(checkpointPath ?? "") ?? {
    createdAt: new Date().toISOString(),
    source: opts.source,
    recipes,
    batches: [],
    persistedBatches: [],
  };

  const resuming = checkpoint.batches.length > 0;
  if (resuming) {
    console.log(
      `[batch] retomando checkpoint: ${checkpoint.batches.length} batches submetidos,` +
        ` ${checkpoint.persistedBatches.length} já persistidos`,
    );
  }

  // Garante que persistedBatches existe em checkpoints antigos
  checkpoint.persistedBatches ??= [];

  const recipesToProcess = checkpoint.recipes;

  // Mapeamento custom_id → receita (necessário para coleta de resultados)
  const byCustomId = new Map<string, IngestRecipeInput>();
  const allRequests: BatchRequest[] = recipesToProcess.map((recipe, i) => {
    const customId = `recipe-${i}`;
    byCustomId.set(customId, recipe);
    return { custom_id: customId, params: buildExtractionParams(recipe) };
  });

  const chunks = chunkArray(allRequests, BATCH_CHUNK_SIZE);
  console.log(
    `[batch] ${recipesToProcess.length} receitas → ${chunks.length} batch(es) de até ${BATCH_CHUNK_SIZE}` +
      (resuming ? ` (retomando)` : ""),
  );

  // Cria apenas os chunks ainda não submetidos
  for (let i = 0; i < chunks.length; i++) {
    const chunkStart = i * BATCH_CHUNK_SIZE;
    const alreadySubmitted = checkpoint.batches.some(
      (b) => b.start === chunkStart,
    );
    if (alreadySubmitted) {
      console.log(`[batch] ${i + 1}/${chunks.length} já submetido — pulando`);
      continue;
    }

    try {
      const b = await createBatchWithRetry(chunks[i]!);
      checkpoint.batches.push({
        id: b.id,
        start: chunkStart,
        end: chunkStart + chunks[i]!.length - 1,
      });
      if (checkpointPath) saveCheckpoint(checkpointPath, checkpoint);
      if (opts.onBatchCreated) {
        opts.onBatchCreated(i + 1, chunks.length, b.id);
      } else {
        console.log(
          `[batch] ${i + 1}/${chunks.length} criado: ${b.id} (${chunks[i]!.length} requests)`,
        );
      }
    } catch (err) {
      if (isCreditExhausted(err)) {
        if (checkpointPath) saveCheckpoint(checkpointPath, checkpoint);

        // Aproveita e persiste os batches já prontos antes de sair
        console.log(
          "[batch] Crédito esgotado — verificando batches prontos para salvar no DB...",
        );
        const saved = await persistReadyBatches(
          checkpoint,
          byCustomId,
          opts,
          checkpointPath,
        );
        if (saved > 0) {
          console.log(`[batch] ${saved} receitas salvas antes do encerramento`);
        } else {
          console.log("[batch] Nenhum batch finalizado ainda — tente o --resume em alguns minutos");
        }

        throw new CreditExhaustedError(checkpointPath);
      }
      throw err;
    }
  }

  // Polling dos batches ainda não persistidos
  const pending = checkpoint.batches
    .filter((b) => !checkpoint.persistedBatches.includes(b.id))
    .map((b) => b.id);

  await pollUntilAllEnded(pending, opts.onPollUpdate);

  // Coleta e persiste os resultados restantes
  const allFailed: { customId: string; reason: string }[] = [];
  let totalSaved = 0;

  for (const bm of checkpoint.batches) {
    if (checkpoint.persistedBatches.includes(bm.id)) continue;

    const { saved, failed } = await collectAndPersistBatch(
      bm.id,
      byCustomId,
      opts,
    );
    totalSaved += saved;
    allFailed.push(...failed);
    checkpoint.persistedBatches.push(bm.id);
    if (checkpointPath) saveCheckpoint(checkpointPath, checkpoint);
  }

  const batchId = checkpoint.batches.map((b) => b.id).join(",");
  console.log(`[batch] concluído: ${totalSaved} ok, ${allFailed.length} falhas`);
  return { batchId, succeeded: totalSaved, failed: allFailed };
}
