---
phase: 03-capture-mandatory-review-ui
plan: 05
subsystem: ui
tags: [nextjs, react, tailwind, clerk, import, review, grounding]

requires:
  - phase: 03-capture-mandatory-review-ui
    provides: "03-01 backend PATCH /import/:jobId/recipe + GET /import/mine + GET /recipes/:id visibility guard; 03-03 frontend types/actions/api wrappers + GroundingBadge; 03-04 /import + /import/[jobId] progress routes"
provides:
  - "/import/[jobId]/review route + ImportReviewForm: mandatory inline-edit review screen with grounding badges and single-PATCH confirm gate (REV-01..04)"
  - "/import/mine route + ImportsList: owner-scoped imports list with per-item status and deep-links (D-09)"
  - "web/lib/types.ts Recipe now carries grounding/reviewRequired/confirmedAt (was missing, blocked REV-02/REV-03 on the frontend)"
  - "backend fix: mapExtractedToRecipe now sets createdBy so listMyImportedRecipes/hybridSearch ownerId filter actually matches imported recipes"
affects: [phase-04, ui-review, import-confirm-flow]

tech-stack:
  added: []
  patterns:
    - "Grounding zip-at-fetch: ingredients[i]/steps[i] paired with quantityGrounding[i]/stepGrounding[i] into { ingredient, grounding } units immediately on component init (useState initializer), never re-indexed during render"
    - "Confirm gate via useTransition + content-only patch construction (title/intro/ingredients{name,quantity,unit}/steps{text}) — grounding/reviewRequired/confidenceScore never sent from client"

key-files:
  created:
    - "web/app/(main)/import/[jobId]/review/page.tsx"
    - "web/components/ImportReviewForm.tsx"
    - "web/app/(main)/import/mine/page.tsx"
    - "web/components/ImportsList.tsx"
  modified:
    - "web/lib/types.ts"
    - "src/modules/import/import.recipe-mapping.ts"
    - "src/modules/import/import.recipe-mapping.test.ts"
    - "web/components/README.md"
    - "web/README.md"
    - "src/modules/import/README.md"

key-decisions:
  - "Frontend Recipe type was missing grounding/reviewRequired/confirmedAt (backend Recipe has all three) — added them; without this REV-02 badges and the review screen's field-level flags could not compile/render"
  - "Backend mapExtractedToRecipe never populated createdBy on imported recipes, so hybridSearch's ownerId $or filter never matched — GET /import/mine always returned empty. Fixed by setting createdBy: [{ userId: job.userId, username: job.userId }] (username placeholder — no Clerk profile lookup in this backend context, and createdBy is never rendered for source:'imported', only for source:'variant')"
  - "ImportsList status mapping simplified to what ImportedRecipeListItem (RecipeSearchHit + reviewRequired/confirmedAt) can actually express: confirmedAt present -> 'Confirmada' (-> /recipe/:id), otherwise -> 'Em revisão' (-> /import/:jobId/review). 'Falhou'/'Importando…' states from the UI-SPEC copy table apply to ImportJob-level state (no Recipe doc yet) which this owner-scoped Recipe-search endpoint cannot see — out of this endpoint's data shape, not a missed requirement"

patterns-established:
  - "Confirm-gate mutation shape: useTransition + startTransition(async () => { ...call server action...; if ok router.push(...) else setError(...) })"

requirements-completed: [REV-01, REV-02, REV-03, REV-04, CAP-01]

