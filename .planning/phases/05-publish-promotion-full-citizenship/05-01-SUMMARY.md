---
phase: 05-publish-promotion-full-citizenship
plan: 01
subsystem: database
tags: [mongoat, mongodb, jsonschema, recipe-model, env-config, vitest]

requires:
  - phase: 04-cost-quota-gating-dedup
    provides: import.confidence.ts (REVIEW_SCORE_THRESHOLD=0.6), env.import block conventions
provides:
  - "Recipe.shareSlug optional string field (TS type + BSON validator, in sync)"
  - "share_slug_lookup unique+sparse index declaration on Recipe.shareSlug"
  - "env.import.promoteConfidence (IMPORT_PROMOTE_CONFIDENCE, default 0.7) public-promotion confidence gate"
  - "Model-shape test proving shareSlug type-safety and promoteConfidence > REVIEW_SCORE_THRESHOLD"
affects: [05-02 (maybePromote widening consumes promoteConfidence), 05-03 (confirmImportedRecipe writes shareSlug, getRecipeByShareSlug reads it), 05-04, 05-05]

tech-stack:
  added: []
  patterns:
    - "mongoat two-source-of-truth schema sync: TS type (recipe.types.ts) + BSON $jsonSchema validator (recipe.model.ts) changed in the same commit"
    - "unique+sparse index for secret-token lookup fields (mirrors external_id_unique)"
    - "env threshold gate: Number(optional(ENV_VAR, default)) grouped inside the related config block"

key-files:
  created:
    - src/modules/recipes/recipe.model.test.ts
  modified:
    - src/modules/recipes/recipe.types.ts
    - src/modules/recipes/recipe.model.ts
    - src/config/env.ts

key-decisions:
  - "shareSlug NOT added to RecipeSearchHit — search results never need the token, per plan instruction"
  - "share_slug_lookup index copies the exact unique+sparse shape of external_id_unique (not the plain-sparse import_job_lookup) since token uniqueness is a hard DB-level guarantee, not just a lookup convenience"
  - "recipe.model.test.ts stubs the required env vars (MONGODB_URI/USERNAME/PASSWORD/DB_NAME, VOYAGE_API_KEY, ANTHROPIC_API_KEY) via process.env before a dynamic import of @/config/env.js — no other *.test.ts in the repo imports the real env module directly, and env.ts's required() throws at import time without them; this keeps the test pure/synchronous without needing a .env file or dotenv dependency"

patterns-established:
  - "Schema-sync tasks (type + validator + index) land in one commit; the live-Atlas collMod sync (npm run setup:db) is a separate, explicitly documented USER GATE — mirrors 04-02's precedent"

requirements-completed: [SOC-02]

coverage:
  - id: D1
    description: "Recipe.shareSlug optional string declared identically in recipe.types.ts and recipe.model.ts BSON validator"
    requirement: "SOC-02"
    verification:
      - kind: unit
        ref: "src/modules/recipes/recipe.model.test.ts#Recipe.shareSlug (Fase 5, D-03/D-04) > aceita shareSlug como string e lê o valor de volta"
        status: pass
      - kind: unit
        ref: "src/modules/recipes/recipe.model.test.ts#Recipe.shareSlug (Fase 5, D-03/D-04) > lê shareSlug ausente como undefined via optional access, sem lançar (receitas pré-Fase-5)"
        status: pass
    human_judgment: false
  - id: D2
    description: "share_slug_lookup unique+sparse index declared in recipe.model.ts indexes array"
    requirement: "SOC-02"
    verification:
      - kind: other
        ref: "grep -c share_slug_lookup src/modules/recipes/recipe.model.ts (returns 1, line contains unique:true and sparse:true)"
        status: pass
    human_judgment: false
  - id: D3
    description: "env.import.promoteConfidence exists as a dedicated public-promotion gate, strictly above REVIEW_SCORE_THRESHOLD (0.6)"
    requirement: "SOC-02"
    verification:
      - kind: unit
        ref: "src/modules/recipes/recipe.model.test.ts#Recipe.shareSlug (Fase 5, D-03/D-04) > env.import.promoteConfidence é um número finito estritamente maior que o threshold de revisão (0.6, D-06)"
        status: pass
    human_judgment: false
  - id: D4
    description: "npm run setup:db run against live Atlas to sync the collMod validator + share_slug_lookup index before any Plan 03 confirm-time shareSlug write"
    requirement: "SOC-02"
    verification: []
    human_judgment: true
    rationale: "The harness blocks .env/prod-Atlas credentials — this is a documented USER GATE that only the user can execute and confirm. Not run by the executor."

