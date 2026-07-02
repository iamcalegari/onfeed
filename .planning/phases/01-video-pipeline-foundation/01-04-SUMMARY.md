---
phase: 01-video-pipeline-foundation
plan: 04
subsystem: api
tags: [fastify, typebox, ssrf, idor, sqs, mongoat, video-import]

# Dependency graph
requires:
  - phase: 01-video-pipeline-foundation (plan 01)
    provides: "ImportJob types/model/repository (createImportJob, getImportJob, updateImportJobStatus), env.sqs.importQueueUrl"
provides:
  - "detectPlatform(url) — SSRF allowlist boundary classifying youtube/tiktok/instagram, null otherwise"
  - "normalizeUrl(url) — idempotent tracking-param stripping (utm_*, igshid, si)"
  - "enqueueImportJob(jobId) — sends { jobId } to the dedicated import SQS queue via the existing sqsClient"
  - "importRoutes: POST /import (validate-then-enqueue, 202/400) and GET /import/:jobId (userId-scoped, 404 on non-owner)"
  - "getImportJob(jobId, userId?) — repository extended with optional ownership-scoped query variant"
affects: [01-05-PLAN, 01-06-PLAN]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Domain allowlist as the SSRF security boundary (strict regex match, no soft-pass fallback) enforced before any downstream fetch"
    - "IDOR mitigation via query-level ownership scoping (filter by _id AND userId in the same Mongo query) rather than fetch-then-compare"
    - "Route rejects invalid input before any side effect (job creation / enqueue) — validate-then-act ordering"

key-files:
  created:
    - src/modules/import/import.service.ts
    - src/modules/import/import.service.test.ts
    - src/modules/import/import.routes.ts
  modified:
    - src/modules/import/import-job.repository.ts
    - src/modules/import/README.md
    - src/app.ts

key-decisions:
  - "classifyRejectionReason (route-layer helper) distinguishes invalid_url from unsupported_platform for the 400 response — detectPlatform itself stays a strict boolean-ish (platform | null) SSRF gate, keeping the security boundary simple while still giving CAP-02's required specific error"
  - "getImportJob(jobId, userId?) uses an optional second parameter rather than a new function name — preserves the existing single-arg call sites (worker/idempotency checks) while adding the ownership-scoped variant the route needs"
  - "Ownership check queries Mongo with { _id, userId } in one filter (ImportJobModel.find), not findById+compare — a non-owner and a nonexistent job both resolve to the same notFound(), so job existence cannot be enumerated"

patterns-established:
  - "SSRF-relevant allowlist logic gets its own unit-test block asserting both the valid-platform and reject cases (malformed, non-http(s), non-allowlisted domain/internal IP) so the security boundary has explicit regression coverage"

requirements-completed: [CAP-02, PIPE-06]

coverage:
  - id: D1
    description: "detectPlatform rejects malformed URLs, non-http(s) schemes, and non-allowlisted domains (SSRF boundary) while correctly classifying valid youtube/tiktok/instagram URLs"
    requirement: CAP-02
    verification:
      - kind: unit
        ref: "src/modules/import/import.service.test.ts#detectPlatform (CAP-02 / SSRF boundary) — 12 cases"
        status: pass
    human_judgment: false
  - id: D2
    description: "normalizeUrl strips tracking params (utm_*, igshid, si) and is idempotent across links differing only by those params"
    requirement: CAP-02
    verification:
      - kind: unit
        ref: "src/modules/import/import.service.test.ts#normalizeUrl — 3 cases"
        status: pass
    human_judgment: false
  - id: D3
    description: "enqueueImportJob sends { jobId } (the ImportJob _id) to env.sqs.importQueueUrl via the existing sqsClient singleton"
    requirement: PIPE-06
    verification:
      - kind: unit
        ref: "src/modules/import/import.service.test.ts#enqueueImportJob — mocked sqsClient assertion"
        status: pass
    human_judgment: false
  - id: D4
    description: "POST /import rejects invalid/unsupported URLs with a specific 400 before creating a job or enqueueing; valid submission creates a queued ImportJob, enqueues its _id, returns 202 { jobId }"
    requirement: CAP-02
    verification:
      - kind: unit
        ref: "npm run typecheck (route + schema compile); no dedicated route-level HTTP test in this plan — behavior composed from D1/D3-covered units"
        status: pass
    human_judgment: true
    rationale: "No integration/HTTP-level test harness exists yet for Fastify routes in this repo (favorites/recipes routes are also untested at the HTTP layer) — the route wires already-unit-tested detectPlatform/normalizeUrl/enqueueImportJob/createImportJob correctly per code review, but end-to-end request/response behavior (status codes, body shape) has not been exercised by an automated HTTP test."
  - id: D5
    description: "GET /import/:jobId returns the job only to its owner; a non-owner or nonexistent jobId both receive notFound (IDOR blocked)"
    requirement: CAP-02
    verification:
      - kind: unit
        ref: "npm run typecheck (route + repository signature compile); ownership-scoped query verified by code inspection against ImportJobModel.find contract"
        status: pass
    human_judgment: true
    rationale: "Same as D4 — no HTTP-level test harness exists yet; the query-scoping logic itself has no dedicated unit test isolating getImportJob(jobId, userId) behavior against a mocked ImportJobModel.find call (only findById is covered by the plan-01 repository test). A human/manual-gate check against a live Mongo instance is the closest available verification per 01-VALIDATION.md's manual sign-off gate."
  - id: D6
    description: "src/modules/import/README.md documents the module in Obsidian style: routes, SSRF-allowlist boundary, ownership check, state machine"
    verification:
      - kind: other
        ref: "test -f src/modules/import/README.md && grep -q import src/modules/import/README.md"
        status: pass
    human_judgment: false