coverage:
  - id: D1
    description: "/import/[jobId]/review shows extracted title/ingredients/steps/tips with inferred/ambiguous GroundingBadge pills and grounded fields neutral (no badge)"
    requirement: "REV-02"
    verification:
      - kind: unit
        ref: "cd web && npx tsc --noEmit"
        status: pass
      - kind: manual_procedural
        ref: "VALIDATION.md risoto fixture: title 'Confira isto — inferido', 'a gosto' quantity 'impreciso', spoken ingredients neutral"
        status: unknown
    human_judgment: true
    rationale: "Grounding correctness depends on the real LLM extraction output for the risoto fixture — verified visually against VALIDATION.md, not unit-testable from this plan's frontend-only scope."
  - id: D2
    description: "Every field (title, intro, each ingredient name/quantity/unit, each step) is editable inline held in local React state — no field is persisted on blur/change"
    requirement: "REV-03"
    verification:
      - kind: unit
        ref: "cd web && npx tsc --noEmit"
        status: pass
    human_judgment: true
    rationale: "Absence of auto-save is a behavioral/negative assertion (nothing persists until confirm) best verified by manual UAT navigating away without confirming, per VALIDATION.md."
  - id: D3
    description: "'Confirmar receita' fires exactly one PATCH with content-only fields (title/intro/ingredients{name,quantity,unit}/steps{text}, never grounding/reviewRequired/confidenceScore) and routes to /recipe/[recipeId] on success"
    requirement: "REV-04"
    verification:
      - kind: unit
        ref: "cd web && npx tsc --noEmit"
        status: pass
    human_judgment: true
    rationale: "Single-PATCH-then-navigate behavior needs manual confirmation against a live confirmImportRecipeAction call and the recipe detail route; no integration test exists in this frontend-only plan."
  - id: D4
    description: "/import/mine lists the caller's imports with correct per-item status label ('Confirmada'/'Em revisão') and deep-links (confirmed -> /recipe/:id, in-review -> /import/:jobId/review), empty state when none, plain <Link> rows with no swipe-to-delete"
    requirement: "D-09"
    verification:
      - kind: unit
        ref: "src/modules/import/import.recipe-mapping.test.ts (createdBy assertion, backend prerequisite for D-09)"
        status: pass
      - kind: unit
        ref: "cd web && npx tsc --noEmit"
        status: pass
      - kind: manual_procedural
        ref: "VALIDATION.md: /import/mine shows correct status per item and deep-links correctly"
        status: unknown
    human_judgment: true
    rationale: "End-to-end list rendering against a real owner-scoped backend response needs manual verification; the backend prerequisite (createdBy populated so ownerId filter matches) is unit-tested, but the full list->deep-link flow is not."

duration: 55min
completed: 2026-07-02
status: complete
---

# Phase 3 Plan 05: Review Screen + Imports List Summary

**Mandatory review/edit screen with zip-at-fetch grounding badges and single-PATCH confirm gate, plus the owner-scoped "Minhas importações" list — completed by fixing a backend `createdBy` gap that silently made `/import/mine` always return empty.**

## Performance

- **Duration:** ~55 min
- **Completed:** 2026-07-02T05:47:09Z
- **Tasks:** 2
- **Files modified:** 10 (4 created, 6 modified)

## Accomplishments
- `/import/[jobId]/review` (server component, two round-trips: `GET /import/:jobId` then `GET /recipes/:recipeId`) hands off to `ImportReviewForm`, which zips grounding arrays with ingredients/steps once at init, holds all edits in local state, and fires a single content-only PATCH on "Confirmar receita" before routing to `/recipe/[recipeId]`
- `/import/mine` (server component, `favorites/page.tsx` auth-guard shell analog) hands off to `ImportsList`, a plain-`<Link>`-row list (no swipe-to-delete) with status derived from `confirmedAt`/`reviewRequired` and an empty state
- Found and fixed a real backend bug blocking D-09: imported recipes never had `createdBy` populated, so `hybridSearch`'s owner-scope `$or` filter never matched them — `GET /import/mine` was silently returning `[]` for every user before this plan

## Task Commits

Each task was committed atomically:

1. **Task 1: /import/[jobId]/review route + ImportReviewForm** - `a1d0c7c` (feat)
2. **[Deviation - Rule 1 bug fix] createdBy missing on imported recipes** - `8b589e1` (fix)
3. **Task 2: /import/mine route + ImportsList** - `dd14fc5` (feat)
4. **README updates (Obsidian convention)** - `427ff2f` (docs)

**Plan metadata:** (this commit, docs: complete plan)

