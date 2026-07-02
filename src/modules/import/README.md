---
tags: [backend, module, video-pipeline, import, ssrf, idor]
updated: 2026-07-01
---

> [!INFO] Fase 2 (onFeed Import) em andamento
> Este README ainda descreve o shape da Fase 1 (`extracting` como stub). O
> Plano 02-01 já estendeu `ImportJob`/`Recipe` com os campos que a extração
> real vai preencher (`recipeId`, `reviewRequired`, `confidenceScore`,
> `ImportFailureReason: "extraction_failed"`) e adicionou
> `__fixtures__/` (transcript+caption de teste para grounding) — a extração
> LLM em si (`import.extraction.ts`) e o plug no `pipeline.ts` chegam nos
> planos seguintes da Fase 2.

# Import

Pipeline de import de receita a partir de vídeo (Instagram/TikTok/YouTube). O
`ImportJob` é um documento de state machine — a fonte única da verdade tanto
para progresso quanto para idempotência (PIPE-06).

## Arquivos

| Arquivo | Responsabilidade |
|---|---|
| `import-job.types.ts` | `ImportJobStatus`, `ImportFailureReason`, `ImportJob`, `ImportJobMessage` |
| `import-job.model.ts` | Schema Mongoat: coleção `import_jobs`, índices em `status`/`userId` |
| `import-job.repository.ts` | `createImportJob`, `getImportJob` (opcionalmente escopado por `userId`), `updateImportJobStatus` |
| `import-job.repository.test.ts` | Testes unitários do repositório (`ImportJobModel` mockado) |
| `import.service.ts` | `detectPlatform` (fronteira SSRF), `normalizeUrl`, `enqueueImportJob` |
| `import.service.test.ts` | Testes unitários (allowlist SSRF, normalização, enqueue) |
| `import.routes.ts` | `POST /import`, `GET /import/:jobId` (rotas exigem [[Auth]]) |
| `__fixtures__/*.ts` | Fase 2: transcript+caption de teste (clean/ambiguous/adversarial) para testes de grounding — não usados em produção |

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
- Fase 2 (Plano 02-01): `ImportJob` ganhou `recipeId?`, `reviewRequired?`,
  `confidenceScore?` (preenchidos após a extração real persistir a receita) e
  `ImportFailureReason` ganhou `"extraction_failed"` (LLM não retornou
  `parsed_output`). O plug real ainda não existe — só o shape.

> [!TIP] Idempotência via _id
> A mensagem SQS carrega só `{ jobId }` (o `_id` do Mongo, gerado pelo
> servidor) — nunca o payload completo. O worker sempre relê o documento
> autoritativo em vez de confiar no conteúdo da mensagem. Isso é a mitigação
> de tampering T-01-02 do threat model desta fase.

## Rotas

```
POST   /api/v1/import           body: { url }
                                 → 202 { jobId }
                                 → 400 { error: "invalid_url" | "unsupported_platform" }
GET    /api/v1/import/:jobId    → ImportJob (só se o caller for o dono)
                                 → 404 (job de outro usuário OU inexistente — indistinguível)
```

`POST /import` roda `detectPlatform(url)` **antes** de criar qualquer doc ou
enfileirar qualquer mensagem — uma URL rejeitada nunca chega perto do
worker/yt-dlp. Em caso de sucesso: cria o `ImportJob` (`status: "queued"`),
chama `enqueueImportJob(job._id)` e responde `202` com o `jobId`.

> [!INFO] detectPlatform é a fronteira de segurança contra SSRF
> `detectPlatform` usa uma allowlist estrita de domínio (só
> `youtube.com`/`youtu.be`, `tiktok.com`/`vm.tiktok.com`,
> `instagram.com`) — não uma checagem frouxa de "parece uma URL de vídeo".
> Qualquer URL fora dessas 3 plataformas (IP interno, host arbitrário,
> `file:`/`javascript:`) retorna `null` e é rejeitada com 400 antes do job
> existir. Isso é a mitigação real de SSRF (T-04-01) — o yt-dlp nunca vê
> uma URL que não passou por essa allowlist.

> [!TIP] Ownership check escopado na query, não busca-e-compara
> `GET /import/:jobId` chama `getImportJob(jobId, userId)`, que filtra por
> `_id` **e** `userId` na própria query Mongo. Um usuário que não é dono
> recebe o mesmo `404` de "job inexistente" — não há como diferenciar "não
> existe" de "não é seu", o que bloqueia enumeração de jobId (IDOR, T-04-02).
> Essa rota não tem precedente no restante do código (é superfície de
> ataque nova desta fase) — o check é explícito, não herdado do guard de auth.

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
- `getImportJob(jobId, userId?)` — sem `userId`, `findById` direto (usado
  internamente/pelo worker). Com `userId`, filtra por `_id` **e** `userId`
  na mesma query (`ImportJobModel.find({ _id, userId })`) — é essa variante
  que `GET /import/:jobId` usa para o ownership check (ver callout acima).
- `updateImportJobStatus(jobId, patch)` — `update({ _id: new ObjectId(jobId) }, { $set: { ...patch, updatedAt: new Date() } })`,
  transição atômica de status/campos a cada fronteira de etapa do pipeline.

## Relacionamentos

- Referencia [[Recipes]] indiretamente — o objetivo final do pipeline é criar
  uma receita a partir do `ImportJob` completo (fora do escopo deste plan).
- Usa [[Auth]] (`requireAuth` nas duas rotas; ownership check adicional em
  `GET /import/:jobId` via `getImportJob(jobId, userId)`).
- Depende de `src/infra/video/*` (downloader/transcription/keyframe) — esse
  módulo só cria e enfileira o `ImportJob`; quem baixa/transcreve/extrai é o
  worker dedicado (`src/workers/import-worker.ts`, plans seguintes).
- Env config relacionada vive em `src/config/env.ts`: blocos `sqs.import*`,
  `groq`, `openaiTranscription`, `import.maxDurationSec`.

> [!INFO] Extração estruturada é stub nesta fase
> `status: "extracting"` sempre passa direto para `ready_for_review` — não há
> chamada de LLM aqui. A extração real da receita (ingredientes, passos,
> confidence/grounding) é a Fase 2, que reprocessa a partir do `transcript`
> já persistido, sem precisar rebaixar o vídeo.
