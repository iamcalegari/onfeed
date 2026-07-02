---
phase: 01-video-pipeline-foundation
plan: 01
subsystem: infra
tags: [vitest, mongoat, mongodb, env-config, import-pipeline, state-machine]

# Dependency graph
requires: []
provides:
  - "Vitest test framework with fast/integration split (project's first test runner)"
  - "Additive env.ts blocks: sqs.import*, groq, openaiTranscription, import.maxDurationSec"
  - "ImportJob types (ImportJobStatus, ImportFailureReason, ImportJob, ImportJobMessage)"
  - "ImportJobModel (Mongoat, collection import_jobs, registered in src/modules/index.ts)"
  - "ImportJob repository (createImportJob, getImportJob, updateImportJobStatus)"
affects: [01-02-PLAN, 01-03-PLAN, 01-04-PLAN, 01-05-PLAN, 01-06-PLAN]

# Tech tracking
tech-stack:
  added: ["vitest@^4.1.9"]
  patterns:
    - "Fast/integration test split via .integration.test.ts suffix, excluded from `npm run test`"
    - "Mongoat Model construction mirrors favorite.model.ts (schema + allowedMethods + documentDefaults + indexes)"
    - "Repository unit tests mock the Model layer (vi.mock) rather than requiring a live Mongo connection"
    - "env.ts additive blocks use optional()+enabled (never required()) for keys whose absence should degrade one feature, not crash boot"

key-files:
  created:
    - vitest.config.ts
    - src/modules/import/import-job.types.ts
    - src/modules/import/import-job.model.ts
    - src/modules/import/import-job.repository.ts
    - src/modules/import/import-job.repository.test.ts
    - src/modules/import/README.md
  modified:
    - package.json
    - src/config/env.ts
    - src/modules/index.ts
    - yarn.lock

key-decisions:
  - "Groq/OpenAI transcription keys use optional()+enabled (not required()) — worker is a separate deployable from the API; a missing key fails one job (transcription_failed) instead of crashing the whole process at boot, mirroring the existing mp.enabled precedent"
  - "ImportJobMessage carries only { jobId } — the ImportJob Mongo doc is the sole source of truth for progress/idempotency (PIPE-06); the worker always re-reads the authoritative doc instead of trusting message contents"
  - "Repository unit test mocks ImportJobModel instead of standing up a real Mongo connection — no test container introduced in this phase, per plan constraint"
  - "ImportJobModel allowedMethods includes METHODS.UPDATE (unlike favorites, which never updates in place) because ImportJob is a state machine requiring atomic status transitions"

patterns-established:
  - "Import-order registration: new Mongoat models must be imported in src/modules/index.ts before any Model method call, or Database throws 'not found' — see import-job.model.js registration"
  - "Obsidian-style README required per module (frontmatter + wikilinks + callouts), following src/modules/favorites/README.md"

requirements-completed: [PIPE-06]

coverage:
  - id: D1
    description: "Vitest installed with fast/integration split; npm run test excludes .integration.test.ts, npm run test:all includes it, no watch-mode flags"
    verification:
      - kind: unit
        ref: "npm run test (fast suite, 4 tests, 319ms)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Additive env.ts blocks (sqs.import*, groq, openaiTranscription, import.maxDurationSec) with no new required() keys — app boots without them set"
    requirement: PIPE-06
    verification:
      - kind: unit
        ref: "npm run typecheck"
        status: pass
    human_judgment: false
  - id: D3
    description: "ImportJob document (types + Mongoat model + repository) supports create/get/status-transition; model registered in src/modules/index.ts"
    requirement: PIPE-06
    verification:
      - kind: unit
        ref: "src/modules/import/import-job.repository.test.ts (createImportJob, getImportJob x2, updateImportJobStatus)"
        status: pass
    human_judgment: false

duration: ~35min
completed: 2026-07-01
status: complete
---

# Phase 1 Plan 01: Test Infra, Env Config & ImportJob Foundation Summary

**Vitest fast/integration test split, additive Groq/OpenAI/import-queue env config, and a Mongoat-backed ImportJob state-machine document (types + model + repository) that is the single source of truth for import pipeline progress and idempotency (PIPE-06).**

## Performance

- **Duration:** ~35 min (across an interrupted + resumed session)
- **Started:** 2026-07-01T15:39:00Z (approx, Task 1)
- **Completed:** 2026-07-01T19:16:00Z
- **Tasks:** 3
- **Files modified:** 10 (6 created, 4 modified)

## Accomplishments
- Vitest installed and configured as the project's first test framework, with an enforced fast/integration split (`.integration.test.ts` suffix convention) and no watch-mode flags
- Additive `env.ts` blocks for the import queue (+ DLQ), Groq, OpenAI fallback, and a video-duration DoS cap — all using `optional()+enabled` so the app boots cleanly with none of them configured
- `ImportJob` state machine fully modeled: types, Mongoat model (`import_jobs` collection, registered via `src/modules/index.ts`), and a repository (`createImportJob`, `getImportJob`, `updateImportJobStatus`) with a passing mocked-model unit test
- Obsidian-style `src/modules/import/README.md` documenting the state machine, idempotency design, and Mongoat import-order gotcha

## Task Commits

Each task was committed atomically:

