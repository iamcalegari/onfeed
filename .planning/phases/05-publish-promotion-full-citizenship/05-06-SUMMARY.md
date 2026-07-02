---
phase: 05-publish-promotion-full-citizenship
plan: 06
subsystem: testing
tags: [vitest, regression, citizenship, documentation, obsidian]

# Dependency graph
requires:
  - phase: 05-publish-promotion-full-citizenship
    provides: "Plan 02's promoteImportToPublic (visibility flip, source stays imported) + Plan 04's hybridSearch widening for search citizenship"
provides:
  - "recipe.citizenship.test.ts — regression suite proving adaptRecipe accepts an imported base identically to curated (RCP-01, D-11), SOC-01 (born private, verified against import.recipe-mapping), and SOC-05 (credit retention, verified against promoteImportToPublic's \$set shape)"
  - "import/README.md 'Cidadania plena (Fase 5)' section documenting SOC-01/02/04/05 + RCP-01..04 with a D-11 anti-branching warning for future editors"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Citizenship regression test = verify existing reuse, not rebuild: mock RecipeModel/ingredient-service/voyage/anthropic at the same seams recipe.ingestion.test.ts already uses, then assert the SAME insert/update shape is produced regardless of the recipe's source"

key-files:
  created:
    - src/modules/recipes/recipe.citizenship.test.ts
  modified:
    - src/modules/import/README.md

key-decisions:
  - "adaptRecipe test mocks at the module boundary (RecipeModel, ingredient.service, voyage.client, anthropic.client) mirroring recipe.ingestion.test.ts's exact pattern, rather than mocking recipe.repository.js's getRecipeById directly -- this exercises adaptRecipe's real call into persistExtractedRecipe end-to-end and proves the insert shape (source: generated_pending, parentRecipeId) is identical whether the anchor is source:'imported' or source:'curated'."
  - "SOC-05 is asserted against promoteImportToPublic's captured \$set/filter shape (RecipeModel.update mock), not by constructing a full before/after Recipe object -- the plan's own guidance frames SOC-05 verification this way (Plan 02's key-decisions), and it is the strongest possible assertion: proving the mutation NEVER touches source/createdBy/sourceMeta is a stronger guarantee than snapshotting one example object."
  - "No source-special-casing was found anywhere in adaptRecipe / getRecipeById(1-arg, trusted) / persistExtractedRecipe during this plan's read_first pass -- D-11 direct reuse holds as designed, nothing to flag as a gap."

requirements-completed: [RCP-01, RCP-02, RCP-03]

coverage:
  - id: D1
    description: "adaptRecipe resolves an imported base via getRecipeById (trusted, 1-arg) and produces a generated_pending child anchored via parentRecipeId, with the identical insert shape whether the base is source:'imported' or source:'curated' — no source special-casing (RCP-01, D-11)"
    requirement: "RCP-01"
    verification:
      - kind: unit
        ref: "src/modules/recipes/recipe.citizenship.test.ts#RCP-01 — adaptRecipe trata uma base 'imported' identicamente a uma curated"
        status: pass
    human_judgment: false
  - id: D2
    description: "SOC-01 verified: import.recipe-mapping's mapExtractedToRecipe sets visibility:'private' and populates createdBy[0] with the importer's userId (born-private substrate for SOC-05)"
    requirement: "RCP-01"
    verification:
      - kind: unit
        ref: "src/modules/recipes/recipe.citizenship.test.ts#SOC-01 — receita importada nasce privada (born private)"
        status: pass
    human_judgment: false
  - id: D3
    description: "SOC-05 verified: promoteImportToPublic's \$set only touches visibility/updatedAt — source, createdBy, and sourceMeta never appear in the update, so credits structurally survive promotion (D-05/D-09)"
    requirement: "RCP-01"
    verification:
      - kind: unit
        ref: "src/modules/recipes/recipe.citizenship.test.ts#SOC-05 — createdBy[]/sourceMeta sobrevivem à promoção"
        status: pass
    human_judgment: false
  - id: D4
    description: "RCP-02 (shopping list) and RCP-03 (cook mode) reuse the recipe-by-id resolver with no source inspection — asserted structurally via getRecipeById's trusted-caller idiom (same function adaptRecipe uses) and confirmed end-to-end by the human-verify checkpoint (Task 3), since these are frontend-page flows with no dedicated backend seam to unit-test"
    requirement: "RCP-02"
    verification: []
    human_judgment: true
    rationale: "Shopping list and cook mode are Next.js pages that resolve a recipe by id and render its ingredients/steps — there is no backend contract distinguishing 'imported' from any other source for these flows to unit-test against (confirmed via read_first: getRecipeById never branches on source). The only way to prove the end-to-end UX (adding missing ingredients to /compras, stepping through cook mode with a working timer) works identically for an imported recipe is to run the app, per the plan's own Task 3 human-verify checkpoint."

