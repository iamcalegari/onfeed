---
tags: [backend, worker, sqs, import-pipeline, render]
updated: 2026-07-01
---

# Workers

Deployables standalone de longa duração (Render Background Worker), distintos
do processo Fastify (`src/server.ts`) e do handler Lambda (`src/lambda/`).
Cada worker consome uma fila SQS via `sqs-consumer` (loop de long-poll real),
não o shape `handler(event: SQSEvent)` de invocação única do Lambda.

## Arquivos

| Arquivo | Responsabilidade |
|---|---|
| `import-worker.ts` | Entrypoint do worker de import de vídeo (PIPE-05/06). Conecta ao Mongo uma vez, varre `tmpdir()` por diretórios `import-*` órfãos de uma instância anterior morta por SIGKILL/OOM (`sweepStaleTempDirs`, PIPE-05 camada 2), então inicia o `Consumer` do `sqs-consumer` sobre `env.sqs.importQueueUrl`. `handleImportMessage` relê o [[Import\|ImportJob]] autoritativo por `jobId` e é um no-op se o status já é terminal (`ready_for_review`/`failed`) — idempotência PIPE-06. Processamento real delega a `processImportJob` em [[Video Infra\|src/infra/video/pipeline.ts]], dentro de um limitador `p-queue` (concorrência 2-3). |

## Rodando localmente

```bash
npm run worker:import   # tsx --env-file=.env src/workers/import-worker.ts
```

Requer `SQS_IMPORT_QUEUE_URL` configurada (senão o worker conecta ao Mongo/
varre tmpdir normalmente, mas o `Consumer` falha ao tentar consumir uma URL
vazia — configure `.env` antes de rodar localmente).

> [!INFO]
> `main()` só roda quando o arquivo é executado diretamente (`import.meta.url
> === file://process.argv[1]`), não quando importado por testes — permite que
> `import-worker.test.ts` importe `handleImportMessage`/`sweepStaleTempDirs`/
> `createImportConsumer` isoladamente sem disparar o boot completo (conexão
> Mongo real, `consumer.start()`).

> [!WARNING]
> Idempotência depende do documento Mongo, NUNCA do payload da mensagem SQS
> — a mensagem carrega só `{ jobId }` ([[Import]]). Uma mensagem redelivered
> para um job já terminal é sempre um no-op, mesmo que o corpo da mensagem
> tenha sido adulterado (T-05-01, mitigação de tampering).

## Dependências

- `sqs-consumer` (`Consumer.create`) — reusa o `sqsClient` singleton existente de `src/infra/queue/sqs.client.ts`, sem client novo.
- `p-queue` — limita a concorrência de jobs simultâneos (padrão 2, `IMPORT_WORKER_CONCURRENCY` env var) para não disparar `ffmpeg`/`yt-dlp` sem limite (T-05-03, DoS bound).
- [[Video Infra]] (`pipeline.ts`) — a orquestração real do pipeline por-job.
- [[Import]] (`import-job.repository.ts`) — `getImportJob`/`updateImportJobStatus`, fonte da verdade de estado/idempotência.

## DLQ e retry (infra, não código)

`processing_error` é logado e a mensagem é deixada na fila (não deletada) —
quem governa a redrive para a DLQ é o `maxReceiveCount` configurado na
própria fila SQS (infra, Plano 01-06), não este código. `anti_bot_blocked`/
`rate_limited` são exceção: `pipeline.ts` falha o job explicitamente e
retorna sem lançar, então a mensagem É deletada (ack) mesmo em falha — evita
que a redelivery automática da SQS acelere um bloqueio de plataforma; o
circuit breaker (`platform-breaker.ts`, [[Video Infra]]) é quem decide quando
tentar aquela plataforma de novo.
