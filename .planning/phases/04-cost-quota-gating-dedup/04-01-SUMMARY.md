---
phase: 04-cost-quota-gating-dedup
plan: 01
subsystem: database
tags: [mongoat, quota, cost-control, race-safety, usage, atomic-counter]

# Dependency graph
requires: []
provides:
  - "ImportUsageModel (dedicated import_usage collection, unique {userId,day} index)"
  - "consumeDailyImportQuota(userId, limit) — atomic per-day reservation"
  - "refundDailyImportQuota(userId, day) — atomic refund keyed by reserved day, no upsert"
affects: [04-cost-quota-gating-dedup (plans 05, 06), import quota gating, cost tracking]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dedicated per-usage-type Mongo collection instead of a discriminator field — zero cross-contamination between adapt and import quotas"
    - "Atomic $inc upsert on a unique {userId, day} index as the race-safety boundary (no Redis, no in-memory counter)"
    - "Refund is a negative $inc with no upsert, keyed by an explicit caller-supplied day (never 'today' blindly)"

key-files:
  created:
    - src/modules/usage/import-usage.model.ts
    - src/modules/usage/usage.repository.test.ts
    - src/modules/usage/README.md
  modified:
    - src/modules/usage/usage.repository.ts
    - src/modules/index.ts

key-decisions:
  - "import_usage é uma coleção Mongo dedicada, não um discriminador em adapt_usage (D-02 / RESEARCH Open Question 2) — zero risco à cota de adapt em produção"
  - "refundDailyImportQuota recebe day explícito (o dia em que a vaga foi reservada), nunca 'hoje' — evita decrementar o contador do dia errado quando a falha é detectada após a virada de dia"
  - "refundDailyImportQuota nunca usa upsert — o doc já existe obrigatoriamente porque o refund só é chamado depois de uma reserva bem-sucedida"

patterns-established:
  - "Cópia 1:1 de consumeDailyAdaptQuota para consumeDailyImportQuota, trocando só o Model alvo — mesma primitiva de atomicidade (Model.update $inc upsert), zero mecanismo de concorrência novo"

requirements-completed: [COST-01, COST-03]

coverage:
  - id: D1
    description: "ImportUsageModel provisiona a coleção dedicada import_usage com índice único {userId, day}"
    requirement: "COST-01"
    verification:
      - kind: unit
        ref: "npm run typecheck (tsc --noEmit) + grep de acceptance criteria (import_usage, user_day_unique, ImportUsageModel presentes; token adapt_usage ausente)"
        status: pass
    human_judgment: false
  - id: D2
    description: "consumeDailyImportQuota reserva atomicamente e retorna allowed:false ao ultrapassar o limite (boundary)"
    requirement: "COST-01"
    verification:
      - kind: unit
        ref: "src/modules/usage/usage.repository.test.ts#usage.repository — consumeDailyImportQuota"
        status: pass
    human_judgment: false
  - id: D3
    description: "refundDailyImportQuota decrementa o contador do dia reservado sem upsert"
    requirement: "COST-03"
    verification:
      - kind: unit
        ref: "src/modules/usage/usage.repository.test.ts#usage.repository — refundDailyImportQuota"
        status: pass
    human_judgment: false
  - id: D4
    description: "README do módulo usage documenta as duas famílias de cota (adapt/import) em estilo Obsidian, pt-BR"
    verification:
      - kind: other
        ref: "test -f src/modules/usage/README.md && grep -c import_usage/consumeDailyImportQuota"
        status: pass
    human_judgment: false

# Metrics
duration: ~4min
completed: 2026-07-02
status: complete
---

# Phase 04 Plan 01: Primitiva de cota diária de import Summary

**Cota diária de import atômica e isolada: ImportUsageModel dedicado (`import_usage`) + `consumeDailyImportQuota`/`refundDailyImportQuota`, espelhando `consumeDailyAdaptQuota` sem tocar a cota de adapt em produção.**

## Performance

- **Duration:** ~4 min (10:33–10:37 BRT)
- **Started:** 2026-07-02T13:33:39Z
- **Completed:** 2026-07-02T13:36:46Z
- **Tasks:** 3
- **Files modified:** 5 (3 criados, 2 modificados)

## Accomplishments
- `ImportUsageModel` criado como espelho estrutural de `AdaptUsageModel`, mas contra uma coleção `import_usage` totalmente separada, com índice único `{userId, day}` (`user_day_unique`) — a fronteira de atomicidade para COST-01.
- `consumeDailyImportQuota(userId, limit)` implementado como cópia 1:1 de `consumeDailyAdaptQuota`, reutilizando a mesma primitiva de upsert atômico `$inc`, agora contra `ImportUsageModel`.
- `refundDailyImportQuota(userId, day)` implementado como a peça genuinamente nova: `$inc: {count: -1}` sem upsert, keyed pelo dia em que a vaga foi reservada (não "hoje").
- Primeira cobertura de teste de `usage.repository.ts` (`usage.repository.test.ts`): boundary do limite, shape do upsert/`$inc`, isolamento por `{userId, day}`, e refund sem upsert.
- README do módulo `usage` criado em estilo Obsidian (pt-BR), documentando as duas famílias de cota e por que são coleções separadas.

## Task Commits

Cada task foi commitada atomicamente:

