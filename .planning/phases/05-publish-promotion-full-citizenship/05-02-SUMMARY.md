---
phase: 05-publish-promotion-full-citizenship
plan: 02
subsystem: backend
tags: [likes, recipes, promotion, mongoat, vitest]

requires:
  - phase: 05-publish-promotion-full-citizenship
    plan: 01
    provides: env.import.promoteConfidence (IMPORT_PROMOTE_CONFIDENCE, default 0.7)
provides:
  - "promoteImportToPublic(recipeId) — visibility flip private->public, source stays 'imported' (D-05)"
  - "maybePromote widened: imported branch with 3-part gate (third-party likes >= threshold AND confidenceScore >= promoteConfidence AND confirmedAt != null)"
  - "Owner self-like exclusion in the promotion count via LikeModel.total({ userId: { $ne: ownerId } }) (D-08)"
  - "like.repository.test.ts proving the gate, self-like exclusion, and generated_pending regression"
affects: [05-03 (shareSlug generation reuses the same imported recipe), 05-06 (citizenship reuse verification, search-isolation regression)]

tech-stack:
  added: []
  patterns:
    - "LikeModel.total(filter) forwards the filter directly to collection.countDocuments() (mongoat) — full Mongo operator support ($ne, etc), no client-side count-and-filter needed"
    - "Source-gated promotion trigger: parallel branches in maybePromote, one per Recipe.source, each calling a dedicated promote-mutation with its own idempotency-guarded filter"

key-files:
  created:
    - src/modules/likes/like.repository.test.ts
  modified:
    - src/modules/recipes/recipe.repository.ts
    - src/modules/likes/like.repository.ts
    - src/modules/likes/README.md

key-decisions:
  - "LikeModel.total() exclusion path: operator filter ($ne), NOT client-side count. Verified against mongoat's Model.total() (lib/model/index.d.ts) and database/index.js:190 -- total() forwards its filter arg straight into collection.countDocuments(filter, options), so { recipeId, userId: { $ne: ownerId } } works natively as a standard MongoDB filter. This is the path Plan 06's regression should rely on."
  - "getRecipeById used via its 1-argument (trusted/internal caller) overload inside maybePromote, matching the pre-existing generated_pending branch -- no visibility filter needed since maybePromote is a server-side trigger, not an untrusted-caller path."
  - "recipes/README.md left untouched -- its Fase-2-era note that imports have no createdBy[] is now stale (PATTERNS.md's pattern-mapper already flagged this drift), but recipes/README.md is out of this plan's files_modified scope; only likes/README.md was updated."

requirements-completed: [SOC-04, SOC-05]

coverage:
  - id: D1
    description: "promoteImportToPublic flips visibility private->public, keeps source:'imported', idempotent via source+visibility filter guard"
    requirement: "SOC-04"
    verification:
      - kind: other
        ref: "grep -c promoteImportToPublic src/modules/recipes/recipe.repository.ts returns 1; npm run typecheck exits 0"
        status: pass
    human_judgment: false
  - id: D2
    description: "maybePromote imported branch applies the full D-06 3-part gate (third-party likes >= threshold AND confidenceScore >= promoteConfidence AND confirmedAt != null)"
    requirement: "SOC-04"
    verification:
      - kind: unit
        ref: "src/modules/likes/like.repository.test.ts#maybePromote (via toggleLike) — receita imported (D-05..D-08) > promove ... / NÃO promove quando confidenceScore < promoteConfidence ... / NÃO promove quando confirmedAt é null ..."
        status: pass
    human_judgment: false
  - id: D3
    description: "Owner/importer's own like is excluded from the promotion count (D-08)"
    requirement: "SOC-04"
    verification:
      - kind: unit
        ref: "src/modules/likes/like.repository.test.ts#... exclui o próprio like do dono do count (D-08) ... / com um like de terceiro a mais ... -> promove (D-08)"
        status: pass
    human_judgment: false
  - id: D4
    description: "generated_pending -> variant promotion path unchanged (regression)"
    requirement: "SOC-04"
    verification:
      - kind: unit
        ref: "src/modules/likes/like.repository.test.ts#maybePromote (via toggleLike) — receita generated_pending (regressão, inalterado)"
        status: pass
    human_judgment: false
  - id: D5
    description: "SOC-05 credit retention: source never changes on promotion, so createdBy[]/sourceMeta survive"
    requirement: "SOC-05"
    verification:
      - kind: other
        ref: "promoteImportToPublic's $set only touches visibility+updatedAt (no source/createdBy/sourceMeta key present) -- code-level guarantee, confirmed by reading the diff"
        status: pass
    human_judgment: false