## Files Created/Modified
- `web/app/(main)/import/[jobId]/review/page.tsx` - server component: auth-guard, fetches job then recipe (two round-trips), hands off to ImportReviewForm
- `web/components/ImportReviewForm.tsx` - inline-editable review form: zips grounding at init, local-state-only edits, useTransition confirm -> single PATCH -> router.push to recipe detail
- `web/app/(main)/import/mine/page.tsx` - server component mirroring favorites/page.tsx's soft-auth-guard shell, fetches via listMyImportsAction
- `web/components/ImportsList.tsx` - plain-Link row list (FavoritesList row shape minus swipe-to-delete), status label + deep-link per item, empty state
- `web/lib/types.ts` - `Recipe` interface gains `grounding?`, `reviewRequired?`, `confirmedAt?` (backend already had them; frontend mirror was stale, blocking this plan's badge/gate logic)
- `src/modules/import/import.recipe-mapping.ts` - `mapExtractedToRecipe` now sets `options.createdBy` so imported recipes are ownerId-discoverable
- `src/modules/import/import.recipe-mapping.test.ts` - added assertion locking in the `createdBy` fix
- `web/components/README.md`, `web/README.md`, `src/modules/import/README.md` - Obsidian-style docs updated per module

## Decisions Made
- Frontend `Recipe` type was missing fields the backend already returns (`grounding`, `reviewRequired`, `confirmedAt`) — added them rather than working around the gap with `as any`/optional chaining hacks, since these are the exact fields REV-02/REV-03 need.
- Fixed the `createdBy` gap in the backend mapping module (not in this plan's `files_modified` list) because it directly blocks this plan's D-09 success criterion (`/import/mine` returning items at all) — scoped narrowly to the one field, verified against the existing `getRecipeById` ownership-resolution precedent to confirm `createdBy` is never publicly rendered for `source: "imported"` (only for `source: "variant"`), so the placeholder `username` value is safe.
- Did not attempt to surface `ImportJob`-level "Falhou"/"Importando…" statuses in `/import/mine`, since `listMyImportsAction` (`GET /import/mine`) only returns confirmed `Recipe` search hits, not raw `ImportJob` documents — those states are out of this endpoint's data shape as built in 03-01/03-02, not a gap introduced or owed by this plan.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Frontend `Recipe` type missing `grounding`/`reviewRequired`/`confirmedAt`**
- **Found during:** Task 1 (ImportReviewForm implementation)
- **Issue:** `web/lib/types.ts`'s `Recipe` interface (hand-mirrored from the backend) lacked the three fields the review screen needs to render grounding badges and know confirmation state — backend `Recipe` (src/modules/recipes/recipe.types.ts) already has all three.
- **Fix:** Added `grounding?: RecipeGrounding`, `reviewRequired?: boolean`, `confirmedAt?: string` to the frontend `Recipe` interface.
- **Files modified:** `web/lib/types.ts`
- **Verification:** `cd web && npx tsc --noEmit` clean.
- **Committed in:** `a1d0c7c` (Task 1 commit)

**2. [Rule 1 - Bug] `createdBy` never populated on imported recipes, breaking `/import/mine`**
- **Found during:** Task 2 (ImportsList implementation) — while tracing how `listMyImportsAction` resolves ownership, discovered `hybridSearch({ ownerId })`'s `$or` filter matches on `createdBy.userId`, but `import.recipe-mapping.ts` never set `createdBy` on imported recipes (confirmed via the `getRecipeById` code comment explicitly documenting "SEM createdBy[]" for imports).
- **Issue:** `GET /import/mine` (via `listMyImportedRecipes`) would return `[]` for every user, regardless of how many recipes they imported — the owner-scope filter structurally could never match.
- **Fix:** `mapExtractedToRecipe` now sets `options.createdBy: [{ userId: job.userId, username: job.userId }]`. Verified `createdBy` is never publicly rendered for `source: "imported"` recipes (the "Por @username" block in `recipe/[id]/page.tsx` only renders when `isVariant` i.e. `source === "variant"`), so the `username` placeholder (repeating `userId`, same fallback pattern already used in `web/app/actions.ts`) is safe.
- **Files modified:** `src/modules/import/import.recipe-mapping.ts`, `src/modules/import/import.recipe-mapping.test.ts`
- **Verification:** `npx vitest run src/modules/import/` (63/63 pass, including the new assertion); `npx tsc --noEmit -p .` clean.
- **Committed in:** `8b589e1` (separate fix commit before Task 2)

---

**Total deviations:** 2 auto-fixed (2 Rule 1 bug fixes)
**Impact on plan:** Both fixes were prerequisites for this plan's own success criteria to be achievable (REV-02/REV-03 rendering, D-09 returning any data at all). No scope creep beyond what was needed to make the shipped screens actually work end-to-end.

## Issues Encountered
None beyond the two deviations above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 4 Phase 3 screens now exist: `/import`, `/import/[jobId]` (progress), `/import/[jobId]/review`, `/import/mine`.
- Manual UAT still pending per `03-VALIDATION.md` (risoto fixture grounding badges, no-persist-until-confirm behavior, `/import/mine` status/deep-link correctness) — flagged as `human_judgment: true` in this SUMMARY's coverage block, not yet executed in this session.
- The `createdBy` fix should be spot-checked against a real import end-to-end (POST /import -> ready_for_review -> confirm -> GET /import/mine shows it as "Confirmada") since it was verified by unit test + code-path tracing, not a live run.

---
*Phase: 03-capture-mandatory-review-ui*
*Completed: 2026-07-02*

## Self-Check: PASSED
- FOUND: .planning/phases/03-capture-mandatory-review-ui/03-05-SUMMARY.md
- FOUND commits: a1d0c7c, 8b589e1, dd14fc5, 427ff2f
