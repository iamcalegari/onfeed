---
phase: 01-video-pipeline-foundation
plan: 02
subsystem: infra
tags: [ffmpeg, execFile, vad, silencedetect, circuit-breaker, keyframe, sharp, vitest]

# Dependency graph
requires:
  - phase: 01-video-pipeline-foundation (plan 01)
    provides: "Vitest fast/integration test split (fast/integration exclude convention now made actually functional by this plan)"
provides:
  - "ffmpeg.exec.ts: single execFile-based shared ffmpeg invocation point (runFfmpeg, extractAudio)"
  - "vad.ts: silencedetect-based no-speech pre-filter (detectSilenceRatio, parseSilenceDurations) — pure parse logic unit-tested without the ffmpeg binary"
  - "keyframe.ts: scene-score keyframe extractor with midpoint-seek fallback, normalized via a locally-replicated sharp chain (extractKeyframe, extractNormalizedKeyframe)"
  - "platform-breaker.ts: per-platform circuit breaker state machine (recordOutcome, isOpen, successRate) with injectable clock for deterministic cooldown testing"
  - "Fix: vitest.config.ts / npm run test:all now actually executes .integration.test.ts files (previously silently excluded regardless of script)"
affects: [01-03-PLAN, 01-05-PLAN]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "All ffmpeg shell-outs route through ffmpeg.exec.ts's runFfmpeg(args) — execFile with a discrete args array, never child_process.exec string form (T-02-01 command-injection mitigation)"
    - "Pure-logic helpers are split out of ffmpeg-dependent functions (parseSilenceDurations vs detectSilenceRatio) so unit tests don't require the ffmpeg binary"
    - "Circuit breaker uses an injectable clock (setClock/resetClock) instead of real timers, making cooldown transitions deterministically testable"
    - "Fast/integration test split enforced via .integration.test.ts suffix; now gated by VITEST_EXCLUDE_INTEGRATION env var (fixes a Plan 01-01 config bug where the exclude was unconditional)"

key-files:
  created:
    - src/infra/video/ffmpeg.exec.ts
    - src/infra/video/vad.ts
    - src/infra/video/vad.test.ts
    - src/infra/video/keyframe.ts
    - src/infra/video/keyframe.integration.test.ts
    - src/infra/video/platform-breaker.ts
    - src/infra/video/platform-breaker.test.ts
    - src/infra/video/README.md
  modified:
    - vitest.config.ts
    - package.json

key-decisions:
  - "keyframe.ts replicates image.service.ts's sharp resize/jpeg chain locally instead of importing toThumbnail — importing would drag env.ts's module-load-time required(MONGODB_URI) validation plus the S3/Bedrock client chain into a pure video-infra unit test; RESEARCH explicitly allows either approach"
  - "vitest.config.ts exclude of .integration.test.ts is now gated by a VITEST_EXCLUDE_INTEGRATION env var (set only by the `test` script) instead of being unconditional — fixes a real bug from Plan 01-01 where `npm run test:all` silently never ran integration tests despite the config's own comment claiming it would"
  - "Circuit breaker constants (FAILURE_THRESHOLD=0.7, MIN_SAMPLES=5, COOLDOWN_MS=5min, WINDOW_SIZE=20) kept as documented tunables per RESEARCH Architecture Pattern 3 / Assumption A3, not treated as a locked external spec"
  - "PIPE-02/PIPE-04/PIPE-07 requirement IDs are NOT marked complete in REQUIREMENTS.md by this plan — this plan builds only the isolated pure-logic/ffmpeg units; full requirement satisfaction (worker wiring, download/transcription adapters) lands in Plans 03 and 05"

patterns-established:
  - "Video infra namespace (src/infra/video/*) modules have no dependency on ImportJob or the SQS worker — testable in complete isolation, consumed by later plans"
  - "src/infra/video/README.md established as the Obsidian-style doc for this namespace, to be extended as Plan 01-03 adds downloader/transcription adapters"

requirements-completed: []

coverage:
  - id: D1
    description: "detectSilenceRatio/parseSilenceDurations flag a silent/music-only fixture as no-speech via ffmpeg silencedetect stderr parsing, not Whisper confidence (PIPE-02)"
    requirement: PIPE-02
    verification:
      - kind: unit
        ref: "src/infra/video/vad.test.ts (6 tests: parseSilenceDurations extraction + threshold crossing for silent-heavy vs speech-heavy fixtures)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Per-platform circuit breaker opens after threshold failures, blocks while open, half-opens after cooldown, and closes on a successful trial (PIPE-07)"
    requirement: PIPE-07
    verification:
      - kind: unit
        ref: "src/infra/video/platform-breaker.test.ts (10 tests: closed/open/half-open/cooldown/close/independent-platforms)"
        status: pass
    human_judgment: false
  - id: D3
    description: "extractKeyframe produces a real JPEG via ffmpeg scene-score select, and falls back to a midpoint-seek frame when no scene change qualifies (PIPE-04); output normalized to 512² JPEG"
    requirement: PIPE-04
    verification:
      - kind: integration
        ref: "src/infra/video/keyframe.integration.test.ts (3 tests: scene-change fixture, static-clip fallback, extractNormalizedKeyframe buffer) — real ffmpeg binary, run via npm run test:all"
        status: pass
    human_judgment: false
  - id: D4
    description: "No child_process.exec string form and no fluent-ffmpeg import anywhere under src/infra/video/ (T-02-01 command-injection mitigation)"
    verification:
      - kind: other
        ref: "grep -rn 'child_process.exec(|fluent-ffmpeg' src/infra/video/ — no matches outside comments"
        status: pass
    human_judgment: false