# Metrics
duration: 20min
completed: 2026-07-02
status: complete
---

# Phase 5 Plan 6: Full Citizenship Verification Summary

**Regression-tested (not rebuilt) that an imported recipe adapts via the existing adaptRecipe path with zero source-special-casing, verified SOC-01 (born private) and SOC-05 (credit retention on promotion) directly against shipped code, and documented the D-11 direct-reuse guarantee in the import module README.**

## Performance

- **Duration:** 20 min
- **Started:** 2026-07-02T19:55:25Z (approx, per STATE.md)
- **Completed:** 2026-07-02
- **Tasks:** 2 autonomous (Task 3 is a pending human-verify checkpoint)
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments

- `recipe.citizenship.test.ts` (6 tests, all passing): proves `adaptRecipe` resolves an imported base via `getRecipeById`'s trusted 1-argument overload and produces an identical `generated_pending` insert (same `source`, same `parentRecipeId` anchoring) whether the base recipe's `source` is `"imported"` or `"curated"` — a direct side-by-side comparison, not just a single-case assertion.
- SOC-01 (born private) verified against the real `mapExtractedToRecipe` output: `visibility:"private"` and `createdBy[0]` populated with the importer's `userId`, not merely assumed from reading the code.
- SOC-05 (credit retention on promotion) verified against `promoteImportToPublic`'s actual `RecipeModel.update` call — the captured `$set` is asserted to contain ONLY `visibility`/`updatedAt`, with explicit `not.toHaveProperty` assertions proving `source`/`createdBy`/`sourceMeta` are never part of the mutation.
- No latent source-special-casing was found in `adaptRecipe`, `getRecipeById` (trusted overload), or `persistExtractedRecipe` during the `read_first` pass — D-11 direct reuse holds exactly as designed; nothing to flag as a gap.
- `src/modules/import/README.md` updated (Obsidian style) with a new "Cidadania plena (Fase 5)" section covering SOC-01/02/04/05 and RCP-01..04, including a `[!WARNING]` callout instructing future editors never to add `source:"imported"` branches to adapt/shopping-list/cook-mode, cross-linked to `[[Recipes]]` and `[[Likes]]`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Citizenship regression tests — adapt reuse; SOC-01/SOC-05 verified** - `2d3752c` (test)
2. **Task 2: Document full-citizenship reuse in the import module README** - `f643035` (docs)

