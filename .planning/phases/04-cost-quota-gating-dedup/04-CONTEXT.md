# Phase 4: Cost/Quota Gating & Dedup - Context

**Gathered:** 2026-07-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Tornar o volume de importação **economicamente seguro antes do uso real**: (1) importações duplicadas da mesma URL normalizada são deduplicadas e reusam o resultado existente em vez de reprocessar (CAP-03); (2) a quota diária de importação do free tier é **reservada atomicamente na submissão** (não na conclusão), de modo que retries/duplicatas/submissões concorrentes não gastam além do limite antes de o gate perceber (COST-01); (3) cada job completo tem um custo registrado **por estágio** (download/bandwidth, minutos de ASR, tokens de LLM, embedding) — visível para revisão operacional básica (COST-02); (4) importação básica é grátis dentro da quota, e exceder (ou pedir enriquecimento PRO) é bloqueado com mensagem clara apontando o entitlement PRO existente, reusando os padrões `isProUser()`/`consumeDailyAdaptQuota()` — sem nova lógica de billing (COST-03).

**Fora de escopo:** dedup entre usuários / compartilhar a extração privada de um usuário com outro (Fase 5 — promoção pública); qualquer UI/dashboard de custos (v2); OCR PRO (deferido de fases anteriores); novo motor de billing (reusa Mercado Pago + entitlement já implementados).

</domain>

<decisions>
## Implementation Decisions

### Dedup (CAP-03)
- **D-01:** Dedup é **por-usuário**. Antes de enfileirar, procura uma importação anterior **do mesmo `userId`** para a mesma `normalizedUrl` (Fase 1) que terminou com **sucesso** (status terminal `ready_for_review` ou já confirmada) e reusa o resultado existente em vez de rodar download/transcrição/extração. Respeita a privacidade (imports são privados/owner-scoped, D-14). Dedup **entre usuários** fica pra Fase 5 (só faz sentido quando a receita já é pública/promovida).
- **D-05:** Jobs `failed` **NÃO** deduplicam — reimportar uma URL que falhou antes é um retry legítimo e deve rodar o pipeline de novo.
- **D-06:** Sem TTL / janela de cache v1 — o match é permanente (a receita importada é cidadã de primeira classe; se o usuário quiser reprocessar uma URL já importada com sucesso, isso é um "forçar re-importação" deferido pra v2).

### Quota na submissão (COST-01/03)
- **D-02:** Limite diário **free = 3 importações/dia**, espelhando o `adaptDailyLimitFree=3` já existente (consistência com o resto do app). PRO tem **teto alto anti-abuso** (novo limite dedicado, ex.: 50/dia — valor exato é discricionário). Reserva **atômica na submissão** via uma função no mesmo molde de `consumeDailyAdaptQuota` (upsert `$inc` por `userId+day`), chamada dentro do `POST /import` **antes** de `enqueueImportJob`.
- **D-07:** **Dedup-hit NÃO consome quota** (não há custo de pipeline num reuso). **Falha do job DEVOLVE a quota** (refund — o usuário não perde o dia porque um vídeo estava indisponível ou o pipeline errou). O `$inc` atômico é a garantia anti-corrida: submissões concorrentes/retries não ultrapassam o limite antes do gate perceber (COST-01).

### Telemetria de custo (COST-02)
- **D-03:** Grava **unidades cruas por estágio** (bytes de download, minutos de ASR, tokens de LLM in/out, contagem×dims de embedding) **e** o **custo estimado em centavos** derivado via uma **tabela de preço por unidade**, no `ImportJob.costCents` (expandir o shape atual `{download,transcription,total}`). Destino: o doc do ImportJob + **logs estruturados** para revisão operacional. **Sem UI/endpoint admin v1.**
- **D-08:** A tabela de preço (Groq/OpenAI ASR, Anthropic LLM, Voyage embedding, egress de download) fica em **config** (fácil de atualizar quando os preços mudam) — os valores concretos o research levanta. Nunca logar payloads/transcript completos (disciplina de CONCERNS.md); só as métricas agregadas.

### UX ao exceder a quota (COST-03)
- **D-04:** Ao exceder o free, **bloqueia no submit** (antes de enfileirar) com mensagem de **limite diário + upsell PRO** ("você atingiu seu limite grátis de N/dia — volte amanhã ou assine o PRO"), **reusando exatamente o gate/response do adapt** (`isProUser` + a quota → resposta de bloqueio, ver `recipe.routes.ts` linha ~199). Mesmo status/shape que o adapt usa; o frontend reusa o messaging PRO existente. Nenhuma UI nova é criada nesta fase.

### Claude's Discretion
- O **shape exato do retorno de um dedup-hit** (ex.: 200 com `{ recipeId, deduped: true }` sem criar job novo, vs. um job novo apontando ao mesmo recipe) — planner decide; o simples/barato é responder com o recipeId existente sem enfileirar.
- O **status HTTP exato** do bloqueio de quota — espelhar o que o adapt/search já retorna (403/402 + mensagem PRO), não inventar um novo.
- **Onde** a quota é decrementada/refundada em caso de falha (no `failJob` do pipeline? num hook de status terminal?) — planner decide o ponto mais seguro/atômico.
- Valores concretos: `IMPORT_DAILY_LIMIT_PRO`, a tabela de preço por unidade — via env/config, valores levantados no research.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Projeto / fase
- `.planning/ROADMAP.md` §Phase 4 — goal + success criteria (CAP-03, COST-01..03)
- `.planning/REQUIREMENTS.md` — CAP-03, COST-01, COST-02, COST-03
- `.planning/PROJECT.md` — decisões de monetização (Mercado Pago; grátis com limite; OCR no PRO)