duration: ~40min
completed: 2026-07-01
status: complete
---

# Phase 1 Plan 04: Import API Surface — Validation, Enqueue, Ownership-Scoped Polling Summary

**POST /import validate-then-enqueue with a strict domain-allowlist SSRF boundary (detectPlatform), and GET /import/:jobId ownership-scoped at the Mongo query level to block IDOR — the synchronous API surface that fronts the ImportJob pipeline.**

## Performance

- **Duration:** ~40 min
- **Started:** 2026-07-01T20:55:00Z (approx)
- **Completed:** 2026-07-01T21:09:00Z
- **Tasks:** 3
- **Files modified:** 6 (3 created, 3 modified)

## Accomplishments
- `detectPlatform`/`normalizeUrl`/`enqueueImportJob` implemented in `import.service.ts` — the SSRF security boundary (strict 3-domain allowlist, no soft-pass) plus tracking-param-stripping normalization plus the dedicated-queue enqueue producer that carries the existing `ImportJob._id`, not a fresh UUID
- `import.routes.ts` — `POST /import` validates before any side effect and returns a specific 400 (`invalid_url` vs `unsupported_platform`); `GET /import/:jobId` is ownership-scoped via an extended `getImportJob(jobId, userId)` repository query, closing the IDOR gap (T-04-02)
- `importRoutes` registered in `src/app.ts` under `/api/v1`
- 17 fast unit tests (detectPlatform SSRF cases including internal-IP/`file:`/`javascript:` rejection, normalizeUrl idempotency, mocked-sqsClient enqueue assertion) — full fast suite (58 tests across all Phase 1 plans so far) green
- `src/modules/import/README.md` updated with `## Rotas`, SSRF-allowlist `[!INFO]` callout, ownership-check `[!TIP]` callout, and the extraction-is-stubbed forward reference to Phase 2

## Task Commits

Each task was committed atomically:

1. **Task 1: Platform detection, URL normalization, and enqueue producer (CAP-02, PIPE-06)** - `455a907` (feat)
2. **Task 2: Import routes — POST /import (validate→enqueue) and ownership-scoped GET /import/:jobId (CAP-02, PIPE-06)** - `43fde50` (feat)
3. **Task 3: Obsidian-style module README for src/modules/import** - `9c46932` (docs)

**Plan metadata:** (pending — this commit)

