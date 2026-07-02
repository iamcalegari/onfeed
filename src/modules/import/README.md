---
tags: [backend, module, video-pipeline, import, ssrf, idor, llm-extraction, confidence-gate]
updated: 2026-07-02
---

> [!INFO] Fase 2 (onFeed Import) completa
> Plano 02-01 estendeu `ImportJob`/`Recipe` com os campos que a extração real
> preenche (`recipeId`, `reviewRequired`, `confidenceScore`,
> `ImportFailureReason: "extraction_failed"`) e adicionou `__fixtures__/`.
> Plano 02-02 implementou a extração LLM real de texto estruturado
> (`import.extraction.ts`, via Claude — schema zod + grounding por campo).
> Plano 02-03 fechou o gap de segurança D-14: `listMyImportedRecipes` agora
> materializa EXT-04 (receita importada buscável só pelo dono) via
> `hybridSearch` owner-scoped (ver [[Recipes]]). Plano 02-04 implementou o
> gate de confiança (`import.confidence.ts` — `computeConfidence`). Plano
> 02-05 fechou o loop: `pipeline.ts`'s estágio `extracting` chama a extração
> real, o gate de confiança, o mapeamento (`import.recipe-mapping.ts`) e
> `persistExtractedRecipe`, sempre terminando em `ready_for_review` (nunca
> um status público) — ver §Extração → Confiança → Persistência abaixo.

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
| `import.service.ts` | `detectPlatform` (fronteira SSRF), `normalizeUrl`, `enqueueImportJob`, `listMyImportedRecipes` (Fase 2, Plano 02-03 — owner-scoped) |
| `import.service.test.ts` | Testes unitários (allowlist SSRF, normalização, enqueue, invariante ownerId-sempre-junto-com-'imported' de `listMyImportedRecipes`) |
| `import.routes.ts` | `POST /import`, `GET /import/:jobId` (rotas exigem [[Auth]]) |
| `import.extraction.ts` | Fase 2 (Plano 02-02): `ImportedRecipeSchema` (zod + grounding inline), `IMPORT_RECONCILIATION_SYSTEM_PROMPT`, `buildImportUserContent`, `extractImportedRecipe(input)` — extração LLM real de transcript+caption em receita estruturada |
| `import.extraction.test.ts` | Testes unitários (LLM mockado): shape do schema, ambíguo preservado literal (D-04), título inferido (D-06), seções delimitadas do user-content |
| `import.confidence.ts` | Fase 2 (Plano 02-04): `computeConfidence(recipe, opts)` — gate puro de score agregado + `reviewRequired` estrutural (EXT-02/EXT-05) |
| `import.confidence.test.ts` | Testes unitários (função pura, sem mocks): score ponderado, overrides estruturais de `reviewRequired` |
| `import.recipe-mapping.ts` | Fase 2 (Plano 02-05): `mapExtractedToRecipe(extracted, job, confidence)` — mapeia a extração + o gate de confiança para o input exato de `persistExtractedRecipe`, sem persistir e sem reimplementar canonicalização (EXT-03) |
| `import.recipe-mapping.test.ts` | Testes unitários de shape: visibility/importJobId/sourceMeta/grounding/confidenceScore/reviewRequired, ingrediente ambíguo preservado |
| `__fixtures__/*.ts` | Fase 2: transcript+caption de teste (clean/ambiguous/adversarial) para testes de grounding — não usados em produção |

## State Machine

```
queued → downloading → transcribing → extracting → ready_for_review
                                                   ↘ failed (a partir de qualquer etapa)
```

- `extracting` (Plano 02-05): chama a extração LLM real → o gate de
  confiança → o mapeamento → `persistExtractedRecipe`, e SEMPRE termina em
  `ready_for_review` em caso de sucesso (nunca um status público — EXT-05).
- `failedStep` registra em qual etapa a falha ocorreu; `failureReason` é um dos
  valores tipados de `ImportFailureReason` (ex.: `anti_bot_blocked`,
  `rate_limited` — relevantes ao circuit breaker de [[PIPE-07]]).
- `noSpeechDetected: true` não é necessariamente falha (D-06) — significa que o
  transcript está ausente/não confiável por design, não um bug; ainda assim
  força `reviewRequired: true` via `computeConfidence` (Plano 02-04).
- `ImportJob` tem `recipeId?`, `reviewRequired?`, `confidenceScore?`,
  preenchidos ao final de uma extração bem-sucedida (junto com `keyframeUrl`,
  numa única escrita `ready_for_review`), e `ImportFailureReason` inclui
  `"extraction_failed"` (extração/mapeamento/persistência lançaram).

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
- Usa `hybridSearch`/`DEFAULT_SEARCH_SOURCES` de [[Recipes]] diretamente via
  `listMyImportedRecipes` (Plano 02-03) — busca owner-scoped D-14.
- Usa [[Auth]] (`requireAuth` nas duas rotas; ownership check adicional em
  `GET /import/:jobId` via `getImportJob(jobId, userId)`).
