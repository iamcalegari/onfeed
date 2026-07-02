---
tags: [backend, module, video-pipeline, import, ssrf, idor, llm-extraction, confidence-gate, confirm-gate, cost-telemetry, dedup, citizenship]
updated: 2026-07-02
---

> [!INFO] Fase 5 (Publish, Promotion & Full Citizenship) — Plano 06 (citizenship regression + doc)
> Fecha o loop de cidadania plena (RCP-01..04): testes de regressão em
> `recipe.citizenship.test.ts` ([[Recipes]]) provam — em vez de reconstruir —
> que uma receita importada adapta, entra na lista de compras e roda no modo
> cozinha exatamente como qualquer outra, e que SOC-01 (nasce privada) e
> SOC-05 (créditos sobrevivem à promoção) valem contra o código real. Ver
> §Cidadania plena (Fase 5) abaixo para o detalhe e o aviso de "não
> reintroduza source:'imported' nesses caminhos".

> [!INFO] Fase 4 (Cost/Quota/Gating/Dedup) — Plano 04-05 (guards de dedup + cota em POST /import)
> `POST /import` ganha dois guards novos, na ORDEM ESTRITA de D-07:
> `detectPlatform` (SSRF, inalterado, continua o PRIMEIRO gate) →
> `normalizeUrl` → **dedup lookup** (`findExistingSuccessfulImport(userId,
> normalizedUrl)`; HIT → `200 { recipeId, deduped: true }`, SEM enfileirar,
> SEM consumir cota) → **gate de cota** (`isProUser` → escolhe
> `env.import.dailyLimitFree/Pro` → `consumeDailyImportQuota`; se
> `!allowed` → `reply.tooManyRequests` espelhando VERBATIM o gate de adapt
> em `recipe.routes.ts`, D-04) → `createImportJob` + `enqueueImportJob` →
> `202 { jobId }` (cauda inalterada). Um HIT de dedup nunca reserva vaga de
> cota nem gera job novo — reaproveita o import bem-sucedido anterior do
> mesmo usuário. No frontend, `PasteLinkButton` (via `startImportAction` →
> `startImport`) faz o branch nessa união discriminada: `{ deduped, recipeId
> }` roteia pra `/recipe/[recipeId]` existente (reuso de rota, zero UI
> nova); `{ jobId }` mantém o fluxo de progresso já existente. O 429 de cota
> excedida propaga como erro capturado pelo `catch` de `startImportAction`
> — a mensagem de upsell PRO do backend chega ao usuário sem componente
> novo. Cobertura em `import.routes.dedup.test.ts` (HIT/MISS, IDOR-safe) e
> `import.routes.quota.test.ts` (reserve-at-submission, bloqueio free com
> upsell PRO, bloqueio PRO genérico, dedup HIT não consome cota).

> [!INFO] Fase 4 (Cost/Quota/Gating/Dedup) — Plano 04-04 (findExistingSuccessfulImport)
> Implementa `findExistingSuccessfulImport(userId, normalizedUrl)` em
> `import-job.repository.ts` — a consulta de dedup exigida por CAP-03. Segue
> o mesmo idiom `getImportJob(jobId, userId)`: `userId` é dobrado no próprio
> filtro Mongo (`{ userId, normalizedUrl, status: "ready_for_review" }`),
> nunca busca-e-compara depois (T-04-07, D-01). Casa SOMENTE
> `status: "ready_for_review"` — um job `failed` nunca deduplica (D-05,
> retry legítimo). Sem filtro de tempo/TTL — o match é permanente (D-06).
> Consome o índice `dedup_lookup {userId, normalizedUrl, status}` criado no
> Plano 04-02. `POST /import` (Plano 04-05) vai chamar essa função como o
> primeiro guard, antes do gate de quota.

