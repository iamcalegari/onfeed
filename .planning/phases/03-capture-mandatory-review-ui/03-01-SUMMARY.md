---
phase: 03-capture-mandatory-review-ui
plan: 01
subsystem: api
tags: [fastify, typebox, mongoat, idor, confirm-gate, import]

requires:
  - phase: 02-structured-extraction-recipe-persistence
    provides: "Recipe.reviewRequired/confidenceScore/grounding, ImportJob.recipeId, listMyImportedRecipes(userId) owner-scoped search (D-14)"
provides:
  - "Recipe.confirmedAt (BSON + TS, pending live-Atlas validator sync via user-gated setup:db)"
  - "confirmImportedRecipe(recipeId, userId, patch) — idempotent-safe confirm gate service fn"
  - "PATCH /import/:jobId/recipe — owner-scoped confirm/edit route (REV-04)"
  - "GET /import/mine — thin wrapper over listMyImportedRecipes(userId) (D-09)"
  - "ImportRecipeEditSchema / ImportRecipeEditPatch — content-only, additionalProperties:false"
affects: [03-02, 03-03, 03-04, 03-05, frontend-review-screen]

tech-stack:
  added: []
  patterns:
    - "Confirm-gate idempotency: confirmImportedRecipe checks recipe.confirmedAt BEFORE writing, returns { alreadyConfirmed } instead of throwing — route maps that to 409 without a second Mongo round-trip to check status"
    - "recipeId always route-derived from job.recipeId (owner-scoped lookup), never trusted from request body — same idiom as the existing GET /import/:jobId"
    - "HTTP-level route testing via fastify.inject() with vi.mock() on auth.guard.js/import-job.repository.js/import.service.js (no live Mongo) — new precedent for this project, since prior import tests were repository/service-level only"

key-files:
  created:
    - src/modules/import/import.routes.confirm.test.ts
    - src/modules/import/import.routes.mine.test.ts
  modified:
    - src/modules/recipes/recipe.model.ts
    - src/modules/recipes/recipe.types.ts
    - src/modules/import/import.routes.ts
    - src/modules/import/import.service.ts
    - src/modules/import/import.service.test.ts
    - src/modules/import/README.md

key-decisions:
  - "Task 2 (npm run setup:db) NÃO foi executada pelo executor — é um gate humano (autonomous:false, gate=blocking-human) que muta o validator do Atlas live; requer MONGODB_URI com credenciais de escrita que o executor não deve assumir. Tasks 1/3/4 foram reordenadas para 1→3→4, todas verificadas sem depender do validator sincronizado (typecheck + testes com Models mockados)."
  - "confirmImportedRecipe preserva canonicalId/core/isStaple/raw dos ingredientes existentes pelo índice (não re-roda resolveCanonicalForIngestion) — decisão já resolvida na Open Question 1 do research, mantém o PATCH síncrono sem chamada Voyage no caminho da request."
  - "Idempotência implementada como early-return em confirmImportedRecipe (checa recipe.confirmedAt antes do $set) em vez de um segundo guard na rota — a rota só traduz { alreadyConfirmed: true } em 409, sem duplicar a checagem de estado."

requirements-completed: [REV-03, REV-04, CAP-01]

