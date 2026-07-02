---
phase: 01-video-pipeline-foundation
plan: 03
subsystem: infra
tags: [yt-dlp, youtube-dl-exec, groq, openai, transcription, download, vitest]

# Dependency graph
requires:
  - phase: 01-video-pipeline-foundation (plan 01)
    provides: "Vitest fast/integration split, env.ts groq/openaiTranscription/import.maxDurationSec blocks"
  - phase: 01-video-pipeline-foundation (plan 02)
    provides: "src/infra/video/ffmpeg.exec.ts (extractAudio, reused conceptually — no direct call from this plan's adapters)"
provides:
  - "downloader.port.ts: VideoMetadata/DownloadResult typed contract, platform-agnostic field names"
  - "ytdlp.downloader.ts: fetchMetadata, downloadVideo, classifyYtdlpError, DownloadError, DownloadFailureReason"
  - "transcription.port.ts: transcribe orchestrator (Groq->OpenAI fallback), Transcriber interface, TranscriptionError"
  - "groq.transcriber.ts / openai.transcriber.ts: concrete SDK adapters consumed by transcription.port.ts"
affects: [01-04-PLAN, 01-05-PLAN, 01-06-PLAN]

# Tech tracking
tech-stack:
  added: ["youtube-dl-exec@^3.1.8", "groq-sdk@^1.3.0", "openai@^6.45.0"]
  patterns:
    - "youtube-dl-exec named export (youtubeDl) used instead of default export — the package's CJS module.exports shape doesn't resolve as callable via the default import under this project's NodeNext moduleResolution"
    - "Groq->OpenAI fallback is a runtime try/catch inside transcribe(), never an env-time adapter swap"
    - "Transcriber deps (groq/openai functions) are injectable via TranscribeDeps, making the fallback path fully unit-testable against mocked functions with zero real SDK/network calls"
    - "Unit tests that import a module transitively pulling in env.ts mock @/config/env.js explicitly (env.ts's required(MONGODB_URI) at module-load would otherwise fail the fast suite)"

key-files:
  created:
    - src/infra/video/downloader.port.ts
    - src/infra/video/ytdlp.downloader.ts
    - src/infra/video/ytdlp.downloader.test.ts
    - src/infra/video/ytdlp.downloader.integration.test.ts
    - src/infra/video/transcription.port.ts
    - src/infra/video/groq.transcriber.ts
    - src/infra/video/openai.transcriber.ts
    - src/infra/video/transcription.test.ts
  modified:
    - package.json
    - package-lock.json
    - yarn.lock
    - src/infra/video/README.md

key-decisions:
  - "Package-legitimacy checkpoint (Task 0) was pre-approved by the user via the orchestrator before this execution session started; youtube-dl-exec/groq-sdk/openai were installed without an additional interactive pause, and that approval is recorded here rather than re-prompted"
  - "youtube-dl-exec install required YOUTUBE_DL_SKIP_DOWNLOAD=true locally — the postinstall script's fetch of the yt-dlp binary from GitHub releases timed out in this sandboxed environment (network reachable for HEAD requests but the large binary download itself stalled). This matches RESEARCH.md's own anticipated dev-workflow note (YOUTUBE_DL_SKIP_PYTHON_CHECK precedent); the real binary is guaranteed at runtime by the worker's production Dockerfile (Plan 06), not by local npm install"
  - "fetchMetadata's --dump-json mapping omits optional VideoMetadata keys entirely (via conditional spread) rather than assigning them undefined, required by the project's exactOptionalPropertyTypes:true tsconfig setting"
  - "transcribe()'s size guard treats a failed fs.stat (e.g. missing file) as 'not oversized' and lets the real transcription call surface the actual error, rather than masking a stat failure as an oversized-file classification"
  - "No fluent-ffmpeg installed or referenced anywhere in this plan's code (RESEARCH Pitfall 0) — this plan's adapters are yt-dlp/Groq/OpenAI SDK boundaries, not ffmpeg call sites; ffmpeg remains centralized in ffmpeg.exec.ts from Plan 02"

patterns-established:
  - "Video-infra adapter tests inject the transitive env.ts dependency via vi.mock('@/config/env.js', ...) when the module under test needs env.ts fields (maxDurationSec, groq/openaiTranscription keys) but the test itself should not require Mongo/AWS env vars to run"

