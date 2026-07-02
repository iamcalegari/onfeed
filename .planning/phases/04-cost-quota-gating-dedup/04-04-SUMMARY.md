---
phase: 04-cost-quota-gating-dedup
plan: 04
subsystem: api
tags: [mongodb, mongoat, idor, dedup, import-pipeline, repository-pattern]

# Dependency graph
requires:
  - phase: 04-cost-quota-gating-dedup
    provides: "índice composto dedup_lookup {userId, normalizedUrl, status} e shape nested costCents (Plano 04-02)"
provides:
  - "findExistingSuccessfulImport(userId, normalizedUrl) — dedup lookup owner-scoped em import-job.repository.ts"
affects: ["04-05 (POST /import gate + dedup-hit 200)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Owner-scoped Mongo filter idiom (userId dobrado na query, nunca fetch-then-compare) reaplicado de getImportJob para o dedup lookup"

key-files:
  created: []
  modified:
    - src/modules/import/import-job.repository.ts
    - src/modules/import/import-job.repository.test.ts
    - src/modules/import/README.md

key-decisions:
  - "findExistingSuccessfulImport casa SOMENTE status ready_for_review — sem filtro de tempo/TTL (D-06), nunca failed (D-05)"
  - "userId é dobrado no filtro Mongo, nunca busca-e-compara em código de aplicação (mitigação IDOR T-04-07, D-01)"

patterns-established:
  - "Toda nova consulta de dedup/ownership neste módulo deve seguir o idiom getImportJob: userId dentro do objeto de filtro passado ao Model, nunca como checagem pós-fetch"

requirements-completed: [CAP-03, COST-02]

coverage:
  - id: D1
    description: "findExistingSuccessfulImport retorna o ImportJob existente (HIT) quando há um ready_for_review do mesmo usuário para o mesmo normalizedUrl, ou null (MISS)"
    requirement: "CAP-03"
    verification:
      - kind: unit
        ref: "src/modules/import/import-job.repository.test.ts#findExistingSuccessfulImport retorna o job existente quando há um ready_for_review para o mesmo usuário e normalizedUrl (HIT)"
        status: pass
      - kind: unit
        ref: "src/modules/import/import-job.repository.test.ts#findExistingSuccessfulImport retorna null quando não há import bem-sucedido anterior (MISS)"
        status: pass
    human_judgment: false
  - id: D2
    description: "O filtro Mongo dobra userId, normalizedUrl e status:ready_for_review na própria query — nunca omite userId (IDOR) nem casa status:failed (D-05)"
    requirement: "CAP-03"
    verification:
      - kind: unit
        ref: "src/modules/import/import-job.repository.test.ts#findExistingSuccessfulImport escopa o filtro por userId, normalizedUrl e status ready_for_review (guarda de IDOR / D-01, D-05)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Leitura do shape nested costCents (download.cents, extraction.inputTokens, totalCents) via optional chaining, ausente ou presente, sem lançar"
    requirement: "COST-02"
    verification:
      - kind: unit
        ref: "src/modules/import/import-job.repository.test.ts#findExistingSuccessfulImport lê o shape nested costCents com optional chaining sem lançar quando ausente"
        status: pass
      - kind: unit
        ref: "src/modules/import/import-job.repository.test.ts#findExistingSuccessfulImport lê o shape nested costCents (download.cents, extraction.inputTokens, totalCents) quando presente"
        status: pass
    human_judgment: false

duration: 5min
completed: 2026-07-02
status: complete
---

# Phase 04 Plan 04: Dedup Lookup (findExistingSuccessfulImport) Summary

**Lookup de dedup por usuário `findExistingSuccessfulImport(userId, normalizedUrl)` em `import-job.repository.ts`, owner-scoped no próprio filtro Mongo, casando apenas `status: "ready_for_review"` — sem TTL, sem leak entre usuários.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-07-02T13:47:03Z
- **Completed:** 2026-07-02T13:48:43Z
- **Tasks:** 1
- **Files modified:** 3 (repository, test, README)

## Accomplishments
- `findExistingSuccessfulImport(userId, normalizedUrl)` implementada em `import-job.repository.ts`, reaplicando o idiom owner-scoped de `getImportJob(jobId, userId)`: `userId` dobrado no próprio filtro `ImportJobModel.find({ userId, normalizedUrl, status: "ready_for_review" })`, nunca busca-e-compara depois.
- Cobertura de teste TDD completa: HIT (retorna o job existente), MISS (retorna null), asserção explícita de shape do filtro (userId + normalizedUrl + status ready_for_review, e explicitamente NÃO failed), mais dois casos de leitura do shape nested `costCents` (ausente e presente) usando o tipo expandido do Plano 04-02.
- Usa o índice composto `dedup_lookup {userId, normalizedUrl, status}` já criado no Plano 04-02 — nenhuma alteração de índice necessária.
- README do módulo (`src/modules/import/README.md`) atualizado em estilo Obsidian: novo callout `[!INFO]` do Plano 04-04, nova entrada na seção `## Repository`, e a referência ao índice `dedup_lookup` corrigida para apontar ao plano que efetivamente o consome.

## Task Commits

Cada task foi commitada atomicamente (ciclo TDD RED → GREEN):

1. **Task 1 (RED): testes para findExistingSuccessfulImport** - `faad283` (test)
2. **Task 1 (GREEN): implementação de findExistingSuccessfulImport** - `1374560` (feat)
3. **Task 1 (docs): README do módulo import** - `f9d0cf3` (docs)

**Plan metadata:** (aplicado pelo orquestrador — este agente não atualiza STATE.md/ROADMAP.md)

_Nota: task TDD gerou 2 commits de código (test → feat), mais 1 commit de documentação separado._

## Files Created/Modified
- `src/modules/import/import-job.repository.ts` — adiciona `findExistingSuccessfulImport(userId, normalizedUrl)` com doc comment pt-BR explicando D-01/D-05/D-06/T-04-07
- `src/modules/import/import-job.repository.test.ts` — adiciona `find` ao mock de `ImportJobModel`; 5 novos casos de teste (HIT, MISS, filter-shape/IDOR, costCents ausente, costCents presente)
- `src/modules/import/README.md` — novo callout do Plano 04-04, entrada na tabela `## Repository`, correção da referência ao índice `dedup_lookup`

## Decisions Made
- **Casar apenas `ready_for_review`, sem status "confirmed":** confirmado no `import-job.types.ts` que não existe status "confirmed" no state machine — a confirmação do usuário vive em `Recipe.confirmedAt`, ortogonal ao `ImportJob.status`. `ready_for_review` é o único terminal de sucesso (consistente com EXT-05, documentado no README).
- **Sem filtro de tempo/TTL:** implementado literalmente como no plano — a query não tem cláusula de data, então o dedup é permanente (D-06) por design, não por omissão.
- **Teste de filter-shape usa `mockClear()` explícito:** o vitest não reseta mocks automaticamente entre `it()` neste arquivo (sem `vi.config` de `clearMocks`), então a asserção `toHaveBeenCalledTimes(1)` exigiu um `mockClear()` no início do teste correspondente para não acumular chamadas dos testes anteriores que reusam o mesmo `ImportJobModel.find`.

## Deviations from Plan

**1. [Rule 1 - Bug] `toHaveBeenCalledTimes(1)` falhava por acúmulo de chamadas entre testes**
- **Found during:** Task 1 (execução dos testes recém-escritos)
- **Issue:** O mock `ImportJobModel.find` não é limpo entre `it()` blocks (não há `clearMocks: true` na config do vitest deste projeto), então o teste de filter-shape via `toHaveBeenCalledTimes(1)` contava chamadas de testes anteriores (HIT + MISS), falhando com "3 times" em vez de "1 times".
- **Fix:** Adicionado `vi.mocked(ImportJobModel.find).mockClear()` no início do teste de filter-shape, isolando a contagem de chamadas apenas à própria asserção.
- **Files modified:** `src/modules/import/import-job.repository.test.ts`
- **Verification:** `npm run test -- src/modules/import/import-job.repository.test.ts` — 9/9 testes verdes.
- **Committed in:** `1374560` (parte do commit GREEN da Task 1, corrigido durante o ciclo TDD antes de estabilizar)

---

**Total deviations:** 1 auto-fixed (1 bug de teste)
**Impact on plan:** Correção local ao arquivo de teste, sem mudança de escopo ou comportamento do código de produção. Nenhum impacto na cobertura ou nos critérios de aceitação do plano.

## Issues Encountered
None além do já documentado em Deviations.

## User Setup Required
None — não há configuração de serviço externo neste plano (o índice `dedup_lookup` já foi criado no Plano 04-02).

## Next Phase Readiness
- `findExistingSuccessfulImport` está pronta para ser consumida por `POST /import` no Plano 04-05, como o primeiro guard antes do gate de quota (conforme `key_links` do plano).
- Nenhum bloqueio identificado. `npm run typecheck` limpo; suíte de testes do repositório 9/9 verde.

---
*Phase: 04-cost-quota-gating-dedup*
*Completed: 2026-07-02*

## Self-Check: PASSED

All created/modified files verified present on disk; all task commit hashes (`faad283`, `1374560`, `f9d0cf3`) verified present in git log.
