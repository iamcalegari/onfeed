---
phase: 03-capture-mandatory-review-ui
plan: 04
subsystem: ui
tags: [nextjs, react, clipboard-api, polling, useTransition, clerk]

requires:
  - phase: 03-capture-mandatory-review-ui
    provides: "03-03 (web/lib/types.ts, web/lib/api.ts, web/app/actions.ts startImport/getImportJob/confirmImportRecipe/listMyImports, web/lib/useImportPolling.ts, web/components/GroundingBadge.tsx)"
provides:
  - "/import route (capture entry point) reachable from /perfil header/menu, not BottomNav/FAB"
  - "PasteLinkButton component: clipboard read under gesture + silent paste-event fallback + client-side URL hint + submit via startImportAction"
  - "/import/[jobId] route (server fetch + client polling child)"
  - "ImportProgress component: 4-stage vertical indicator consuming useImportPolling, ready_for_review redirect, failed/timeout terminal states"
  - "TopBar PAGE_TITLES entry for /import (covers /import, /import/[jobId], /import/[jobId]/review via prefix match)"
affects: [03-05-review-and-confirm, phase-04]

tech-stack:
  added: []
  patterns:
    - "Clipboard read as the first async call in a click handler via .then()/.catch() (no leading await) with a silent catch — never surface a permission/denial error to the user"
    - "Native onPaste listener as the always-available fallback path alongside the Clipboard API button"
    - "Explicit timedOut boolean from a polling hook renders a distinct terminal UI state instead of an indefinite spinner"

key-files:
  created:
    - "web/app/(main)/import/page.tsx"
    - "web/app/(main)/import/[jobId]/page.tsx"
    - "web/components/PasteLinkButton.tsx"
    - "web/components/ImportProgress.tsx"
  modified:
    - "web/components/TopBar.tsx"
    - "web/app/(main)/perfil/page.tsx"

key-decisions:
  - "/import wired into /perfil's existing SETTINGS list (header/menu) rather than /hoje, since /perfil already renders a list-of-links pattern matching D-01's 'reachable via header/menu' requirement with zero new layout"
  - "TopBar PAGE_TITLES uses a single '/import' prefix entry covering all three sub-routes (progress + review) — progress/review screens render their own in-body H1 so the generic TopBar title is harmless, matching UI-SPEC's 'self-titled acceptable' note"

patterns-established:
  - "Import capture flow: PasteLinkButton submit -> startImportAction -> router.push(/import/[jobId]) -> useImportPolling drives ImportProgress -> router.push(/import/[jobId]/review) on ready_for_review"

requirements-completed: [CAP-01]

coverage:
  - id: D1
    description: "/import route with pantry-style hard auth guard, H1/subtitle per UI-SPEC, renders PasteLinkButton"
    requirement: "CAP-01"
    verification:
      - kind: automated_ui
        ref: "cd web && npx tsc --noEmit"
        status: pass
    human_judgment: true
    rationale: "Visual conformance to UI-SPEC (spacing, color, copy) and actual browser behavior of the auth redirect require manual UAT, not just a typecheck."
  - id: D2
    description: "PasteLinkButton: Colar link reads clipboard under gesture with silent fallback (never a red error), always-on onPaste fallback, client-side isLikelyUrl hint is UX-only, submit calls startImportAction and routes to /import/[jobId]"
    requirement: "CAP-01"
    verification:
      - kind: automated_ui
        ref: "cd web && npx tsc --noEmit"
        status: pass
    human_judgment: true
    rationale: "Clipboard permission behavior (granted/denied/unsupported, Safari vs Chrome) and the 'no visible error' guarantee can only be confirmed by manual cross-browser testing, per VALIDATION.md Manual-Only."
  - id: D3
    description: "/import/[jobId] progress route + ImportProgress: real per-stage progress via polling, redirect to review on ready_for_review, legible mapped failureReason + retry on failed, explicit timeout state after POLL_TIMEOUT_MS"
    requirement: "CAP-01"
    verification:
      - kind: automated_ui
        ref: "cd web && npx tsc --noEmit"
        status: pass
    human_judgment: true
    rationale: "End-to-end progress behavior (real backend job transitions, worker-down timeout, failure copy correctness) requires live-job manual UAT per VALIDATION.md, not just a typecheck."
  - id: D4
    description: "TopBar/perfil nav wiring: /import reachable from header/menu, not a new BottomNav item, not a FAB"
    requirement: "CAP-01"
    verification:
      - kind: automated_ui
        ref: "cd web && npx tsc --noEmit"
        status: pass
    human_judgment: true
    rationale: "Confirming the link is discoverable and BottomNav remains unchanged is a manual navigation check per VALIDATION.md."

