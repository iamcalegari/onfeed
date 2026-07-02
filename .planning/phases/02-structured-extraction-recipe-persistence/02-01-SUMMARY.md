---
phase: 02-structured-extraction-recipe-persistence
plan: 01
subsystem: database
tags: [mongodb, mongoat, bson-schema, typescript, anthropic, vitest, tdd]

# Dependency graph
requires:
  - phase: 01-video-pipeline-foundation
    provides: ImportJob state machine (transcript/caption/sourceMeta/noSpeechDetected), pipeline.ts extracting-stage stub
provides:
  - RecipeSource "imported" value + RecipeVisibility/GroundingLevel/RecipeGrounding types
  - Recipe schema fields visibility (required)/grounding/importJobId/sourceMeta/reviewRequired/confidenceScore (optional)
  - BSON model property schemas + sparse import_job_lookup index for the new fields, visibility intentionally OUT of the required array
  - ImportJob.recipeId/reviewRequired/confidenceScore + ImportFailureReason "extraction_failed"
  - IngestOptions.visibility/importJobId/sourceMeta/grounding threaded through persistExtractedRecipe (default visibility 'public' for existing callers)
  - IMPORT_EXTRACTION_MODEL env var (default claude-sonnet-4-5, D-15) + parametrized effortOption(level, model)
  - 3 transcript+caption fixtures (clean/ambiguous/adversarial) under src/modules/import/__fixtures__/
  - recipe.ingestion.test.ts baseline (Nyquist Wave 0 for EXT-03/EXT-04)
