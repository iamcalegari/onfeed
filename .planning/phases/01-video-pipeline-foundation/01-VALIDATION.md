---
phase: 1
slug: video-pipeline-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-01
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `01-RESEARCH.md` §Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (none exists project-wide today — Wave 0 installs it; per CONCERNS.md recommendation) |
| **Config file** | `vitest.config.ts` — Wave 0 creates |
| **Quick run command** | `npx vitest run --exclude '**/*.integration.test.ts'` |
| **Full suite command** | `npx vitest run` (includes `.integration.test.ts` — needs yt-dlp/ffmpeg/Python present) |
| **Estimated runtime** | ~5–15s fast suite; integration suite network/binary-dependent |

---

## Sampling Rate

- **After every task commit:** Run the quick (fast) suite — excludes `.integration.test.ts` (real yt-dlp/ffmpeg/network).
- **After every plan wave:** Run the full suite including integration tests.
- **Before `/gsd-verify-work`:** Full suite green PLUS a manual end-to-end run against one real URL per platform (YouTube, TikTok, Instagram) — D-08 success criteria are about real-world platform reliability, which mocks cannot substitute.
- **Max feedback latency:** ~15 seconds (fast suite).

---

## Per-Task Verification Map

Requirement → behavior → automated check (from RESEARCH §Validation Architecture). Task IDs are assigned by the planner; the requirement/behavior/test mapping is the contract.

| Requirement | Wave | Secure Behavior / Threat Ref | Behavior under test | Test Type | Automated Command | File Exists | Status |
|-------------|------|------------------------------|---------------------|-----------|-------------------|-------------|--------|
| CAP-02 | 1 | SSRF boundary: reject non-allowlisted domains before yt-dlp (T-1 SSRF) | `detectPlatform()` classifies valid/invalid URLs per platform | unit | `npx vitest run src/modules/import/import.service.test.ts` | ❌ W0 | ⬜ pending |
| CAP-02 | 1 | — | `normalizeUrl()` strips tracking params without altering the canonical video ref | unit | `npx vitest run src/modules/import/import.service.test.ts` | ❌ W0 | ⬜ pending |
| PIPE-01 | 1 | Command injection avoided (execFile/args array, T-4) | `fetchMetadata()`/`downloadVideo()` against a small stable public test video returns expected fields | integration (manual-gated) | `npx vitest run src/infra/video/ytdlp.downloader.integration.test.ts` | ❌ W0 | ⬜ pending |
| PIPE-01 / PIPE-07 | 1 | Block classified distinctly (T-1 anti-bot) | `classifyYtdlpError()` maps recorded real stderr fixtures → correct `DownloadFailureReason` | unit | `npx vitest run src/infra/video/ytdlp.downloader.test.ts` | ❌ W0 | ⬜ pending |
| PIPE-02 | 1 | — | `detectSilenceRatio()` flags silent/music-only fixture vs speech fixture (ffmpeg silencedetect, not Whisper confidence) | unit | `npx vitest run src/infra/video/vad.test.ts` | ❌ W0 | ⬜ pending |
| PIPE-02 | 1 | — | Transcription adapter falls back Groq→OpenAI on simulated Groq failure | unit (mocked SDKs) | `npx vitest run src/infra/video/transcription.test.ts` | ❌ W0 | ⬜ pending |
| PIPE-03 | 1 | — | Metadata extraction captures platform, video URL, author handle/profile from `--dump-json` fields | unit | `npx vitest run src/infra/video/ytdlp.downloader.test.ts` | ❌ W0 | ⬜ pending |
| PIPE-04 | 1 | — | `extractKeyframe()` produces valid JPEG from a real short video; graceful fallback when no scene changes | integration (manual-gated) | `npx vitest run src/infra/video/keyframe.integration.test.ts` | ❌ W0 | ⬜ pending |
| PIPE-05 | 1 | Temp paths unpredictable (mkdtemp, T-V12) | Temp dir removed after success AND after simulated mid-pipeline throw (try/finally + startup sweep) | unit | `npx vitest run src/workers/import-worker.test.ts` | ❌ W0 | ⬜ pending |
| PIPE-06 | 1 | Ownership on `GET /import/:jobId` (T-3 IDOR) | Message for a job already `ready_for_review`/`failed` is a no-op (idempotent) | unit (mock ImportJobModel) | `npx vitest run src/workers/import-worker.test.ts` | ❌ W0 | ⬜ pending |
| PIPE-07 | 1 | — | Circuit breaker opens after threshold, blocks while open, resets after cooldown | unit | `npx vitest run src/infra/video/platform-breaker.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Install Vitest + `vitest.config.ts` — no test framework exists project-wide
- [ ] Integration-test tagging convention (`.integration.test.ts` suffix) so slow/network/binary tests are excluded from the fast suite
- [ ] `src/infra/video/ytdlp.downloader.test.ts` — real stderr classification fixtures (record from actual yt-dlp failures early in the phase, do not invent strings)
- [ ] `src/infra/video/vad.test.ts` — small checked-in silent/music/speech audio fixtures (few seconds each, keep repo light)
- [ ] `src/infra/video/platform-breaker.test.ts` — pure state-machine unit tests, no external deps
- [ ] `src/infra/video/transcription.test.ts` — mocked Groq/OpenAI clients for fallback path
- [ ] `src/workers/import-worker.test.ts` — idempotency + cleanup-guarantee with mocked ImportJobModel and mocked pipeline stages

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real end-to-end download+transcribe+keyframe per platform | PIPE-01, PIPE-04, D-08 | Real yt-dlp against live platforms; anti-bot behavior is not mockable | Submit one real URL each for YouTube, TikTok, Instagram; confirm transcript + keyframe + metadata produced (IG best-effort) |
| PT-BR transcription quality on real cooking clips | PIPE-02, D-05 | Subjective quality of ASR on cooking slang/informal PT-BR; no ground-truth fixture | Transcribe 3–5 real PT-BR cooking Reels; spot-check ingredient/step words against audio |
| Platform block lands in monitored `failed` state | PIPE-07, D-02 | Requires triggering a real block/rate-limit | Force repeated requests until a platform blocks; confirm distinct `failed` reason + telemetry increments + breaker opens |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s (fast suite)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