duration: ~10min
completed: 2026-07-01
status: complete
---

# Phase 1 Plan 02: ffmpeg exec wrapper, VAD, keyframe extractor, and circuit breaker Summary

**Pure-logic and ffmpeg-shell-out infra units (VAD via silencedetect, scene-score keyframe extraction, per-platform circuit breaker) built via execFile-only ffmpeg invocation, with zero dependency on ImportJob or the SQS worker.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-07-01T19:21:00Z (approx)
- **Completed:** 2026-07-01T19:28:17Z
- **Tasks:** 3
- **Files modified:** 10 (8 created, 2 modified)

## Accomplishments
- `ffmpeg.exec.ts` centralizes every ffmpeg invocation in the phase behind `runFfmpeg(args)` (execFile + args array, never `exec` string form) and exposes `extractAudio()` (mono 16kHz 64kbps, keeps files under Groq's 25MB limit)
- `vad.ts` implements the silencedetect-based no-speech pre-filter (PIPE-02, D-06): `parseSilenceDurations()` is a pure regex-parsing function unit-tested without the ffmpeg binary; `detectSilenceRatio()` tolerates non-zero ffmpeg exits
- `platform-breaker.ts` implements the full circuit breaker state machine (PIPE-07, D-02): closed → open (≥70% failure over ≥5 samples) → half_open (after 5min cooldown, deterministically testable via an injectable clock) → closed on a successful trial
- `keyframe.ts` implements scene-score keyframe extraction (PIPE-04) with a midpoint-seek fallback for clips with no qualifying scene change, normalized to 512² JPEG via a locally-replicated sharp chain
- Discovered and fixed a real bug in `vitest.config.ts` from Plan 01-01: the `.integration.test.ts` exclude was unconditional, so `npm run test:all` never actually ran integration tests despite the config's own comment claiming otherwise — now gated by `VITEST_EXCLUDE_INTEGRATION`, set only by the fast `test` script

## Task Commits

Each task was committed atomically:

1. **Task 1: Shared ffmpeg exec wrapper + audio extraction** - `8ba74ef` (feat)
2. **Task 2: silencedetect VAD pre-check (PIPE-02) with unit test** - `ed59882` (feat)
3. **Task 3: Circuit breaker (PIPE-07) + keyframe extractor (PIPE-04)** - `58533dd` (feat)

**Docs:** `b3bf61c` (docs: src/infra/video/README.md)

**Plan metadata:** (pending — this commit)

## Files Created/Modified
- `src/infra/video/ffmpeg.exec.ts` - `runFfmpeg(args)` shared execFile wrapper; `extractAudio(videoPath, audioPath)` (mono 16kHz 64kbps)
- `src/infra/video/vad.ts` - `detectSilenceRatio`, `parseSilenceDurations`, `NOISE_THRESHOLD_DB`, `MIN_SILENCE_SEC`, `NO_SPEECH_RATIO_THRESHOLD` (~0.8)
- `src/infra/video/vad.test.ts` - 6 fast unit tests against captured silencedetect stderr fixtures
- `src/infra/video/keyframe.ts` - `extractKeyframe(videoPath, outputPath, durationSec?)` (scene-score + midpoint fallback), `extractNormalizedKeyframe(...)` (returns 512² JPEG Buffer)
- `src/infra/video/keyframe.integration.test.ts` - 3 real-ffmpeg tests against synthetic scene-change/static video fixtures generated at test time
- `src/infra/video/platform-breaker.ts` - `recordOutcome`, `isOpen`, `successRate`, `BreakerState`, `setClock`/`resetClock`/`resetForTest` test seams
- `src/infra/video/platform-breaker.test.ts` - 10 fast pure state-machine unit tests
- `src/infra/video/README.md` - Obsidian-style module doc for the new infra namespace
- `vitest.config.ts` - `exclude` of `.integration.test.ts` now gated by `VITEST_EXCLUDE_INTEGRATION` env var instead of unconditional
- `package.json` - `test` script now sets `VITEST_EXCLUDE_INTEGRATION=true` (fixes the fast/integration split that was previously non-functional for `test:all`)

## Decisions Made
- `keyframe.ts` replicates `image.service.ts`'s exact sharp `.resize(512,512,{fit:"cover"}).jpeg({quality:82,mozjpeg:true})` chain locally rather than importing `toThumbnail` — importing it would pull in `env.ts`'s module-load-time `required(MONGODB_URI)` validation and the S3/Bedrock client chain, disproportionate coupling for a pure video-infra module whose tests should not need Mongo/AWS env vars configured. RESEARCH.md explicitly permits either "import and call it, or replicate the identical resize/jpeg chain."
- Fixed `vitest.config.ts`'s unconditional `.integration.test.ts` exclude (a latent bug from Plan 01-01) so the full suite (`npm run test:all`) can actually exercise `keyframe.integration.test.ts` against the real ffmpeg binary — verified locally (ffmpeg n8.1.2 present at `/usr/bin/ffmpeg`).
- Circuit breaker's `openedAt` field uses `delete` rather than assigning `undefined` on the half-open→closed transition, required by the project's `exactOptionalPropertyTypes: true` tsconfig setting.
- PIPE-02/PIPE-04/PIPE-07 are intentionally NOT marked complete in `REQUIREMENTS.md` — this plan only builds the isolated logic units (VAD parsing, keyframe extraction, breaker state machine); the requirements' full text ("worker extrai o áudio e transcreve...", "circuit breaker... com mensagem específica ao usuário") isn't satisfied until Plan 03 (downloader/transcription adapters) and Plan 05 (worker wiring) land. Marking them complete now would be a false positive in requirement tracking.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TS strict-mode regex match-group typing in parseSilenceDurations**
- **Found during:** Task 2 (VAD implementation)
- **Issue:** `String.matchAll` group `m[1]` types as `string | undefined` under the project's strict tsconfig; `parseFloat(m[1])` failed typecheck
- **Fix:** Filter out `undefined` match groups before parsing
- **Files modified:** src/infra/video/vad.ts
- **Verification:** `npm run typecheck` green
- **Committed in:** ed59882 (Task 2 commit)

**2. [Rule 1 - Bug] Fixed exactOptionalPropertyTypes violation in platform-breaker's half-open→closed transition**
- **Found during:** Task 3 (circuit breaker implementation)
- **Issue:** `s.openedAt = undefined` is rejected under `exactOptionalPropertyTypes: true` (project tsconfig)
- **Fix:** Use `delete s.openedAt` instead of assigning `undefined`
- **Files modified:** src/infra/video/platform-breaker.ts
- **Verification:** `npm run typecheck` green
- **Committed in:** 58533dd (Task 3 commit)

**3. [Rule 1 - Bug] Fixed vitest.config.ts's unconditional integration-test exclude**
- **Found during:** Task 3 (attempting to run keyframe.integration.test.ts to verify the real-ffmpeg path)
- **Issue:** `vitest.config.ts`'s `test.exclude` array hardcoded `**/*.integration.test.ts` regardless of which npm script ran vitest, so `npm run test:all` (intended to include integration tests per its own comment and per 01-VALIDATION.md's "Full suite command") never actually executed them — a config bug from Plan 01-01 that would have silently let PIPE-04's real-ffmpeg verification go unrun
- **Fix:** Gated the exclude behind a `VITEST_EXCLUDE_INTEGRATION` env var, set only by the `test` (fast) npm script; `test:all` now genuinely runs the full suite including `.integration.test.ts`
- **Files modified:** vitest.config.ts, package.json
- **Verification:** `npm run test` still shows 3 files/20 tests (fast suite unaffected); `npm run test:all` now shows 4 files/23 tests including the 3 real-ffmpeg keyframe tests, all passing
- **Committed in:** 58533dd (Task 3 commit)

