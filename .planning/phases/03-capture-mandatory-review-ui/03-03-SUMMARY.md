---
phase: 03-capture-mandatory-review-ui
plan: 03
subsystem: ui
tags: [nextjs, clerk, server-actions, polling, typescript, grounding]

requires:
  - phase: 03-capture-mandatory-review-ui
    provides: "PATCH /import/:jobId/recipe, GET /import/mine, ImportRecipeEditSchema (03-01)"
provides:
  - "web/lib/types.ts — ImportJob, ImportJobStatus, ImportFailureReason, GroundingLevel, RecipeGrounding, ImportRecipeEditPatch, ImportedRecipeListItem, RecipeSource com 'imported'"
  - "web/lib/api.ts — startImport/getImportJob/confirmImportRecipe/listMyImports (fetch autenticado)"
  - "web/app/actions.ts — startImportAction/getImportJobAction/confirmImportRecipeAction/listMyImportsAction"
  - "web/lib/useImportPolling.ts — hook de polling com timeout explícito"
  - "web/components/GroundingBadge.tsx — pill de revisão grounded/inferred/ambiguous"
affects: [03-04, 03-05]

tech-stack:
  added: []
  patterns:
    - "setTimeout-recursion polling com estado de timeout explícito (diverge de useLazyThumbnail que silencia) — useImportPolling retorna { job, timedOut }"
    - "Server action wrapper 1:1 sobre lib/api.ts, nunca fetch direto de client component (mesmo idioma de adaptRecipeAction/triggerThumbnailAction)"
    - "GroundingBadge: sistema de 2 estados (badge ausente = grounded, pill amber = precisa revisão), reaproveitando --t-warn-bg/--t-warn-fg já existentes"

key-files:
  created:
    - web/lib/useImportPolling.ts
    - web/components/GroundingBadge.tsx
  modified:
    - web/lib/types.ts
    - web/lib/api.ts
    - web/app/actions.ts
    - src/modules/recipes/recipe.repository.ts
    - src/modules/recipes/recipe.types.ts
    - src/modules/recipes/README.md
    - web/components/README.md

key-decisions:
  - "[Rule 2] hybridSearch passou a projetar reviewRequired/confirmedAt no RecipeSearchHit — sem isso GET /import/mine nunca devolveria o dado que ImportedRecipeListItem promete e que ImportsList (03-04/03-05) precisa pra renderizar o status 'Em revisão'/'Confirmada'. Mudança de 2 linhas no $project, sem novo campo no schema (já existiam em Recipe desde 03-01/Fase 2), sem query extra."
  - "ImportJob (frontend) espelha só os campos que a UI lê (_id/status/failureReason/errorMessage/recipeId/reviewRequired/confidenceScore/platform/sourceMeta) — não replica transcript/caption/costCents/retryCount do backend, que a UI de progresso/revisão nunca consome."
  - "ImportedRecipeListItem estende SearchHit (não duplica os campos) + reviewRequired/confirmedAt opcionais — evita drift entre o shape de busca normal e o de import."

requirements-completed: [CAP-01, REV-02, REV-04, REV-03]

coverage:
  - id: D1
    description: "web/lib/types.ts espelha os contratos de import (ImportJob, ImportJobStatus, ImportFailureReason, GroundingLevel, RecipeGrounding, ImportRecipeEditPatch, ImportedRecipeListItem) e adiciona 'imported' a RecipeSource"
    requirement: CAP-01
    verification:
      - kind: unit
        ref: "cd web && npx tsc --noEmit"
        status: pass
    human_judgment: false
  - id: D2
    description: "web/lib/api.ts expõe startImport/getImportJob/confirmImportRecipe/listMyImports como fetch autenticado (authHeaders, cache:no-store), mesmo idioma das funções existentes"
    requirement: CAP-01
    verification:
      - kind: unit
        ref: "cd web && npx tsc --noEmit"
        status: pass
    human_judgment: false
  - id: D3
    description: "web/app/actions.ts expõe os 4 wrappers de server action com copy de erro pt-BR (startImportAction/confirmImportRecipeAction normalizados { ok, ... }; getImportJobAction/listMyImportsAction pass-through)"
    requirement: REV-04
    verification:
      - kind: unit
        ref: "cd web && npx tsc --noEmit"
        status: pass
    human_judgment: false
  - id: D4
    description: "useImportPolling faz polling via getImportJobAction em loop setTimeout-recursion (nunca setInterval), para em status terminal, mantém tentando em erro transiente, e expõe timedOut:true explícito após 10min em vez de silenciar (Pitfall 2)"
    requirement: CAP-01
    verification:
      - kind: unit
        ref: "cd web && npx tsc --noEmit"
        status: pass
    human_judgment: true
    rationale: "Comportamento de timing (setTimeout, unmount cleanup, timeout após 10min) não tem teste automatizado neste plano — só typecheck. Verificação funcional real (polling parar corretamente, timeout aparecer) fica para o UAT da tela de progresso em 03-04, que consome este hook."
  - id: D5
    description: "GroundingBadge retorna null para 'grounded' e renderiza a pill amber (--t-warn-bg/--t-warn-fg) com os labels exatos do UI-SPEC para 'inferred'/'ambiguous'"
    requirement: REV-02
    verification:
      - kind: unit
        ref: "cd web && npx tsc --noEmit"
        status: pass
    human_judgment: true
    rationale: "Aparência visual final (cor renderizada, contraste, dark mode) não é verificável por typecheck — fica para o UAT visual quando 03-04/03-05 montarem a tela de revisão que efetivamente renderiza o badge."