> [!INFO] Fase 4 (Cost/Quota/Gating/Dedup) — Plano 04-02 (schema costCents + dedup_lookup)
> Expande `ImportJob.costCents` do shape flat-placeholder da Fase 1
> (`{download,transcription,total}: number`) para o shape nested por estágio
> exigido por COST-02: `download{bytes,cents}`, `transcription{minutes,cents}`,
> `extraction{inputTokens,outputTokens,cents}`, `embedding{tokens,cents}`,
> `totalCents`. Mudado em UM commit no TS (`import-job.types.ts`) e no
> validator BSON (`import-job.model.ts`) — as duas fontes de verdade do
> mongoat, cuja divergência já quebrou o UAT nas Fases 2/3. `costCents`
> continua totalmente opcional (nunca em `required`); todo consumidor futuro
> (Plano 06) DEVE ler via optional chaining, já que docs anteriores à Fase 4
> têm o shape antigo ou nenhum. Também adiciona o índice composto
> `dedup_lookup {userId, normalizedUrl, status}` que o Plano 04 (dedup lookup)
> vai consultar. **Nota:** `npm run setup:db` (sync do validator + índice no
> Atlas live) é um gate humano deste plano — ver `04-02-SUMMARY.md`.

> [!INFO] Fase 3 (Capture/Review UI) — Plano 03-01 (backend confirm/edit)
> Adiciona o gate de confirmação explícita (REV-04): `Recipe.confirmedAt`
> (BSON + TS), `confirmImportedRecipe` (`import.service.ts`),
> `PATCH /import/:jobId/recipe` e `GET /import/mine` (`import.routes.ts`).
> Até agora a API só sabia enfileirar (`POST /import`) e sondar
> (`GET /import/:jobId`) — não havia caminho HTTP para persistir edições do
> usuário, sair de "aguardando revisão" ou listar imports. Ver §Confirmação
> (Plano 03-01) abaixo. **Nota:** `npm run setup:db` (sync do validator
> `confirmedAt` no Atlas live) é um gate humano deste plano — ver
> `03-01-SUMMARY.md`.

> [!WARNING] Fix — Plano 03-05: `createdBy` faltava em receitas importadas
> `mapExtractedToRecipe` nunca setava `options.createdBy`, então o `$or` de
> visibilidade que `hybridSearch({ ownerId })` monta (`{ visibility:
> "private", "createdBy.userId": ownerId }`) nunca autorizava o dono de um
> import — `GET /import/mine` (via `listMyImportedRecipes`) sempre voltava
> vazio, mesmo com jobs `ready_for_review`/confirmados. Corrigido setando
> `createdBy: [{ userId: job.userId, username: job.userId }]` no mapeamento
> (`username` repete o `userId` como placeholder — não há lookup de perfil
> Clerk neste contexto, e o campo nunca é exibido para `source: "imported"`,
> só para `source: "variant"` no frontend). Descoberto executando o Plano
> 03-05 (frontend `/import/mine`), corrigido no módulo backend correspondente.

> [!WARNING] Fix — UAT Fase 3: `GET /import/mine` dava 500 no Atlas
> `listMyImportedRecipes` reusava `hybridSearch({ queryVector: [] })` — mas
> "Minhas importações" é LISTAGEM, não busca semântica. O Atlas rejeita um
> `$vectorSearch` com vetor vazio: _"vector field is indexed with 1024
> dimensions but queried with 0"_. Além disso, o composto antigo somava
> `DEFAULT_SEARCH_SOURCES`, o que despejaria o catálogo público. Corrigido:
> `listMyImportedRecipes` agora delega a `listImportedRecipesByOwner` ([[Recipes]])
> — um `findMany` puro filtrado por `source:"imported"` + `createdBy.userId`,
> ordenado por `insertedAt` desc, **sem** `$vectorSearch`. Owner-scoped por
> construção. Regressão travada em `recipe.repository.test.ts` (assert
> `aggregate` nunca chamado). Descoberto no UAT ao vivo — os testes mockados
> não exercem o `$vectorSearch` real.

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

> [!WARNING] Fix jul/2026 — link curto `vt.tiktok.com` rejeitado como inválido
> O app do TikTok no Brasil gera links de compartilhamento
> `https://vt.tiktok.com/...`, mas a allowlist só aceitava `vm.tiktok.com` —
> o import recusava o link em 4 lugares ao mesmo tempo (backend + 3 cópias do
> regex no front). Corrigido: `PLATFORM_PATTERNS` aceita `vm.`/`vt.`/`m.`
> (todos domínios TikTok-owned, allowlist continua estrita — testes cobrem
> lookalikes `vt-tiktok.com`/`vt.tiktok.com.evil.com`), e o regex do front
> foi consolidado em `web/lib/video-url.ts` (`isLikelyVideoUrl`) — fonte
> única, sem drift entre cópias. Limitação conhecida: o link curto redireciona
> para a URL canônica `www.tiktok.com/@user/video/…`, então o dedup por
> `normalizedUrl` trata curto vs. completo do mesmo vídeo como URLs distintas.

