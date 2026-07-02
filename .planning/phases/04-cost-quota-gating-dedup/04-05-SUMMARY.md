---
phase: 04-cost-quota-gating-dedup
plan: 05
subsystem: api
tags: [fastify, dedup, quota, cost-control, idor, ssrf, nextjs, entitlement]

# Dependency graph
requires:
  - phase: 04-cost-quota-gating-dedup
    provides: "consumeDailyImportQuota/refundDailyImportQuota (Plano 04-01), env.import.dailyLimitFree/Pro (Plano 04-03), findExistingSuccessfulImport (Plano 04-04)"
provides:
  - "POST /import com guards de dedup + cota na ordem D-07 (detectPlatform → normalizeUrl → dedup → quota → enqueue)"
  - "Contrato dedup-hit 200 {recipeId, deduped:true} sem consumo de cota nem enqueue"
  - "PasteLinkButton/startImport/startImportAction com união discriminada jobId vs. deduped"
affects: ["04-06 (pipeline cost recording)", "qualquer consumidor futuro de POST /import"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Guard ordering estrito documentado inline (D-07): SSRF allowlist sempre primeiro, dedup sempre antes de quota"
    - "Response discriminada por presença de campo (deduped:true) em vez de status code novo — reusa 200 vs 202 já existentes no contrato HTTP"

key-files:
  created:
    - src/modules/import/import.routes.dedup.test.ts
    - src/modules/import/import.routes.quota.test.ts
  modified:
    - src/modules/import/import.routes.ts
    - src/modules/import/import.routes.confirm.test.ts
    - src/modules/import/import.routes.mine.test.ts
    - web/lib/api.ts
    - web/app/actions.ts
    - web/components/PasteLinkButton.tsx
    - src/modules/import/README.md

key-decisions:
  - "Guard order é estrito e não-negociável: detectPlatform (SSRF) primeiro, dedup segundo, quota terceiro — dedup nunca consome cota, quota nunca vê antes do dedup checar"
  - "O bloqueio de cota é uma cópia verbatim do gate de adapt (reply.tooManyRequests, mesma estrutura de mensagem PRO/free), só trocando chave de config e texto — nenhum contrato de erro novo"
  - "Frontend distingue dedup vs. job novo por um campo (deduped:true) na resposta 200, não por um status HTTP novo — minimiza a superfície de mudança no contrato"

patterns-established:
  - "Toda nova rota que precisa reservar cota deve seguir a mesma ordem: validação de segurança → dedup/idempotência → reserva de cota → efeito colateral caro (enqueue/chamada paga)"

requirements-completed: [CAP-03, COST-01, COST-03]

coverage:
  - id: D1
    description: "POST /import roda os guards na ordem detectPlatform → normalizeUrl → dedup lookup → quota gate → create/enqueue"
    requirement: CAP-03
    verification:
      - kind: unit
        ref: "src/modules/import/import.routes.dedup.test.ts#POST /import — dedup guard (CAP-03, D-07) — MISS — falls through to enqueue (202 { jobId })"
        status: pass
      - kind: unit
        ref: "src/modules/import/import.routes.quota.test.ts#POST /import — quota gate (COST-01/COST-03, D-07) — reserve-at-submission — on a dedup MISS, consumeDailyImportQuota is called BEFORE enqueueImportJob"
        status: pass
    human_judgment: false
  - id: D2
    description: "Um dedup hit retorna 200 {recipeId, deduped:true} sem enfileirar e sem consumir cota"
    requirement: CAP-03
    verification:
      - kind: unit
        ref: "src/modules/import/import.routes.dedup.test.ts#POST /import — dedup guard (CAP-03, D-07) — HIT — dedup returns 200 { recipeId, deduped: true }, no enqueue, no quota consume"
        status: pass
      - kind: unit
        ref: "src/modules/import/import.routes.quota.test.ts#POST /import — quota gate (COST-01/COST-03, D-07) — dedup HIT does NOT call consumeDailyImportQuota (D-07)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Um usuário free acima do limite recebe o mesmo reply.tooManyRequests com upsell PRO do gate de adapt; PRO acima do teto recebe a mensagem genérica"
    requirement: COST-03
    verification:
      - kind: unit
        ref: "src/modules/import/import.routes.quota.test.ts#POST /import — quota gate (COST-01/COST-03, D-07) — free user over limit gets 429 with PRO upsell"
        status: pass
      - kind: unit
        ref: "src/modules/import/import.routes.quota.test.ts#POST /import — quota gate (COST-01/COST-03, D-07) — PRO user over the PRO ceiling gets the generic daily-limit message"
        status: pass
    human_judgment: false
  - id: D4
    description: "PasteLinkButton branch na resposta 200/deduped e roteia para /recipe/[recipeId] existente em vez da tela de progresso"
    requirement: CAP-03
    verification:
      - kind: unit
        ref: "web typecheck (npx tsc --noEmit) — 0 erros; grep de deduped em web/lib/api.ts, web/app/actions.ts e /recipe/ em PasteLinkButton.tsx"
        status: pass
    human_judgment: false
  - id: D5
    description: "Verificação end-to-end ao vivo: dedup-hit routing real, cota não decrementada na reutilização, upsell PRO real, falha não deduplica"
    human_judgment: true
    rationale: "Depende do gate humano pendente setup:db (Plano 04-02) rodar contra o Atlas live — o agente não pode simular o fluxo completo de submissão real + polling + confirmação sem um Mongo/SQS vivos. Checkpoint blocking aguardando o usuário."

# Metrics
duration: ~35min (Tasks 1-3; Task 4 aguardando checkpoint humano)
completed: 2026-07-02
status: paused
---

# Phase 04 Plan 05: Guards de dedup + cota diária em POST /import Summary

**POST /import ganha os guards de dedup (CAP-03) e cota diária (COST-01/COST-03) na ordem estrita D-07 — detectPlatform → normalizeUrl → dedup lookup → quota gate → enqueue — e PasteLinkButton passa a rotear um dedup-hit direto para a receita existente em vez de uma tela de progresso nova.**

## Performance

- **Duration:** ~35 min (Tasks 1-3 executadas; Task 4 é checkpoint humano pendente)
- **Started:** 2026-07-02T13:31:00Z (aprox.)
- **Completed:** parcial — Tasks 1-3 completas em 2026-07-02T14:06:15Z; Task 4 (checkpoint) NÃO executada
- **Tasks:** 3/4 completas (Task 4 é `checkpoint:human-verify` bloqueante)
- **Files modified:** 9 (2 criados, 7 modificados)

## Accomplishments
- `POST /import` (`import.routes.ts`) passa a rodar, na ordem exata de D-07: `detectPlatform` (SSRF, inalterado, primeiro) → `normalizeUrl` → **dedup** (`findExistingSuccessfulImport(userId, normalizedUrl)`; HIT → `200 { recipeId, deduped: true }`, sem enqueue, sem consumo de cota) → **cota** (`isProUser` → `env.import.dailyLimitFree/Pro` → `consumeDailyImportQuota`; bloqueio espelha verbatim `reply.tooManyRequests` do gate de adapt) → `createImportJob` + `enqueueImportJob` → `202 { jobId }` (cauda inalterada).
- Dois arquivos de teste novos cobrindo os dois guards com mocks (sem Mongo real): `import.routes.dedup.test.ts` (HIT/MISS, IDOR-safe lookup, no-enqueue/no-quota-consume no HIT) e `import.routes.quota.test.ts` (reserve-at-submission antes do enqueue, bloqueio free com upsell PRO, bloqueio PRO com mensagem genérica, dedup HIT não chama a cota) — 7 testes novos, todos verdes.
- Frontend: `startImport` (`web/lib/api.ts`) retorna uma união discriminada `{ jobId } | { deduped: true; recipeId }`; `startImportAction` (`web/app/actions.ts`) propaga a união pro client; `PasteLinkButton` faz o branch — dedup hit roteia para `/recipe/[recipeId]` (reuso da rota existente, zero UI nova), jobId mantém `/import/[jobId]` (progresso inalterado), erro (incluindo o 429 com upsell PRO) segue exibido via `setSubmitError` já existente.
- README do módulo (`src/modules/import/README.md`) atualizado em estilo Obsidian, pt-BR: novo callout do Plano 04-05 com a ordem de guards, contrato do dedup-hit `200` vs. `202`, e o gate de cota mirror-verbatim; seção `## Rotas` e `## Repository` atualizadas para refletir o novo comportamento de `POST /import`.

## Task Commits

Cada task foi commitada atomicamente:

1. **Task 1: Insert dedup + quota guards into POST /import (D-07 ordering) with route tests** - `9f2b5cb` (feat)
2. **Task 2: Frontend — startImport returns dedup/jobId union; PasteLinkButton branches to existing recipe** - `9a28370` (feat)
3. **Task 3: Update import module README (dedup + quota gate + dedup-hit contract)** - `74ae1ae` (docs)

**Task 4 (checkpoint:human-verify, gate="blocking"): NÃO executada — ver seção Checkpoint Pendente abaixo.**

**Plan metadata:** (aplicado pelo orquestrador — este agente não atualiza STATE.md/ROADMAP.md)

## Files Created/Modified
- `src/modules/import/import.routes.ts` - guards de dedup + cota inseridos em `POST /import`, na ordem D-07, entre `normalizeUrl` e `createImportJob`
- `src/modules/import/import.routes.dedup.test.ts` (novo) - 3 testes: HIT (200/deduped, no-enqueue, no-quota), IDOR-safe lookup args, MISS falls through
- `src/modules/import/import.routes.quota.test.ts` (novo) - 4 testes: reserve-at-submission ordering, bloqueio free (upsell PRO) + PRO (genérico) via `it.each`, dedup HIT não consome cota
- `src/modules/import/import.routes.confirm.test.ts` - mocks adicionados (`@/config/env.js`, `entitlement.repository.js`, `usage.repository.js`, `findExistingSuccessfulImport`) para compilar/rodar depois que `import.routes.ts` passou a importar esses módulos
- `src/modules/import/import.routes.mine.test.ts` - mesmos mocks adicionados pelo mesmo motivo
- `web/lib/api.ts` - `startImport` retorna `{ jobId } | { deduped: true; recipeId }`
- `web/app/actions.ts` - `startImportAction` propaga a união de 3 casos (jobId/deduped/erro)
- `web/components/PasteLinkButton.tsx` - branch no resultado: deduped → `/recipe/[recipeId]`, jobId → `/import/[jobId]` (inalterado), erro → `setSubmitError` (inalterado)
- `src/modules/import/README.md` - callout do Plano 04-05, seção `## Rotas` e `## Repository` atualizadas

## Decisions Made
- **Nenhuma decisão arquitetural nova** — o plano já especificava a ordem de guards, o shape da resposta de dedup e o mirror verbatim do gate de cota; a execução seguiu literalmente.
- **`status: paused` neste SUMMARY** (não `complete`): a Task 4 é um `checkpoint:human-verify` com `gate="blocking"` que exige um fluxo ao vivo contra Mongo/SQS reais (via `setup:db`, gate humano pendente do Plano 04-02) — este agente não pode simular submissão real + polling + confirmação de receita sem esses serviços vivos.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `import.routes.confirm.test.ts` e `import.routes.mine.test.ts` quebravam depois da Task 1**
- **Found during:** Task 1 (rodando a suíte completa do módulo `import` após a mudança em `import.routes.ts`)
- **Issue:** Ao adicionar `import { env } from "@/config/env.js"`, `isProUser` de `entitlement.repository.js` e `consumeDailyImportQuota` de `usage.repository.js` em `import.routes.ts`, os dois arquivos de teste pré-existentes que importam `importRoutes` (mas não mockavam esses três módulos novos) passaram a falhar com `Error: Variável de ambiente obrigatória ausente: MONGODB_URI` — `env.ts` real sendo carregado fora de um ambiente com Mongo configurado.
- **Fix:** Adicionado `vi.mock("@/config/env.js", ...)`, `vi.mock("@/modules/billing/entitlement.repository.js", ...)`, `vi.mock("@/modules/usage/usage.repository.js", ...)` e `findExistingSuccessfulImport: vi.fn()` ao mock de `import-job.repository.js` em ambos os arquivos, no mesmo padrão já usado nos dois testes novos desta plan.
- **Files modified:** `src/modules/import/import.routes.confirm.test.ts`, `src/modules/import/import.routes.mine.test.ts`
- **Verification:** `npm run test -- src/modules/import/` — 10 arquivos, 77 testes, todos verdes; `npm run test` (suíte completa) — 19 arquivos, 163 testes, todos verdes.
- **Committed in:** `9f2b5cb` (parte do commit da Task 1 — os mocks fazem parte do mesmo escopo de mudança que os introduziu)

---

**Total deviations:** 1 auto-fixed (1 bug de teste causado diretamente pela mudança desta task, escopo estritamente local)
**Impact on plan:** Correção necessária para a suíte de testes compilar/rodar depois da mudança em `import.routes.ts`; nenhum impacto em comportamento de produção ou nos critérios de aceitação do plano.

## Issues Encountered
None além do já documentado em Deviations.

## User Setup Required

**Nenhuma configuração nova neste plano** — mas a Task 4 (checkpoint bloqueante) depende de um gate humano JÁ PENDENTE do Plano 04-02 (`npm run setup:db`, sync do validator Mongo + índices no Atlas live). Sem isso, não é possível rodar o fluxo end-to-end ao vivo que a Task 4 pede verificar (submissão real, polling, dedup ao vivo, quota real).

## Next Phase Readiness

- **BLOQUEADO em checkpoint humano (Task 4, `gate="blocking"`).** Código (Tasks 1-3) está completo, testado (77/77 testes do módulo import, 163/163 da suíte inteira) e com `npm run typecheck` (backend) e `npx tsc --noEmit` (frontend web) limpos.
- Este agente NÃO tentou a verificação ao vivo — ela depende do `setup:db` (gate humano pendente do Plano 04-02) rodar primeiro, e mesmo com isso, exige um humano confirmando o comportamento observado (ver `rationale` de D5 acima).
- Assim que o checkpoint for aprovado (ou o desvio reportado e corrigido), a Plan 06 (per-stage cost recording + refund-in-failJob) pode prosseguir sem bloqueio adicional desta plan — nenhuma interface exportada por 04-05 muda para 04-06.

---
*Phase: 04-cost-quota-gating-dedup*
*Completed: parcial — aguardando checkpoint humano (Task 4)*

## Self-Check: PASSED

Todos os arquivos citados existem em disco (`import.routes.ts`, `import.routes.dedup.test.ts`, `import.routes.quota.test.ts`, `import.routes.confirm.test.ts`, `import.routes.mine.test.ts`, `web/lib/api.ts`, `web/app/actions.ts`, `web/components/PasteLinkButton.tsx`, `src/modules/import/README.md`) e todos os 3 commits de task (`9f2b5cb`, `9a28370`, `74ae1ae`) existem no histórico git (`git log --oneline -5`).