coverage:
  - id: D1
    description: "Recipe.confirmedAt existe na interface TS e no validator BSON (properties, não required) — mongoat aceita insert/update com confirmedAt sem DocumentValidationFailure em código; typecheck passa"
    requirement: REV-04
    verification:
      - kind: unit
        ref: "npm run typecheck"
        status: pass
    human_judgment: false
  - id: D2
    description: "confirmImportedRecipe aplica edições de título/intro/ingredientes/passos + seta reviewRequired:false + confirmedAt numa única RecipeModel.update, preservando canonicalId"
    requirement: REV-03
    verification:
      - kind: integration
        ref: "src/modules/import/import.routes.confirm.test.ts#confirm applies edits"
        status: pass
    human_judgment: false
  - id: D3
    description: "PATCH /import/:jobId/recipe rejeita com 409 quando job.status !== ready_for_review (table-test 5 status: queued/downloading/transcribing/extracting/failed)"
    requirement: REV-04
    verification:
      - kind: integration
        ref: "src/modules/import/import.routes.confirm.test.ts#not ready — status=%s returns 409, no write"
        status: pass
    human_judgment: false
  - id: D4
    description: "Segunda confirmação numa receita já confirmada é idempotente-safe: 409 already_confirmed, sem reaplicar dados diferentes"
    requirement: REV-04
    verification:
      - kind: integration
        ref: "src/modules/import/import.routes.confirm.test.ts#idempotent — second confirm on an already-confirmed recipe does not silently apply different data"
        status: pass
    human_judgment: false
  - id: D5
    description: "ImportRecipeEditSchema (additionalProperties:false) rejeita grounding/reviewRequired/confidenceScore/canonicalId/recipeId enviados pelo client com 400, nunca persistidos"
    requirement: CAP-01
    verification:
      - kind: integration
        ref: "src/modules/import/import.routes.confirm.test.ts#rejects protected fields — body with extra field is rejected (400), never persisted"
        status: pass
    human_judgment: false
  - id: D6
    description: "PATCH em jobId de outro usuário retorna 404 (getImportJob(jobId,userId) owner-scoped numa query só) — IDOR-safe"
    requirement: CAP-01
    verification:
      - kind: integration
        ref: "src/modules/import/import.routes.confirm.test.ts#owner scope — PATCH on another user's jobId returns 404, never edits"
        status: pass
    human_judgment: false
  - id: D7
    description: "GET /import/mine delega sempre a listMyImportedRecipes(userId), nunca hybridSearch direto"
    requirement: REV-03
    verification:
      - kind: integration
        ref: "src/modules/import/import.routes.mine.test.ts#returns listMyImportedRecipes(userId) for the caller only"
        status: pass
    human_judgment: false
  - id: D8
    description: "npm run setup:db aplica o validator confirmedAt ao Atlas live — necessário para uma escrita real de confirmedAt não falhar com DocumentValidationFailure"
    requirement: REV-04
    verification: []
    human_judgment: true
    rationale: "Gate humano explícito (Task 2, autonomous:false, gate=blocking-human) — muta o schema validator da collection recipes em produção via collMod. O executor não tem (e não deve assumir) credenciais de escrita do Atlas live. Precisa ser rodado manualmente pelo usuário antes de qualquer confirmação real via UI chegar a persistir confirmedAt."

duration: 35min
completed: 2026-07-02
status: complete
---

# Phase 3 Plan 1: Confirm/Edit Backend Summary

**Gate de confirmação REV-04 completo no backend: `Recipe.confirmedAt` (BSON+TS), `confirmImportedRecipe` idempotente-safe, `PATCH /import/:jobId/recipe` IDOR-safe e `GET /import/mine` — sync do validator Atlas live (`npm run setup:db`) pendente de execução humana.**

## Performance

- **Duration:** 35 min
- **Started:** 2026-07-02T05:04:38Z
- **Completed:** 2026-07-02T05:12:27Z
- **Tasks:** 3 de 4 executadas (Tasks 1, 3, 4); Task 2 pendente (gate humano)
- **Files modified:** 6 modificados + 2 criados (testes)

## Accomplishments

- `Recipe.confirmedAt` adicionado como campo `Date` opcional no validator BSON (`recipe.model.ts`) e na interface TS (`recipe.types.ts`), mirrorando o placement de `reviewRequired`/`confidenceScore` da Fase 2.
- `confirmImportedRecipe(recipeId, userId, patch)` em `import.service.ts`: aplica title/intro/ingredients/steps editados, seta `reviewRequired:false` + `confirmedAt` numa única `RecipeModel.update`, preservando `canonicalId`/`core`/`isStaple`/`raw` dos ingredientes existentes; idempotente-safe via early-return se `recipe.confirmedAt` já setado.
- `ImportRecipeEditSchema`/`ImportRecipeEditPatch` (TypeBox, `additionalProperties:false`) aceitando apenas campos de conteúdo editável — rejeita explicitamente `grounding`/`reviewRequired`/`confidenceScore`/`canonicalId`/`recipeId`.
- `PATCH /import/:jobId/recipe`: owner-scoped via `getImportJob(jobId, userId)` (mesmo idioma IDOR-safe de `GET /import/:jobId`), 409 quando `job.status !== "ready_for_review"`, `recipeId` sempre derivado do job (nunca do body), 409 `already_confirmed` numa segunda confirmação.
- `GET /import/mine`: wrapper fino sobre `listMyImportedRecipes(userId)` já existente (D-09/D-14) — nunca chama `hybridSearch` diretamente.
- 15 testes novos via `fastify.inject()` cobrindo os 6 comportamentos exigidos pelo VALIDATION.md (`confirm applies edits`, `not ready` ×5 status, `idempotent`, `rejects protected fields` ×5 campos, `owner scope`, `GET /import/mine` ×2).
- README.md do módulo atualizado em estilo Obsidian (callouts `[!WARNING]`/`[!INFO]`/`[!TIP]`, wikilinks) documentando o novo gate de confirmação e suas garantias de segurança.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add Recipe.confirmedAt (BSON model + TS type)** - `7f8211b` (feat)
2. **Task 2: Run setup:db to sync the confirmedAt validator to live Atlas** - **NÃO EXECUTADA** (gate humano pendente — ver seção abaixo)
3. **Task 3: confirmImportedRecipe service + ImportRecipeEditSchema** - `3a6ee9f` (feat)
4. **Task 4: PATCH /import/:jobId/recipe + GET /import/mine routes with tests** - `448ee41` (feat)