## Arquivos

| Arquivo | Responsabilidade |
|---|---|
| `import-job.types.ts` | `ImportJobStatus`, `ImportFailureReason`, `ImportJob`, `ImportJobMessage` |
| `import-job.model.ts` | Schema Mongoat: coleção `import_jobs`, índices em `status`/`userId`/`dedup_lookup` (Fase 4, Plano 04-02) |
| `import-job.repository.ts` | `createImportJob`, `getImportJob` (opcionalmente escopado por `userId`), `updateImportJobStatus` |
| `import-job.repository.test.ts` | Testes unitários do repositório (`ImportJobModel` mockado) |
| `import-job.model.test.ts` | Fase 4 (Plano 04-02): guarda de shape para `costCents` nested — shape completo é atribuível a `ImportJob`; ausência (docs pré-Fase-4) lê `undefined` via optional chaining sem lançar |
| `import.service.ts` | `detectPlatform` (fronteira SSRF), `normalizeUrl`, `enqueueImportJob`, `listMyImportedRecipes` (D-09 — delega a `listImportedRecipesByOwner`, filtro puro owner-scoped; **não** hybridSearch), `confirmImportedRecipe` (Fase 3, Plano 03-01 — gate de confirmação REV-04) |
| `import.service.test.ts` | Testes unitários (allowlist SSRF, normalização, enqueue, invariante ownerId-sempre-junto-com-'imported' de `listMyImportedRecipes`) |
| `import.routes.ts` | `POST /import`, `GET /import/:jobId`, `PATCH /import/:jobId/recipe`, `GET /import/mine` (rotas exigem [[Auth]]); exporta `ImportRecipeEditSchema`/`ImportRecipeEditPatch` (Fase 3, Plano 03-01) |
| `import.routes.confirm.test.ts` | Fase 3 (Plano 03-01): testes HTTP (`fastify.inject`) do PATCH — confirm applies edits, not ready (409, table-test por status), idempotent (409 no segundo confirm), rejects protected fields (400), owner scope (404) |
| `import.routes.mine.test.ts` | Fase 3 (Plano 03-01): GET /import/mine sempre delega a `listMyImportedRecipes(userId)`, nunca hybridSearch direto |
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
POST   /api/v1/import                  body: { url }
                                        → 202 { jobId }
                                        → 200 { recipeId, deduped: true }     (Fase 4, dedup hit — CAP-03)
                                        → 400 { error: "invalid_url" | "unsupported_platform" }
                                        → 429 tooManyRequests (Fase 4, cota diária excedida — COST-01/03)
GET    /api/v1/import/:jobId           → ImportJob (só se o caller for o dono)
                                        → 404 (job de outro usuário OU inexistente — indistinguível)
PATCH  /api/v1/import/:jobId/recipe    body: ImportRecipeEditSchema (title/intro/ingredients/steps)
                                        → 200 { recipeId }
                                        → 404 (job de outro usuário OU inexistente)
                                        → 409 { error: "job_not_ready_for_review" } (status != ready_for_review)
                                        → 409 { error: "already_confirmed" } (segunda confirmação — idempotente-safe)
                                        → 400 (campo não-editável no body: additionalProperties:false)
