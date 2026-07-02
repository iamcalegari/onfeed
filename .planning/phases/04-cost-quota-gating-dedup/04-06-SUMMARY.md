---
phase: 04-cost-quota-gating-dedup
plan: 06
subsystem: infra
tags: [import-pipeline, cost-telemetry, quota, anthropic-sdk, mongoat]

requires:
  - phase: 04-cost-quota-gating-dedup
    provides: "refundDailyImportQuota/consumeDailyImportQuota (04-01), costCents shape nested por-estágio (04-02), env.import price table (04-03)"
provides:
  - "Telemetria de custo por-estágio (bytes/minutos/tokens + centavos) gravada em ImportJob.costCents nas fronteiras de download/transcrição/extração"
  - "Log agregado-só-números '[pipeline] cost' por job bem-sucedido, nunca payload/transcript"
  - "Refund de cota único e correto (chaveado por job.insertedAt) dentro de failJob"
  - "extractImportedRecipe expõe usage de tokens LLM ({ recipe, usage })"
affects: [04-cost-quota-gating-dedup, billing, observability]

tech-stack:
  added: []
  patterns:
    - "Helpers puros de conversão unidade→centavos (downloadBytesToCents/asrMinutesToCents/llmTokensToCents) lendo sempre env.import, nunca constante inline"
    - "Refund de recurso reservado vive SÓ no writer único do status terminal (failJob), nunca em lógica per-attempt — mesmo padrão que TERMINAL_STATUSES no worker garante idempotência"

key-files:
  created: []
  modified:
    - src/modules/import/import.extraction.ts
    - src/infra/video/pipeline.ts
    - src/workers/import-worker.test.ts
    - src/modules/import/import.extraction.test.ts
    - src/infra/video/README.md

key-decisions:
  - "extractImportedRecipe muda de retorno plano (ExtractedImportedRecipe) para { recipe, usage } — único caller (pipeline.ts) atualizado no mesmo plano"
  - "stat() roda sobre downloadResult.videoPath (retornado pelo downloader), não sobre o videoPath local construído pelo pipeline — o mock de teste só escreve/aponta para o primeiro"
  - "Custo de embedding fica omitido (undefined) nesta versão — persistExtractedRecipe não expõe tokens de embedding de volta ao pipeline; não se re-deriva por heurística nem se loga o payload"
  - "refundDailyImportQuota chamado uma única vez, dentro de failJob, logo após o write de status:failed, chaveado por job.insertedAt (dia reservado) — nunca new Date()"

patterns-established:
  - "Preço-por-unidade sempre lido de env.import.priceCents* — nunca hardcoded no pipeline (D-08)"
  - "Log de custo agregado-só-números, mesma disciplina de logOutcome — nunca payload/transcript/legenda"

requirements-completed: [COST-01, COST-02]

coverage:
  - id: D1
    description: "Cada estágio do pipeline (download, transcrição, extração) grava unidades brutas + centavos estimados em ImportJob.costCents, derivados da tabela de preço de env.import"
    requirement: "COST-02"
    verification:
      - kind: unit
        ref: "npm run typecheck (pipeline.ts compila com o novo shape)"
        status: pass
      - kind: other
        ref: "grep -c env.import.priceCents src/infra/video/pipeline.ts >= 3 (obteve 5)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Log estruturado '[pipeline] cost' emitido por job bem-sucedido, carregando só números agregados (bytes/minutos/tokens/centavos), nunca transcript/caption/payload"
    requirement: "COST-02"
    verification:
      - kind: other
        ref: "grep -c '\\[pipeline\\] cost' src/infra/video/pipeline.ts == 1; revisão manual do JSON.stringify — só campos numéricos"
        status: pass
    human_judgment: false
  - id: D3
    description: "failJob() refunda a cota reservada exatamente uma vez, chaveada por job.insertedAt, sem double-refund em redelivery SQS de um job já failed"
    requirement: "COST-01"
    verification:
      - kind: unit
        ref: "src/workers/import-worker.test.ts#failJob — refund da cota reservada (COST-01/D-07) (3 testes: refund único, no double-refund em redelivery, chave por insertedAt não new Date())"
        status: pass
    human_judgment: false
  - id: D4
    description: "extractImportedRecipe expõe uso de tokens LLM (inputTokens/outputTokens) sem chamada extra de metering, preservando o guard de parsed_output"
    requirement: "COST-02"
    verification:
      - kind: unit
        ref: "src/modules/import/import.extraction.test.ts#extractImportedRecipe > returns parsed_output plus LLM token usage when the LLM call succeeds"
        status: pass
    human_judgment: false
  - id: D5
    description: "README de infra/video documenta telemetria de custo e refund único em estilo Obsidian, pt-BR"
    verification:
      - kind: other
        ref: "grep -c costCents/failJob src/infra/video/README.md >= 1 (obteve 2/6)"
        status: pass
    human_judgment: false