_Ordem de execução real: 1 → 3 → 4 (Task 2 pulada intencionalmente — ver <critical_deviation_authorization> do executor)._

## Files Created/Modified

- `src/modules/recipes/recipe.model.ts` - `confirmedAt: { bsonType: "date" }` adicionado ao BSON validator (optional, não em `required`)
- `src/modules/recipes/recipe.types.ts` - `confirmedAt?: Date` adicionado à interface `Recipe`
- `src/modules/import/import.routes.ts` - `ImportRecipeEditSchema`/`ImportRecipeEditPatch` exportados; rotas `PATCH /import/:jobId/recipe` e `GET /import/mine` adicionadas
- `src/modules/import/import.service.ts` - `confirmImportedRecipe(recipeId, userId, patch)` adicionada, usando `RecipeModel.update` + `getRecipeById`
- `src/modules/import/import.routes.confirm.test.ts` - 15 casos de teste HTTP (`fastify.inject`) do PATCH de confirmação
- `src/modules/import/import.routes.mine.test.ts` - testes de `GET /import/mine` (delegação a `listMyImportedRecipes`)
- `src/modules/import/import.service.test.ts` - mock de `env.js`/`recipe.model.js`/`recipe.repository.js` ampliado para acomodar o novo import de `RecipeModel` (correção de regressão, ver Deviations)
- `src/modules/import/README.md` - nova seção "Confirmação / Edição (Fase 3 — Plano 03-01)" com callouts documentando o gate, `additionalProperties:false` e a limitação conhecida de não re-canonicalização

## Decisions Made

- **Reordenação de tasks (1→3→4, Task 2 pendente):** conforme autorização explícita do orquestrador — `npm run setup:db` muta o validator Atlas live via `collMod` e é um gate humano (`autonomous:false`, `gate="blocking-human"`). Tasks 3 e 4 verificam via `npm run typecheck`/`npm run test` com `RecipeModel`/`ImportJobModel` mockados, então não dependem do validator sincronizado.
- **Idempotência como early-return em `confirmImportedRecipe`:** a função checa `recipe.confirmedAt` antes de qualquer escrita e retorna `{ alreadyConfirmed: true }` em vez de lançar — a rota traduz isso em `409 already_confirmed` sem precisar de um segundo guard de estado no nível HTTP.
- **`recipeId` sempre derivado de `job.recipeId`:** nunca aceito do corpo da requisição — `ImportRecipeEditSchema` nem declara esse campo, então o mesmo IDOR-safe idiom de `GET /import/:jobId` se estende ao PATCH (T-03-01).
- **Testes HTTP-level via `fastify.inject()`:** diferente do padrão puramente repository/service-level das Fases 1/2 (`import-job.repository.test.ts`), a Task 4 exercita a rota real (validação de schema TypeBox incluída) para cobrir "rejects protected fields" com fidelidade — um teste unitário direto de `confirmImportedRecipe` não pegaria a rejeição 400 do schema.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrigido mock quebrado em `import.service.test.ts` causado pela Task 3**
- **Found during:** Task 4 (rodando `npm run test` completo após adicionar as rotas)
- **Issue:** `import.service.ts` (Task 3) passou a importar `RecipeModel` de `recipe.model.ts` para `confirmImportedRecipe`. `recipe.model.ts` lê `env.voyage.model` no module-load (via `documentDefaults`). O mock existente de `@/config/env.js` em `import.service.test.ts` (Fase 2, pré-existente) só expunha `{ sqs: {...} }`, causando `TypeError: Cannot read properties of undefined (reading 'model')` e quebrando a suíte inteira desse arquivo (0 testes coletados).
- **Fix:** Ampliado o mock de `@/config/env.js` para incluir `voyage: { model: "voyage-3" }`; adicionado `vi.mock("@/modules/recipes/recipe.model.js", ...)` mockando `RecipeModel.update`; adicionado `getRecipeById: vi.fn()` ao mock existente de `recipe.repository.js`.
- **Files modified:** `src/modules/import/import.service.test.ts`
- **Verification:** `npm run test` — 130/130 testes passam (14 arquivos), nenhuma regressão.
- **Committed in:** `448ee41` (parte do commit da Task 4)

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug de escopo direto)
**Impact on plan:** Correção necessária e diretamente causada pela mudança planejada da Task 3 (novo import de `RecipeModel`). Sem scope creep — nenhuma lógica de produção foi alterada, só o setup de mocks do teste pré-existente.