requirements-completed: [PIPE-01, PIPE-02, PIPE-03]

coverage:
  - id: D1
    description: "classifyYtdlpError maps documented stderr patterns (sign-in-to-confirm, 403, 429, private/unavailable, network) to the correct DownloadFailureReason, case-insensitively, defaulting to 'unknown' for unrecognized text (PIPE-01, PIPE-07)"
    requirement: PIPE-01
    verification:
      - kind: unit
        ref: "src/infra/video/ytdlp.downloader.test.ts (8 classifier tests)"
        status: pass
    human_judgment: false
  - id: D2
    description: "fetchMetadata maps --dump-json fields to platform-agnostic VideoMetadata and tolerates missing optional fields (e.g. absent uploader_url on TikTok/Instagram) without throwing (PIPE-03)"
    requirement: PIPE-03
    verification:
      - kind: unit
        ref: "src/infra/video/ytdlp.downloader.test.ts (4 fetchMetadata tests, incl. missing-optional-field tolerance and uploader_id fallback)"
        status: pass
    human_judgment: false
  - id: D3
    description: "downloadVideo rejects with duration_exceeded before attempting the actual download when metadata duration exceeds env.import.maxDurationSec, and throws DownloadError carrying both the classified reason and raw stderr on a genuine download failure"
    requirement: PIPE-01
    verification:
      - kind: unit
        ref: "src/infra/video/ytdlp.downloader.test.ts (3 downloadVideo tests: duration cap, DownloadError shape, success path)"
        status: pass
    human_judgment: false
  - id: D4
    description: "transcribe() tries Groq first and falls back to OpenAI on any Groq failure (outage, error, or oversized-file guard), returning { text, source } (PIPE-02)"
    requirement: PIPE-02
    verification:
      - kind: unit
        ref: "src/infra/video/transcription.test.ts (Groq-succeeds, Groq-fails-OpenAI-used, oversized-routes-to-OpenAI tests)"
        status: pass
    human_judgment: false
  - id: D5
    description: "transcribe() throws a typed TranscriptionError (not a hang or generic error) when both Groq and OpenAI fail, preserving both underlying errors for the worker's failureReason mapping"
    requirement: PIPE-02
    verification:
      - kind: unit
        ref: "src/infra/video/transcription.test.ts (both-fail and oversized-both-fail tests)"
        status: pass
    human_judgment: false
  - id: D6
    description: "Real yt-dlp download + metadata extraction against a live public video, and end-to-end anti-bot/rate-limit stderr fixture confirmation, are deferred to the manual-gated integration suite"
    verification:
      - kind: manual
        ref: "src/infra/video/ytdlp.downloader.integration.test.ts (npm run test:all) — not run in this session; requires the real yt-dlp binary + network"
        status: pending
    human_judgment: true
  - id: D7
    description: "No fluent-ffmpeg dependency and no child_process.exec string-form usage introduced by this plan's files"
    verification:
      - kind: other
        ref: "grep -rn 'fluent-ffmpeg|child_process.exec(' src/infra/video/ downloader.ts/transcription.ts/transcriber.ts — no matches outside pre-existing warning comments"
        status: pass
    human_judgment: false

duration: ~45min
completed: 2026-07-01
status: complete
---

# Phase 1 Plan 03: yt-dlp Downloader + Groq/OpenAI Transcription Adapters Summary

**yt-dlp download adapter with typed failure classification (anti-bot/rate-limit/unavailable/network/duration-cap) and a Groq-primary/OpenAI-fallback transcription orchestrator with a pre-call size guard — both unit-tested end-to-end via mocked SDK/binary boundaries, no real network calls in the fast suite.**

## Performance

- **Duration:** ~45 min
- **Started:** 2026-07-01T20:49:00Z
- **Completed:** 2026-07-01T21:00:00Z (approx)
- **Tasks:** 3 (Task 0 checkpoint pre-approved, Task 1, Task 2)
- **Files modified:** 12 (8 created, 4 modified)