GET    /api/v1/import/mine             → RecipeSearchHit[] (só imports do próprio caller)
```

`POST /import` roda `detectPlatform(url)` **antes** de criar qualquer doc ou
enfileirar qualquer mensagem — uma URL rejeitada nunca chega perto do
worker/yt-dlp. Depois de `normalizeUrl`, a Fase 4 (Plano 04-05) insere DOIS
guards na ordem estrita de D-07: **dedup** (`findExistingSuccessfulImport`)
primeiro, **cota** (`consumeDailyImportQuota`) depois — nunca o inverso, e
nenhum dos dois roda antes de `detectPlatform`. Só depois dos dois guards
passarem: cria o `ImportJob` (`status: "queued"`), chama
`enqueueImportJob(job._id)` e responde `202` com o `jobId`.

> [!INFO] detectPlatform é a fronteira de segurança contra SSRF
> `detectPlatform` usa uma allowlist estrita de domínio (só
> `youtube.com`/`youtu.be`, `tiktok.com`/`vm.`/`vt.`/`m.tiktok.com`,
> `instagram.com`) — não uma checagem frouxa de "parece uma URL de vídeo".
> Qualquer URL fora dessas 3 plataformas (IP interno, host arbitrário,
> `file:`/`javascript:`) retorna `null` e é rejeitada com 400 antes do job
> existir. Isso é a mitigação real de SSRF (T-04-01) — o yt-dlp nunca vê
> uma URL que não passou por essa allowlist. Fase 4 (Plano 04-05): `detectPlatform`
> continua sendo o PRIMEIRO gate, sem exceção — os guards de dedup e cota
> só operam sobre a `normalizedUrl` já validada, nunca sobre a URL crua
> (V5).

> [!INFO] Dedup hit (Fase 4, Plano 04-05, CAP-03) — contrato 200, não 202
> Reimportar uma URL que este mesmo usuário já importou com sucesso
> (`ImportJob.status === "ready_for_review"`) NÃO cria um `ImportJob` novo
> nem enfileira nada — retorna direto `200 { recipeId, deduped: true }`
> reaproveitando a receita já existente. É a ÚNICA rota deste módulo que
> responde `200` (não `202`) num "sucesso de submissão": o frontend usa
> exatamente essa distinção (`202` = job novo, vá pro progresso; `200` +
> `deduped` = receita já existe, vá direto pra ela) pra rotear
> `PasteLinkButton` sem introduzir um terceiro status. Um `ImportJob`
> `failed` NUNCA casa o dedup (D-05) — reimportar uma URL que falhou antes é
> um retry legítimo e sempre re-roda o pipeline do zero.

> [!INFO] Gate de cota diária de import (Fase 4, Plano 04-05, COST-01/03)
> Espelha VERBATIM o gate de `POST /recipes/:id/adapt` em `recipe.routes.ts`
> — mesma primitiva (`isProUser` → escolhe o limite do plano →
> `consumeDailyImportQuota`, reserva atômica `$inc` upsert) e mesmo formato
> de resposta (`reply.tooManyRequests`), só trocando a chave de config
> (`env.import.dailyLimitFree/Pro` em vez de `env.anthropic.adaptDailyLimitFree/Pro`)
> e o texto da mensagem. Free vê o upsell PRO; PRO vê a mensagem genérica de
> "tente amanhã" no teto anti-abuso. Nenhum contrato de erro novo foi
> inventado (D-04) — o frontend já sabia renderizar esse 429 pro gate de
> adapt, e reusa a mesma superfície aqui sem UI nova.

> [!TIP] Ownership check escopado na query, não busca-e-compara
> `GET /import/:jobId` chama `getImportJob(jobId, userId)`, que filtra por
> `_id` **e** `userId` na própria query Mongo. Um usuário que não é dono
> recebe o mesmo `404` de "job inexistente" — não há como diferenciar "não
> existe" de "não é seu", o que bloqueia enumeração de jobId (IDOR, T-04-02).
> Essa rota não tem precedente no restante do código (é superfície de
> ataque nova desta fase) — o check é explícito, não herdado do guard de auth.

## Confirmação / Edição (Fase 3 — Plano 03-01)

`PATCH /import/:jobId/recipe` é o gate de confirmação explícita (REV-04):
nenhuma receita importada sai de "aguardando revisão" (`reviewRequired:
true`) sem um PATCH bem-sucedido do próprio dono do job.

```
PATCH /import/:jobId/recipe
  → getImportJob(jobId, userId)         (mesmo ownership check de GET /import/:jobId)
  → 404 se job === null
  → 409 se job.status !== "ready_for_review"           (Pitfall 3)
  → confirmImportedRecipe(job.recipeId, userId, body)
  → 409 "already_confirmed" se a receita já tinha confirmedAt (idempotente)
  → 200 { recipeId }