affects: [02-02-import-extraction, 02-03-owner-scoped-search, 02-04-confidence-gate, 02-05-pipeline-integration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Conditional-spread idiom (`...(value && { field: value })`) reused for every new optional Recipe/IngestOptions field — never explicit `undefined` (BSON/mongoat gotcha)"
    - "BSON required-array field intentionally left optional + app-layer default, when new field would break existing docs on insert/update validation"
    - "effortOption(level, model = MODULE_MODEL) — parametrized so callers with a different model constant (IMPORT_EXTRACTION_MODEL) evaluate the regex against the model they actually use"

key-files:
  created:
    - src/modules/import/__fixtures__/clean-risotto.ts
    - src/modules/import/__fixtures__/ambiguous-sparse.ts
    - src/modules/import/__fixtures__/adversarial-injection.ts
    - src/modules/recipes/recipe.ingestion.test.ts
  modified:
    - src/modules/recipes/recipe.types.ts
    - src/modules/recipes/recipe.model.ts
    - src/modules/recipes/recipe.ingestion.ts
    - src/modules/import/import-job.types.ts
    - src/config/env.ts
    - src/infra/llm/anthropic.client.ts
    - src/infra/video/pipeline.ts
    - src/modules/import/README.md
    - src/modules/recipes/README.md

key-decisions:
  - "visibility kept OUT of the BSON required array — existing catalog docs lack it; persistExtractedRecipe defaults it to 'public' at the app layer for every caller that doesn't pass opts.visibility"
  - "IMPORT_EXTRACTION_MODEL defaults to claude-sonnet-4-5 via env override (D-15) — catalog EXTRACTION_MODEL stays haiku, no opus hardcoding"
  - "effortOption made to accept an optional model param (default EXTRACTION_MODEL) instead of introducing a parallel effort-option function — smallest change that lets the import path evaluate the regex against its own model string"
  - "RecipeGrounding kept as a single nested object (titleGrounding/quantityGrounding/stepGrounding/nutrition/sourceDivergence) rather than a parallel top-level collection — mirrors the creatorSchema/nutritionSchema nested-object BSON pattern already in the file"

patterns-established:
  - "Grounding shape: per-field GroundingLevel ('grounded'|'inferred'|'ambiguous') keyed by canonicalId/step-index inside a single RecipeGrounding object, with nutrition hardcoded to 'inferred' (never asked of the model, per D-10)"
  - "Fixture modules under src/modules/<module>/__fixtures__/*.ts exporting typed { transcript?, caption?, noSpeechDetected, label, expected } objects — expected is a prose spot-check note, not a machine assertion"

requirements-completed: [EXT-03, EXT-04, EXT-05]

coverage:
  - id: D1
    description: "Recipe schema (types + BSON model) carries source='imported', visibility, importJobId, denormalized sourceMeta, and a per-field grounding blob; existing catalog docs still validate (visibility optional in BSON required array)"
    requirement: "EXT-05"
    verification:
      - kind: unit
        ref: "npm run typecheck"
        status: pass
    human_judgment: false
  - id: D2
    description: "persistExtractedRecipe threads visibility/importJobId/sourceMeta/grounding via IngestOptions, defaults visibility to 'public' for existing callers, and reuses the canonicalization (EXT-03) + embedding (EXT-04) loops unchanged"
    requirement: "EXT-03"
    verification:
      - kind: unit
        ref: "src/modules/recipes/recipe.ingestion.test.ts#persistExtractedRecipe (EXT-03/EXT-04 — canonicalização + embedding reuse)"
        status: pass
    human_judgment: false
  - id: D3
    description: "IMPORT_EXTRACTION_MODEL resolves from env (default Sonnet per D-15); effortOption evaluates whichever model string is actually used"
    requirement: "EXT-03"
    verification:
      - kind: unit
        ref: "npm run typecheck"
        status: pass
    human_judgment: false
  - id: D4
    description: "Three fixture transcript+caption pairs (clean/ambiguous-sparse/adversarial-injection) exist for downstream grounding tests"
    verification:
      - kind: unit
        ref: "npm run typecheck (fixtures compile; grep confirms no production import)"
        status: pass
    human_judgment: false

duration: 35min
completed: 2026-07-01
status: complete
---

# Phase 2 Plan 01: Schema + Config Foundation for Imported Recipes Summary

**Extended Recipe/ImportJob types and BSON model with visibility/grounding/importJobId/sourceMeta fields, threaded them through persistExtractedRecipe via IngestOptions without touching the canonicalization/embedding loops, added an env-driven IMPORT_EXTRACTION_MODEL (Sonnet default per D-15), and committed 3 grounding-test fixtures plus a new recipe.ingestion.test.ts baseline.**

## Performance

- **Duration:** ~35 min
- **Completed:** 2026-07-01
- **Tasks:** 3/3 completed
- **Files modified:** 9 (4 created, 9 modified/touched including 2 READMEs and 1 Rule-3 fix)

## Accomplishments
- Recipe/ImportJob types + BSON model carry every net-new field required by the imported-recipe pipeline (source "imported", visibility, grounding, importJobId, sourceMeta, reviewRequired, confidenceScore) while existing catalog ingestion keeps validating and defaulting `visibility: 'public'`.
- `persistExtractedRecipe` (single + batch paths) threads the four new `IngestOptions` fields through the existing conditional-spread block; the canonicalization loop and `embedDocuments` call are byte-identical to before, confirmed via diff review.
- `IMPORT_EXTRACTION_MODEL` resolves to `claude-sonnet-4-5` by default via a new `IMPORT_EXTRACTION_MODEL` env var, and `effortOption` now accepts an optional `model` argument so it evaluates the regex against whichever model is actually in use.
- Three prose-annotated transcript+caption fixtures (clean, ambiguous/sparse, adversarial-injection) exist for the Wave-0/Nyquist grounding tests that later plans (extraction, confidence gate) will build on.
- `recipe.ingestion.test.ts` (previously absent) now covers canonicalization call-count-per-ingredient, embedding-text shape parity with the catalog path, visibility default vs override, and grounding passthrough.

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend Recipe + ImportJob types and BSON model with imported-recipe fields** - `c0e715d` (feat)
2. **Task 2: Extend IngestOptions + persistExtractedRecipe and add IMPORT_EXTRACTION_MODEL** - `2920c92` (feat)
3. **Task 3: Commit fixture transcript+caption pairs for downstream grounding tests** - `820734c` (test)

**Docs (module READMEs, out-of-plan-scope but required by project convention):** `689d154` (docs)

## Files Created/Modified
- `src/modules/recipes/recipe.types.ts` - RecipeSource +"imported"; new RecipeVisibility/GroundingLevel/RecipeGrounding types; Recipe interface gains visibility (required) + grounding/importJobId/sourceMeta/reviewRequired/confidenceScore (optional)
- `src/modules/recipes/recipe.model.ts` - source enum +"imported"; groundingSchema/sourceMetaSchema nested BSON objects; visibility/importJobId/reviewRequired/confidenceScore property schemas (visibility NOT in required array); sparse `import_job_lookup` index
- `src/modules/import/import-job.types.ts` - ImportJob gains recipeId/reviewRequired/confidenceScore; ImportFailureReason gains "extraction_failed"
- `src/infra/video/pipeline.ts` - `USER_SAFE_MESSAGES` extended with an `extraction_failed` entry (Rule 3 fix — exhaustive `Record<ImportFailureReason, string>` broke on the new union member)
- `src/modules/recipes/recipe.ingestion.ts` - `IngestOptions` gains visibility/importJobId/sourceMeta/grounding; both `RecipeModel.insert` call sites (single + batch) write `visibility` and conditionally spread the new fields; canonicalization + embedding logic untouched
- `src/config/env.ts` - `anthropic.importModel` = `optional("IMPORT_EXTRACTION_MODEL", "claude-sonnet-4-5")`
- `src/infra/llm/anthropic.client.ts` - `IMPORT_EXTRACTION_MODEL` export; `effortOption(level, model = EXTRACTION_MODEL)` parametrized
- `src/modules/import/__fixtures__/clean-risotto.ts` - rich pt-BR transcript + written-ingredient-list caption, mostly-groundable case
- `src/modules/import/__fixtures__/ambiguous-sparse.ts` - `noSpeechDetected: true` + hashtag-only caption, Pitfall 5 (no hallucination from nothing)
- `src/modules/import/__fixtures__/adversarial-injection.ts` - plausible transcript + injection-attempt caption, Pitfall 4 (untrusted content is data, not instruction)
- `src/modules/recipes/recipe.ingestion.test.ts` - new baseline test suite for `persistExtractedRecipe`
- `src/modules/import/README.md`, `src/modules/recipes/README.md` - Obsidian-style docs updated for the new fields/files (project convention on module modification)

## Decisions Made
- Kept `visibility` required in the TypeScript `Recipe` interface but optional in the BSON schema's `required` array, with the app-layer default (`'public'`) applied inside `persistExtractedRecipe` — matches the plan's explicit instruction and avoids a migration for existing catalog docs.
- `RecipeGrounding` modeled as one nested object (`titleGrounding`, `quantityGrounding: Record<string, GroundingLevel>`, `stepGrounding: Record<string, GroundingLevel>`, `nutrition: "inferred"` literal, `sourceDivergence: string[]`) rather than several parallel top-level fields — mirrors the existing `creatorSchema`/`nutritionSchema` nested-object BSON convention and keeps grounding import-only/flexible per the plan.
- `effortOption` extended with an optional second `model` parameter (default `EXTRACTION_MODEL`) instead of adding a second effort-resolution function — smallest change satisfying the plan's "effortOption must key off the model string actually used" key-link.
- Fixture `expected` fields are prose spot-check notes (not machine assertions), matching the plan's explicit instruction that these are test-only inputs for later grounding tests, not immediately-consumed fixtures.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Extended `USER_SAFE_MESSAGES` in pipeline.ts for the new `extraction_failed` failure reason**
- **Found during:** Task 1 (typecheck run after extending `ImportFailureReason`)
- **Issue:** `src/infra/video/pipeline.ts` declares `const USER_SAFE_MESSAGES: Record<ImportFailureReason, string>` — an exhaustive record. Adding `"extraction_failed"` to the `ImportFailureReason` union (required by the plan) broke this record's exhaustiveness, failing `npm run typecheck` project-wide.
- **Fix:** Added `extraction_failed: "Não foi possível estruturar a receita a partir do vídeo."` to the record, in the same style as the other entries.
- **Files modified:** `src/infra/video/pipeline.ts` (not in the plan's `files_modified` list, but a direct, unavoidable consequence of the Task 1 type change)
- **Verification:** `npm run typecheck` clean after the fix.
- **Committed in:** `c0e715d` (Task 1 commit)

**2. [Rule 3 - Blocking] Added `visibility: opts.visibility ?? "public"` to the batch insert call site in `persistExtractedRecipesBatch`**
- **Found during:** Task 2 (typecheck run after making `Recipe.visibility` required in the type)
- **Issue:** The plan's `<action>` for Task 2 only explicitly calls out the single-recipe `RecipeModel.insert({...})` call site (lines ~121-142) for the visibility/conditional-spread additions. The batch path's `RecipeModel.insert({...})` (lines ~244-263 pre-change) also constructs a full `Recipe` document and, once `visibility` became a required field on the `Recipe` type, failed the same `exactOptionalPropertyTypes` structural check.
- **Fix:** Added `visibility: opts.visibility ?? "public"` to the batch insert call, same default semantics as the single-recipe path — batch callers (catalog-only today) keep identical behavior.
- **Files modified:** `src/modules/recipes/recipe.ingestion.ts`
- **Verification:** `npm run typecheck` clean; full fast test suite (75 tests, 8 files) green.
- **Committed in:** `2920c92` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 3 — blocking typecheck failures caused directly by this plan's own type changes, not pre-existing/unrelated issues)
**Impact on plan:** Both fixes were required for `npm run typecheck` to pass at all; no scope creep beyond making the plan's own frontmatter `files_modified` list typecheck-clean.

## Issues Encountered
- Initial `recipe.ingestion.test.ts` draft only mocked `env.voyage` — the test file transitively imports `recipe.extraction.ts` → `anthropic.client.ts`, which reads `env.anthropic.apiKey`/`env.anthropic.model` at module load and threw `Cannot read properties of undefined`. Fixed by adding a minimal `anthropic: { apiKey: "test-key", model: "claude-haiku-4-5-20251001" }` block to the `@/config/env.js` mock (same shape used by `import-worker.test.ts` for other transitively-imported env slices).
- `exactOptionalPropertyTypes: true` rejected `transcript: undefined` in the `ambiguous-sparse` fixture (explicit `undefined` is not the same as an absent key under this tsconfig setting) — fixed by omitting the key entirely with a comment explaining the omission is intentional.

## User Setup Required

None - no external service configuration required. `IMPORT_EXTRACTION_MODEL` is optional and defaults to `claude-sonnet-4-5`; no `.env` change needed to use the default.

## Next Phase Readiness
- Plan 02-02 (import extraction) can now import `RecipeGrounding`/`GroundingLevel`/`RecipeVisibility` from `recipe.types.ts` and call `persistExtractedRecipe` with `source: "imported"`, `visibility: "private"`, `importJobId`, `sourceMeta`, and `grounding` populated.
- Plan 02-02 can import `IMPORT_EXTRACTION_MODEL` and the parametrized `effortOption(level, IMPORT_EXTRACTION_MODEL)` from `anthropic.client.ts` to build `import.extraction.ts`, mirroring `recipe.extraction.ts`.
- Plan 02-03 (owner-scoped search) can rely on `Recipe.visibility` and `Recipe.createdBy` existing on every document (visibility defaulted at insert time).
- Plan 02-04 (confidence gate) can rely on `RecipeGrounding`'s shape and the three fixtures in `src/modules/import/__fixtures__/` for manual/automated spot-checks, plus `ImportJob.reviewRequired`/`confidenceScore` for where to write its output.
- Plan 02-05 (pipeline integration) can rely on `ImportJob.recipeId` and `ImportFailureReason: "extraction_failed"` (with a user-safe message already wired in `pipeline.ts`) being available to patch in after extraction runs.
- No blockers identified. All 3 tasks' `<done>` criteria met; `npm run typecheck` and the fast Vitest suite (75/75) are green.

---
*Phase: 02-structured-extraction-recipe-persistence*
*Completed: 2026-07-01*