## Accomplishments
- Package-legitimacy checkpoint (Task 0) was already approved by the user via the orchestrator before this session; installed `youtube-dl-exec@3.1.8`, `groq-sdk@1.3.0`, `openai@6.45.0` — no `fluent-ffmpeg` anywhere in the tree
- `downloader.port.ts` + `ytdlp.downloader.ts`: platform-agnostic `VideoMetadata`/`DownloadResult` contract, `fetchMetadata`/`downloadVideo` backed by `youtube-dl-exec`, `classifyYtdlpError` mapping documented stderr patterns to a closed `DownloadFailureReason` union (feeds the Plan 02 circuit breaker), `DownloadError` always preserving raw stderr for debuggability (RESEARCH Assumption A1)
- Duration cap enforcement: `downloadVideo` rejects before the expensive download step if `fetchMetadata`'s duration exceeds `env.import.maxDurationSec` (defense-in-depth vs T-03-02 DoS)
- `transcription.port.ts` + `groq.transcriber.ts` + `openai.transcriber.ts`: `transcribe()` orchestrator tries Groq (`whisper-large-v3-turbo`, `pt` language hint) first, falls back to OpenAI (`whisper-1`) on any failure via runtime try/catch; a pre-call file-size guard (25MB Groq free-tier ceiling) routes oversized audio straight to OpenAI instead of letting the Groq SDK call fail ambiguously
- Both `.integration.test.ts` (manual-gated, real yt-dlp/network) and `.test.ts` (fast, mocked) files created per the fast/integration split established in Plan 01
- `src/infra/video/README.md` updated with the new adapter entries, test-mocking rationale, and the `YOUTUBE_DL_SKIP_DOWNLOAD` local-install note

## Task Commits

Each task was committed atomically:

1. **Task 0: Package legitimacy checkpoint** - pre-approved by the user via the orchestrator (no separate commit; recorded here per instruction)
2. **Task 1: yt-dlp downloader adapter with failure classification (PIPE-01/03/07)** - `994c8d1` (feat)
3. **Task 2: Transcription port — Groq primary, OpenAI fallback (PIPE-02)** - `ed382ba` (feat)

**Docs:** `dc81fdc` (docs: src/infra/video/README.md — new adapter entries)

**Plan metadata:** (pending — this commit)

## Files Created/Modified
- `src/infra/video/downloader.port.ts` - `VideoMetadata`, `DownloadResult` — platform-agnostic typed contract
- `src/infra/video/ytdlp.downloader.ts` - `fetchMetadata`, `downloadVideo`, `classifyYtdlpError`, `DownloadError`, `DownloadFailureReason`
- `src/infra/video/ytdlp.downloader.test.ts` - 15 fast unit tests (classifier fixtures, metadata mapper tolerance, duration cap, DownloadError shape)
- `src/infra/video/ytdlp.downloader.integration.test.ts` - manual-gated real download+metadata assertion against a stable public YouTube video
- `src/infra/video/transcription.port.ts` - `transcribe`, `Transcriber`, `TranscribeDeps`, `TranscriptionError`, `GROQ_FILE_SIZE_LIMIT_BYTES`
- `src/infra/video/groq.transcriber.ts` - `transcribeWithGroq` (groq-sdk, `whisper-large-v3-turbo`, `pt` hint)
- `src/infra/video/openai.transcriber.ts` - `transcribeWithOpenAI` (openai SDK, `whisper-1`, `pt` hint)
- `src/infra/video/transcription.test.ts` - 6 fast unit tests (Groq-first, OpenAI-fallback, both-fail typed error, oversized-file routing x2, stat-failure tolerance)
- `src/infra/video/README.md` - new adapter entries, test-mocking rationale, dependency/install notes
- `package.json` / `package-lock.json` / `yarn.lock` - `youtube-dl-exec`, `groq-sdk`, `openai` dependencies