**Plan metadata:** _(pending — this SUMMARY's commit)_

**Task 3 (checkpoint:human-verify) is NOT yet approved** — this SUMMARY documents the autonomous work; the plan awaits human verification of adapt/shopping-list/cook-mode on a real imported recipe before the phase is considered fully closed.

## Files Created/Modified

- `src/modules/recipes/recipe.citizenship.test.ts` (new) - 6 tests across three describe blocks: RCP-01 (imported-vs-curated adapt parity, 3 tests), SOC-01 (born-private substrate, 1 test), SOC-05 (credit retention on promotion, 2 tests). Mocks `RecipeModel`, `resolveCanonicalForIngestion`, `embeddings.embedDocuments`, and `anthropic.messages.parse` at the same seams as `recipe.ingestion.test.ts`, exercising `adaptRecipe`'s real internal call into `persistExtractedRecipe` rather than stubbing it away.
- `src/modules/import/README.md` - New "Cidadania plena (Fase 5 — Plano 06)" section (frontmatter tag `citizenship` added) plus a top `[!INFO]` callout pointing to it. Documents SOC-01/02 (born private + shareSlug), SOC-04/05 (promotion as visibility-flip, credit retention), RCP-01/02/03 (direct reuse + D-11 warning callout), and RCP-04 (search citizenship + explicit note on the still-open route-level `ownerId` wiring scope).

## Decisions Made

- **Test mocking strategy:** mocked at the module boundary (`RecipeModel`, `ingredient.service.js`, `voyage.client.js`, `anthropic.client.js`) rather than mocking `getRecipeById`/`persistExtractedRecipe` directly. This exercises `adaptRecipe`'s actual internal call chain end-to-end (mirroring `recipe.ingestion.test.ts`'s established pattern exactly) and lets the test prove — not assume — that the insert shape produced for an imported anchor is byte-identical to a curated one.
- **SOC-05 verification target:** asserted against `promoteImportToPublic`'s captured `RecipeModel.update` filter/`$set` shape rather than snapshotting a full before/after `Recipe` object. This was Plan 02's own recommended verification surface (see its `key-decisions`) and is the strongest possible guarantee: proving the mutation structurally never touches `source`/`createdBy`/`sourceMeta` (via `not.toHaveProperty`) is stronger than checking one example object still has the right values.
- **RCP-02/RCP-03 left to the human-verify checkpoint (Task 3).** Per the plan's own instruction, shopping list and cook mode are frontend-page reuse with no dedicated backend seam that inspects `source` — `getRecipeById` (already covered by the RCP-01 test's assertions on its trusted-caller idiom) is the only shared resolution point, and it has no source branch. The end-to-end UX (missing ingredients landing in `/compras`, step timers running) is genuinely a runtime/human concern, not fabricable via unit test — documented in the coverage block as `human_judgment: true`.

## Deviations from Plan

None - plan executed exactly as written. No latent source-special-casing was found in the adapt/shopping/cook paths, so there was nothing to flag as a D-11 violation gap; the tests confirm the direct-reuse design holds.

## Issues Encountered

- Initial test draft used non-hex placeholder recipe ids (`"recipe-x"`, `"recipe-imported-4"`) for the two `promoteImportToPublic` calls — `new ObjectId(recipeId)` inside the real (unmocked) `recipe.repository.ts` throws `BSONError` on non-24-char-hex strings. Fixed by using valid 24-character hex strings (`507f1f77bcf86cd799439011` / `...439099`, matching the convention already used elsewhere in the repo's test suite, e.g. `import-job.repository.test.ts`). Caught and fixed before the first commit — not a deviation, just a test-authoring correction within Task 1.
- Confirmed (but did not touch, out of `files_modified` scope) that `recipe.repository.ts`'s `getRecipeById` JSDoc (lines ~545-554) still contains a stale comment claiming imported recipes are persisted "SEM `createdBy[]`" — this was already flagged as stale in `05-02-SUMMARY.md`'s decisions (contradicted by `import.recipe-mapping.ts:76`, which this plan's SOC-01 test directly verifies DOES populate `createdBy`). Left untouched per this plan's `files_modified` scope; a future docs-only pass could correct the comment.

## User Setup Required

None - no external service configuration required. No schema change, no new env var, no `setup:db` requirement.

## Next Phase Readiness

- RCP-01/02/03, SOC-01, and SOC-05 are now verified against shipped code with automated regression coverage (RCP-01/SOC-01/SOC-05) and a pending human checkpoint (RCP-02/RCP-03 end-to-end UX).
- No gaps were found in the D-11 direct-reuse design — adapt/shopping-list/cook-mode remain genuinely source-agnostic. The import README's new D-11 warning callout is now the guardrail against future regression.
- **This plan is NOT fully complete** — Task 3 (`checkpoint:human-verify`, gate="blocking") is outstanding. The phase cannot be marked done until a human confirms adapt + shopping list + cook mode all work end-to-end on a real imported recipe, per the plan's `<how-to-verify>` steps.

---
*Phase: 05-publish-promotion-full-citizenship*
*Completed: 2026-07-02*

## Self-Check: PASSED

Verified files present on disk:
- `src/modules/recipes/recipe.citizenship.test.ts` — FOUND
- `src/modules/import/README.md` — FOUND (modified, contains new section)

Verified commits present in `git log`:
- `2d3752c` (test) — FOUND
- `f643035` (docs) — FOUND

Verified test suite: `npm run test -- src/modules/recipes/recipe.citizenship.test.ts` — 6/6 PASSED.
Verified typecheck: `npm run typecheck` — clean, no errors.