1. **Task 1: Create the dedicated import_usage model** - `b197a0d` (feat)
2. **Task 2: Add consumeDailyImportQuota + refundDailyImportQuota** - `f4d170a` (feat, inclui os testes RED→GREEN)
3. **Task 3: Update usage module README** - `d6eb464` (docs)

_Nota: Task 2 tinha `tdd="true"` — os testes foram escritos primeiro (RED confirmado: `TypeError: consumeDailyImportQuota is not a function`) e a implementação (GREEN) foi commitada junto, já que o projeto commita teste+implementação de uma função nova no mesmo commit `feat` quando não há refactor separado._

## Files Created/Modified
- `src/modules/usage/import-usage.model.ts` - `ImportUsageModel` (coleção `import_usage`, índice único `{userId,day}`)
- `src/modules/usage/usage.repository.ts` - +`consumeDailyImportQuota`, +`refundDailyImportQuota`
- `src/modules/usage/usage.repository.test.ts` - primeira cobertura de teste do repositório (novo arquivo)
- `src/modules/usage/README.md` - documentação Obsidian das duas famílias de cota (novo arquivo)
- `src/modules/index.ts` - registra `import-usage.model.js` no barrel para `setup:db` provisionar a coleção

## Decisions Made
- Coleção dedicada `import_usage` em vez de discriminador em `adapt_usage` (D-02 do RESEARCH) — isolamento total, sem risco à cota de adapt em produção.
- `refundDailyImportQuota` exige `day` explícito no call site — decisão que evita o bug de decrementar o contador do dia errado quando um job reservado perto da meia-noite falha já no dia seguinte.
- Sem mecanismo de concorrência novo (sem Redis, sem contador em memória) — reutiliza a mesma primitiva `Model.update $inc` upsert já validada em produção pela cota de adapt.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Mock de `AdaptUsageModel` (`usage.model.js`) necessário no novo arquivo de teste**
- **Found during:** Task 2 (escrita do teste RED de `usage.repository.test.ts`)
- **Issue:** `usage.repository.ts` importa tanto `ImportUsageModel` quanto `AdaptUsageModel`. Mockar só `import-usage.model.js` deixava `usage.model.js` real ser importado, disparando o construtor real do mongoat (`new Model(...)`) fora de um ambiente com Mongo vivo — erro `Database not found` (o gotcha de ordem de import do mongoat já documentado na memória do projeto). Isso bloqueava qualquer teste rodar, não só os que tocam `AdaptUsageModel`.
- **Fix:** Adicionado `vi.mock("./usage.model.js", () => ({ AdaptUsageModel: { update: vi.fn(), find: vi.fn() } }))` no topo do arquivo de teste, ao lado do mock de `import-usage.model.js`.
- **Files modified:** src/modules/usage/usage.repository.test.ts
- **Verification:** `npm run test -- src/modules/usage/usage.repository.test.ts` — RED correto confirmado (`TypeError: ... is not a function`) antes do fix de mock ser aplicado; GREEN após a implementação.
- **Committed in:** f4d170a (Task 2 commit)

**2. [Rule 1 - Bug] `vi.mocked(...).mockReset()` em `beforeEach` para isolar mocks entre casos de teste**
- **Found during:** Task 2 (execução dos 5 casos de teste juntos)
- **Issue:** Sem reset entre testes, `ImportUsageModel.update` acumulava chamadas de testes anteriores no mesmo `describe`, quebrando as asserções de `toHaveBeenCalledTimes(1)` e de conteúdo do primeiro call (ex.: `userId` do teste anterior vazando para a asserção do teste seguinte).
- **Fix:** Adicionado `beforeEach(() => { vi.mocked(ImportUsageModel.update).mockReset(); vi.mocked(ImportUsageModel.find).mockReset(); })`.
- **Files modified:** src/modules/usage/usage.repository.test.ts
- **Verification:** Todos os 5 testes passam de forma isolada e determinística.
- **Committed in:** f4d170a (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 blocking/bug de infraestrutura de teste)
**Impact on plan:** Ambos os fixes são internos ao arquivo de teste novo (não tocam a implementação de produção) e necessários para que a suíte rode de forma correta e determinística. Sem scope creep.

## Issues Encountered
None além dos dois deviations documentados acima (ambos resolvidos dentro da Task 2).

## User Setup Required
None - nenhuma configuração de serviço externo necessária. `npm run setup:db` (provisionamento da nova coleção `import_usage` no Atlas) permanece como gate humano típico do projeto para próximas fases que rodem contra Atlas live — não foi necessário nesta plan (testes usam model mockado).

## Next Phase Readiness
- `consumeDailyImportQuota`/`refundDailyImportQuota` prontos para o gate de `POST /import` (Plano 04-05) e para o refund em `failJob` do pipeline (Plano 04-06).
- Nenhum bloqueio conhecido. `usage.model.ts`/`adapt_usage` permanecem intocados (confirmado via `git diff`).

---
*Phase: 04-cost-quota-gating-dedup*
*Completed: 2026-07-02*

## Self-Check: PASSED

Todos os arquivos citados existem (`import-usage.model.ts`, `usage.repository.test.ts`, `README.md`, `usage.repository.ts`, `modules/index.ts`, `04-01-SUMMARY.md`) e todos os 3 commits de task (`b197a0d`, `f4d170a`, `d6eb464`) existem no histórico git.