duration: 15min
completed: 2026-07-02
status: complete
---

# Phase 5 Plan 01: Schema Foundation for Shareable Links Summary

**Recipe.shareSlug (optional, unique+sparse-indexed) and env.import.promoteConfidence (0.7, stricter than the 0.6 review bar) added across mongoat's two sources of truth in one commit, with setup:db left as a pending USER GATE.**

## Performance

- **Duration:** 15 min
- **Started:** 2026-07-02T19:06:00Z
- **Completed:** 2026-07-02T19:09:30Z
- **Tasks:** 2
- **Files modified:** 4 (3 modified, 1 created)

## Accomplishments
- `Recipe.shareSlug?: string` added identically to `recipe.types.ts` (TS type) and `recipe.model.ts` (BSON `$jsonSchema` validator) in the same commit — the mongoat two-source-of-truth gotcha that caused Phase 2/3 UAT failures was avoided by construction.
- `share_slug_lookup` unique+sparse index declared on `Recipe.shareSlug`, mirroring the `external_id_unique` shape: unique guarantees no two recipes can ever resolve to the same public token; sparse exempts every pre-Phase-5 recipe (which lacks the field) from the unique constraint.
- `env.import.promoteConfidence` (`IMPORT_PROMOTE_CONFIDENCE`, default `0.7`) added to the existing `import` config block — a dedicated public-promotion confidence bar, proven in a unit test to sit strictly above `REVIEW_SCORE_THRESHOLD` (`0.6`) per D-06.
- Model-shape test (`recipe.model.test.ts`) proves: (a) `shareSlug` is type-valid when set, (b) absent `shareSlug` reads back as `undefined` via optional access without throwing (pre-Phase-5 doc safety), and (c) `promoteConfidence > 0.6`.

## Task Commits

Each task was committed atomically:

1. **Task 1 [BLOCKING]: shareSlug type + BSON validator + unique/sparse index + env.promoteConfidence** - `29b073a` (feat)
2. **Task 2: Model-shape test** - `8781094` (test)