duration: 22min
completed: 2026-07-02
status: complete
---

# Phase 3 Plan 3: Frontend Foundation (types/api/actions/polling/badge) Summary

**Camada compartilhada do frontend de import: tipos mirrorados, 4 wrappers autenticados de api.ts/actions.ts, hook de polling com timeout explícito (não silencioso), e o primitivo GroundingBadge de 2 estados — tudo consumido pelas telas de 03-04/03-05.**

## Performance

- **Duration:** 22 min
- **Started:** 2026-07-02T05:14:00Z
- **Completed:** 2026-07-02T05:36:00Z
- **Tasks:** 3 de 3
- **Files modified:** 7 (5 modificados, 2 criados)

## Accomplishments

- `web/lib/types.ts`: `ImportJob`, `ImportJobStatus`, `ImportFailureReason`, `GroundingLevel`, `RecipeGrounding`, `ImportRecipeEditPatch`, `ImportedRecipeListItem` espelhando os contratos de `src/modules/import/import-job.types.ts` e `src/modules/recipes/recipe.types.ts`; `"imported"` adicionado à union `RecipeSource` do frontend.
- `web/lib/api.ts`: `startImport`, `getImportJob`, `confirmImportRecipe`, `listMyImports` — fetch autenticado (`authHeaders()`, `cache:"no-store"`) seguindo exatamente o idioma de `searchRecipes`/`getRecipe`/`triggerThumbnail`.
- `web/app/actions.ts`: `startImportAction`/`confirmImportRecipeAction` (shape normalizado `{ ok, ... } | { ok:false, error }`, copy pt-BR) e `getImportJobAction`/`listMyImportsAction` (pass-through fino), mesmo padrão de `adaptRecipeAction`/`triggerThumbnailAction`.
- `web/lib/useImportPolling.ts`: hook `"use client"` com loop `setTimeout`-recursivo (2s), parando em `ready_for_review`/`failed`, mantendo tentativas em erro de rede transiente, e — diferente de `useLazyThumbnail` — expondo `timedOut:true` explícito após 10 min em vez de silenciar (Pitfall 2, tela ativamente observada).
- `web/components/GroundingBadge.tsx`: retorna `null` para `grounded` (neutro = ausência de badge); pill amber (`--t-warn-bg`/`--t-warn-fg`) com "Confira isto — inferido"/"Confira isto — impreciso" para `inferred`/`ambiguous`, reaproveitando o idioma de pill de `NutritionBadge`.
- `[Rule 2]` `hybridSearch` (`recipe.repository.ts`) passou a projetar `reviewRequired`/`confirmedAt` no `RecipeSearchHit` — sem isso `GET /import/mine` nunca devolveria o dado que `ImportedRecipeListItem` promete.
- READMEs (`src/modules/recipes/README.md`, `web/components/README.md`) atualizados em estilo Obsidian documentando as duas mudanças acima.

## Task Commits

Each task was committed atomically:

1. **Task 1: Mirror import contracts in web/lib/types.ts + add api.ts/actions.ts wrappers** - `c4e515d` (feat)
2. **Task 2: useImportPolling hook (setTimeout-recursion, explicit timeout state)** - `3aa1e63` (feat)
3. **Task 3: GroundingBadge primitive (grounded = no badge; inferred/ambiguous = warn pill)** - `79c4090` (feat)

**Docs:** `7f6872f` (docs: READMEs de recipes/components)

## Files Created/Modified

- `web/lib/types.ts` - tipos de import mirrorados + `RecipeSource` estendido com `"imported"`
- `web/lib/api.ts` - 4 wrappers de fetch autenticado para as rotas de import
- `web/app/actions.ts` - 4 server actions correspondentes, copy pt-BR
- `web/lib/useImportPolling.ts` - hook de polling com timeout explícito (novo arquivo)
- `web/components/GroundingBadge.tsx` - primitivo de badge de revisão (novo arquivo)
- `src/modules/recipes/recipe.repository.ts` - `$project` de `hybridSearch` agora inclui `reviewRequired`/`confirmedAt`
- `src/modules/recipes/recipe.types.ts` - `RecipeSearchHit` ganha `reviewRequired?`/`confirmedAt?`
- `src/modules/recipes/README.md` - callout documentando a nova projeção
- `web/components/README.md` - nova seção "onFeed Import" listando `GroundingBadge`

## Decisions Made

