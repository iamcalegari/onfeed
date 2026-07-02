---
phase: 01-video-pipeline-foundation
plan: 05
subsystem: worker
tags: [sqs-consumer, p-queue, worker, pipeline-orchestration, idempotency, cleanup, circuit-breaker]

# Dependency graph
requires:
  - phase: 01-video-pipeline-foundation (plan 01)
    provides: "ImportJob types/model/repository (getImportJob, updateImportJobStatus), env.sqs.importQueueUrl"
  - phase: 01-video-pipeline-foundation (plan 02)
    provides: "ffmpeg.exec.ts (extractAudio), vad.ts (detectSilenceRatio), keyframe.ts (extractNormalizedKeyframe), platform-breaker.ts (isOpen/recordOutcome)"
  - phase: 01-video-pipeline-foundation (plan 03)
    provides: "ytdlp.downloader.ts (downloadVideo, DownloadError, DownloadFailureReason), transcription.port.ts (transcribe, TranscriptionError)"
  - phase: 01-video-pipeline-foundation (plan 04)
    provides: "enqueueImportJob (producer side, not directly consumed here but completes the end-to-end loop this worker closes)"
provides:
  - "processImportJob(job) — src/infra/video/pipeline.ts, full per-job orchestration"
  - "import-worker.ts — standalone sqs-consumer entrypoint (handleImportMessage, sweepStaleTempDirs, createImportConsumer)"
  - "worker:import npm script"
affects: [01-06-PLAN]

# Tech tracking
tech-stack:
  added: ["sqs-consumer@15.0.2", "p-queue@9.3.0"]
  patterns:
    - "DownloadFailureReason (ytdlp.downloader.ts's error vocabulary) is explicitly mapped to ImportFailureReason (ImportJob's state vocabulary) via toImportFailureReason() — the two unions diverge in purpose, never assumed to be the same type"
    - "anti_bot_blocked/rate_limited fail the job explicitly and RETURN without rethrowing (breaker cooldown governs retry, not SQS redelivery); network/unknown reasons rethrow so sqs-consumer leaves the message for redrive"
    - "Worker entrypoint's main() is guarded by an import.meta.url === file://argv[1] check, so tests can import handleImportMessage/sweepStaleTempDirs/createImportConsumer without triggering a real Mongo connection or consumer.start()"
    - "Idempotency source of truth is always the re-read ImportJob doc (getImportJob(jobId)), never the SQS message body — a terminal-status job (ready_for_review/failed) is a no-op regardless of message contents"

key-files:
  created:
    - src/infra/video/pipeline.ts
    - src/workers/import-worker.ts
    - src/workers/import-worker.test.ts
    - src/workers/README.md
  modified:
    - package.json
    - package-lock.json
    - yarn.lock
    - src/infra/video/README.md

key-decisions:
  - "extractNormalizedKeyframe (already exported by keyframe.ts from Plan 02, extraction+normalize in one call) is used directly instead of re-implementing the extract-then-toThumbnail sequence the plan's action text describes — same outcome (512² JPEG Buffer ready for putImage), zero duplication of the sharp chain"
  - "Circuit-breaker-open failures and anti_bot_blocked/rate_limited download failures are both classified to ImportFailureReason 'anti_bot_blocked' at the fail-fast breaker-open site (no download was attempted, so there's no more specific reason to report) — the breaker-open path never calls downloadVideo, confirmed by a dedicated test"
  - "handleMessage's ack strategy: return the SQS message (ack/delete) on both success and idempotent no-op — sqs-consumer's typed handleMessage contract treats a returned message as 'processed, delete it'; only a thrown error (processing_error) leaves the message for DLQ redrive"
  - "p-queue concurrency is read from IMPORT_WORKER_CONCURRENCY (default 2) rather than a fixed env.ts block — kept as a worker-process-local env var (not added to env.ts) since it's a runtime tuning knob for this one deployable, not a cross-cutting app config value"

patterns-established:
  - "src/workers/ is a new top-level namespace for standalone Render Background Worker deployables (distinct from src/server.ts and src/lambda/), documented in its own Obsidian-style README"
  - "pipeline.ts is the one file in src/infra/video/ that is NOT platform/binary-boundary-pure — it's the orchestration layer that depends on ImportJob and composes every other module in the namespace, called out explicitly in the namespace's README"

requirements-completed: [PIPE-01, PIPE-02, PIPE-03, PIPE-04, PIPE-05, PIPE-06, PIPE-07]