**Plan metadata:** _(pending — this SUMMARY's commit)_

## Files Created/Modified
- `src/modules/recipes/recipe.types.ts` - Added `shareSlug?: string` field to the `Recipe` interface (pt-BR comment, adjacent to `confirmedAt`). NOT added to `RecipeSearchHit`.
- `src/modules/recipes/recipe.model.ts` - Added `shareSlug: { bsonType: "string" }` BSON property (not in `required`) and the `share_slug_lookup` unique+sparse index.
- `src/config/env.ts` - Added `import.promoteConfidence` (`Number(optional("IMPORT_PROMOTE_CONFIDENCE", "0.7"))`) with a pt-BR comment cross-referencing `REVIEW_SCORE_THRESHOLD`.
- `src/modules/recipes/recipe.model.test.ts` (new) - Pure unit/shape-guard test; stubs required env vars before dynamically importing `@/config/env.js` (first test file in the repo to import the real env module).

## Decisions Made
- `shareSlug` deliberately excluded from `RecipeSearchHit` — search results never surface the raw token (plan instruction, security-relevant: keeps the token out of any list/search response payload).
- Copied the `external_id_unique` unique+sparse index shape (not `import_job_lookup`'s plain-sparse shape) because token collision must be structurally impossible at the DB layer (T-05-02), not merely a lookup optimization.
- `recipe.model.test.ts` stubs the minimal required env vars via `process.env` assignment + dynamic `import()` inside `beforeAll`, rather than requiring a `.env` file or adding a `dotenv` dependency — keeps the test synchronous-in-spirit, network-free, and independent of the shell's actual `.env` state. This is a new pattern in the repo (no other test imports `@/config/env` directly); documented inline in the test file for future test authors.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Test file could not import the real `env` module without stubbed env vars**
- **Found during:** Task 2 (model-shape test)
- **Issue:** `src/config/env.ts` calls `required()` for `MONGODB_URI`, `MONGODB_USERNAME`, `MONGODB_PASSWORD`, `MONGODB_DB_NAME`, `VOYAGE_API_KEY`, and `ANTHROPIC_API_KEY` at module-load time, throwing if any are absent. The Bash tool cannot read the project's `.env` file (permission denied), and `vitest.config.ts` has no `dotenv`/`setupFiles` wiring — running `npm run test` failed immediately with `Variável de ambiente obrigatória ausente: MONGODB_URI`.
- **Fix:** Stubbed the six required env vars via `process.env.X ??= "stub"` inside a `beforeAll`, then dynamically `import()`ed `@/config/env.js` after the stub, assigning the result to a module-scoped `env` variable typed via `typeof EnvType`. This satisfies `required()`'s contract without needing real credentials, a `.env` file, or a new dependency.
- **Files modified:** `src/modules/recipes/recipe.model.test.ts` (no other files touched by this fix)
- **Verification:** `npm run test -- src/modules/recipes/recipe.model.test.ts` — 3/3 tests pass; `npm run typecheck` exits 0.
- **Committed in:** `8781094` (Task 2 commit, since the fix is intrinsic to writing a working test — no separate commit needed)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** The fix only affects test-file plumbing (how the test loads config), not the shipped schema/config code from Task 1. No scope creep — no other files were touched, and env.ts itself was not modified for this fix.

## Issues Encountered
- Running the full fast suite (`npm run test`) surfaces a **pre-existing, unrelated** failure in `src/workers/import-worker.test.ts` ("Database not found" from mongoat's `Model` constructor, triggered by `RecipeModel` at module-load in `recipe.repository.ts`). Confirmed via `git stash` that this failure exists on `main` *before* this plan's changes — it is the "ordem de import (Database not found)" mongoat gotcha already known and tracked in project memory, out of this plan's scope per the Deviation Rules' scope boundary (only auto-fix issues directly caused by the current task's changes). Not fixed here; all 148 other tests in the fast suite pass, including the 3 new tests in this plan.

## User Setup Required

**`npm run setup:db` has NOT been run.** This is a documented, blocking USER GATE per the plan's `user_setup` frontmatter — the harness executing this plan blocks `.env`/prod-Atlas credentials, so the executor cannot run the live collMod sync.

**What is pending:**
1. Run `npm run setup:db` locally (with the project's `.env` present — `MONGODB_URI`/`MONGODB_USERNAME`/`MONGODB_PASSWORD`/`MONGODB_DB_NAME` already provisioned from prior phases).
2. This executes `src/infra/database/setup.ts` → `database.setupCollections()`, which applies the updated `$jsonSchema` validator (including the new `shareSlug` property) via `collMod` and provisions the `share_slug_lookup` unique+sparse index against the live Atlas `recipes` collection.
3. Confirm the setup script's console output shows collections/validators/indexes are ready, with no errors.

**Why this blocks downstream work:** Plan 03's `confirmImportedRecipe` will write `shareSlug` at confirm-time. If `setup:db` has not synced the live validator, that write fails with a Mongo `DocumentValidationFailure` (the exact class of bug that failed Phase 2/3 UAT). **Plan 03 must not proceed past its shareSlug-write task until this gate is confirmed done.**

**Verification command once run:** re-run this plan's automated verify (`npm run typecheck && grep -c "share_slug_lookup" src/modules/recipes/recipe.model.ts | grep -qx 1 && ...`) is code-only and already passes; the live-Atlas confirmation is manual (inspect `setup:db`'s console output, or attempt a `shareSlug` write from a scratch script and confirm it succeeds).

## Next Phase Readiness
- Task 1 and Task 2 are both complete and committed; the schema/config foundation is fully in place for Plan 02 (`promoteConfidence`-gated `maybePromote` widening) and Plan 03 (`shareSlug` generation + `getRecipeByShareSlug`).
- **Blocker for Plan 03:** the `npm run setup:db` USER GATE above must be confirmed run by the user before Plan 03's confirm-time `shareSlug` write task executes, or that write will fail validation against the live Atlas instance.
- Plan 02 has no dependency on `setup:db` (it only reads `env.import.promoteConfidence`, no new writes), so it can proceed independently of this gate.

---
*Phase: 05-publish-promotion-full-citizenship*
*Completed: 2026-07-02*

## Self-Check: PASSED

All created/modified files verified present on disk; both task commits (`29b073a`, `8781094`) verified present in `git log`.