duration: 20min
completed: 2026-07-02
status: complete
---

# Phase 5 Plan 02: Imported Recipe Promotion Gate Summary

**Widened the existing likes→promotion trigger to also promote confirmed, trusted imported recipes from private to public via a visibility flip (not a source flip), gated on a 3-part condition (third-party likes, confidence, confirmedAt) that structurally excludes the owner's own like and never lets popularity alone cross the trust bar.**

## Performance

- **Duration:** 20 min
- **Started:** 2026-07-02T19:15:00Z (approx, continuation of same session as 05-01)
- **Completed:** 2026-07-02T19:35:00Z
- **Tasks:** 3
- **Files modified:** 4 (3 modified, 1 created)

## Accomplishments
- `promoteImportToPublic(recipeId)` added to `recipe.repository.ts`, sibling to `promoteToVariant`: flips `visibility: private → public`, keeps `source: "imported"` (D-05), idempotent via a `source: "imported", visibility: "private"` filter guard.
- `maybePromote` in `like.repository.ts` widened with a parallel `imported` branch alongside the untouched `generated_pending` branch. The imported branch enforces the full D-06 gate: third-party likes `>= env.variants.promoteThreshold` AND `confidenceScore >= env.import.promoteConfidence` AND `confirmedAt != null`.
- Owner self-like exclusion (D-08) implemented via `LikeModel.total({ recipeId, userId: { $ne: ownerId } })` — verified against mongoat's source (`total()` forwards its filter arg directly to `collection.countDocuments()`), so the `$ne` Mongo operator works natively without any client-side fetch-and-filter fallback.
- 7 new tests in `like.repository.test.ts` (via `toggleLike`'s public entry point, since `maybePromote` is not exported) proving: promotion fires on full gate pass; blocked by low confidence; blocked by missing `confirmedAt`; owner self-like excluded (threshold-1 without the owner, promotes once a genuine third-party like is added); `generated_pending` regression unchanged (both promote and non-promote cases).
- `likes/README.md` updated (Obsidian style: callout block + updated file table + relationships) documenting the two promotion branches, the D-06 gate, and the D-08 exclusion rationale, wikilinked to `[[Recipes]]` and `[[Import]]`.

## Task Commits

Each task was committed atomically:

1. **Task 1: promoteImportToPublic in recipe.repository.ts** - `e80b42f` (feat)
2. **Task 2: Widen maybePromote — imported branch** - `758b164` (feat)
3. **Task 3: Repository test + likes README** - `0b2aae4` (test)

**Plan metadata:** _(pending — this SUMMARY's commit)_

## Files Created/Modified
- `src/modules/recipes/recipe.repository.ts` - Added `promoteImportToPublic(recipeId)`, adjacent to `promoteToVariant`. pt-BR JSDoc explains the D-05 visibility-not-source rationale and the idempotency guard.
- `src/modules/likes/like.repository.ts` - `maybePromote` restructured into two parallel branches by `recipe.source`. The `generated_pending` branch is byte-identical to before (just moved into its own `if`). The new `imported` branch computes the owner-excluded like count, applies the 3-part D-06 gate, and calls `promoteImportToPublic` when it passes.
- `src/modules/likes/like.repository.test.ts` (new) - 7 tests: 5 for the imported branch (gate pass, confidence-block, confirmedAt-block, self-like-exclusion-block, self-like-exclusion-pass) + 2 for the generated_pending regression (promote, non-promote).
- `src/modules/likes/README.md` - New callout documenting the widened promotion machinery; updated file table (added `like.repository.test.ts` row, expanded `like.repository.ts` description); updated relationships section linking to `[[Recipes]]`'s two promote functions and `[[Import]]`'s `promoteConfidence`.

## Decisions Made
- **LikeModel.total() exclusion path — operator filter, not client-side count.** Per the plan's explicit instruction to verify before choosing, I read `node_modules/@iamcalegari/mongoat/lib/model/index.d.ts` (confirms `total(filter?: Filter<ModelType>, ...)` accepts a full Mongo `Filter`) and `lib/database/index.js:190` (confirms `total()`'s implementation is `return collection.countDocuments(filter, options)`). Since `countDocuments` is a native MongoDB driver call supporting the full query operator language, `{ recipeId, userId: { $ne: ownerId } }` works directly — no need for `findMany`+client-side filtering (which `LikeModel`'s `allowedMethods` doesn't even expose; only `FIND, INSERT, DELETE_MANY, TOTAL`). **This is the path Plan 06's regression test should assume.**
- `getRecipeById(recipeId)` (1-argument, trusted-caller overload) is used inside `maybePromote`, unchanged from the pre-existing `generated_pending` branch — `maybePromote` is a server-side trigger fired after an authenticated `toggleLike`, not an untrusted external caller, so no `userId`/visibility-filtering second argument is needed.
- `recipes/README.md` was intentionally left untouched. It carries a Fase-2-era note claiming imports have no `createdBy[]`, which the pattern-mapper (05-PATTERNS.md) already flagged as stale vs. the current codebase (`import.recipe-mapping.ts:76` does populate `createdBy[]`). Fixing that note is out of this plan's `files_modified` scope (only `likes/README.md` was listed) — flagging here so a future plan (or a dedicated docs pass) can correct it.

## Deviations from Plan

None — plan executed exactly as written. The `LikeModel.total()` verification the plan explicitly called for (rather than assuming) confirmed the simpler operator-filter path was safe to use, avoiding the client-side fallback the plan flagged as a fallback option.

## Issues Encountered
- Running the full fast suite (`npm run test`) still surfaces the same pre-existing, unrelated failure in `src/workers/import-worker.test.ts` ("Database not found" from mongoat's `Model` constructor via `RecipeModel`) already documented in `05-01-SUMMARY.md` as out-of-scope and pre-existing on `main`. Not touched here. All 155 other tests pass, including the 7 new ones in this plan.
- Two empty, untracked files (`Pantry.md`, `Recipes.md`) exist at the repo root, dated 2026-07-01 (before this plan's execution session) — not created by this plan's tasks, not staged/committed, left as-is (likely Obsidian vault stubs per project convention).

## Next Phase Readiness
- Plan 03 (shareSlug generation at confirm, `getRecipeByShareSlug`, `GET /recipes/share/:token`) can proceed independently — this plan's changes don't touch `shareSlug` or the confirm flow.
- Plan 06 (citizenship reuse verification + search-isolation regression) can rely on the `LikeModel.total({ userId: { $ne: ownerId } })` operator-filter pattern documented here as the exclusion mechanism to assert against.
- No user gates introduced by this plan (no schema change, no new env var, no `setup:db` requirement) — this plan only adds application-layer logic on top of Plan 01's already-synced schema/config foundation.

---
*Phase: 05-publish-promotion-full-citizenship*
*Completed: 2026-07-02*

## Self-Check: PASSED

All created/modified files verified present on disk; all three task commits (`e80b42f`, `758b164`, `0b2aae4`) verified present in `git log`.