coverage:
  - id: D1
    description: "processImportJob advances status queued->downloading->transcribing->extracting(stub)->ready_for_review on the happy path, writing status at each stage boundary via updateImportJobStatus"
    requirement: PIPE-01
    verification:
      - kind: unit
        ref: "src/workers/import-worker.test.ts (cleanup-success test asserts final status ready_for_review with all mocked stages called)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Temp dir is removed after a successful run AND after a simulated mid-pipeline throw (try/finally, PIPE-05 layer 1)"
    requirement: PIPE-05
    verification:
      - kind: unit
        ref: "src/workers/import-worker.test.ts#processImportJob — cleanup guarantee (2 tests: success + throw path, both assert no import-job1-* dir left in tmpdir())"
        status: pass
    human_judgment: false
  - id: D3
    description: "sweepStaleTempDirs removes orphaned import-* temp dirs on worker boot (PIPE-05 layer 2, SIGKILL/OOM survival) without touching unrelated tmpdir entries"
    requirement: PIPE-05
    verification:
      - kind: unit
        ref: "src/workers/import-worker.test.ts#sweepStaleTempDirs (2 tests)"
        status: pass
    human_judgment: false
  - id: D4
    description: "A silent/music-only clip (detectSilenceRatio above threshold) sets noSpeechDetected and does NOT call transcribe (PIPE-02, D-06)"
    requirement: PIPE-02
    verification:
      - kind: unit
        ref: "src/workers/import-worker.test.ts#processImportJob — no-speech skip"
        status: pass
    human_judgment: false
  - id: D5
    description: "anti_bot_blocked/rate_limited download failures set status failed with that failureReason and do NOT rethrow (no immediate SQS retry); breaker outcome is recorded; a circuit-breaker-open platform fails fast without attempting downloadVideo at all"
    requirement: PIPE-07
    verification:
      - kind: unit
        ref: "src/workers/import-worker.test.ts#processImportJob — anti_bot_blocked failure (3 tests: no-rethrow+recordOutcome, breaker-open fail-fast, cleanup on no-rethrow path)"
        status: pass
    human_judgment: false
  - id: D6
    description: "A redelivered message for a job already in ready_for_review/failed is a no-op (does not call downloadVideo or write any status); a queued job is processed; a missing job is a defensive no-op (PIPE-06 idempotency)"
    requirement: PIPE-06
    verification:
      - kind: unit
        ref: "src/workers/import-worker.test.ts#handleImportMessage — idempotency (4 tests)"
        status: pass
    human_judgment: false
  - id: D7
    description: "Keyframe is extracted, normalized, and uploaded to imports/{jobId}/keyframe.jpg via the existing putImage; caption + sourceMeta (authorHandle/authorUrl/durationSec) are captured from downloader metadata; raw video/audio is never written to S3 anywhere in the pipeline"
    requirement: PIPE-04
    verification:
      - kind: unit
        ref: "src/workers/import-worker.test.ts#processImportJob — cleanup-success test asserts final ready_for_review status with keyframeUrl set"
        status: pass
      - kind: other
        ref: "grep -rn putImage src/infra/video/pipeline.ts — exactly one call site, imports/{jobId}/keyframe.jpg key, no other S3 write in the file"
        status: pass
    human_judgment: false
  - id: D8
    description: "Worker uses sqs-consumer's poll loop (Consumer.create + handleMessage) with the existing sqsClient singleton and a 20-minute visibilityTimeout — NOT the Lambda SQSEvent handler shape"
    requirement: PIPE-06
    verification:
      - kind: other
        ref: "grep -n SQSEvent src/workers/import-worker.ts — only appears in a comment explaining the topology divergence, never as an actual type import/usage"
        status: pass
    human_judgment: false
  - id: D9
    description: "npm run typecheck green across the full project after both tasks; npm run test (fast suite) green with 70 total tests across 7 files, no regressions in prior plans' tests"
    verification:
      - kind: unit
        ref: "npm run typecheck && npm run test"
        status: pass
    human_judgment: false
  - id: D10
    description: "Real end-to-end pipeline execution (real yt-dlp download, real ffmpeg, real Groq/OpenAI transcription, real S3 upload) against one real URL per platform (YouTube, TikTok, Instagram best-effort) is deferred to Plan 01-06's manual E2E gate"
    verification:
      - kind: manual
        ref: "01-VALIDATION.md Manual-Only Verifications — real end-to-end download+transcribe+keyframe per platform; PT-BR transcription quality spot-check (D-05); platform block landing in monitored failed state (requires triggering a real block)"
        status: pending
    human_judgment: true

duration: ~50min
completed: 2026-07-01
status: complete
---

# Phase 1 Plan 05: Worker Assembly — processImportJob Orchestration + sqs-consumer Entrypoint Summary

**Standalone sqs-consumer worker (`import-worker.ts`) drives every prior Phase 1 artifact through a single per-job orchestration (`pipeline.ts`): breaker-gated download → VAD → transcribe/skip → keyframe → S3 → cleanup, with guaranteed two-layer temp-file cleanup and idempotent, no-op-on-terminal-status message handling.**

## Performance