## Decisions Made
- Used `youtube-dl-exec`'s named `youtubeDl` export instead of the default export — under this project's `NodeNext` module resolution + `esModuleInterop`, the default-export type didn't resolve as callable (`TS2349: This expression is not callable`) against the package's CJS `module.exports = fn` shape; the named export is explicitly typed as callable in the package's own `.d.ts` and resolved cleanly.
- Installed with `YOUTUBE_DL_SKIP_DOWNLOAD=true` after the plain `npm install` failed with an `ETIMEDOUT` fetching the yt-dlp binary from GitHub releases during postinstall (network reachable for HTTP HEAD requests in this sandbox, but the large binary download itself stalled). This is consistent with RESEARCH.md's own anticipated local-dev workaround pattern (it documents `YOUTUBE_DL_SKIP_PYTHON_CHECK` for a related postinstall constraint) — the actual yt-dlp binary is guaranteed present at runtime by the worker's production Dockerfile (Plan 06), not by this local npm install.
- `mapToVideoMetadata` in `ytdlp.downloader.ts` uses conditional object spread to omit absent optional fields entirely, rather than assigning them `undefined` — required by the project's `exactOptionalPropertyTypes: true` tsconfig (same class of fix Plan 02 already made in `platform-breaker.ts`).
- Both `ytdlp.downloader.test.ts` and `transcription.test.ts` mock `@/config/env.js` directly, because the modules under test import `env.ts` (for `maxDurationSec`/API keys) and `env.ts` throws `required(MONGODB_URI)` at module-load time — mocking env avoids requiring a full Mongo/AWS env for a pure-adapter-logic unit test, mirroring the precedent already set by `import-job.repository.test.ts` (Plan 01) of mocking the transitive dependency rather than standing up real infra.
- `transcribe()`'s size guard treats a failed `fs.stat` call (e.g., the audio file doesn't exist) as "not oversized" and proceeds to the normal Groq-then-OpenAI flow, so the real transcription call's own error surfaces rather than being masked by a misleading "oversized" classification.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] youtube-dl-exec postinstall network timeout resolved via skip-download env var**
- **Found during:** Task 0/1 (initial `npm install`)
- **Issue:** `npm install youtube-dl-exec groq-sdk openai` failed with `ETIMEDOUT` — the package's postinstall script fetches the yt-dlp binary from GitHub releases, and the fetch stalled/timed out in this sandboxed environment (plain HTTP HEAD requests to the same host succeeded, confirming general connectivity was fine; only the large binary GET stalled).
- **Fix:** Retried with `YOUTUBE_DL_SKIP_DOWNLOAD=true YOUTUBE_DL_SKIP_PYTHON_CHECK=true npm install ...`, which succeeded cleanly. This is not a package-legitimacy concern (already pre-approved) and not a code change — it defers the real binary fetch to the worker's Dockerfile (Plan 06), exactly as RESEARCH.md anticipates for local dev.
- **Files modified:** package.json, package-lock.json, yarn.lock (install artifacts only)
- **Verification:** `npm ls youtube-dl-exec groq-sdk openai` confirms all three installed at the RESEARCH-verified versions; no fluent-ffmpeg present
- **Committed in:** `994c8d1` (Task 1 commit, install landed alongside the adapter code)

**2. [Rule 1 - Bug] youtube-dl-exec default import not callable under NodeNext**
- **Found during:** Task 1 (typecheck)
- **Issue:** `import youtubedl from "youtube-dl-exec"` followed by `youtubedl(url, ...)` failed typecheck with `TS2349: This expression is not callable` — the package's `.d.ts` types the default export in a way that doesn't resolve as a call signature under this project's `NodeNext` + `esModuleInterop` combination against the package's actual CJS `module.exports = fn` runtime shape.
- **Fix:** Switched to the package's named `youtubeDl` export (`import { youtubeDl as youtubedl } from "youtube-dl-exec"`), which the package's own `.d.ts` types explicitly as `((...args) => Promise<Payload | string>) & { exec, create }` — a genuine call signature.
- **Files modified:** src/infra/video/ytdlp.downloader.ts, src/infra/video/ytdlp.downloader.test.ts (mock updated to export both `default` and `youtubeDl`)
- **Verification:** `npm run typecheck` green; all 15 ytdlp.downloader tests pass
- **Committed in:** `994c8d1` (Task 1 commit)

**3. [Rule 1 - Bug] exactOptionalPropertyTypes violation in mapToVideoMetadata**
- **Found during:** Task 1 (typecheck)
- **Issue:** Assigning `parsed.uploader ?? parsed.uploader_id` (typed `string | undefined`) directly to `VideoMetadata.authorHandle` (typed `string | undefined` optional property) failed under `exactOptionalPropertyTypes: true` — the project's tsconfig rejects explicitly assigning `undefined` to an optional property rather than omitting the key.
- **Fix:** Rewrote `mapToVideoMetadata` to use conditional object spread (`...(value !== undefined && { key: value })`) for every optional `VideoMetadata` field, omitting absent keys entirely instead of assigning `undefined`.
- **Files modified:** src/infra/video/ytdlp.downloader.ts
- **Verification:** `npm run typecheck` green
- **Committed in:** `994c8d1` (Task 1 commit)