- Depende de `src/infra/video/*` (downloader/transcription/keyframe) — esse
  módulo só cria e enfileira o `ImportJob`; quem baixa/transcreve/extrai é o
  worker dedicado (`src/workers/import-worker.ts`, plans seguintes).
- Env config relacionada vive em `src/config/env.ts`: blocos `sqs.import*`,
  `groq`, `openaiTranscription`, `import.maxDurationSec`.

> [!INFO] Extração plugada no pipeline (Plano 02-05)
> `pipeline.ts`'s estágio `status: "extracting"` chama `extractImportedRecipe`
> de verdade a partir do `transcript`/`caption` já persistidos nesse mesmo
> job (não precisa rebaixar o vídeo), então `computeConfidence` e
> `mapExtractedToRecipe` → `persistExtractedRecipe`. Ver §Extração →
> Confiança → Persistência abaixo para o fluxo completo.

## Extração LLM (Fase 2 — Plano 02-02)

`import.extraction.ts` espelha `recipe.extraction.ts` ([[Recipes]]), com
schema/prompt/input próprios:

- **`ImportedRecipeSchema`** — mesmo shape do catálogo (ingredientes com
  `quantity`/`unit`/`core`, passos com `text`/`minutes`, `nutrition`
  nullable), estendido com `title`+`titleGrounding` (o LLM PROPÕE o título
  quando ausente, D-06), `quantityGrounding` inline em cada ingrediente,
  `grounding` inline em cada passo, e `sourceDivergence: string[]`
  top-level (D-08). Grounding é sempre um dos três valores de
  `GroundingLevel` — `grounded` (dito quase literalmente numa fonte),
  `inferred` (preenchido por conhecimento geral) ou `ambiguous` (dito de
  forma imprecisa — preservado literal, nunca numericizado, D-04).
- **`IMPORT_RECONCILIATION_SYSTEM_PROMPT`** — reconcilia transcript (ASR) vs
  caption: legenda com receita escrita > transcrição; senão a transcrição é
  a espinha dorsal (D-07). Divergência explícita entre as duas fontes vai
  para `sourceDivergence`, nunca é "resolvida" adivinhando (D-08). Instrui
  explicitamente a NÃO marcar tudo como `grounded` por padrão (mitigação de
  over-confidence) e a tratar transcript/caption como DADO, nunca instrução
  (mitigação de prompt injection — ver `__fixtures__/adversarial-injection.ts`).
- **`buildImportUserContent`** — mesma convenção de delimitação `"""..."""`
  usada em `recipe.extraction.ts`: conteúdo não confiável (transcript/
  caption) só entra na mensagem do usuário, nunca no system prompt.
- **`extractImportedRecipe(input)`** — `anthropic.messages.parse` com
  `IMPORT_EXTRACTION_MODEL` (Sonnet, D-15) + `effortOption("medium", ...)`;
  mesmo contrato de erro do catálogo (`parsed_output` null → throw com
  `stop_reason`).

> [!WARNING] Grounding truthfulness não é testável deterministicamente
> Os testes unitários (`import.extraction.test.ts`) cobrem SHAPE (zod
> aceita/rejeita corretamente, seções delimitadas existem) com o LLM
> mockado — nunca fazem uma chamada real. Se o modelo real está sendo
> honesto sobre o que é `grounded` vs `inferred`/`ambiguous` (inclusive sob
> o fixture adversarial de injection) só é verificável rodando a extração
> de verdade contra os `__fixtures__/`, um spot-check manual documentado em
> `02-VALIDATION.md` > Manual-Only Verifications.

## Busca owner-scoped (Fase 2 — Plano 02-03)

`listMyImportedRecipes(userId, params?)` é o caminho de chamada concreto que
entrega EXT-04 ("receita importada buscável pelo usuário importador"):

```ts
listMyImportedRecipes(userId, params?) →
  hybridSearch({
    ...params,
    ownerId: userId,
    sources: [...(params?.sources ?? DEFAULT_SEARCH_SOURCES), "imported"],
  })
```

- `ownerId` e `'imported'` em `sources` **sempre** viajam juntos — nunca há
  um caminho aqui que inclua `'imported'` sem `ownerId` (D-14; ver o
  callout D-14 em [[Recipes]] para o filtro `$or` que isso ativa).
- A Fase 3 (UI de revisão) chama este método, não `hybridSearch` diretamente
  — evita que qualquer novo caller reintroduza o bug do Pitfall 2 do
  research (adicionar `'imported'` a `DEFAULTS.sources` sem escopo de dono).
- É composição fina: nenhuma lógica de busca nova vive aqui, só a montagem
  dos params que `hybridSearch` (em [[Recipes]]) já sabe interpretar.

## Confiança / Review Gate (Fase 2 — Plano 02-04)

