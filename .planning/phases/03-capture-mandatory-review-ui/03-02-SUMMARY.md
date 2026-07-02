---
phase: 03-capture-mandatory-review-ui
plan: 02
subsystem: api
tags: [fastify, mongoat, idor, security, recipes, import]

requires:
  - phase: 03-capture-mandatory-review-ui
    provides: "Plano 03-01: Recipe.confirmedAt, confirmImportedRecipe, PATCH /import/:jobId/recipe, GET /import/mine — o gate de confirmação cria receitas private+reviewRequired linkáveis por id que esta plan protege"
provides:
  - "getRecipeById(id) / getRecipeById(id, userId | null) — assinatura de 3 estados (trusted interno vs untrusted público), resolve ownership de import privado via importJobId → ImportJob.userId"
  - "GET /recipes/:id soft-auth — anônimo/outro usuário recebem 404 em receita private, público segue anonimamente acessível"
  - "recipe.routes.visibility.test.ts — cobertura HTTP-level dos 5 comportamentos do guard"
affects: [03-03, 03-04, 03-05, frontend-review-screen]

tech-stack:
  added: []
  patterns:
    - "getRecipeById 3-state signature: 1 arg = trusted/internal caller (adaptação, likes, confirm flow — sem filtro de visibility, comportamento pré-existente); 2 args (string | null) = untrusted/public caller (rota), aciona o guard de visibilidade — mesmo idioma de getImportJob(jobId, userId?), evita quebrar callers internos que precisam ler receitas privadas por ownership já resolvida a montante"
    - "Ownership de import resolvido em 2 passos: fast-path Mongo $or (cobre público + createdBy.userId) e, se não encontrar E userId presente, fallback findById cru + getImportJob(importJobId).userId === userId — nunca vaza existência (não-match sempre retorna null, mesmo 404 de id inexistente)"

key-files:
  created:
    - src/modules/recipes/recipe.routes.visibility.test.ts
  modified:
    - src/modules/recipes/recipe.repository.ts
    - src/modules/recipes/recipe.repository.test.ts
    - src/modules/recipes/recipe.routes.ts
    - src/modules/recipes/README.md

key-decisions:
  - "getRecipeById ganhou overloads TS explícitos (1 arg vs 2 args) em vez de um único parâmetro opcional `userId?: string` — porque o comportamento correto para 'sem userId' precisa DIFERENCIAR caller trusted (interno: adaptação, likes, confirmImportedRecipe — quer ler qualquer receita) de caller untrusted anônimo (rota pública: NÃO deve ler privado). Um único parâmetro opcional colidiria os dois casos; a rota Task 2 passa null explícito para anônimo, nunca omite o argumento."
  - "Fallback de ownership via importJobId é um segundo round-trip (findById + getImportJob), não um único filtro Mongo — porque a chave de ownership cruza duas collections (recipes → importJobs) e não pode ser expressa num $or de uma coleção só, conforme já antecipado no <action> do plano."

requirements-completed: [REV-01, CAP-01]

coverage:
  - id: D1
    description: "getRecipeById resolve ownership de import privado (createdBy[] vazio) via importJobId → ImportJob.userId: dono vê, outro usuário e anônimo recebem null"
    requirement: REV-01
    verification:
      - kind: unit
        ref: "src/modules/recipes/recipe.repository.test.ts#getRecipeById — IDOR-safe owner overload (D-14 / T-02-07)"
        status: pass
    human_judgment: false
  - id: D2
    description: "GET /recipes/:id continua público (sem requireAuth) e passa getUserId(request) explicitamente a getRecipeById, fechando o gap de enumeração sem quebrar o acesso anônimo a receitas de catálogo"
    requirement: CAP-01
    verification:
      - kind: integration
        ref: "src/modules/recipes/recipe.routes.visibility.test.ts#GET /recipes/:id — visibility guard (T-03-05/T-03-06)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Não-dono e anônimo recebem o MESMO 404 de 'não encontrada' em receita private — sem existence leak; lang=en overlay preservado para receitas públicas"
    requirement: REV-01
    verification:
      - kind: integration
        ref: "src/modules/recipes/recipe.routes.visibility.test.ts#other-user GET on someone else's private import returns 404 (same shape as anonymous)"
        status: pass
    human_judgment: false

duration: 8min
completed: 2026-07-02
status: complete
---