**4. [Rule 1 - Bug] env.ts module-load validation broke fast-suite tests for two new test files**
- **Found during:** Task 1 and Task 2 (running `npm run test`)
- **Issue:** `ytdlp.downloader.test.ts` and `transcription.test.ts` both import modules (`ytdlp.downloader.ts`, `transcription.port.ts` -> `groq.transcriber.ts`/`openai.transcriber.ts`) that import `@/config/env.ts`, which throws `Variável de ambiente obrigatória ausente: MONGODB_URI` at module-load time since the test runner doesn't load `.env` (no `--env-file` in the `test` npm script, matching the project's Plan 01/02 precedent of not depending on a loaded `.env` for tests).
- **Fix:** Added `vi.mock("@/config/env.js", () => ({ env: { ... } }))` in both test files, providing only the fields each module under test actually reads (`import.maxDurationSec` for the downloader test; `groq`/`openaiTranscription` blocks for the transcription test), mirroring the same "mock the transitive dependency" approach `import-job.repository.test.ts` already used for `ImportJobModel` in Plan 01.
- **Files modified:** src/infra/video/ytdlp.downloader.test.ts, src/infra/video/transcription.test.ts
- **Verification:** `npm run test` — all 41 tests across the fast suite pass (5 files)
- **Committed in:** `994c8d1` and `ed382ba` respectively

---

**Total deviations:** 4 auto-fixed (1 blocking network-timeout workaround, 3 bugs — 2 typecheck-strictness fixes, 1 test-infra env-mocking fix). None required an architectural change or user decision; all were necessary for correctness (typecheck must be green) or for the fast suite to actually run without requiring a full Mongo/AWS environment.
**Impact on plan:** No scope creep. All four deviations are the minimum change needed to make the plan's own verification commands (`npm run test`, `npm run typecheck`) pass as written.

## Issues Encountered
None beyond the auto-fixed items above.

## Known Stubs

None. Both adapters are fully implemented (not stubbed) — the only deferred work is the **manual verification** of `ytdlp.downloader.integration.test.ts` against real yt-dlp output (see below), which is explicitly scoped as manual-gated per `01-VALIDATION.md`, not a stub.

## User Setup Required

- **Real yt-dlp binary + network access** is required to run `npm run test:all` (which includes `ytdlp.downloader.integration.test.ts`). This was not run in this session — the fast suite (`npm run test`, mocked SDK/binary boundaries) is what was verified. Running the integration test locally requires either letting `youtube-dl-exec`'s postinstall complete (network permitting) or having `yt-dlp` on PATH some other way.
- **Groq/OpenAI API keys** (`GROQ_API_KEY`, `OPENAI_API_KEY`) are needed for any real transcription call — both remain `optional()+enabled` in `env.ts` per Plan 01, so the app/worker boot without them, degrading to a `transcription_failed` job outcome if genuinely invoked without keys configured.

## Next Phase Readiness
- `src/infra/video/{downloader.port,ytdlp.downloader,transcription.port,groq.transcriber,openai.transcriber}.ts` are ready to be consumed by Plan 01-05 (the worker, which calls `downloadVideo`/`fetchMetadata` inside the circuit-breaker-guarded download stage, and `transcribe(audioPath)` after the VAD pre-check from Plan 02 gates whether transcription is attempted at all).
- **Open Question 1 (RESEARCH.md) remains open:** the stderr fixtures seeded into `classifyYtdlpError`'s unit tests are drawn from documented community patterns, not real yt-dlp output captured in this session. Running `ytdlp.downloader.integration.test.ts` manually against 2-3 real URLs per platform (YouTube/TikTok/Instagram) — ideally during Plan 01-06's E2E gate — is recommended to confirm or expand the classifier's pattern set before relying on it in production, especially for Instagram/TikTok per D-08's best-effort posture.
- PIPE-01/02/03 requirement text is now genuinely satisfied by this plan's adapters (unlike Plan 02, which built only isolated pure-logic units and intentionally left these IDs pending) — marked complete in `REQUIREMENTS.md` by this plan's state update.
- No blockers for Plan 01-04 (routes/service, independent of these adapters per the plan's own objective) or Plan 01-05 (worker wiring, the actual consumer of both adapters built here).

---
*Phase: 01-video-pipeline-foundation*
*Completed: 2026-07-01*