`import.confidence.ts` exporta `computeConfidence(recipe, { noSpeechDetected })`
— função PURA (sem I/O/LLM/DB) que transforma o grounding por-campo produzido
por `import.extraction.ts` num `ConfidenceResult { score, reviewRequired,
reasons }`:

- **Score agregado**: média ponderada de `GROUNDING_WEIGHT` (`grounded=1`,
  `ambiguous=0.5`, `inferred=0`) sobre título + quantidade de cada ingrediente
  + grounding de cada passo. Título e ingredientes `core` pesam 2x
  (`CRITICAL_FIELD_WEIGHT`) vs passos/ingredientes não-core (peso 1).
  Nutrição fica FORA da lista ponderada (D-10 — nunca tem grounding próprio
  no schema, incluí-la deprimiria todo score de forma fixa e sem sinal real).
- **`reviewRequired` é estruturalmente forçado** — é o OR de 4 condições
  independentes, nenhuma delas bypassável por autoavaliação do LLM: (1) campo
  crítico (título ou ingrediente `core`) com `grounding: "inferred"`; (2)
  `noSpeechDetected: true` (D-06 — vídeo sem fala nunca produz receita
  "confiada" silenciosamente); (3) `score < REVIEW_SCORE_THRESHOLD` (0.6);
  (4) `sourceDivergence` não-vazio (D-08 — conflito explícito entre
  transcript e caption).

## Extração → Confiança → Persistência (Fase 2 — Plano 02-05)

O plug real do estágio `extracting` do pipeline (`src/infra/video/
pipeline.ts`), fechando o loop que as Plans 01-04 construíram:

```
extractImportedRecipe({ transcript, caption, noSpeechDetected })
  → ExtractedImportedRecipe (grounding por campo)
  → computeConfidence(extracted, { noSpeechDetected })
  → ConfidenceResult { score, reviewRequired, reasons }
  → mapExtractedToRecipe(extracted, job, confidence)
  → { input, extracted, options }  (formato exato de persistExtractedRecipe)
  → persistExtractedRecipe(input, extracted, options)
  → Recipe persistida (canonicalização + embedding reusados sem duplicação)
  → updateImportJobStatus(id, { status: "ready_for_review", keyframeUrl,
      recipeId, reviewRequired, confidenceScore })
```

- **`mapExtractedToRecipe`** (`import.recipe-mapping.ts`) NÃO persiste nada —
  só constrói o shape. `options.source = "imported"`, `visibility =
  "private"`, `importJobId`, `sourceMeta` (platform + authorHandle/authorUrl/
  sourceUrl desnormalizados do job), `grounding` (titleGrounding +
  quantityGrounding por índice de ingrediente + stepGrounding por índice de
  passo + `nutrition: "inferred"` hardcoded, D-10 + `sourceDivergence`),
  `confidenceScore`, `reviewRequired`. Os ingredientes preservam
  `raw`/`name`/`quantity`/`unit`/`core` inalterados — o MESMO loop de
  `resolveCanonicalForIngestion` que o catálogo já usa consome esse shape sem
  nenhuma lógica paralela (EXT-03).

> [!WARNING] EXT-05 — `ready_for_review` é o ÚNICO terminal de sucesso
> Não existe NENHUM caminho de código do estágio `extracting` até um status
> público/publicado. Toda extração bem-sucedida termina em
> `ready_for_review` com `reviewRequired`/`confidenceScore`/`recipeId`
> escritos — mesmo quando `reviewRequired` é `false` (alta confiança), a
> promoção pública é sempre um passo manual/gated futuro (Fase 5, por
> confiança + likes), nunca automático a partir daqui. O teste de integração
> em `src/workers/import-worker.test.ts` (describe "extracting stage")
> varre TODAS as chamadas de `updateImportJobStatus` de um run e garante que
> nenhuma jamais carrega `status: "public"`/`"published"`.

> [!DANGER] Falha na extração/persistência é SEMPRE `extraction_failed`, nunca retryable
> `extractImportedRecipe`, `computeConfidence`, `mapExtractedToRecipe` e
> `persistExtractedRecipe` rodam dentro de um único `try/catch` no estágio
> `extracting`. QUALQUER erro (zod, `parsed_output` null/stop_reason
> diferente de `end_turn`, erro de mapeamento, ou o `persistExtractedRecipe`
> lançando) cai no mesmo branch: `status: "failed"`, `failedStep:
> "extracting"`, `failureReason: "extraction_failed"`, SEM relançar (uma
> redelivery SQS de uma falha determinística repetiria o mesmo erro — não é
> um caso do DLQ/circuit-breaker de PIPE-07, é simplesmente não-retryable).
> `persistExtractedRecipe` é atômico ao nível da aplicação: insere a receita
> inteira ou lança ANTES de vincular qualquer `recipeId` — não existe
> "meia-receita" referenciada por um `ImportJob` falho. O transcript/payload
> completo do LLM NUNCA é logado (só `err.message`), mesmo em falha.