- **`[Rule 2]` Projeção de `reviewRequired`/`confirmedAt` no `hybridSearch`:** o plano pedia `ImportedRecipeListItem` com esses campos ("plus reviewRequired/confirmedAt so ImportsList can show status"), mas o `$project` de `hybridSearch` (usado por `listMyImportedRecipes`, que alimenta `GET /import/mine`) não os incluía — 03-01 não tocou nesse arquivo. Sem a correção, o backend sempre devolveria `undefined` para esses campos e a tela "Minhas importações" (03-04/03-05) não conseguiria distinguir "Em revisão" de "Confirmada". Fix de 2 linhas no `$project`, sem novo campo de schema (já existiam em `Recipe` desde 03-01), sem custo de query adicional.
- **`ImportJob` frontend é um subconjunto do backend:** só os campos que a UI de progresso/revisão realmente lê — evita vazar `transcript`/`caption`/`costCents`/`retryCount` (que não deveriam nem trafegar para o cliente) e mantém o tipo de frente pequeno e auditável.
- **`ImportedRecipeListItem extends SearchHit`:** em vez de duplicar os ~15 campos de `SearchHit`, estende e adiciona só o que é específico de import — evita drift entre os dois shapes conforme a busca normal evoluir.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Backend não projetava reviewRequired/confirmedAt necessários ao contrato do plano**
- **Found during:** Task 1 (verificando se `listMyImportedRecipes`/`hybridSearch` de fato devolvia os campos que `ImportedRecipeListItem` promete)
- **Issue:** o `must_haves.artifacts` do plano especifica `ImportedRecipeListItem` "mirroring the RecipeSearchHit fields listMyImportedRecipes returns (plus reviewRequired/confirmedAt so ImportsList can show status)" — mas o `$project` final de `hybridSearch` em `recipe.repository.ts` não incluía esses dois campos, então o backend sempre devolveria `undefined`, quebrando silenciosamente o status na tela "Minhas importações" das próximas plans.
- **Fix:** adicionadas as linhas `reviewRequired: 1` e `confirmedAt: 1` ao `$project` de `hybridSearch`; `RecipeSearchHit` (backend) ganhou os campos opcionais correspondentes para o cast do `aggregate` continuar type-safe.
- **Files modified:** `src/modules/recipes/recipe.repository.ts`, `src/modules/recipes/recipe.types.ts`
- **Verification:** `npm run typecheck` limpo; `npx vitest run src/modules/recipes/recipe.repository.test.ts src/modules/import` — 73/73 testes passando, nenhuma regressão nos testes existentes de `hybridSearch` (isolamento owner-scoped, exclusão de `'imported'` de `DEFAULTS.sources` etc. continuam válidos).
- **Committed in:** `c4e515d` (parte do commit da Task 1)

---

**Total deviations:** 1 auto-fixed (Rule 2 - funcionalidade crítica ausente no backend, bloqueante para o artefato do plano funcionar de ponta a ponta)
**Impact on plan:** Correção pequena e diretamente necessária para o contrato de dados que o próprio plano declara (`ImportedRecipeListItem`). Sem scope creep — nenhuma lógica nova de negócio, só duas linhas de projeção num pipeline já existente.

## Issues Encountered

Nenhum. `cd web && npx tsc --noEmit` limpo após cada task; `npm run typecheck` (backend) limpo; `npx vitest run` — 141/141 testes relevantes passando (a única falha, `ytdlp.downloader.integration.test.ts`, é pré-existente e exige `MONGODB_URI` real, já documentada como fora de escopo no SUMMARY de 03-01).

## User Setup Required

None - nenhuma configuração externa necessária. (O gate humano `npm run setup:db` do plano 03-01 continua pendente, mas não bloqueia este plano — ver 03-01-SUMMARY.md.)

## Next Phase Readiness

- `web/lib/types.ts`, `web/lib/api.ts`, `web/app/actions.ts`, `web/lib/useImportPolling.ts`, `web/components/GroundingBadge.tsx` prontos para 03-04/03-05 importarem sem race em arquivo compartilhado (interface-first ordering do Wave 2 cumprido).
- `GET /import/mine` agora devolve `reviewRequired`/`confirmedAt` de fato — `ImportsList` (03-04/03-05) pode mapear o status sem trabalho extra de backend.
- Nenhum bloqueio identificado para as telas de captura (`/import`), progresso (`/import/[jobId]`) e revisão (`/import/[jobId]/review`) começarem a consumir esta camada.

---
*Phase: 03-capture-mandatory-review-ui*
*Completed: 2026-07-02*

## Self-Check: PASSED

Todos os arquivos citados (`web/lib/types.ts`, `web/lib/api.ts`, `web/app/actions.ts`, `web/lib/useImportPolling.ts`, `web/components/GroundingBadge.tsx`, `src/modules/recipes/recipe.repository.ts`, `src/modules/recipes/recipe.types.ts`, `src/modules/recipes/README.md`, `web/components/README.md`) existem no disco. Todos os 4 commits (`c4e515d`, `3aa1e63`, `79c4090`, `7f6872f`) existem em `git log --oneline --all`. `cd web && npx tsc --noEmit` e `npm run typecheck` (backend) confirmados limpos antes da criação deste SUMMARY.