duration: 33min
completed: 2026-07-02
status: complete
---

# Phase 3 Plan 4: Capture Entry Point + Live Progress Screen Summary

**`/import` (paste-link capture) e `/import/[jobId]` (progresso real via polling) implementados sobre a base da wave 2 (types/api/actions/useImportPolling já existentes), com Clipboard API + fallback silencioso e estado explícito de timeout.**

## Performance

- **Duration:** ~33 min
- **Started:** 2026-07-02T05:04:38Z (aprox., baseado em STATE.md)
- **Completed:** 2026-07-02T05:37:20Z
- **Tasks:** 3
- **Files modified:** 6 (4 criados, 2 modificados)

## Accomplishments
- `/import`: rota com auth-guard rígido (`redirect("/sign-in")`), H1/subtitle conforme UI-SPEC, hospedando `PasteLinkButton`
- `PasteLinkButton`: input controlado + "Colar link" (lê clipboard como primeira chamada assíncrona do handler, sem `await` antes, fallback silencioso em erro) + `onPaste` nativo sempre ativo + hint de URL inválida (UX-only) + submit via `startImportAction` navegando para `/import/[jobId]`
- `/import/[jobId]` + `ImportProgress`: fetch inicial server-side do job, polling real via `useImportPolling`, indicador vertical de 4 estágios reutilizando o keyframe `spin-ring` existente, redirecionamento para `/review` em `ready_for_review`, copy de erro mapeada por `failureReason`, estado explícito de timeout (nunca spinner silencioso)
- Navegação: `/import` adicionado à TopBar (`PAGE_TITLES`) e à lista de atalhos do `/perfil` — sem tocar em `BottomNav.tsx` (D-01)

## Task Commits

Each task was committed atomically:

1. **Task 1: /import route + PasteLinkButton** - `812d86a` (feat)
2. **Task 2: /import/[jobId] progress route + ImportProgress** - `f3bdf1b` (feat)
3. **Task 3: TopBar nav wiring for /import** - `c94f352` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified
- `web/app/(main)/import/page.tsx` - Rota de captura, auth-guard rígido, hospeda PasteLinkButton
- `web/components/PasteLinkButton.tsx` - Input de URL + clipboard read/fallback + submit
- `web/app/(main)/import/[jobId]/page.tsx` - Rota de progresso (fetch inicial server-side)
- `web/components/ImportProgress.tsx` - Indicador de estágio + polling + estados terminais (review/failed/timeout)
- `web/components/TopBar.tsx` - `PAGE_TITLES["/import"]` adicionado
- `web/app/(main)/perfil/page.tsx` - Item "Importar receita" adicionado à lista `SETTINGS`

## Decisions Made
- Âncora do link de header/menu escolhida como `/perfil` (lista `SETTINGS` já existente) em vez de `/hoje`, por já seguir exatamente o padrão "lista de links" que D-01 pede, sem inventar novo layout.
- `TopBar.PAGE_TITLES["/import"]` cobre as três sub-rotas via prefix match (`pathname.startsWith(key + "/")`); telas de progresso/revisão têm H1 próprio no corpo, então o título genérico da TopBar não conflita, conforme UI-SPEC permite explicitamente.
- `readText()` implementado com `.then()/.catch()` (não `await`) para garantir de forma inequívoca que é a primeira operação assíncrona do handler, sem qualquer chamada anterior que pudesse quebrar a cadeia de user-activation (Pattern 3 / Pitfall verbatim).

## Deviations from Plan

None - plan executado exatamente como escrito. `useImportPolling` (já existente da wave 03-03) retorna `{ job, timedOut }` em vez do shape single-value sugerido em 03-PATTERNS.md — `ImportProgress` foi escrito consumindo o hook real (código-fonte), não o pseudocódigo do PATTERNS.md, que já antecipava essa divergência ("diferente de useLazyThumbnail... expõe timedOut: true explicitamente").

## Issues Encountered
None.

## User Setup Required
None - nenhuma configuração de serviço externo necessária.

## Next Phase Readiness
- `/import` → `/import/[jobId]` → `/import/[jobId]/review` (rota ainda não implementada) está com o link de navegação pronto para o plano 03-05, que deve criar a tela de revisão obrigatória.
- Manual UAT pendente (per VALIDATION.md Manual-Only): paste válido → submit → progresso real → review; clipboard negado/Safari → fallback silencioso; worker-down → timeout; URL inválida → failureReason legível.

---
*Phase: 03-capture-mandatory-review-ui*
*Completed: 2026-07-02*

## Self-Check: PASSED

All created/modified files found on disk; all 3 task commits (812d86a, f3bdf1b, c94f352) verified in git log.
