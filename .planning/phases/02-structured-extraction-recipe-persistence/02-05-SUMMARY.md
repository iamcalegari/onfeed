---
phase: 02-structured-extraction-recipe-persistence
plan: 05
subsystem: api
tags: [video-pipeline, import, llm-extraction, confidence-gate, ext-05, vitest]

# Dependency graph
requires:
  - phase: 02-structured-extraction-recipe-persistence
    provides: "02-01 (Recipe/ImportJob schema fields + persistExtractedRecipe/IngestOptions threading), 02-02 (extractImportedRecipe + ExtractedImportedRecipe), 02-03 (owner-scoped search), 02-04 (computeConfidence + ConfidenceResult)"
provides:
  - "mapExtractedToRecipe(extracted, job, confidence) — pure mapping from an extracted+scored import to the exact { input, extracted, options } shape persistExtractedRecipe expects"
  - "pipeline.ts extracting stage wired end-to-end: extract -> confidence -> map -> persist -> ready_for_review"
  - "IngestOptions.reviewRequired/confidenceScore threaded through persistExtractedRecipe onto the Recipe document (BSON schema already had the properties from 02-01, never wired)"
  - "ready_for_review as the structurally-only success terminal (EXT-05) — proven by an integration test that scans every updateImportJobStatus call for a public/published status"
  - "extraction_failed non-retryable failure path (zod/LLM/mapping/persist errors all converge here, no recipeId ever linked)"
