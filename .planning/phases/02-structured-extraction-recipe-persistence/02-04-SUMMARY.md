---
phase: 02-structured-extraction-recipe-persistence
plan: 04
subsystem: api
tags: [confidence-gate, review-required, ext-05, pure-function, vitest]

# Dependency graph
requires:
  - phase: 02-structured-extraction-recipe-persistence
    provides: "02-02 (import.extraction.ts — ExtractedImportedRecipe type + per-field GroundingLevel produced by the LLM extractor)"
provides:
  - "computeConfidence(recipe, { noSpeechDetected }) — pure aggregate confidence score + reviewRequired gate"
  - "REVIEW_SCORE_THRESHOLD (0.6) exported constant"
  - "ConfidenceResult type ({ score, reviewRequired, reasons })"
affects: ["05-pipeline-integration (wires computeConfidence output into Recipe/ImportJob status: ready_for_review)", "03-review-ui (consumes reviewRequired + reasons for the review queue)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Structural override gate: reviewRequired is the OR of four independent conditions (critical-field-inferred, noSpeechDetected, low score, sourceDivergence) rather than a single self-graded threshold — no single signal (including the LLM's own grounding) can bypass review alone"
    - "Weighted average over a flat list of { grounding, weight } records built from title/ingredients/steps, avoiding per-field-type branching in the score formula itself"

key-files:
  created:
    - src/modules/import/import.confidence.ts
    - src/modules/import/import.confidence.test.ts
  modified: []

key-decisions:
  - "Nutrition excluded entirely from the weighted field list (not just hardcoded 'inferred' and included) — since ImportedRecipeSchema never asks the model for a nutrition grounding signal, including it as a fixed 'inferred' field would deterministically depress every extraction's score by the same fixed amount, adding noise without adding signal. Documented inline in import.confidence.ts and D-10."
  - "Non-core ingredient inferred quantity does NOT alone trigger the critical-field override — only core ingredients and the title do (matches D-03's 'campo crítico' definition literally: título ou ingrediente principal)."

requirements-completed: [EXT-02, EXT-05]

coverage:
  - id: D1
    description: "computeConfidence returns an aggregate score in [0,1] from weighted per-field grounding (title + core-ingredient quantity weighted 2x vs steps/non-core ingredients at 1x), pure function with no I/O"
    requirement: EXT-02
    verification:
      - kind: unit
        ref: "src/modules/import/import.confidence.test.ts#clean, well-grounded recipe yields reviewRequired=false and score above threshold (EXT-02)"
        status: pass
      - kind: unit
        ref: "src/modules/import/import.confidence.test.ts#aggregate score reflects a known grounded/inferred/ambiguous mix within tolerance (EXT-02)"
        status: pass
    human_judgment: false
  - id: D2
    description: "reviewRequired forced true when a critical field (title or core ingredient quantity) is grounding='inferred', regardless of aggregate score"
    requirement: EXT-05
    verification:
      - kind: unit
        ref: "src/modules/import/import.confidence.test.ts#title grounding 'inferred' forces reviewRequired=true regardless of an otherwise-high score (EXT-05)"
        status: pass
      - kind: unit
        ref: "src/modules/import/import.confidence.test.ts#a core ingredient with quantityGrounding 'inferred' forces reviewRequired=true (EXT-05)"
        status: pass
    human_judgment: false
  - id: D3
    description: "reviewRequired forced true unconditionally when noSpeechDetected is true, independent of grounding quality (Pitfall 5)"
    requirement: EXT-05
    verification:
      - kind: unit
        ref: "src/modules/import/import.confidence.test.ts#noSpeechDetected=true forces reviewRequired=true even on an otherwise clean recipe (Pitfall 5)"
        status: pass
    human_judgment: false
  - id: D4
    description: "reviewRequired forced true when sourceDivergence is non-empty (D-08 transcript/caption conflict)"
    requirement: EXT-05
    verification:
      - kind: unit
        ref: "src/modules/import/import.confidence.test.ts#non-empty sourceDivergence forces reviewRequired=true (D-08)"
        status: pass
    human_judgment: false

# Metrics
duration: 15min
completed: 2026-07-02
status: complete
---

# Phase 2 Plan 04: Confidence & Review Gate Summary

**Pure `computeConfidence` gate turning per-field LLM grounding into an aggregate score plus a structurally-forced `reviewRequired` boolean that no self-graded signal can bypass**

## Performance

- **Duration:** ~15 min
- **Completed:** 2026-07-02
- **Tasks:** 2
- **Files modified:** 2 (both new)

## Accomplishments
- `computeConfidence(recipe, { noSpeechDetected })` implemented as a pure function (`src/modules/import/import.confidence.ts`) with zero I/O/LLM/DB dependencies
- Weighted scoring: title and core-ingredient quantities count double (`CRITICAL_FIELD_WEIGHT=2`) versus steps and non-core ingredients (`NORMAL_FIELD_WEIGHT=1`); grounding maps to `grounded=1, ambiguous=0.5, inferred=0`
- Four independent structural overrides force `reviewRequired=true`: critical field inferred, `noSpeechDetected`, score below `REVIEW_SCORE_THRESHOLD=0.6`, non-empty `sourceDivergence` — each pushes a distinct reason string
- Full unit coverage with in-line fixtures (no mocks needed since the function is pure): clean-pass, title-inferred, core-ingredient-inferred, non-core-inferred (negative case), no-speech override, source-divergence override, and a hand-computed weighted-average tolerance check

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement computeConfidence pure gate** - `e94347c` (feat)
2. **Task 2: Unit-test the gate (EXT-02, EXT-05)** - `2a7f59e` (test)

**Plan metadata:** _pending (this commit)_

## Files Created/Modified
- `src/modules/import/import.confidence.ts` - `computeConfidence`, `ConfidenceResult`, `REVIEW_SCORE_THRESHOLD`, grounding weight constants
- `src/modules/import/import.confidence.test.ts` - full unit coverage (7 tests)

## Decisions Made
- Nutrition is excluded from the weighted field list entirely (not scored as a fixed "inferred" entry) since `ImportedRecipeSchema` never solicits a nutrition grounding signal from the model — including it would deterministically depress every score by the same amount without adding real signal. Noted inline per D-10.
- The critical-field override strictly follows D-03's definition ("título ou ingrediente principal") — only core ingredients trigger it; a non-core (garnish/optional) ingredient being inferred does not alone force review, covered by an explicit negative-case test.

## Deviations from Plan

None - plan executed exactly as written. Field names (`titleGrounding`, `quantityGrounding`, `core`, `grounding`, `sourceDivergence`) matched the plan's pseudo-names exactly against the real `ImportedRecipeSchema` from `import.extraction.ts` (Plan 02), so no adaptation was needed.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `computeConfidence` is ready for Plan 05 (pipeline integration) to call from the `extracting` stage, persisting `score`/`reviewRequired`/`reasons` onto the Recipe/ImportJob and setting `status: ready_for_review`
- Fast suite green (103/103 tests, 11 files), `npm run typecheck` clean
- No blockers for Plan 05

---
*Phase: 02-structured-extraction-recipe-persistence*
*Completed: 2026-07-02*