# Phase 3 Plan 2: Visibility Guard em GET /recipes/:id Summary

**Fecha o gap de enumeração de imports privados: `getRecipeById` ganha uma assinatura de 3 estados (trusted interno vs untrusted público) que resolve ownership de import via `importJobId → ImportJob.userId`, e `GET /recipes/:id` passa a soft-auth sem perder o acesso anônimo ao catálogo.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-07-02T05:15:00Z (aprox.)
- **Completed:** 2026-07-02T05:22:48Z
- **Tasks:** 2/2 executadas
- **Files modified:** 4 modificados + 1 criado

## Accomplishments

- `getRecipeById` reescrito com overloads TS explícitos: `getRecipeById(id)` (1 argumento) preserva o comportamento pré-existente para callers internos/trusted (adaptação, likes, `confirmImportedRecipe`) sem qualquer filtro de `visibility`; `getRecipeById(id, userId | null)` (2 argumentos) é o caminho untrusted/público que aplica o guard de visibilidade.
- Resolução de ownership de import privado em dois passos: o fast-path Mongo `$or` (público OU `createdBy.userId`) roda primeiro; se não encontrar E houver `userId`, um fallback busca o doc cru + `getImportJob(recipe.importJobId)` e compara `job.userId === userId` — porque imports nascem com `createdBy[]` vazio (`import.recipe-mapping.ts`), o `$or` sozinho nunca teria autorizado o dono real.
- `GET /recipes/:id` passa a chamar `getRecipeById(request.params.id, getUserId(request))`, mantendo-se pública (sem `requireAuth`) — anônimo e outro usuário recebem o mesmo 404 `"Receita não encontrada"` que um id inexistente (sem existence leak); dono acessa normalmente; overlay `lang=en` intocado.
- `recipe.routes.visibility.test.ts` novo cobrindo os 5 comportamentos do `VALIDATION.md` via `fastify.inject()` (estilo HTTP-level introduzido no Plano 03-01), mockando `auth.guard.js` + `recipe.repository.js`.
- `recipe.repository.test.ts` (Fase 2, pré-existente) estendido com 3 novos casos cobrindo o fallback via `importJobId` (dono, outro usuário, anônimo).
- `README.md` do módulo atualizado (estilo Obsidian — callout `[!WARNING]`) documentando o guard e a assinatura de 3 estados.

## Task Commits

Each task was committed atomically:

1. **Task 1: Resolve private-import ownership in getRecipeById via importJobId → ImportJob.userId** - `059fdea` (feat)
2. **Task 2: Wire GET /recipes/:id to pass the caller's userId (soft-auth) + visibility test** - `df7b7ea` (feat)

## Files Created/Modified

- `src/modules/recipes/recipe.repository.ts` - `getRecipeById` com overloads de 3 estados; import de `getImportJob`; fallback via `importJobId → ImportJob.userId`
- `src/modules/recipes/recipe.repository.test.ts` - mock de `@/modules/import/import-job.repository.js`; 3 novos testes do fallback de ownership de import
- `src/modules/recipes/recipe.routes.ts` - `GET /recipes/:id` passa `getUserId(request)` como 2º argumento explícito
- `src/modules/recipes/recipe.routes.visibility.test.ts` - novo, 5 testes HTTP-level (`fastify.inject`) cobrindo anônimo+público, anônimo+privado, dono+privado, outro-usuário+privado, overlay `lang=en`
- `src/modules/recipes/README.md` - callout `[!WARNING]` documentando o guard, a razão do `createdBy.userId` sozinho ser insuficiente, e a assinatura de 3 estados; tabela de arquivos atualizada

## Decisions Made