duration: 45min
completed: 2026-07-02
status: complete
---

# Phase 04 Plan 06: Custo por-estágio + refund de cota único Summary

**Telemetria de custo por-estágio (bytes/ASR-minutos/tokens LLM → centavos via tabela de preço de env.import) gravada em ImportJob.costCents, mais o refund exactly-once da cota diária de import dentro de failJob, chaveado pelo dia da reserva (job.insertedAt).**

## Performance

- **Duration:** ~45min
- **Started:** 2026-07-02T13:15:00Z (aprox.)
- **Completed:** 2026-07-02T13:58:56Z
- **Tasks:** 4/4
- **Files modified:** 5

## Accomplishments
- `extractImportedRecipe` agora retorna `{ recipe, usage }`, expondo `inputTokens`/`outputTokens` de `res.usage.input_tokens/output_tokens` (Anthropic Messages API) sem chamada extra ao LLM.
- `pipeline.ts` acumula `costCents.download` (bytes via `stat()` no arquivo baixado), `costCents.transcription` (minutos de ASR, `0` quando `noSpeechDetected`), `costCents.extraction` (tokens in/out), todos convertidos em centavos por helpers puros que leem `env.import.priceCents*` — nunca constante hardcoded (D-08). `totalCents` soma os estágios conhecidos; persistido no write de sucesso `ready_for_review`.
- Uma linha `[pipeline] cost` agregada-só-números é logada por job bem-sucedido (bytes, ASR minutes, tokens LLM, total de centavos) — nunca transcript/legenda/payload.
- `failJob()` — o único caminho de código que escreve `status: "failed"` — agora chama `refundDailyImportQuota(job.userId, day)` logo após o write, com `day = job.insertedAt` (dia reservado), nunca `new Date()`. O guard `TERMINAL_STATUSES` no-op do worker garante exactly-once mesmo sob redelivery SQS.
- `src/infra/video/README.md` documenta os dois comportamentos novos em estilo Obsidian pt-BR, com aviso explícito de que os preços são estimativas de baixa confiança, não billing-grade.

## Task Commits

Each task was committed atomically:

1. **Task 1: Expose LLM token usage from extractImportedRecipe** - `cd9946f` (feat)
2. **Task 2: Record per-stage cost into costCents + aggregate cost log** - `1909311` (feat)
3. **Task 3: Refund quota once inside failJob (keyed by reserved day) + refund-once test** - `4573792` (feat)
4. **Task 4: Update infra/video README (cost telemetry + refund discipline)** - `091b6a3` (docs)

_Nota TDD (Task 3, `tdd="true"`): o plano prescreveu explicitamente "implementar o refund em failJob, DEPOIS estender import-worker.test.ts" — uma extensão de suite existente, não um ciclo RED→GREEN clássico com commits `test(...)`/`feat(...)` separados. Ambas as mudanças (implementação + teste) foram feitas e verificadas juntas antes do commit único da Task 3, conforme a ordem literal do `<action>` do plano._

## Files Created/Modified
- `src/modules/import/import.extraction.ts` - `extractImportedRecipe` retorna `{ recipe, usage: { inputTokens, outputTokens } }` em vez do recipe plano; guard de `parsed_output` preservado
- `src/infra/video/pipeline.ts` - helpers puros `downloadBytesToCents`/`asrMinutesToCents`/`llmTokensToCents`; acumulador `costCents` por-job; `stat()` sobre `downloadResult.videoPath`; log `[pipeline] cost`; import de `refundDailyImportQuota`; chamada de refund dentro de `failJob`
- `src/workers/import-worker.test.ts` - mock de `usage.repository.js`; fixture `extractionResultFixture()` (novo shape); `FAKE_VIDEO_PATH` real em disco (necessário porque `stat()` agora roda de fato); nova suite `failJob — refund da cota reservada (COST-01/D-07)` com 3 testes
- `src/modules/import/import.extraction.test.ts` - teste de sucesso atualizado para o novo shape `{ recipe, usage }`, mockando `usage.input_tokens/output_tokens`
- `src/infra/video/README.md` - dois callouts novos (telemetria de custo por-estágio; refund único em `failJob`), tabela de arquivos atualizada, frontmatter `updated`/`tags`