## Issues Encountered

Nenhum além da deviation documentada acima. `npm run test:all` reporta uma falha pré-existente e não relacionada em `src/infra/video/ytdlp.downloader.integration.test.ts` (requer `MONGODB_URI`/`.env` real — teste de integração fora do escopo desta plan, arquivo não tocado por nenhum commit desta plan).

## User Setup Required

**Ação manual pendente antes de qualquer confirmação real via UI persistir `confirmedAt`:**

```bash
npm run setup:db
```

- **O que faz:** roda `tsx --env-file=.env src/infra/database/setup.ts`, aplicando um `collMod` que sincroniza o validator BSON atualizado (agora incluindo `confirmedAt`) na coleção `recipes` do Atlas live.
- **Por que é necessário:** o mongoat valida todo insert/update contra o validator *live* da coleção, não contra o código local. Sem esse `collMod`, uma escrita real de `confirmedAt` (via `confirmImportedRecipe` em produção) falha com `DocumentValidationFailure` — exatamente o modo de falha do UAT da Fase 2.
- **Pré-requisito:** `MONGODB_URI` já presente em `.env` (mesma connection string que `setup.ts` lê).
- **Por que o executor não rodou isso:** Task 2 é `autonomous:false` / `gate="blocking-human"` — muta o schema validator do banco de produção. O executor não tem, e não deve assumir, credenciais de escrita do Atlas live sem confirmação explícita do usuário.
- **Verificação após rodar:** um write de teste com `confirmedAt: new Date()` na coleção `recipes` não deve mais lançar `DocumentValidationFailure`.

## Next Phase Readiness

- Backend pronto para os planos seguintes da Fase 3 (frontend de captura/revisão): `PATCH /import/:jobId/recipe` e `GET /import/mine` existem, são IDOR-safe e testados; `confirmImportedRecipe` é o único caminho de código que confirma uma receita.
- **Bloqueio para E2E real (não para desenvolvimento):** até `npm run setup:db` rodar contra o Atlas live, qualquer teste manual/E2E que confirme uma receita de verdade (não mockada) falhará com `DocumentValidationFailure` no write de `confirmedAt`. Testes automatizados (`npm run test`) não são afetados — usam Models mockados.
- Nenhum blocker para os planos de frontend (03-02 a 03-05) começarem a consumir essas rotas.

---
*Phase: 03-capture-mandatory-review-ui*
*Completed: 2026-07-02*

## Self-Check: PASSED

Todos os arquivos citados (`recipe.model.ts`, `recipe.types.ts`, `import.routes.ts`, `import.service.ts`, `import.routes.confirm.test.ts`, `import.routes.mine.test.ts`, `import.service.test.ts`, `README.md`) existem no disco. Todos os 3 commits (`7f8211b`, `3a6ee9f`, `448ee41`) existem em `git log --oneline --all`. `npm run typecheck` limpo e `npm run test` com 130/130 testes passando confirmados novamente antes da criação deste SUMMARY.