- **Overloads TS de 1 vs 2 argumentos em vez de `userId?: string`:** o plano original (Task 1 `<behavior>`) descrevia `getRecipeById(id)` sem userId como "anônimo → null para privado", mas isso colidiria com o uso interno pré-existente de `getRecipeById(recipeId)` sem userId em `confirmImportedRecipe` (Plano 03-01), `recipe.generation.ts` (adaptação) e `like.repository.ts` — todos esses precisam ler QUALQUER receita (ownership já resolvida a montante por quem chamou, ex: a rota `PATCH /import/:jobId/recipe` já escopou por `getImportJob(jobId, userId)` antes de chamar `confirmImportedRecipe`). A solução foi diferenciar "argumento omitido" (trusted/interno, comportamento inalterado) de "`null` passado explicitamente" (untrusted/anônimo, aplica o guard) via overloads TS — a rota (Task 2) sempre passa o valor explícito de `getUserId(request)`, nunca omite o argumento. Isso satisfaz tanto o requisito de segurança da Task 1 quanto a compatibilidade com os 5 callers internos existentes, sem exigir mudança nenhum deles.
- **Fallback de ownership em 2 round-trips (não um único filtro Mongo):** confirmado pelo próprio `<action>` do plano — a chave de ownership de um import cruza duas collections (`recipes.importJobId` → `import_jobs._id/userId`), o que não é expressável num único `$or` da coleção `recipes`. O fast-path Mongo continua sendo a maioria dos casos (público, ou receita privada não-import com `createdBy` populado); o fallback só roda quando o fast-path não encontrou E há `userId` — custo extra restrito ao caso raro (import ainda não confirmado sendo acessado pelo dono).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Mock de `import-job.repository.js` ausente em `recipe.repository.test.ts` quebrava toda a suite**
- **Found during:** Task 1, ao rodar `npm run test -- src/modules/recipes/recipe.repository.test.ts` após adicionar o import de `getImportJob`
- **Issue:** `recipe.repository.ts` passou a importar `getImportJob` de `import-job.repository.ts`, que por sua vez instancia `ImportJobModel` (mongoat) no module-load — sem mock, isso tenta conectar ao Mongo real e lança `Error: Database not found`, derrubando a suíte inteira (0 testes coletados). Mesmo gotcha documentado na MEMORY do projeto (ordem de import do mongoat).
- **Fix:** Adicionado `vi.mock("@/modules/import/import-job.repository.js", ...)` no topo do arquivo de teste, no mesmo padrão dos mocks existentes de `recipe.model.js`/`search-indexes.js`.
- **Files modified:** `src/modules/recipes/recipe.repository.test.ts`
- **Verification:** `npm run test -- src/modules/recipes/recipe.repository.test.ts` — 10/10 testes passam.
- **Committed in:** `059fdea` (parte do commit da Task 1)

---

**Total deviations:** 1 auto-fixed (Rule 3 - bloqueante, causado diretamente pela mudança planejada da Task 1)
**Impact on plan:** Nenhum scope creep — o mock era estritamente necessário para o teste rodar após o novo import; nenhuma lógica de produção foi alterada por essa correção.

## Issues Encountered

Durante a implementação da Task 1, identifiquei uma inconsistência entre o `<behavior>` da Task 1 (que descrevia `getRecipeById(id)` sem userId como devendo bloquear privados para "anônimo") e os 5 call-sites internos pré-existentes que dependem de `getRecipeById(id)` sem userId retornando QUALQUER receita (incluindo privados, com ownership já resolvida a montante). Resolvido com uma assinatura de 3 estados via overloads TS (ver "Decisions Made" acima) — mantém a garantia de segurança da Task 1 (anônimo/outro usuário via rota → 404) sem quebrar nenhum caller interno existente. `npm run test:all` confirma 0 regressões nos 141 testes reais (a única falha é a integration test pré-existente e não relacionada de `ytdlp.downloader.integration.test.ts`, que requer `MONGODB_URI` real).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `GET /recipes/:id` está seguro para os planos de frontend seguintes (03-03 a 03-05) linkarem diretamente para receitas importadas em revisão sem risco de enumeração por terceiros.
- Nenhum blocker novo. O gate humano pendente do Plano 03-01 (`npm run setup:db`) continua sendo o único bloqueio para confirmação real via UI persistir `confirmedAt` — não afeta esta plan (leitura, não escrita).

---
*Phase: 03-capture-mandatory-review-ui*
*Completed: 2026-07-02*

## Self-Check: PASSED

Todos os arquivos citados (`recipe.repository.ts`, `recipe.repository.test.ts`, `recipe.routes.ts`, `recipe.routes.visibility.test.ts`, `README.md`) existem no disco. Ambos os commits (`059fdea`, `df7b7ea`) existem em `git log --oneline --all`. `npm run typecheck` limpo e `npm run test` com 141/141 testes reais passando (única falha é a integration test pré-existente `ytdlp.downloader.integration.test.ts`, não relacionada, requer `MONGODB_URI` real) confirmados novamente antes da criação deste SUMMARY.