## Decisions Made
- **`stat()` sobre `downloadResult.videoPath`, não sobre o `videoPath` local:** o pipeline constrói `videoPath = path.join(jobDir, "video.mp4")` como destino de escrita, mas passa esse valor a `downloadVideo()`, que retorna seu próprio `videoPath` no resultado (em produção, o mesmo valor; em teste, o mock pode apontar para outro path). Medir bytes sobre `downloadResult.videoPath` é semanticamente correto e consistente com o resto do pipeline (`extractAudio(downloadResult.videoPath, ...)`).
- **Custo de embedding omitido nesta versão:** `persistExtractedRecipe` não expõe tokens/dims de embedding de volta ao pipeline nesta fase; em vez de re-derivar por heurística (ex.: contar caracteres do texto) ou logar o payload para inferir, o campo fica `undefined`/ausente em `costCents.embedding`, e `totalCents` soma só os estágios conhecidos (`?? 0` em cada termo).
- **Refund vive só em `failJob`:** confirmado por grep que `refundDailyImportQuota(` aparece exatamente 1 vez em `pipeline.ts` (dentro de `failJob`), nunca em `processImportJob` diretamente ou em lógica per-attempt — evita double-refund sob redelivery SQS at-least-once.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Testes existentes de `import-worker.test.ts` quebravam com `stat()` real após a Task 2**
- **Found during:** Task 2 (verificação pós-implementação)
- **Issue:** Todos os 9 mocks de `downloadVideo.mockResolvedValue({ videoPath: "/tmp/fake/video.mp4", ... })` apontavam para um arquivo que nunca existia em disco; a nova chamada `stat(downloadResult.videoPath)` lançava `ENOENT` em todo teste que atingia o estágio de download bem-sucedido.
- **Fix:** Introduzida constante `FAKE_VIDEO_PATH` apontando para um arquivo real criado em `beforeAll` (`mkdir` + `writeFile` em `tmpdir()`), substituindo os 9 usos do path fake string. Também criada a fixture `extractionResultFixture()` envolvendo `extractedFixture()` no novo shape `{ recipe, usage }` esperado pelo pipeline pós-Task 1, substituindo os 4 usos de `extractImportedRecipe.mockReset().mockResolvedValue(extractedFixture())`.
- **Files modified:** src/workers/import-worker.test.ts
- **Verification:** `npm run test -- src/workers/import-worker.test.ts` — 18/18 passando após o fix (antes: 9 falhas)
- **Committed in:** `1909311` (Task 2 commit)

**2. [Rule 3 - Blocking] `import.extraction.test.ts` (fora de `files_modified` do plano) quebrava com o novo shape de retorno**
- **Found during:** Task 3 (execução de `npm run test` completo, não só a suite do worker)
- **Issue:** `src/modules/import/import.extraction.test.ts` tinha um teste `"returns parsed_output when the LLM call succeeds"` que mockava `parse()` sem `usage`, e asseria `result` igual ao fixture plano — ambos quebrados pela mudança de assinatura da Task 1 (`res.usage.input_tokens` lançava `TypeError` sobre `undefined`, e a asserção `toEqual(fixture)` não bateria mais com o novo shape mesmo se não lançasse).
- **Fix:** Mock de `parse()` estendido com `usage: { input_tokens, output_tokens }`; asserção trocada para `result.recipe`/`result.usage` no novo shape.
- **Files modified:** src/modules/import/import.extraction.test.ts
- **Verification:** `npm run test -- src/modules/import/import.extraction.test.ts` — 10/10 passando; `npm run test` completo (todas as 156 specs do projeto) — 156/156 passando
- **Committed in:** `4573792` (Task 3 commit — agrupado com o restante do fix de teste bloqueante da mesma verificação `npm run test`)

---

**Total deviations:** 2 auto-fixed (ambos Rule 3 — blocking fixes em suites de teste diretamente quebradas pelas mudanças de assinatura das Tasks 1/2, fora do `files_modified` original do plano mas causalmente ligadas a ele)
**Impact on plan:** Nenhum scope creep — ambos os fixes eram necessários para o `npm run test` (verificação explícita do plano) passar. Nenhuma lógica de produção adicional foi introduzida além do que o plano pediu.

## Issues Encountered
Nenhum além dos dois blocking fixes documentados acima em "Deviations from Plan".

## User Setup Required
None - no external service configuration required. (Os valores de `env.import.priceCents*` já existem com defaults desde o Plano 03; um humano deve revisar o preço de input LLM antes do lançamento — ver aviso já presente em `env.ts`, não uma pendência desta plan.)

## Next Phase Readiness
- COST-01 e COST-02 completos: gate de cota (Plano 05), refund em falha (este plano) e telemetria de custo por-estágio (este plano) estão todos implementados e testados.
- Escrita real de `costCents` em produção depende do `setup:db` pendente do Plano 02 (expansão de schema/índice) — não bloqueia esta plan (testes aqui são mockados), mas é pré-requisito operacional antes do deploy da Fase 4 completa.
- Nenhum bloqueio para as próximas plans da fase.

---
*Phase: 04-cost-quota-gating-dedup*
*Completed: 2026-07-02*

## Self-Check: PASSED

Todos os arquivos citados (`import.extraction.ts`, `pipeline.ts`, `import-worker.test.ts`, `import.extraction.test.ts`, `README.md`, este SUMMARY) confirmados em disco. Todos os 4 commits de task (`cd9946f`, `1909311`, `4573792`, `091b6a3`) confirmados em `git log`.
