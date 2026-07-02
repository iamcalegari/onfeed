/**
 * Entrypoint standalone do worker de import (Render Background Worker — NÃO
 * Lambda). Conecta ao Mongo uma vez, varre diretórios temp órfãos de uma
 * instância anterior que morreu por SIGKILL/OOM (PIPE-05 camada 2), e então
 * inicia o loop de long-poll do sqs-consumer sobre a fila dedicada de import.
 *
 * A ordem dos imports é crítica: connectDatabase cria o Database singleton do
 * mongoat ANTES que qualquer model tente se registrar — mesma disciplina de
 * src/lambda/ingest-handler.ts (gotcha "Database not found" do mongoat). O
 * QUE MUDA em relação ao ingest-handler: este worker é um processo
 * standalone de longa duração, não um handler(event: SQSEvent) por invocação
 * — usa o loop de poll real do sqs-consumer, reaproveitando o sqsClient
 * singleton existente (região-only), não um client novo.
 */
import { readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import PQueue from "p-queue";
import { Consumer } from "sqs-consumer";

import { connectDatabase } from "@/infra/database/connection.js";
import "@/modules/index.js";
import { env } from "@/config/env.js";
import { processImportJob } from "@/infra/video/pipeline.js";
import { sqsClient } from "@/infra/queue/sqs.client.js";
import { getImportJob } from "@/modules/import/import-job.repository.js";

let dbConnected = false;
async function ensureDbConnected(): Promise<void> {
  if (dbConnected) return;
  await connectDatabase();
  dbConnected = true;
}

/**
 * PIPE-05 camada 2: o try/finally por-job (pipeline.ts) não sobrevive a um
 * SIGKILL/OOM/force-restart — a `finally` simplesmente não roda. No boot,
 * varre tmpdir() por qualquer diretório `import-*` remanescente e remove.
 * Na escala MVP de instância única, qualquer diretório assim encontrado no
 * boot pertence ao próprio processo que está reiniciando — é seguro apagar.
 * Nota de escala (não bloqueante nesta fase): se o worker escalar
 * horizontalmente, esta varredura precisaria coordenar com outras instâncias
 * antes de apagar (ver 01-RESEARCH.md Architecture Pattern 4).
 */
export async function sweepStaleTempDirs(): Promise<void> {
  let entries: string[];
  try {
    entries = await readdir(tmpdir());
  } catch (e) {
    console.error("[import-worker] falha ao listar tmpdir para sweep", e);
    return;
  }

  const staleDirs = entries.filter((e) => e.startsWith("import-"));
  for (const dir of staleDirs) {
    const fullPath = path.join(tmpdir(), dir);
    await rm(fullPath, { recursive: true, force: true }).catch((e: unknown) => {
      console.error(`[import-worker] falha ao varrer diretório órfão ${fullPath}`, e);
    });
  }
  if (staleDirs.length > 0) {
    console.log(`[import-worker] sweep removeu ${staleDirs.length} diretório(s) temp órfão(s)`);
  }
}

// Limita a concorrência de jobs simultâneos (2-3) para não disparar
// ffmpeg/yt-dlp sem limite (RESEARCH Pitfall 5 / T-05-03 DoS bound).
const CONCURRENCY = Number(process.env.IMPORT_WORKER_CONCURRENCY ?? 2);
const jobQueue = new PQueue({ concurrency: CONCURRENCY });

/** Estados terminais — uma mensagem redelivered para um job já nesses
 * estados é um no-op (idempotência, PIPE-06). O doc Mongo, não o payload
 * SQS, é a fonte da verdade. */
const TERMINAL_STATUSES = new Set(["ready_for_review", "failed"]);

export async function handleImportMessage(body: string): Promise<void> {
  const { jobId } = JSON.parse(body) as { jobId: string };

  const job = await getImportJob(jobId);
  if (!job) {
    // Defensivo — não deveria acontecer (job criado antes do enqueue).
    console.warn(`[import-worker] jobId ${jobId} não encontrado — ack sem processar`);
    return;
  }
  if (TERMINAL_STATUSES.has(job.status)) {
    // Idempotência (PIPE-06): redelivery de um job já terminal é um no-op.
    return;
  }

  await jobQueue.add(() => processImportJob(job));
}

export function createImportConsumer(): Consumer {
  const consumer = Consumer.create({
    queueUrl: env.sqs.importQueueUrl,
    sqs: sqsClient,
    // ~6x o p95 esperado de processamento (RESEARCH Pitfall 4) — download +
    // transcrição + keyframe realisticamente leva 30s-3min.
    visibilityTimeout: 20 * 60,
    // sqs-consumer processa UMA mensagem por vez: sem este teto, um único job
    // pendurado (yt-dlp/ffmpeg/LLM sem resposta) congela o worker inteiro para
    // sempre — foi exatamente o modo de falha de 2026-07-02 (job preso em
    // "extracting" às 03:47 UTC deixou a fila sem consumo o dia todo).
    // 15min < visibilityTimeout (20min): o handler é abortado antes de a
    // mensagem voltar a ficar visível, evitando processamento duplo.
    handleMessageTimeout: 15 * 60 * 1000,
    handleMessage: async (message) => {
      await handleImportMessage(message.Body ?? "{}");
      return message; // ack (delete) — sucesso ou no-op idempotente
    },
  });

  consumer.on("processing_error", (err) => {
    // sqs-consumer NÃO deleta a mensagem em erro — fica na fila para o
    // redrive policy (maxReceiveCount, config de infra da Plan 06) mover
    // para a DLQ após tentativas repetidas.
    console.error("[import-worker] processing error", err);
  });

  consumer.on("timeout_error", (err) => {
    // handleMessageTimeout estourou — o job ficou pendurado além do teto. A
    // mensagem NÃO é deletada (volta via redrive); o job Mongo fica no último
    // status não-terminal até uma redelivery reprocessá-lo do zero.
    console.error("[import-worker] handler timeout (job pendurado abortado)", err);
  });

  consumer.on("error", (err) => {
    console.error("[import-worker] consumer error", err);
  });

  return consumer;
}

async function main(): Promise<void> {
  await ensureDbConnected();
  await sweepStaleTempDirs();

  const consumer = createImportConsumer();
  consumer.start();
  console.log(`[import-worker] consuming ${env.sqs.importQueueUrl} (concurrency=${CONCURRENCY})`);
}

// Só roda main() quando executado diretamente (não quando importado por testes).
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err: unknown) => {
    console.error("[import-worker] fatal error on boot", err);
    process.exit(1);
  });
}