affects: ["03-review-ui (consumes ImportJob.recipeId/reviewRequired/confidenceScore and Recipe.grounding to render the review queue)", "05-public-promotion (future phase reads Recipe.reviewRequired/confidenceScore to gate promotion)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single try/catch around the entire extract->confidence->map->persist sequence in the pipeline stage, with one classification (failed/extraction_failed, non-retryable) for every failure mode inside it — no per-step error handling, no retry branch (a deterministic extraction failure would just repeat)"
    - "Freshly-computed local step variables (transcript/noSpeechDetected/caption) passed into the next stage instead of re-reading the stale `job` parameter, which reflects pre-run state — same idiom already used for the transcribing-stage updateImportJobStatus write"
    - "Integration test that iterates every mock.calls entry of updateImportJobStatus asserting no call ever carries a public/published status, rather than asserting only the final call — proves the structural guarantee across the whole run, not just the happy path"

key-files:
  created:
    - src/modules/import/import.recipe-mapping.ts
    - src/modules/import/import.recipe-mapping.test.ts
  modified:
    - src/infra/video/pipeline.ts
    - src/modules/recipes/recipe.ingestion.ts
    - src/workers/import-worker.test.ts
    - src/modules/import/README.md

key-decisions:
  - "mapExtractedToRecipe returns { input, extracted, options } (three pieces matching persistExtractedRecipe's actual (input, extracted, opts) signature) rather than the plan's literal '{ recipe, options }' wording — the real function takes three arguments, not a single recipe object"
  - "IngestOptions extended with reviewRequired/confidenceScore and threaded into persistExtractedRecipe's RecipeModel.insert call — the BSON schema already declared these properties (02-01) but nothing wrote them; without this fix Recipe.reviewRequired/confidenceScore would always be undefined despite being on ImportJob"
  - "Extraction input (transcript/caption/noSpeechDetected) is built from the transcribing stage's freshly-computed local variables, not job.transcript/job.caption — the job parameter is never mutated locally, so those fields would be stale/undefined on the common single-pass path"
  - "grounding.quantityGrounding/stepGrounding keyed by ingredient/step INDEX (not canonicalId) — canonicalId doesn't exist yet at mapping time (canonicalization happens later, inside persistExtractedRecipe's loop)"

requirements-completed: [EXT-01, EXT-03, EXT-04, EXT-05]

coverage:
  - id: D1
    description: "mapExtractedToRecipe maps an ExtractedImportedRecipe + ImportJob + ConfidenceResult to the exact persistExtractedRecipe input shape (visibility private, importJobId, sourceMeta+platform, grounding with nutrition hardcoded inferred, confidenceScore, reviewRequired), preserving ambiguous/null-quantity ingredients as-extracted"
    requirement: "EXT-01"
    verification:
      - kind: unit
        ref: "src/modules/import/import.recipe-mapping.test.ts (6 tests: options shape, confidence passthrough, ambiguous ingredient preserved, raw/name/quantity/unit/core shape, title+thumbnailUrl, sourceMeta omits absent fields)"
        status: pass
    human_judgment: false
  - id: D2
    description: "pipeline.ts extracting stage calls extractImportedRecipe -> computeConfidence -> mapExtractedToRecipe -> persistExtractedRecipe and folds recipeId/reviewRequired/confidenceScore into a single ready_for_review write merged with keyframeUrl"
    requirement: "EXT-04"
    verification:
      - kind: unit
        ref: "src/workers/import-worker.test.ts#extracting stage > happy path: lands ready_for_review with recipeId/reviewRequired/confidenceScore, and NEVER writes a public/published status"
        status: pass
      - kind: unit
        ref: "src/workers/import-worker.test.ts#extracting stage > passes the persist options with source imported and visibility private"
        status: pass
    human_judgment: false
  - id: D3
    description: "ready_for_review is the only success terminal — no code path ever writes a public/published status, proven across the FULL sequence of updateImportJobStatus calls in a run, not just the final call"
    requirement: "EXT-05"
    verification:
      - kind: unit
        ref: "src/workers/import-worker.test.ts#extracting stage > happy path (scans every updateImportJobStatus call for status public/published)"
        status: pass
      - kind: unit
        ref: "src/workers/import-worker.test.ts#no-speech skip > still reaches ready_for_review with reviewRequired true (scans every call)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Any extraction/mapping/persistence failure lands status failed + failureReason extraction_failed, non-retryable (no rethrow), with no recipeId ever linked on the failed job"
    requirement: "EXT-05"
    verification:
      - kind: unit
        ref: "src/workers/import-worker.test.ts#extracting stage > extraction throw -> status failed, failureReason extraction_failed, no recipeId linked"
        status: pass
      - kind: unit
        ref: "src/workers/import-worker.test.ts#extracting stage > persistExtractedRecipe throw -> status failed, failureReason extraction_failed (atomic)"
        status: pass
      - kind: unit
        ref: "src/workers/import-worker.test.ts#extracting stage > does not retry (no rethrow) on an extraction failure"
        status: pass
    human_judgment: false
  - id: D5
    description: "noSpeechDetected propagates into extraction input and forces reviewRequired=true via computeConfidence, still reaching ready_for_review (never blocking the pipeline, never silently trusted)"
    requirement: "EXT-05"
    verification:
      - kind: unit
        ref: "src/workers/import-worker.test.ts#no-speech skip > still reaches ready_for_review with reviewRequired true when no speech was detected (D-06 override integration)"
        status: pass
    human_judgment: false
  - id: D6
    description: "Ingredients pass through the existing resolveCanonicalForIngestion/embedding loop inside persistExtractedRecipe unchanged — no duplicate canonicalization logic added in the import module"
    requirement: "EXT-03"
    verification:
      - kind: unit
        ref: "src/modules/recipes/recipe.ingestion.test.ts (pre-existing suite, unmodified logic, still green — confirms the canonicalization/embedding loop was untouched)"
        status: pass
    human_judgment: false

# Metrics
duration: 45min
completed: 2026-07-02
status: complete
---

# Phase 2 Plan 05: Pipeline Integration — Extraction, Confidence & Persistence Summary

**Wired the Phase-1 `extracting` stub in pipeline.ts to the real extract→confidence→persist sequence, closing the loop so every successful import lands `ready_for_review` (never public) and every extraction failure lands `failed/extraction_failed` non-retryably, with an integration test proving both guarantees across the full call sequence.**

## Performance

- **Duration:** ~45 min
- **Completed:** 2026-07-02
- **Tasks:** 3/3 completed
- **Files modified:** 6 (2 created, 4 modified)

## Accomplishments
- `mapExtractedToRecipe` (`import.recipe-mapping.ts`) turns an `ExtractedImportedRecipe` + `ImportJob` + `ConfidenceResult` into the exact `{ input, extracted, options }` shape `persistExtractedRecipe` consumes — no persistence logic of its own, no duplicate canonicalization (EXT-01/EXT-03).
- `pipeline.ts`'s `extracting` stage is no longer a stub: it calls `extractImportedRecipe` → `computeConfidence` → `mapExtractedToRecipe` → `persistExtractedRecipe`, then folds `recipeId`/`reviewRequired`/`confidenceScore` into the same `ready_for_review` write that carries `keyframeUrl` — one terminal write, not two.
- `ready_for_review` is structurally the only success terminal (EXT-05): there is no branch anywhere in the stage that can produce a public/published status. An integration test iterates every `updateImportJobStatus` call made during a run and asserts none of them ever carries `status: "public"`/`"published"`.
- Every failure mode inside the extraction sequence (zod validation, `parsed_output` null/non-`end_turn` stop_reason, mapping error, `persistExtractedRecipe` throw) converges on one classification: `status: "failed"`, `failedStep: "extracting"`, `failureReason: "extraction_failed"`, non-retryable (no rethrow) — and because `persistExtractedRecipe` is atomic (fully inserts or throws before any `_id` exists), a failed job never ends up with a dangling `recipeId`.
- `noSpeechDetected` propagates from the transcribing stage into the extraction input and, via `computeConfidence` (Plan 04), forces `reviewRequired: true` — but the job still reaches `ready_for_review`, never silently trusted and never blocked.
- Closed a latent gap from Plan 01: `IngestOptions` never had `reviewRequired`/`confidenceScore` fields even though the `Recipe` BSON schema already declared them — extended `IngestOptions` and the `RecipeModel.insert` call in `recipe.ingestion.ts` so these values actually land on the persisted document.
- Full fast suite green (115/115 across 12 files) and `npm run typecheck` clean after all three tasks.

## Task Commits

Each task was committed atomically:

1. **Task 1: Map an extracted+scored import to a Recipe persistence input** - `1d118f3` (feat)
2. **Task 2: Wire the extracting stage in pipeline.ts + failure path** - `d59eabc` (feat)
3. **Task 3: Pipeline integration test (ready_for_review guarantee) + README** - `48f0bae` (test)

## Files Created/Modified
- `src/modules/import/import.recipe-mapping.ts` - `mapExtractedToRecipe(extracted, job, confidence)`, pure mapping, no persistence
- `src/modules/import/import.recipe-mapping.test.ts` - 6 shape tests (options, confidence passthrough, ambiguous ingredient, ingredient shape, title/thumbnailUrl, sourceMeta omission)
- `src/infra/video/pipeline.ts` - `extracting` stage wired to extract→confidence→map→persist→ready_for_review; single try/catch classifying every failure as `extraction_failed`, non-retryable
- `src/modules/recipes/recipe.ingestion.ts` - `IngestOptions` gains `reviewRequired`/`confidenceScore`; `persistExtractedRecipe`'s insert call writes both onto the `Recipe` document
- `src/workers/import-worker.test.ts` - `env.anthropic`/`env.voyage` added to the env mock (pipeline.ts now transitively imports both client modules); mocks for `extractImportedRecipe`/`persistExtractedRecipe`; new "extracting stage" describe block (5 tests) + one added case in the no-speech-skip block
- `src/modules/import/README.md` - documents the extraction→confidence→persist→ready_for_review flow (Obsidian style), the EXT-05 structural guarantee, and the non-retryable failure path

## Decisions Made
- `mapExtractedToRecipe` returns `{ input, extracted, options }` (three pieces) rather than the plan's literal `{ recipe, options }` phrasing — `persistExtractedRecipe`'s real signature is `(input, extracted, opts)`, a three-argument function, not a single recipe object plus options. Adapted to match the actual code, not the plan's shorthand.
- Extraction input is built from the transcribing stage's local `transcript`/`noSpeechDetected`/`downloadResult.meta.caption` variables, not `job.transcript`/`job.caption` — the `job` parameter passed into `processImportJob` is never locally mutated, so by the time the extracting stage runs, `job.transcript` would still be `undefined` on the normal single-pass path (only the DB document is updated, not the in-memory object). Using the stale job fields would have silently passed no transcript/caption to the extractor. Fixed as a Rule 1 bug during Task 2, before the initial typecheck-only verify.
- `IngestOptions` extended with `reviewRequired`/`confidenceScore` and wired into the `RecipeModel.insert` call (Rule 2 — missing critical functionality): the BSON schema already had `reviewRequired`/`confidenceScore` property schemas from Plan 01, and `ImportJob` already carried both, but nothing populated them on the `Recipe` document itself. Without this fix, `mapExtractedToRecipe`'s `options.reviewRequired`/`confidenceScore` would have been silently dropped by `persistExtractedRecipe`.
- `grounding.quantityGrounding`/`stepGrounding` are keyed by array index (ingredient/step position), not `canonicalId` — `RecipeGrounding`'s doc comment says "chave = canonicalId... do ingrediente", but at mapping time (before `persistExtractedRecipe`'s canonicalization loop runs) no `canonicalId` exists yet. Index is the only identifier available pre-canonicalization; this matches the actual data-flow order in `persistExtractedRecipe`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Threaded `reviewRequired`/`confidenceScore` through `IngestOptions` into the `Recipe` insert**
- **Found during:** Task 1 (reading `recipe.ingestion.ts` to build the mapping's target shape)
- **Issue:** `IngestOptions` (extended in Plan 01) never gained `reviewRequired`/`confidenceScore` fields, and `persistExtractedRecipe`'s `RecipeModel.insert` call never wrote them — even though the BSON schema (`recipe.model.ts`) already declared both as valid properties. `mapExtractedToRecipe`'s output would have silently lost this data on the way into the Recipe document.
- **Fix:** Added `reviewRequired?: boolean` / `confidenceScore?: number` to `IngestOptions`, and added the conditional-spread writes (`...(opts.reviewRequired !== undefined && { reviewRequired: opts.reviewRequired })`, same for `confidenceScore`) to the single-recipe insert call.
- **Files modified:** `src/modules/recipes/recipe.ingestion.ts`
- **Verification:** `npm run typecheck` clean; `recipe.ingestion.test.ts` (5 tests, unmodified logic) still passes.
- **Committed in:** `1d118f3` (Task 1 commit)

**2. [Rule 1 - Bug] Used freshly-computed transcript/caption/noSpeechDetected instead of the stale `job` parameter**
- **Found during:** Task 2 (wiring the extracting stage)
- **Issue:** The plan's `<action>` text reads `transcript: job.transcript, caption: job.caption` — but `job` is the function parameter passed into `processImportJob` and is never locally reassigned after the transcribing stage's `updateImportJobStatus` call (that only persists to the DB). On the normal single-pass path, `job.transcript` would be `undefined` at the point the extracting stage runs, silently starving the extractor of its primary input.
- **Fix:** Built the `extractImportedRecipe` input from the local `transcript`/`noSpeechDetected` variables already computed in the transcribing stage (and `downloadResult.meta.caption` for caption), matching the same idiom already used for that stage's own `updateImportJobStatus` write a few lines above. Passed the same locally-corrected values into `mapExtractedToRecipe`'s `job` argument (via a shallow spread) so `sourceMeta` construction sees the right caption too.
- **Files modified:** `src/infra/video/pipeline.ts`
- **Verification:** `npm run typecheck` clean; integration test (`extracting stage > happy path`) asserts `extractImportedRecipe` receives a transcript/caption via the fixture path.
- **Committed in:** `d59eabc` (Task 2 commit)

**3. [Rule 3 - Blocking] Added `env.anthropic`/`env.voyage` to the `import-worker.test.ts` env mock**
- **Found during:** Task 3 (running the pre-existing worker test suite after Task 2's changes)
- **Issue:** `pipeline.ts` now transitively imports `import.extraction.ts` and `recipe.ingestion.ts`, both of which import client modules (`anthropic.client.ts`, `voyage.client.ts`) that read `env.anthropic`/`env.voyage` at module load. The existing `env.js` mock in `import-worker.test.ts` didn't include those blocks, so the entire test file failed to even load (`Cannot read properties of undefined (reading 'apiKey')`).
- **Fix:** Added `anthropic: { apiKey: "test-key", model: "...", importModel: "..." }` and `voyage: { model: "voyage-3" }` to the mock, matching the same minimal-shape pattern already used in `recipe.ingestion.test.ts` for the identical transitive-import problem.
- **Files modified:** `src/workers/import-worker.test.ts`
- **Verification:** Full worker suite (18 tests) passes; full fast suite (115/115) green.
- **Committed in:** `48f0bae` (Task 3 commit)

---

**Total deviations:** 3 auto-fixed (1 Rule 2 - missing critical, 1 Rule 1 - bug, 1 Rule 3 - blocking)
**Impact on plan:** All three were required for the plan's own stated guarantees (EXT-05's structural checks, EXT-04's confidenceScore/reviewRequired persistence) to actually hold at runtime, or for the test suite to load at all. No scope creep beyond making this plan's own deliverables work correctly.

## Issues Encountered
None beyond the three deviations above.

## User Setup Required
None - no external service configuration required. `IMPORT_EXTRACTION_MODEL` (Plan 01) already defaults to `claude-sonnet-4-5`; no new env var introduced by this plan.

## Next Phase Readiness
- Phase 2 (Structured Extraction & Recipe Persistence) is now feature-complete: EXT-01 through EXT-05 are all implemented and wired end-to-end, from `ImportJob.transcript`/`caption` all the way to a private, owner-searchable, grounded `Recipe` in `ready_for_review`.
- Phase 3 (review UI) can rely on: `ImportJob.recipeId`/`reviewRequired`/`confidenceScore` (populated on every successful run), `Recipe.grounding` (per-field honesty for the review screen), and `listMyImportedRecipes` (Plan 03, owner-scoped search) to list a user's pending imports.
- Phase 5 (public promotion) can rely on `Recipe.reviewRequired`/`confidenceScore` now actually being persisted on the document (fixed in this plan) as the gating signal for confidence + likes-based promotion.
- No blockers identified. Fast suite green (115/115, 12 files), `npm run typecheck` clean.

## Self-Check: PASSED

- FOUND: src/modules/import/import.recipe-mapping.ts
- FOUND: src/modules/import/import.recipe-mapping.test.ts
- FOUND: src/infra/video/pipeline.ts (modified)
- FOUND: src/modules/recipes/recipe.ingestion.ts (modified)
- FOUND: src/workers/import-worker.test.ts (modified)
- FOUND: src/modules/import/README.md (modified)
- FOUND: 1d118f3 (Task 1 commit)
- FOUND: d59eabc (Task 2 commit)
- FOUND: 48f0bae (Task 3 commit)

---
*Phase: 02-structured-extraction-recipe-persistence*
*Completed: 2026-07-02*