### Scaffolding da Fase 1 a preencher
- `src/modules/import/import-job.types.ts` — `normalizedUrl` (dedup) e `costCents?: {download,transcription,total}` (telemetria) já existem como placeholders a expandir
- `src/modules/import/import-job.model.ts` — validador BSON de `costCents` (expandir junto com o type; **mongoat**: type e BSON são fontes separadas + `setup:db`)
- `src/modules/import/import.service.ts` — `normalizeUrl()` (Fase 1), `createImportJob`, `enqueueImportJob`
- `src/modules/import/import.routes.ts` — `POST /import` é o ponto de inserção de dedup + gate de quota (entre `normalizeUrl` e `enqueueImportJob`)

### Padrão de quota/billing a reusar (COST-01/03)
- `src/modules/usage/usage.repository.ts` — `consumeDailyAdaptQuota(userId, limit)` (upsert `$inc` atômico por `userId+day`) + `getDailyAdaptCount`; molde para `consumeDailyImportQuota`
- `src/modules/usage/usage.model.ts` — modelo do contador diário
- `src/modules/billing/entitlement.repository.ts` — `isProUser(userId)` / `getEntitlement`
- `src/modules/recipes/recipe.routes.ts` §~199-205 — o gate concreto do adapt: `isProUser` → escolhe limite free/pro → `consumeDailyAdaptQuota` → bloqueia; espelhar para import
- `src/config/env.ts` — `adaptDailyLimitFree=3` / `adaptDailyLimitPro=100` (padrão a espelhar; adicionar `IMPORT_DAILY_LIMIT_FREE/PRO`)

### Telemetria de custo (COST-02)
- `src/infra/video/pipeline.ts` — `logOutcome` + as fronteiras de estágio (download/transcrição/extração/keyframe) onde as unidades cruas são medidas e o `costCents` é populado
- `src/infra/video/groq.transcriber.ts`, `src/modules/import/import.extraction.ts` (tokens LLM, `max_tokens`) — pontos onde ASR-min e tokens são conhecidos

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `normalizeUrl()` + `ImportJob.normalizedUrl`: dedup key já pronta (Fase 1) — dedup é um `findOne({ userId, normalizedUrl, status∈{ready_for_review, confirmada} })` antes de enfileirar.
- `consumeDailyAdaptQuota(userId, limit)`: upsert `$inc` atômico por dia — copiar como `consumeDailyImportQuota` (mesma coleção-padrão de usage, chave diferente).
- `isProUser(userId)` + o gate do adapt (`recipe.routes.ts`): o fluxo free/PRO + resposta de bloqueio já existe — espelhar no `POST /import`.
- `ImportJob.costCents?`: campo já existe; expandir o shape e popular no pipeline.

### Established Patterns
- Gate de quota: `const pro = await isProUser(userId); const limit = pro ? limitPro : limitFree; const quota = await consumeDailyAdaptQuota(userId, limit); if (!quota.allowed) return <bloqueio PRO>` — padrão canônico do app.
- **mongoat**: expandir `costCents` exige atualizar type + BSON validator + `setup:db` (mesma armadilha das Fases 2/3).
- Pipeline escreve status/telemetria a cada fronteira de estágio (`updateImportJobStatus`).

### Integration Points
- `POST /import` (`import.routes.ts`): inserir **(a)** dedup lookup e **(b)** `consumeDailyImportQuota` gate entre `normalizeUrl(url)` e `createImportJob/enqueueImportJob`. Ordem sugerida: dedup primeiro (reuso não consome quota) → depois quota → depois cria/enfileira.
- `pipeline.ts`: gravar unidades cruas + centavos estimados em `costCents` nas fronteiras de estágio; refundar a quota no caminho de falha (`failJob`).

</code_context>

<specifics>
## Specific Ideas

- A quota de import espelha 1:1 a de adapt (3/dia free) — o usuário já entende esse limite no app, então a mensagem de bloqueio deve ter o mesmo tom/CTA do gate existente.
- Telemetria é para "revisão operacional básica" (logs + campo no doc), não um produto — resista a construir dashboard nesta fase.

</specifics>

<deferred>
## Deferred Ideas

- **Dedup entre usuários / compartilhar extração** — Fase 5 (promoção pública; só quando a receita vira pública).
- **TTL / "forçar re-importação"** de uma URL já importada com sucesso — v2.
- **UI/dashboard de custos** (telemetria como produto) — v2.
- **OCR (PRO)** e enriquecimentos PRO adicionais — deferidos de fases anteriores; esta fase só deixa o gancho de gating pronto.

</deferred>

---

*Phase: 4-Cost/Quota Gating & Dedup*
*Context gathered: 2026-07-02*