## Files Created/Modified
- `src/modules/import/import.service.ts` - `detectPlatform` (SSRF allowlist), `normalizeUrl` (tracking-param strip), `enqueueImportJob` (sends `{ jobId }` to `env.sqs.importQueueUrl`)
- `src/modules/import/import.service.test.ts` - 17 unit tests: detectPlatform valid/reject cases (including SSRF-relevant internal-IP, non-http(s) scheme, and non-allowlisted-domain cases), normalizeUrl idempotency, enqueueImportJob mocked-sqsClient assertion
- `src/modules/import/import.routes.ts` - `POST /import` (requireAuth, body `{ url }`, validates via detectPlatform/normalizeUrl before creating the job, 202 `{ jobId }` or 400 `{ error }`), `GET /import/:jobId` (requireAuth, params `{ jobId }`, ownership-scoped via `getImportJob(jobId, userId)`, notFound on non-owner)
- `src/modules/import/import-job.repository.ts` - `getImportJob` extended with an optional `userId` param; when present, filters `{ _id, userId }` in one Mongo query (`ImportJobModel.find`) instead of fetch-then-compare
- `src/modules/import/README.md` - Added `## Rotas` block, SSRF/ownership callouts, updated Repository section for the new `getImportJob` signature, added extraction-stub forward reference
- `src/app.ts` - Registered `importRoutes` under `/api/v1`, alongside the existing route plugins

## Decisions Made
- `classifyRejectionReason` (route-layer helper, not exported from `import.service.ts`) distinguishes `invalid_url` from `unsupported_platform` for the 400 response body, keeping `detectPlatform` itself a simple, strict `platform | null` security gate while still satisfying CAP-02's "specific error" requirement.
- `getImportJob(jobId, userId?)` uses an optional second parameter rather than introducing a new function name — preserves the existing single-arg call sites (worker/idempotency checks in future plans) while adding the ownership-scoped variant the route needs. When `userId` is omitted, behavior is unchanged (`findById` passthrough).
- Ownership check queries Mongo with `{ _id, userId }` in a single `ImportJobModel.find(...)` filter, not `findById` followed by an in-memory comparison — a non-owner and a nonexistent jobId both resolve to the same `reply.notFound()`, so job existence cannot be enumerated by ID.

## Deviations from Plan

None - plan executed exactly as written. `detectPlatform`/`normalizeUrl` were implemented per RESEARCH.md §7 Code Example verbatim (regex patterns, protocol check, tracking-param list); `enqueueImportJob` mirrors `enqueueIngestJob` with the two required deltas (existing `_id` as `jobId`, `env.sqs.importQueueUrl` instead of `env.sqs.queueUrl`) exactly as specified. `getImportJob`'s signature extension was explicitly pre-authorized by the plan ("coordinate: this plan owns the route, but adding the userId filter to getImportJob is acceptable here since Plan 01 is in an earlier wave and complete").

## Issues Encountered
None. The parallel Wave 2 plan (01-03, yt-dlp/transcription adapters) had already landed test files by the time this plan ran; the fast suite (`npm run test`) confirms all 58 tests across both plans' work pass together with no conflicts.

## User Setup Required

None - no external service configuration required. This plan introduces no new env vars; it consumes `env.sqs.importQueueUrl` which was already added (optional, degrades gracefully) in Plan 01.

## Next Phase Readiness
- The synchronous API surface (`POST /import`, `GET /import/:jobId`) is complete and de-risked (SSRF boundary + IDOR mitigation both unit/code-verified) ahead of the worker existing — Plan 05 (the worker) can now be built and tested against a real enqueue path.
- `enqueueImportJob` targets `env.sqs.importQueueUrl`; the actual queue + DLQ provisioning (redrive policy, `maxReceiveCount`) is explicitly Plan 06's responsibility per this plan's scope note — not yet provisioned as infrastructure.
- Two coverage items (D4, D5 — the route-level HTTP behavior) are flagged `human_judgment: true` because no Fastify HTTP-level test harness exists yet in this repo (consistent with all other route files, e.g. favorites/recipes, which are also untested at the HTTP layer) — this is a pre-existing repo-wide gap, not scope this plan was asked to close. The underlying pure functions (detectPlatform, normalizeUrl, enqueueImportJob) are fully unit-tested; only the route glue (schema validation, status codes, ownership-query wiring) awaits either a manual /gsd-verify-work pass or a future HTTP-test-harness investment.
- No blockers for Plan 05/06.

---
*Phase: 01-video-pipeline-foundation*
*Completed: 2026-07-01*

## Self-Check: PASSED

All created/modified files verified present on disk (import.service.ts, import.service.test.ts, import.routes.ts, import-job.repository.ts, README.md, app.ts, this SUMMARY.md). All 3 task commit hashes (455a907, 43fde50, 9c46932) verified present in git log.