```

> [!WARNING] recipeId vem SEMPRE do job, nunca do body
> A rota deriva o id da receita a editar de `job.recipeId` (resolvido pelo
> lookup owner-scoped `getImportJob(jobId, userId)`) — o corpo do PATCH não
> tem (e `ImportRecipeEditSchema` rejeitaria) um campo `recipeId`. Isso
> fecha o mesmo vetor de IDOR de `GET /import/:jobId` (T-03-01): mesmo que
> um atacante adivinhe o id de outra receita, não há como injetá-lo no
> PATCH — só o `jobId` na URL é usado, e esse já é owner-scoped.

> [!INFO] ImportRecipeEditSchema — additionalProperties:false, conteúdo apenas
> Aceita SOMENTE `title`, `intro`, `ingredients[].{name,quantity,unit}`,
> `steps[].text`. `grounding`, `reviewRequired`, `confidenceScore`,
> `canonicalId` e `recipeId` são todos rejeitados com 400 se presentes no
> body (Pitfall 5, T-03-02) — o servidor é o ÚNICO a setar
> `reviewRequired:false` / `confirmedAt`; grounding é proveniência imutável
> da extração LLM e nunca é editável pelo usuário.

> [!TIP] Idempotência — segunda confirmação nunca reaplica dados diferentes
> `confirmImportedRecipe` checa `recipe.confirmedAt` ANTES de escrever. Se já
> setado, retorna `{ alreadyConfirmed: true }` e a rota responde `409
> "already_confirmed"` sem tocar o documento — protege contra um segundo
> PATCH (aba antiga, duplo clique, retry de rede) sobrescrever silenciosamente
> uma edição já confirmada com um payload diferente (Pitfall 3, T-03-04).

> [!WARNING] Edição de ingrediente NÃO re-roda a canonicalização (limitação conhecida)
> `confirmImportedRecipe` preserva `canonicalId`/`core`/`isStaple`/`raw` de
> cada ingrediente existente pelo índice — só `name`/`quantity`/`unit` são
> sobrescritos pelo patch do usuário. Editar um `name` para algo muito
> diferente do original NÃO dispara `resolveCanonicalForIngestion` de novo
> (decisão da Open Question 1 do research: mantém o PATCH síncrono, sem
> chamada Voyage no caminho da request). Isso pode desalinhar
> temporariamente `canonicalId` do `name` editado até uma futura passada de
> reconciliação — a edição de nome NÃO é descoped, só a re-canonicalização
> síncrona é.

`GET /import/mine` é um wrapper fino sobre `listMyImportedRecipes(userId)`
(já existente desde a Fase 2/Plano 02-03) — nunca chama `hybridSearch`
diretamente (D-14, Anti-pattern do research), então herda automaticamente o
invariante "ownerId sempre junto com `'imported'` em sources".

## ImportJobModel (Mongoat)

Mirror do padrão de [[Favorites]] (`favorite.model.ts`), com uma diferença
central: `ImportJob` é atualizado in-place a cada fronteira de etapa, então o
`allowedMethods` inclui `METHODS.UPDATE` (favorites nunca atualiza um doc
existente).

`documentDefaults` seta `status: "queued"` e `retryCount: 0`. Os timestamps
(`insertedAt`/`updatedAt`) são passados EXPLICITAMENTE por `createImportJob`
no repository — nunca via `documentDefaults`.

> [!WARNING] Gotcha Mongoat — `new Date()` em documentDefaults congela no boot
> O Mongoat avalia `documentDefaults` UMA vez, no load do módulo (spread
> estático em `Model.insert`). Um `insertedAt: new Date()` ali carimba TODOS
> os docs com o horário do deploy — foi o que fez jobs criados às 19:06 UTC
> nascerem com `insertedAt` 17:10 UTC (2026-07-02), quebrando o refund de
> cota por-dia (`failJob` chaveia pelo dia de `insertedAt`) e ordenações por
> recência. Os demais models do projeto ainda carregam esse padrão (dívida).

> [!WARNING] Gotcha Mongoat — ordem de import
> `import-job.model.ts` só registra a coleção no Mongoat se for importado via
> `src/modules/index.ts` antes de qualquer chamada a `ImportJobModel.insert`/
> `findById`/`update`. Esquecer essa linha produz o erro "Database not found".
> Ver [[Mongoat gotchas]] na memória do projeto.

### costCents (Fase 4 — Plano 04-02, COST-02)

```ts
costCents?: {
  download?: { bytes?: number; cents?: number };
  transcription?: { minutes?: number; cents?: number };
  extraction?: { inputTokens?: number; outputTokens?: number; cents?: number };
  embedding?: { tokens?: number; cents?: number };
  totalCents?: number;
};
```

> [!WARNING] Gotcha Mongoat — duas fontes de verdade (type TS + validator BSON)
> O tipo `costCents` em `import-job.types.ts` e o bloco `properties.costCents`
> do `$jsonSchema` em `import-job.model.ts` são declarações INDEPENDENTES —
> mudar só uma compila limpo mas quebra em runtime com
> `MongoServerError: Document failed validation` na primeira escrita do shape
> novo. Essa exata classe de bug já derrubou o UAT das Fases 2/3 (ver
> [[Mongoat gotchas]]). Por isso o Plano 04-02 muda as duas no MESMO commit.
> O validator NÃO foi sincronizado no Atlas live automaticamente — isso
> requer `npm run setup:db` rodado manualmente (gate humano, credenciais
> `.env`), documentado em `04-02-SUMMARY.md`.

> [!TIP] costCents é sempre opcional — leia com optional chaining
> Nenhum sub-campo de `costCents` é obrigatório (nem o próprio `costCents`
> está em `required`). Docs anteriores à Fase 4 têm o shape antigo
> (`{download,transcription,total}: number`) ou nenhum `costCents`. O Plano
> 06 (que populará este campo no pipeline) e qualquer leitor futuro DEVEM
> acessar via `job.costCents?.download?.cents` etc. — nunca assumir
> presença. `import-job.model.test.ts` trava esse invariante.

O índice `dedup_lookup {userId, normalizedUrl, status}` (composto, adicionado
junto no Plano 04-02) serve a consulta `findExistingSuccessfulImport` (Plano
04-04) — dedup por usuário na escala de produção, sem full scan de
`import_jobs`.

## Repository

- `createImportJob(userId, sourceUrl, normalizedUrl, platform)` — insere o doc
  inicial; `status`/`retryCount`/timestamps vêm de `documentDefaults`.
- `getImportJob(jobId, userId?)` — sem `userId`, `findById` direto (usado
  internamente/pelo worker). Com `userId`, filtra por `_id` **e** `userId`
  na mesma query (`ImportJobModel.find({ _id, userId })`) — é essa variante
  que `GET /import/:jobId` usa para o ownership check (ver callout acima).
- `findExistingSuccessfulImport(userId, normalizedUrl)` (Fase 4, Plano 04-04)
  — dedup de CAP-03: filtra por `userId` **e** `normalizedUrl` **e**
  `status: "ready_for_review"` na mesma query Mongo (mesmo idiom acima),
  retorna o `ImportJob` existente ou `null`. Nunca casa `status: "failed"`
  (D-05) nem omite `userId` (T-04-07, D-01). Sem TTL — match permanente
  (D-06). Consumida por `POST /import` (Plano 04-05, primeiro guard depois
  de `detectPlatform`/`normalizeUrl`, ANTES do gate de quota).
- `updateImportJobStatus(jobId, patch)` — `update({ _id: new ObjectId(jobId) }, { $set: { ...patch, updatedAt: new Date() } })`,
  transição atômica de status/campos a cada fronteira de etapa do pipeline.

## Relacionamentos

- Referencia [[Recipes]] indiretamente — o objetivo final do pipeline é criar
  uma receita a partir do `ImportJob` completo (fora do escopo deste plan).
- Usa `hybridSearch`/`DEFAULT_SEARCH_SOURCES`/`getRecipeById` de [[Recipes]]
  diretamente via `listMyImportedRecipes` (Plano 02-03) e `confirmImportedRecipe`
  (Plano 03-01) — busca owner-scoped D-14.
- Usa `RecipeModel` (`recipe.model.ts`, [[Recipes]]) diretamente em
  `confirmImportedRecipe` para o `$set` atômico de
  título/intro/ingredients/steps/reviewRequired/confirmedAt (Plano 03-01) —
  mesmo idioma de `setThumbnail`/`setTranslation` em `recipe.repository.ts`.
- Usa [[Auth]] (`requireAuth` em todas as rotas; ownership check adicional em
  `GET /import/:jobId` e `PATCH /import/:jobId/recipe` via
  `getImportJob(jobId, userId)`).
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

## Cidadania plena (Fase 5 — Plano 06)

Fecha o ciclo SOC-01..05 / RCP-01..04: uma receita importada é cidadã de
primeira classe do catálogo, por **reuso direto** dos fluxos existentes —
nunca por um caminho paralelo específico de import.

- **(a) Nasce privada + linkável (SOC-01/SOC-02/D-03/D-04)** —
  `mapExtractedToRecipe` ([[Import]], acima) seta `visibility: "private"` no
  momento da persistência; o `shareSlug` é gerado na MESMA escrita de
  `confirmedAt` por `confirmImportedRecipe` ([[Import]]) — nenhuma ação
  separada de "publicar link". Ver `recipe.citizenship.test.ts` ([[Recipes]])
  para a asserção de que o mapeamento realmente produz `visibility:"private"`
  (verificado, não assumido).
- **(b) Promoção é um flip de visibilidade, nunca de source (SOC-04/SOC-05/D-05/D-09)**
  — `promoteImportToPublic` ([[Recipes]]), disparado por `maybePromote`
  ([[Likes]]) quando o gate de 3 partes passa (likes de terceiros ≥
  threshold, `confidenceScore ≥ promoteConfidence`, `confirmedAt` setado),
  só toca `visibility`/`updatedAt` no `$set` — `source` permanece
  `"imported"` para sempre, então `createdBy[]` (importador) e `sourceMeta`
  (creator externo, `@handle`) sobrevivem estruturalmente à promoção. Nenhum
  crédito é sintetizado nem apagado.
- **(c) RCP-01/02/03 são REUSO DIRETO — adapt/lista de compras/modo cozinha
  não têm código específico de import.** `adaptRecipe` ([[Recipes]]) resolve
  a receita base via `getRecipeById` (idioma trusted, sem filtro de
  visibilidade) e gera um filho `generated_pending` ancorado via
  `parentRecipeId` — o mesmo caminho para uma base `curated` ou `imported`,
  sem NENHUM branch por `source`. Lista de compras e modo cozinha resolvem
  por id de receita da mesma forma, também sem inspecionar `source`.
  `recipe.citizenship.test.ts` ([[Recipes]]) trava essa paridade.

  > [!WARNING] D-11 — NÃO adicione branches por source:"imported" em adapt/lista de compras/modo cozinha
  > Esses três caminhos são deliberadamente source-agnósticos (D-11). Se um
  > editor futuro sentir necessidade de checar `recipe.source === "imported"`
  > dentro de `adaptRecipe`, da rota de lista de compras ou do modo cozinha,
  > isso é um sinal de que algo mais específico deveria viver em
  > `import.recipe-mapping.ts` ou `import.service.ts` — não nesses fluxos
  > compartilhados. Um branch desses quebraria silenciosamente a promessa de
  > "cidadania plena" e não seria pego por testes que assumem reuso.

- **(d) RCP-04 — cidadania na busca/swipe** — `hybridSearch` ([[Recipes]],
  Fase 5 Plano 04) foi ampliada: `DEFAULTS.sources` agora inclui
  `"imported"`, e o guard de visibilidade no `$vectorSearch.filter` é
  incondicional — sem `ownerId`, exclui `visibility:"private"` (só imports
  promovidos aparecem publicamente); com `ownerId`, mantém o `$or`
  owner-scoped já existente (dono vê o próprio import privado). Regressão de
  isolamento (`recipe.repository.search.test.ts`) prova que o import privado
  de um usuário nunca vaza para outro nem para busca pública.
  **Nota de escopo:** o wiring de `ownerId` a partir da rota
  (`search.service.ts`/`search.routes.ts`) para o dono ver seu próprio
  import privado no feed/swipe geral segue fora do escopo — hoje quem
  escopa `ownerId` de fato é `listMyImportedRecipes` ([[Import]], "Minhas
  importações"), não o `searchRecipes` genérico.
