---
tags: [backend, module, video-pipeline, import]
updated: 2026-07-01
---

# Import

Pipeline de import de receita a partir de vídeo (Instagram/TikTok/YouTube). O
`ImportJob` é um documento de state machine — a fonte única da verdade tanto
para progresso quanto para idempotência (PIPE-06).

## Arquivos

| Arquivo | Responsabilidade |
|---|---|
| `import-job.types.ts` | `ImportJobStatus`, `ImportFailureReason`, `ImportJob`, `ImportJobMessage` |
| `import-job.model.ts` | Schema Mongoat: coleção `import_jobs`, índices em `status`/`userId` |
| `import-job.repository.ts` | `createImportJob`, `getImportJob`, `updateImportJobStatus` |
| `import-job.repository.test.ts` | Testes unitários do repositório (`ImportJobModel` mockado) |

> [!INFO] Ainda não existe nesta fase
> `import.routes.ts` (rotas `POST /import` / `GET /import/:jobId`) e
> `import.service.ts` (`enqueueImportJob`, `detectPlatform`, `normalizeUrl`)
> são entregues em plans seguintes desta mesma fase — este plan (01-01)
> estabelece só a fundação (tipos + model + repository).

## State Machine

```
queued → downloading → transcribing → extracting → ready_for_review
                                                   ↘ failed (a partir de qualquer etapa)
```

- `extracting` é um stub nesta fase — sempre passa direto para `ready_for_review`.
- `failedStep` registra em qual etapa a falha ocorreu; `failureReason` é um dos
  valores tipados de `ImportFailureReason` (ex.: `anti_bot_blocked`,
  `rate_limited` — relevantes ao circuit breaker de [[PIPE-07]]).
- `noSpeechDetected: true` não é necessariamente falha (D-06) — significa que o
  transcript está ausente/não confiável por design, não um bug.

> [!TIP] Idempotência via _id
> A mensagem SQS carrega só `{ jobId }` (o `_id` do Mongo, gerado pelo
> servidor) — nunca o payload completo. O worker sempre relê o documento
> autoritativo em vez de confiar no conteúdo da mensagem. Isso é a mitigação
> de tampering T-01-02 do threat model desta fase.

## ImportJobModel (Mongoat)

Mirror do padrão de [[Favorites]] (`favorite.model.ts`), com uma diferença
central: `ImportJob` é atualizado in-place a cada fronteira de etapa, então o
`allowedMethods` inclui `METHODS.UPDATE` (favorites nunca atualiza um doc
existente).

`documentDefaults` seta `status: "queued"`, `retryCount: 0`, timestamps.

> [!WARNING] Gotcha Mongoat — ordem de import
> `import-job.model.ts` só registra a coleção no Mongoat se for importado via
> `src/modules/index.ts` antes de qualquer chamada a `ImportJobModel.insert`/
> `findById`/`update`. Esquecer essa linha produz o erro "Database not found".
> Ver [[Mongoat gotchas]] na memória do projeto.

## Repository

- `createImportJob(userId, sourceUrl, normalizedUrl, platform)` — insere o doc
  inicial; `status`/`retryCount`/timestamps vêm de `documentDefaults`.
- `getImportJob(jobId)` — `findById` direto (mesmo idioma de
  `recipe.repository.ts#getRecipeById`); retorna `null` se não existir.
- `updateImportJobStatus(jobId, patch)` — `update({ _id: new ObjectId(jobId) }, { $set: { ...patch, updatedAt: new Date() } })`,
  transição atômica de status/campos a cada fronteira de etapa do pipeline.

## Relacionamentos

- Referencia [[Recipes]] indiretamente — o objetivo final do pipeline é criar
  uma receita a partir do `ImportJob` completo (fora do escopo deste plan).
- Usa [[Auth]] (ownership check planejado para `GET /import/:jobId` em plan
  futuro: filtrar por `userId` na query, não comparar depois de buscar).
- Env config relacionada vive em `src/config/env.ts`: blocos `sqs.import*`,
  `groq`, `openaiTranscription`, `import.maxDurationSec`.