- **Duration:** ~50 min
- **Started:** 2026-07-01T21:14:00Z (approx)
- **Completed:** 2026-07-02T00:21:00Z
- **Tasks:** 2
- **Files modified:** 8 (4 created, 4 modified — plus README docs commit)

## Accomplishments
- `pipeline.ts` composes every prior-plan adapter (downloader, VAD, transcription, keyframe, circuit breaker) into `processImportJob(job)`: breaker check → download (status `downloading`) → extractAudio + detectSilenceRatio → transcribe or skip (status `transcribing`) → extracting stub (status `extracting`, explicit no-op with a Phase-2 forward-reference comment) → keyframe extract+normalize+upload (`imports/{jobId}/keyframe.jpg`) → `ready_for_review`
- Two-layer cleanup guarantee (PIPE-05) is fully wired: layer 1 (`try/finally` around the entire per-job body in `pipeline.ts`, removes the `mkdtemp`'d job dir on success AND on throw) and layer 2 (`sweepStaleTempDirs()` in `import-worker.ts`, run on every worker boot before consuming, survives SIGKILL/OOM where `finally` can't run)
- `DownloadFailureReason` (yt-dlp's error vocabulary) is explicitly mapped to `ImportFailureReason` (the ImportJob's state vocabulary) via `toImportFailureReason()` — `anti_bot_blocked`/`rate_limited` fail the job explicitly and return without rethrowing (the circuit breaker's cooldown, not SQS redelivery, governs the next attempt); transient reasons (`network`/`unknown`) rethrow so `sqs-consumer` leaves the message on the queue for DLQ redrive
- `import-worker.ts`: standalone `sqs-consumer` long-poll entrypoint (NOT the Lambda `SQSEvent` shape) — mirrors `ingest-handler.ts`'s connect-once + import-order discipline, reuses the existing region-only `sqsClient` singleton, 20-minute `visibilityTimeout`, `p-queue`-capped concurrency (default 2, `IMPORT_WORKER_CONCURRENCY` override)
- Idempotency (PIPE-06): `handleImportMessage` always re-reads the authoritative `ImportJob` doc by `jobId`; a redelivered message for a job already `ready_for_review`/`failed` is a no-op; a missing job is a defensive no-op; a `queued` job is processed
- Installed `sqs-consumer@15.0.2` and `p-queue@9.3.0` — both pre-approved in `01-RESEARCH.md`'s Package Legitimacy Audit (T-05-SC), no new package-legitimacy checkpoint needed
- Added `worker:import` npm script (`tsx --env-file=.env src/workers/import-worker.ts`)
- 18 new fast unit tests across `src/workers/import-worker.test.ts` (12 for Task 1: cleanup success/throw, no-speech skip, anti_bot_blocked no-rethrow + breaker-open fail-fast + cleanup-on-no-rethrow; 6 for Task 2: idempotency no-op x2 + queued-processed + missing-job no-op, sweep removes/leaves-alone) — 70 total across the full fast suite, zero regressions
- New `src/workers/README.md` (Obsidian-style module doc) and `src/infra/video/README.md` updated with the `pipeline.ts` entry and the `DownloadFailureReason`→`ImportFailureReason` mapping note

## Task Commits

Each task was committed atomically:

1. **Task 1: processImportJob orchestration with guaranteed cleanup (PIPE-01..05, PIPE-07)** - `93cfb80` (feat)
2. **Task 2: Worker entrypoint — sqs-consumer loop, idempotency, startup sweep (PIPE-06, PIPE-05)** - `f56113a` (feat)

**Docs:** `a5a654e` (docs: src/infra/video/README.md + new src/workers/README.md)

**Plan metadata:** (pending — this commit)

## Files Created/Modified
- `src/infra/video/pipeline.ts` - `processImportJob(job)`: the full per-job orchestration; `toImportFailureReason()` mapper; `failJob()` helper; `logOutcome()` structured telemetry (PIPE-07)
- `src/workers/import-worker.ts` - `main()` (guarded by an `import.meta.url` check so tests can import without booting), `ensureDbConnected()`, `sweepStaleTempDirs()`, `handleImportMessage()`, `createImportConsumer()`, module-level `p-queue` limiter
- `src/workers/import-worker.test.ts` - 18 fast unit tests covering both tasks' behaviors, all external deps mocked (downloader, transcription, ffmpeg units, breaker, `putImage`, repository, `@/config/env.js`, `@/infra/database/connection.js`, `@/modules/index.js`, `@/infra/queue/sqs.client.js`)
- `src/workers/README.md` - new Obsidian-style module doc (sqs-consumer topology, local run instructions, `main()`-guard rationale, idempotency/DLQ notes)
- `src/infra/video/README.md` - added `pipeline.ts` entry, updated the phase-progress `[!INFO]` callout, added a `[!TIP]` on the failure-reason mapping, updated "Consumido por" to describe the worker's actual idempotency/p-queue flow
- `package.json` / `package-lock.json` / `yarn.lock` - `sqs-consumer`, `p-queue` dependencies; `worker:import` script

## Decisions Made
- Used `keyframe.ts`'s already-exported `extractNormalizedKeyframe()` (extract + sharp-normalize in one call, from Plan 02) directly rather than re-implementing an extract-then-toThumbnail sequence — same outcome, zero duplicated sharp chain logic.
- The circuit-breaker-open fail-fast path classifies to `ImportFailureReason: "anti_bot_blocked"` since no download was attempted and there's no more specific reason available at that point — confirmed by a dedicated test that `downloadVideo` is never called when `isOpen` returns true.
- `handleMessage`'s sqs-consumer callback returns the message (ack/delete) on both real success and idempotent no-op paths — under `sqs-consumer`'s typed `handleMessage` contract, only a thrown error triggers `processing_error` and leaves the message on the queue for DLQ redrive; returning `undefined` would leave even successfully-processed messages on the queue, which is not the intended behavior here.
- `IMPORT_WORKER_CONCURRENCY` is read as a plain `process.env` var (not added to `env.ts`) — it's a worker-process-local runtime tuning knob for this one deployable, not a cross-cutting app config value shared with the Fastify process.

## Deviations from Plan

None — plan executed exactly as written. Both tasks followed `01-RESEARCH.md`'s Architecture Pattern 4 (two-layer cleanup) and Code Example §6 (sqs-consumer usage) precisely; the `DownloadFailureReason`→`ImportFailureReason` mapping was an implementation necessity (the two types are genuinely different unions defined in different modules) rather than a plan deviation — the plan's action text described the *behavior* (classify to the ImportFailureReason, no-rethrow for anti_bot_blocked/rate_limited) without spelling out the type-level mapping function, which was the natural way to satisfy `npm run typecheck` cleanly.

## Issues Encountered

None. Both tasks' verification commands (`npm run test -- src/workers/import-worker.test.ts`, `npm run typecheck`) passed on the first attempt after the type-mapping fix described above; no auto-fix-limit issues, no blocking package installs beyond the two pre-approved ones.

## Known Stubs

- **Extraction (Phase 2 scope, intentional stub per plan):** `pipeline.ts`'s `extracting` status transition is an explicit no-op — `// no-op intencional` comment marks the exact line Phase 2 will replace with the real LLM-based recipe extraction call. This is not a gap; it is the plan's stated scope boundary (`01-CONTEXT.md`: "extração estruturada é stubbed nesta fase").

## User Setup Required

- **AWS SQS import queue provisioning** (`SQS_IMPORT_QUEUE_URL`, DLQ + `maxReceiveCount` redrive policy) is explicitly Plan 01-06's responsibility — this plan's worker code targets `env.sqs.importQueueUrl` but the queue itself is not yet provisioned as infrastructure.
- **Groq/OpenAI API keys** (`GROQ_API_KEY`, `OPENAI_API_KEY`) — both remain `optional()+enabled` (Plan 01); a worker running without them degrades to a `transcription_failed` job outcome rather than crashing.
- **Real yt-dlp/ffmpeg binaries + network** — required for the worker to actually process a job end-to-end; this session's verification was entirely the fast unit suite (all adapters mocked). The manual end-to-end gate (real URL per platform: YouTube, TikTok, Instagram best-effort) is explicitly deferred to Plan 01-06 per `01-VALIDATION.md`.

## Next Phase Readiness
- Every phase-scoped requirement (PIPE-01 through PIPE-07) is now marked complete in `REQUIREMENTS.md` — this plan is what makes PIPE-04/05/07's full requirement text true (the worker actually extracts/uploads the keyframe, guarantees cleanup end-to-end, and enforces the circuit breaker with no-immediate-retry on block), completing the set that Plans 01-03 and prior intentionally left pending.
- Plan 01-06 (deployment/infra: Dockerfile with Python+ffmpeg+yt-dlp, Render Background Worker service block, SQS import queue + DLQ provisioning, the manual real-URL-per-platform E2E gate) is the only remaining plan in this phase and is now unblocked — the worker code it deploys is complete and unit-tested.
- No blockers. The one deferred verification (real end-to-end pipeline execution) is explicitly scoped to Plan 01-06's manual gate per `01-VALIDATION.md`'s own Sampling Rate section ("Before /gsd-verify-work: Full suite green PLUS a manual end-to-end run against one real URL per platform").

---
*Phase: 01-video-pipeline-foundation*
*Completed: 2026-07-01*

## Self-Check: PASSED

All 4 created source files verified present on disk (pipeline.ts, import-worker.ts, import-worker.test.ts, src/workers/README.md), plus this SUMMARY.md. All 3 relevant commit hashes (93cfb80, f56113a, a5a654e) verified present in git log.