1. **Task 1: Install and configure Vitest with fast/integration split** - `9a0d540` (feat)
2. **Task 2: Add additive env config blocks for import queue, Groq, and OpenAI** - `450b737` (feat)
3. **Task 3: Create the ImportJob model, types, and repository** - `cfe79b2` (feat)

**Plan metadata:** (pending — this commit)

_Note: This plan's execution was interrupted after Task 2 and resumed in a continuation session; Task 3 (this summary's primary new work) was completed and committed as a single atomic commit covering model + repository + registration + test + README + the yarn.lock delta from Task 1's install._

## Files Created/Modified
- `vitest.config.ts` - Vitest config: `@/` alias mirroring tsconfig, node environment, excludes `**/*.integration.test.ts`
- `package.json` - `test` (fast suite) / `test:all` (full suite) scripts, `vitest` devDependency
- `src/config/env.ts` - Additive `sqs.importQueueUrl/importDlqUrl/importEnabled`, `groq.{apiKey,model,enabled}`, `openaiTranscription.{apiKey,enabled}`, `import.maxDurationSec` blocks
- `src/modules/import/import-job.types.ts` - `ImportJobStatus`, `ImportFailureReason`, `ImportJob`, `ImportJobMessage`
- `src/modules/import/import-job.model.ts` - `ImportJobModel` (Mongoat, collection `import_jobs`, indexes on `status`/`userId`, `documentDefaults` for `status`/`retryCount`/timestamps)
- `src/modules/import/import-job.repository.ts` - `createImportJob`, `getImportJob`, `updateImportJobStatus`
- `src/modules/import/import-job.repository.test.ts` - Unit tests against a mocked `ImportJobModel` (4 tests)
- `src/modules/import/README.md` - Obsidian-style module doc (frontmatter, wikilinks, callouts, state machine diagram)
- `src/modules/index.ts` - Registers `import-job.model.js` (Mongoat "Database not found" import-order gotcha)
- `yarn.lock` - Updated for the `vitest` devDependency install

## Decisions Made
- Groq/OpenAI transcription keys use `optional()+enabled`, not `required()` — mirrors the `mp.enabled` graceful-degradation precedent; the worker is a separate deployable and a missing key should fail one job, not crash the process.
- `ImportJobMessage` carries only `{ jobId }` — enforces that the Mongo `ImportJob` doc (not the SQS payload) is the source of truth, per the plan's threat model (T-01-02 tampering mitigation).
- Repository test mocks `ImportJobModel` via `vi.mock` rather than requiring a live Mongo connection, per the plan's explicit instruction not to introduce a Mongo test container in this phase; the real-DB path is covered by the phase's manual end-to-end gate (01-VALIDATION.md).
- `ImportJobModel.allowedMethods` includes `METHODS.UPDATE` (verified against the installed `@iamcalegari/mongoat` package's `METHODS` enum: `UPDATE = "update"`, `FIND_BY_ID = "findById"`) because, unlike `FavoriteModel`, `ImportJob` requires atomic in-place status transitions across the pipeline.

## Deviations from Plan

None - plan executed exactly as written. Task 3 followed the `favorite.model.ts`/`favorite.repository.ts` analog precisely per `01-PATTERNS.md`, and the exact Mongoat `METHODS` member names (`UPDATE`, `FIND_BY_ID`) were confirmed by reading the installed package's `.d.ts` before writing code, resolving the one open question flagged in `01-PATTERNS.md` ("verify the exact METHODS member name against the mongoat package before writing").

## Issues Encountered
- This plan's execution was interrupted mid-flight after Task 2 committed; this session resumed from the documented partial state (Tasks 1-2 already committed, `import-job.types.ts` already written but uncommitted) and completed Task 3 without redoing prior work. No data loss or rework was required — the interruption only left `import-job.model.ts`, `import-job.repository.ts`, module registration, the repository test, and the README to be written.

## User Setup Required

None - no external service configuration required. All new env vars (`SQS_IMPORT_QUEUE_URL`, `SQS_IMPORT_DLQ_URL`, `GROQ_API_KEY`, `GROQ_WHISPER_MODEL`, `OPENAI_API_KEY`, `IMPORT_MAX_DURATION_SEC`) are optional with safe defaults; the app and worker boot without them configured, degrading gracefully per-feature.

## Next Phase Readiness
- Vitest is now the project's test runner for all subsequent Phase 1 plans (01-02 through 01-06), which each add their own `*.test.ts`/`*.integration.test.ts` files against this same fast/integration split.
- `ImportJob` (types + model + repository) is ready to be consumed by 01-02 (pure-logic infra), 01-03 (yt-dlp/transcription adapters), 01-04 (routes/enqueue producer, which will call `createImportJob`/`getImportJob`), and 01-05 (the worker, which will call `updateImportJobStatus` at every pipeline stage boundary).
- No blockers. The one deferred verification (PIPE-06's "message for an already-terminal job is a no-op") is explicitly scoped to `01-05-PLAN.md` (`import-worker.test.ts`) per `01-VALIDATION.md`'s per-task test map — this plan only establishes the document/repository primitives that make that idempotency check possible.

---
*Phase: 01-video-pipeline-foundation*
*Completed: 2026-07-01*

## Self-Check: PASSED

All created files verified present on disk (vitest.config.ts, src/modules/import/import-job.{types,model,repository,repository.test}.ts, src/modules/import/README.md). All 3 task commit hashes (9a0d540, 450b737, cfe79b2) verified present in git log.