---

**Total deviations:** 3 auto-fixed (3 bugs — 2 typecheck strictness fixes, 1 pre-existing test-config bug that blocked this plan's own integration verification)
**Impact on plan:** All three were necessary for correctness (typecheck must be green per plan verification) and for actually being able to verify PIPE-04's real-ffmpeg behavior as the plan requires. No scope creep — the vitest.config.ts fix was the minimum change needed to make `test:all` behave as its own pre-existing comment already promised.

## Issues Encountered
None beyond the auto-fixed items above.

## User Setup Required

None - no external service configuration required. ffmpeg binary is already present on this machine (`/usr/bin/ffmpeg`, n8.1.2) for local verification; the worker's production Dockerfile (Plan 06) will need `apt-get install ffmpeg` per RESEARCH.md.

## Next Phase Readiness
- `src/infra/video/{ffmpeg.exec,vad,keyframe,platform-breaker}.ts` are ready to be consumed by Plan 01-03 (yt-dlp downloader + Groq/OpenAI transcription adapters, which will call `extractAudio`/`detectSilenceRatio` and check `isOpen`/`recordOutcome` around download attempts) and Plan 01-05 (the worker, which drives the full pipeline and calls `extractNormalizedKeyframe` before S3 upload).
- The `vitest.config.ts` fix means Plan 01-03's own `.integration.test.ts` files (e.g., `ytdlp.downloader.integration.test.ts`) will now actually run under `npm run test:all`, not silently be skipped.
- No blockers. PIPE-02/PIPE-04/PIPE-07 remain "Pending" in REQUIREMENTS.md by design until their respective wiring plans complete the full requirement.

---
*Phase: 01-video-pipeline-foundation*
*Completed: 2026-07-01*
