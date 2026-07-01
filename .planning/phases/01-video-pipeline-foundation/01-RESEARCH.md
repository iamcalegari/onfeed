# Phase 1: Video Pipeline Foundation - Research

**Researched:** 2026-07-01
**Domain:** URL-driven video ingestion pipeline (download/transcribe/keyframe/cleanup) on a new long-running worker
**Confidence:** MEDIUM (project-level architecture/stack research is HIGH — reused, not re-derived; the phase-specific deep dives below skew LOW-MEDIUM because yt-dlp anti-bot behavior and Render worker specifics change over weeks, not years)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Download & anti-bot (egress)**
- **D-01:** Egress strategy = **yt-dlp directly from the worker's IPs** in the MVP. Do NOT introduce a residential proxy or managed extraction API now.
- **D-02:** Platform blocking/rate-limiting is a **monitored failure state**, not a generic error. The phase MUST emit **per-platform success-rate telemetry** and have a **circuit breaker** that degrades instead of hammering a broken platform (PIPE-07).
- **D-03:** Residential proxy or paid API only come **later**, and only if measured real success rate is poor. The investment decision comes from telemetry numbers, not assumption.

**Transcription provider**
- **D-04:** Transcription = **Groq `whisper-large-v3-turbo` as primary**, **OpenAI Whisper as fallback**. Cloud, cheap/fast.
- **D-05:** PT-BR quality (kitchen slang, informal register, background noise) MUST be validated empirically with real onFeed clips early in the phase, before locking the provider as default. Do not trust benchmarks alone (English-centric).
- **D-06:** A clip with no real speech (music/silence only) is **flagged as low/no-speech** (VAD pre-filter) instead of delivering a hallucinated transcript downstream (PIPE-02).

**Platform scope**
- **D-07:** Pipeline built **platform-agnostic** (one yt-dlp engine for all 3).
- **D-08:** Phase success criteria require **YouTube + TikTok reliable**. **Instagram enters as best-effort** with a handled failure state (it's the most hostile to yt-dlp) — does not block phase closure if IG is unstable.

**Data retention**
- **D-09:** **Raw video and audio are deleted immediately** after job processing (legal posture — do not re-host third-party media; PIPE-05).
- **D-10:** **Retains: keyframe** (becomes the recipe image), **transcript** (derived text), and **source metadata** (platform, video URL, author @, profile URL). Keeping the transcript allows **reprocessing Phase 2 extraction without re-downloading** the video (which may no longer even exist).

### Claude's Discretion
- `ImportJob` state machine implementation details: number of retries, backoff, exact state schema (within queued → downloading → transcribing → extracting(stub) → ready_for_review/failed), SQS queue name/config (new dedicated queue vs reuse — planner decides following the `enqueueIngestJob` pattern), keyframe format/size (can reuse `image.service.toThumbnail` — JPEG 512²), yt-dlp wrapper (`youtube-dl-exec` recommended), ffmpeg lib (**superseded by this research — see Pitfall 0 below: `fluent-ffmpeg` is deprecated/archived, use direct binary invocation instead**), concurrency limiter (`p-queue`).
- Deploy topology confirmed as **Render Background Worker** (not Lambda) — planner details the Dockerfile/base image (Python + ffmpeg + yt-dlp).

### Deferred Ideas (OUT OF SCOPE)
- **Residential proxy / managed extraction API** — only if egress telemetry shows poor success rate (data-driven decision, post-measurement).
- **Robust Instagram (deep anti-bot resolution)** — best-effort this phase; harden later if the numbers demand it.
- LLM extraction, confidence/grounding, review screen, quota/dedup, promotion — Phases 2-5 (out of scope for this phase by design).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PIPE-01 | Worker downloads video via yt-dlp (IG/TikTok/YouTube, one engine) | Standard Stack (yt-dlp/youtube-dl-exec), Code Examples §1, Common Pitfalls §1 |
| PIPE-02 | Worker extracts audio and transcribes via hosted Whisper, with no-speech/music pre-filter | Standard Stack (Groq), Code Examples §3-4, Common Pitfalls §4 (Whisper hallucination + VAD) |
| PIPE-03 | Worker captures post caption + source metadata (platform, video URL, author @, profile URL) | Code Examples §1 (`--dump-json` field map), Architectural Responsibility Map |
| PIPE-04 | Worker extracts 1 representative keyframe as the recipe image | Code Examples §5 (ffmpeg scene-score keyframe selection + sharp normalize) |
| PIPE-05 | Downloaded video/audio deleted after processing | Runtime State Inventory N/A (greenfield) — see Common Pitfalls §6 (cleanup guarantee) |
| PIPE-06 | `ImportJob` tracks state with idempotency, retry, DLQ | Architecture Patterns §2 (ImportJob model), Code Examples §6 (SQS DLQ+idempotency) |
| PIPE-07 | Platform block/rate-limit is a monitored, circuit-broken state with a specific user message | Common Pitfalls §1, §2 (circuit breaker design), Code Examples §2 |
| CAP-02 | URL/platform validated before enqueue; invalid URL or unsupported platform returns a clear error | Code Examples §7 (platform detection/normalization) |
</phase_requirements>

## Summary

This phase's architecture and stack choices were already locked at the project-research level (`.planning/research/{STACK,ARCHITECTURE,PITFALLS}.md`) and are NOT re-derived here — this document goes deeper on the seven phase-specific open questions the planner needs to make concrete task-level decisions. The single most important finding of this pass: **`fluent-ffmpeg`, the ffmpeg wrapper recommended in the project-level STACK.md, was archived by its maintainer in May 2025 and its own README now states it "no longer works properly with recent ffmpeg versions."** This supersedes that earlier recommendation — the plan must invoke the `ffmpeg` binary directly via `child_process.spawn`/`execFile`, not through `fluent-ffmpeg`. Everything else in the project-level stack research (yt-dlp/youtube-dl-exec, Groq Whisper, p-queue, Render Background Worker topology) is confirmed current as of this research pass — versions were re-verified live against npm/GitHub, not assumed from training data.

The seven open questions resolve as follows: (1) `youtube-dl-exec` wraps the yt-dlp binary with `--dump-json`, and specific field names (`uploader`, `uploader_url`, `channel_url`, `webpage_url`, `description`) are the metadata source for PIPE-03 — anti-bot failures surface as distinguishable exit codes/stderr patterns that must be classified, not treated as generic errors. (2) Render Background Workers are a first-class service type (no HTTP port, `render.yaml` `type: worker`), require their own Dockerfile because the base API image (`node:22-slim`) has no Python/ffmpeg, and bill continuously like a web service (Starter $7/mo minimum, but CPU-heavy yt-dlp+ffmpeg+Whisper work likely needs Standard $25/mo). (3) Groq's `groq-sdk` exposes `audio.transcriptions.create()` with a 25MB free-tier / 100MB paid-tier file limit, `verbose_json` response format returns per-segment `no_speech_prob`/`avg_logprob` for a cheap VAD-adjacent signal, but a dedicated `ffmpeg silencedetect` pre-check before calling Groq at all is the cheaper and more reliable no-speech gate (avoids paying for ASR on silent/music-only clips). (4) Keyframe selection should use ffmpeg's `select='gt(scene,0.4)'` filter to pick a genuine scene-representative frame (not a fixed timestamp, which risks landing on a blurry transition), piped through the existing `image.service` normalization pattern. (5) SQS DLQ + idempotency requires a redrive policy (`maxReceiveCount`) plus an application-level dedup key (`ImportJobModel` document as the source of truth, exactly as ARCHITECTURE.md already recommends) — the Node worker should use `sqs-consumer` (a mature, actively maintained library, not hand-rolled polling) rather than reusing the Lambda `SQSEvent` shape, since this is a standalone process, not a Lambda handler. (6) Cleanup guarantee requires a `try/finally` around every job's temp-file lifecycle PLUS a worker-startup sweep of the temp directory (crash/restart safety net), since `finally` alone doesn't survive a `SIGKILL` or container crash. (7) CAP-02 validation is a pure-function `detectPlatform(url)` matching known URL shapes per platform, called before enqueue, returning a specific rejection reason.

**Primary recommendation:** Build `src/infra/video/*` with direct `child_process` calls to the yt-dlp and ffmpeg binaries (via `youtube-dl-exec` for yt-dlp, raw `execFile` for ffmpeg — do not use `fluent-ffmpeg`), wire a dedicated SQS queue with DLQ via `sqs-consumer`, and drive everything through the `ImportJob` Mongo document as the single source of truth for both progress polling and idempotency.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| URL/platform validation (CAP-02) | API / Backend | — | Fast, synchronous, must reject before enqueue — belongs in the Fastify route/service layer, not the worker |
| Job enqueue + `ImportJob` creation | API / Backend | Database / Storage | `POST /import` creates the Mongo doc and SQS message; thin producer per existing `enqueueIngestJob` pattern |
| Video download (yt-dlp) | New Worker (Render Background Worker) | — | Python/native-binary dependency; cannot run in Lambda or the existing Fastify process (blocks event loop) |
| Audio extraction + transcription (Groq) | New Worker | External API (Groq) | ffmpeg extracts audio locally in-worker; actual ASR is an outbound HTTPS call from the worker, no separate hop |
| Keyframe extraction (ffmpeg) | New Worker | — | Same process/pass as audio extraction — one ffmpeg invocation chain per job |
| Image normalization (sharp → JPEG 512²) | New Worker | Database / Storage (S3) | Reuses `image.service.toThumbnail` pattern; worker calls it directly (same codebase, different process) |
| `ImportJob` state transitions | New Worker | Database / Storage | Worker writes status at each stage boundary; Mongo document is the durable source of truth for polling AND idempotency |
| Cleanup (delete raw video/audio) | New Worker | — | Must happen in the same process/container that downloaded the file — no cross-process handoff for ephemeral files |
| Per-platform success telemetry + circuit breaker | New Worker | Database / Storage | Worker increments counters per job outcome; circuit breaker state can live in Mongo (a lightweight collection) or in-process (per worker instance) — see Architecture Patterns §3 |
| SQS DLQ + idempotency | Infra (SQS) | New Worker | DLQ is queue-level AWS config; idempotency check is worker-level (query `ImportJobModel` before starting expensive work) |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `youtube-dl-exec` | `3.1.8` [VERIFIED: npm registry] | Node wrapper around the yt-dlp binary; used for both download and `--dump-json` metadata extraction | Actively maintained (126 published versions since 2021, most recent 2026-06-18), 76.8K weekly downloads, backed by microlinkhq (legitimate npm org). Thin wrapper avoids hand-rolling `child_process` argument escaping for a binary with dozens of flags. |
| `yt-dlp` (binary, not npm) | `2026.06.09` [VERIFIED: GitHub API — `gh api repos/yt-dlp/yt-dlp/releases/latest` confirms this is still the latest release] | Actual downloader — one engine for YouTube/TikTok/Instagram | De-facto universal short-video downloader; per-site extractors patched within days of platform breakage |
| ffmpeg (binary, direct `child_process`, NOT `fluent-ffmpeg`) | ffmpeg 6.x/7.x via `@ffmpeg-installer/ffmpeg@1.1.0` [VERIFIED: npm registry] or Debian `apt-get install ffmpeg` in the worker Dockerfile | Audio extraction, keyframe extraction, silence detection | See **Pitfall 0** below — `fluent-ffmpeg` is archived/deprecated as of this research pass; direct binary invocation is now the correct path, not a downgrade |
| `groq-sdk` | `1.3.0` [VERIFIED: npm registry] | Primary transcription client (`audio.transcriptions.create`, model `whisper-large-v3-turbo`) | Official Groq SDK, actively maintained (groq/groq-typescript org), 862K weekly downloads. Cheapest/fastest hosted Whisper-quality ASR (`$0.04/hr`, ~216x realtime per Groq's own docs). |
| `openai` | `6.45.0` [VERIFIED: npm registry] | Fallback transcription client (`whisper-1` or `gpt-4o-transcribe`) if Groq quality/PT-BR proves insufficient or Groq has an outage | Official OpenAI SDK, 21.6M weekly downloads. Not primary — ~9x Groq's per-hour cost per public pricing. |
| `sqs-consumer` | `15.0.2` [VERIFIED: npm registry] | Long-poll SQS consumer for the standalone Node worker (NOT the Lambda `SQSEvent` handler pattern) | Actively maintained (bbc org, 1.66M weekly downloads), handles long-poll loop, visibility-timeout heartbeat, and batch processing without hand-rolled polling code — the Render worker is a standalone process, not a Lambda invocation, so it needs its own consumer loop, distinct from `src/lambda/ingest-handler.ts`'s `SQSEvent`-driven shape |
| `p-queue` | `9.3.0` [VERIFIED: npm registry] | Concurrency limiter inside the worker (cap concurrent downloads per platform to reduce anti-bot flagging) | Actively maintained (sindresorhus org), 24.3M weekly downloads |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@ffmpeg-installer/ffmpeg` | `1.1.0` [VERIFIED: npm registry] | Auto-resolves a platform-specific static ffmpeg binary path (bundles ffmpeg 4.1.0 for linux-x64) | Use for local dev convenience; for the worker's production Docker image, prefer `apt-get install ffmpeg` for a current, security-patched build (4.1.0 is several years old) — see Common Pitfalls §0 |
| `sharp` | already in stack (`0.35.1`) | Normalize the extracted keyframe to JPEG 512² before S3 upload | Reuse `image.service.toThumbnail()` exactly — do not reimplement resize/encode logic |
| `@aws-sdk/client-sqs` | already in stack (`3.1077.0`) | SQS client for both the new dedicated import queue and DLQ config | Reuse the existing `sqs.client.ts` singleton pattern; new queue URL env var, not a new client |
| zod | already in stack (`4.4.3`) | Validate yt-dlp `--dump-json` output shape before trusting field values | Coverage of fields varies per platform/extractor version — validate, don't assume all fields are always present |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Direct ffmpeg `child_process` calls | `@ffmpeg/ffmpeg` (WASM build) | WASM avoids a native binary dependency entirely, but is materially slower for video work and adds complexity for a worker that already has full OS control (Docker) — no reason to pay the WASM tax when you own the container |
| `sqs-consumer` | Hand-rolled `while(true)` long-poll loop with `@aws-sdk/client-sqs` `ReceiveMessageCommand`/`DeleteMessageCommand` | Hand-rolling works and has zero extra dependency, but reinvents visibility-timeout heartbeating and batch error handling that `sqs-consumer` already solves — only hand-roll if the team wants zero new deps for a single queue |
| Groq `whisper-large-v3-turbo` | Groq `whisper-large-v3` (non-turbo) | Non-turbo has slightly better WER (10.3% vs 12% per Groq's own published benchmarks) but is ~2.8x the cost (`$0.111/hr` vs `$0.04/hr`) and slower (189x vs 216x realtime) — turbo is the right default per D-04, non-turbo is a quality escalation path if PT-BR validation (D-05) shows turbo is materially worse |
| `youtube-dl-exec` | Spawning the `yt-dlp` binary directly via `execFile` with hand-built args | Marginal — `youtube-dl-exec` IS a thin wrapper over exactly this, but handles binary path resolution/auto-download and arg-object-to-CLI-flags mapping, saving boilerplate with no real downside |

**Installation:**
```bash
npm install youtube-dl-exec groq-sdk sqs-consumer p-queue openai
npm install -D @types/fluent-ffmpeg  # NOT NEEDED — omit; no fluent-ffmpeg dependency

# System-level (worker Dockerfile, NOT npm):
# apt-get install -y python3 ffmpeg
# pip install -U yt-dlp   (or let youtube-dl-exec's postinstall fetch it —
#   set YOUTUBE_DL_SKIP_PYTHON_CHECK=true if Python isn't present at npm-install time,
#   but Python 3.9+ MUST be present at runtime since yt-dlp itself is a Python program)
```

**Version verification performed this pass:**
- `npm view youtube-dl-exec version` → `3.1.8`, first published 2021-02-24, 126 versions total (NOT a "too-new" package — a routine patch-version bump on a mature package)
- `npm view fluent-ffmpeg deprecated` → `"Package no longer supported. Contact Support..."` — genuinely deprecated
- `curl https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest` → confirms `2026.06.09` is still current
- `npm view groq-sdk / openai / p-queue / sqs-consumer version` → all confirmed current, all backed by legitimate, high-download-count orgs

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|--------------|---------|-------------|
| `youtube-dl-exec` | npm | 5 yrs (since 2021-02-24, 126 versions) | 76.8K/wk | github.com/microlinkhq/youtube-dl-exec | [OK] — seam flagged `SUS`/"too-new" on latest-version publish date, not package age; manually verified `time.created` = 2021 | Approved |
| `fluent-ffmpeg` | npm | 15 yrs (since 2011) | 1.87M/wk | github.com/fluent-ffmpeg/node-fluent-ffmpeg (**archived**) | [SUS] seam flag confirmed correct — package is genuinely deprecated/unmaintained, archived May 2025, "no longer works properly with recent ffmpeg versions" per its own README | **REMOVED — do not install; use direct `child_process` ffmpeg calls instead** |
| `groq-sdk` | npm | Mature (org: groq/groq-typescript) | 862K/wk | github.com/groq/groq-typescript | [OK] — seam flagged "too-new" on latest patch date only; official vendor SDK | Approved |
| `p-queue` | npm | Mature (sindresorhus org) | 24.3M/wk | github.com/sindresorhus/p-queue | [OK] | Approved |
| `openai` | npm | Mature (official OpenAI org) | 21.6M/wk | github.com/openai/openai-node | [OK] — seam flagged "too-new" on latest patch date only | Approved |
| `@ffmpeg-installer/ffmpeg` | npm | Mature (2021) | 1.0M/wk | github.com/kribblo/node-ffmpeg-installer | [OK] | Approved — dev convenience only, prefer apt package in prod Dockerfile |
| `sqs-consumer` | npm | Mature (bbc org) | 1.66M/wk | github.com/bbc/sqs-consumer | [OK] | Approved |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** `fluent-ffmpeg` — genuinely deprecated (not a false positive); removed from the recommended stack entirely, superseding the project-level STACK.md recommendation. `youtube-dl-exec`, `groq-sdk`, `openai` were seam-flagged `SUS` on a "too-new" heuristic that measures latest-version publish date rather than package age — manually verified as long-established, high-trust packages via `npm view <pkg> time.created` and GitHub org identity; no `checkpoint:human-verify` needed for these three, but the planner should note the seam's heuristic limitation if it recurs.

*All package names in this document were discovered via WebSearch/training-knowledge and cross-verified against the npm registry directly in this session — tagged `[VERIFIED: npm registry]` where `npm view` confirmed the exact version reported.*

## Architecture Patterns

### System Architecture Diagram

```text
┌─────────────────────────────────────────────────────────────────────┐
│  API (Fastify, existing process)                                      │
│                                                                        │
│  POST /import { url }                                                 │
│       │                                                                │
│       ▼                                                                │
│  detectPlatform(url) ──reject──> 400 { error: "unsupported_platform" │
│       │                                    | "invalid_url" }          │
│       │ (valid)                                                       │
│       ▼                                                                │
│  ImportJobModel.insert(status: "queued")                              │
│       │                                                                │
│       ▼                                                                │
│  SQS SendMessage { jobId }  ───────────────────► 202 Accepted        │
│       │                                            (client polls)     │
└───────┼────────────────────────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────────────────────────────┐
│  IMPORT QUEUE (SQS, new + dedicated) ──on repeated failure──► DLQ  │
└───────┬───────────────────────────────────────────────────────────┘
        │ long-poll (sqs-consumer)
        ▼
┌───────────────────────────────────────────────────────────────────┐
│  IMPORT WORKER (Render Background Worker — new deployable)          │
│                                                                       │
│  1. idempotency check: ImportJobModel.findById(jobId)                │
│     — if status already terminal (ready_for_review/failed) → ack+skip│
│       ▼ status: downloading                                          │
│  2. circuit breaker check (per-platform) — if OPEN, fail fast        │
│     with "platform_unavailable" without attempting download          │
│       ▼                                                              │
│  3. yt-dlp download (youtube-dl-exec) → tmp dir                      │
│     ├─ success → video file + --dump-json metadata                   │
│     └─ failure → classify: anti-bot | not-found | network | unknown  │
│         └─ anti-bot → record platform failure, maybe open breaker    │
│       ▼ status: transcribing                                         │
│  4. ffmpeg: extract audio track (child_process, NOT fluent-ffmpeg)   │
│  5. ffmpeg silencedetect pre-check → no-speech ratio                 │
│     ├─ mostly silent/music → mark "no_speech", SKIP Groq call        │
│     └─ has speech → Groq whisper-large-v3-turbo (fallback: OpenAI)   │
│       ▼ status: extracting (STUB — Phase 2 does real extraction)     │
│  6. ffmpeg: scene-score keyframe extraction → best frame             │
│  7. sharp: normalize keyframe (reuse image.service.toThumbnail)      │
│  8. S3: putImage (reuse s3.image-store.ts, key imports/{jobId}/kf.jpg)│
│       ▼ status: ready_for_review (extraction stubbed)                │
│  9. FINALLY: delete tmp video + audio files (guaranteed cleanup)     │
│     record per-platform success/failure telemetry                    │
│       ▼                                                              │
│  10. ImportJobModel.update(status, keyframeUrl, transcript, error?)  │
└───────────────────────────────────────────────────────────────────┘
        │
        ▼ GET /import/:jobId (poll, existing pattern)
┌───────────────────────────────────────────────────────────────────┐
│  ImportJob document — sole source of truth for progress + idempotency│
└───────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure
```
src/modules/import/
├── import-job.types.ts        # ImportJobStatus enum, ImportJobMessage shape
├── import-job.model.ts        # Mongoat schema (status, timestamps, per-stage cost placeholders, error, failedStep)
├── import-job.repository.ts   # CRUD + atomic state transitions, idempotency lookup
├── import.routes.ts           # POST /import, GET /import/:jobId
├── import.service.ts          # enqueueImportJob(), detectPlatform(), URL normalization
└── README.md                  # Obsidian-style module doc

src/infra/video/
├── downloader.port.ts         # interface: download(url) -> { videoPath, audioPath?, meta }
├── ytdlp.downloader.ts        # youtube-dl-exec shell-out + dump-json parsing + failure classification
├── transcription.port.ts      # interface: transcribe(audioPath) -> { text, noSpeech, segments? }
├── groq.transcriber.ts        # groq-sdk primary implementation
├── openai.transcriber.ts      # openai SDK fallback implementation
├── vad.ts                     # ffmpeg silencedetect pre-check (child_process)
├── keyframe.ts                # ffmpeg scene-score extraction (child_process, NOT fluent-ffmpeg)
├── platform-breaker.ts        # per-platform circuit breaker + success-rate telemetry
└── ffmpeg.exec.ts             # shared child_process wrapper (spawn/execFile helpers)

src/workers/
└── import-worker.ts           # sqs-consumer long-poll loop, drives ImportJob state machine

infra/ (existing top-level infra scripts dir)
└── (Dockerfile.import-worker + render.yaml worker service block — see Deployment Notes)
```

### Pattern 1: yt-dlp Download with Failure Classification

**What:** Wrap `youtube-dl-exec`'s `dumpSingleJson` call (metadata) and the actual download call, and classify every non-zero exit / thrown error into a small closed set of reasons the state machine and circuit breaker can act on.

**When to use:** Every download attempt — this is the seam PIPE-07 depends on ("distinct, monitored failed state, not a silent hang or generic 500").

**Example:**
```typescript
// src/infra/video/ytdlp.downloader.ts
// Source: youtube-dl-exec README (github.com/microlinkhq/youtube-dl-exec) + yt-dlp
// GitHub issue #7143 (HTTP 429/403 patterns) — confidence MEDIUM, re-verify
// error strings periodically as yt-dlp's messages are not a stable API.
import youtubedl from "youtube-dl-exec";

export type DownloadFailureReason =
  | "anti_bot_blocked"      // "Sign in to confirm you're not a bot", 403 from Cloudflare fingerprinting
  | "rate_limited"          // HTTP 429
  | "unavailable"           // video deleted/private/geo-blocked
  | "network"               // timeout, DNS, connection reset
  | "unknown";

function classifyYtdlpError(stderr: string): DownloadFailureReason {
  const s = stderr.toLowerCase();
  if (s.includes("sign in to confirm") || s.includes("confirm you're not a bot")) {
    return "anti_bot_blocked";
  }
  if (s.includes("429") || s.includes("too many requests")) return "rate_limited";
  if (s.includes("403") || s.includes("forbidden")) return "anti_bot_blocked";
  if (s.includes("private video") || s.includes("video unavailable") || s.includes("removed")) {
    return "unavailable";
  }
  if (s.includes("timed out") || s.includes("econnreset") || s.includes("enotfound")) {
    return "network";
  }
  return "unknown";
}

export async function fetchMetadata(url: string) {
  return youtubedl(url, {
    dumpSingleJson: true,
    noCheckCertificates: true,
    noWarnings: true,
    // Cap acceptable duration server-side too (defense in depth vs a
    // pathological/huge URL wasting worker time before download starts).
  });
}

export async function downloadVideo(url: string, outputPath: string) {
  try {
    await youtubedl(url, {
      output: outputPath,
      format: "best[ext=mp4]/best", // predictable container for ffmpeg downstream
      noCheckCertificates: true,
      noWarnings: true,
    });
  } catch (err) {
    const stderr = (err as { stderr?: string }).stderr ?? String(err);
    throw new DownloadError(classifyYtdlpError(stderr), stderr);
  }
}

export class DownloadError extends Error {
  constructor(public reason: DownloadFailureReason, stderr: string) {
    super(`yt-dlp download failed: ${reason}`);
    this.cause = stderr;
  }
}
```

**Field map from `--dump-json` (per-platform coverage varies — validate with zod, don't assume all present):**

| Field | Purpose | YouTube | TikTok | Instagram |
|-------|---------|---------|--------|-----------|
| `webpage_url` | Canonical source video URL (PIPE-03, SOC-03) | reliable | reliable | reliable |
| `uploader` / `uploader_id` | Author handle (PIPE-03) | reliable | reliable | reliable |
| `uploader_url` / `channel_url` | Author profile URL (PIPE-03) | reliable (`channel_url`) | reliable | often present, occasionally null |
| `description` | Caption text (PIPE-03) | video description | post caption | post caption |
| `duration` | Video length in seconds (validate against a max-duration cap) | reliable | reliable | reliable |
| `thumbnail` | Platform-provided thumbnail URL (NOT used as the recipe image — PIPE-04 requires an extracted keyframe, but useful for job-list preview before extraction completes) | reliable | reliable | sometimes missing |

**Confidence:** MEDIUM — field names verified against youtube-dl-exec's README examples and general yt-dlp `--dump-json` knowledge; exact per-platform field presence should be spot-checked with `yt-dlp --dump-json <url>` against one real URL per platform early in the phase (STACK.md already recommends this as a pre-build validation step — do it before writing the zod schema).

### Pattern 2: `ImportJob` State Machine

**What:** A single Mongoat document per import; `status` enum the worker advances through; `error`/`failedStep` on failure; per-stage cost placeholders for future Phase 4 wiring.

**When to use:** Every import job — source of truth for both polling (frontend, later phase) and idempotency (this phase).

**Example:**
```typescript
// src/modules/import/import-job.types.ts
// Source: derived from .planning/research/ARCHITECTURE.md Pattern 2, extended
// with fields this phase's requirements (PIPE-06, PIPE-07) actually need.
export type ImportJobStatus =
  | "queued"
  | "downloading"
  | "transcribing"
  | "extracting"       // STUB this phase — always no-ops through to ready_for_review
  | "ready_for_review"
  | "failed";

export type ImportFailureReason =
  | "unsupported_platform"   // CAP-02, rejected before enqueue — never actually stored, but keep for symmetry
  | "invalid_url"
  | "anti_bot_blocked"       // PIPE-07 — circuit-breaker-relevant
  | "rate_limited"           // PIPE-07 — circuit-breaker-relevant
  | "video_unavailable"
  | "no_speech_detected"     // NOT necessarily a failure — see note below
  | "transcription_failed"   // both Groq and OpenAI fallback exhausted
  | "download_timeout"
  | "unknown_error";

export interface ImportJob {
  _id?: string;
  userId: string;
  sourceUrl: string;              // as submitted
  normalizedUrl: string;          // canonicalized for idempotency/dedup (CAP-02/CAP-03 groundwork)
  platform: "instagram" | "tiktok" | "youtube";
  status: ImportJobStatus;
  failedStep?: ImportJobStatus;
  failureReason?: ImportFailureReason;
  errorMessage?: string;          // human-readable, safe to show the user
  transcript?: string;
  transcriptSource?: "groq" | "openai" | null;
  noSpeechDetected?: boolean;     // D-06 — true means transcript is absent/unreliable by design, not a bug
  caption?: string;
  sourceMeta?: {
    authorHandle?: string;
    authorUrl?: string;
    durationSec?: number;
  };
  keyframeUrl?: string;           // S3 URL, set once PIPE-04 completes
  costCents?: {                   // placeholders — populated fully in Phase 4, but the shape
    download?: number;             // should exist now so Phase 4 doesn't need a schema migration
    transcription?: number;
    total?: number;
  };
  retryCount: number;
  insertedAt: Date;
  updatedAt: Date;
}
```

**Retry/backoff recommendation (Claude's Discretion area — concrete proposal):**
- SQS redrive policy `maxReceiveCount: 3` before DLQ (mirrors the "3 strikes" pattern common for this workload — download+transcribe is expensive enough that unlimited retries burn real cost on a permanently-broken URL).
- Application-level: on `anti_bot_blocked`/`rate_limited`, do NOT let SQS's built-in retry immediately re-attempt — explicitly fail the job (`status: failed`, `failureReason: anti_bot_blocked`) and let the CIRCUIT BREAKER (not per-message retry) decide when the platform is healthy again. Retrying a blocked download immediately just accelerates the block. Reserve SQS-level retry for transient reasons (`network`, `download_timeout`).
- Visibility timeout: set to **6x expected p95 processing time** (this exact multiplier is called out in the project's own PITFALLS.md for this workload) — with download+transcribe+keyframe realistically taking 30s-3min, a visibility timeout of 15-20 minutes gives comfortable headroom without being absurd.

### Pattern 3: Per-Platform Circuit Breaker + Success Telemetry

**What:** Track a rolling window of success/failure per platform; when failure rate crosses a threshold, short-circuit new attempts for that platform with an immediate `platform_unavailable` failure instead of spending 30s-3min attempting a download that will fail anyway.

**When to use:** Wraps every download attempt — this is what makes PIPE-07's "degrades gracefully instead of hammering a broken platform" concrete, not aspirational.

**Recommended shape (Claude's Discretion — concrete proposal, no existing precedent in the codebase to mirror):**
```typescript
// src/infra/video/platform-breaker.ts
// Simple, no new infra dependency — in-process state is fine for a single
// worker instance at MVP scale (ARCHITECTURE.md's own scaling doc confirms
// single-instance is the expected MVP shape). If the worker scales to
// multiple instances later, promote this to a shared Mongo collection
// (a `platform_health` doc per platform) — flagged as a scaling note, not
// a Phase 1 requirement.
type BreakerState = "closed" | "open" | "half_open";

interface PlatformStats {
  state: BreakerState;
  recentOutcomes: boolean[];   // ring buffer, e.g. last 20 attempts
  openedAt?: Date;
}

const COOLDOWN_MS = 5 * 60_000;      // 5 min before trying half-open
const FAILURE_THRESHOLD = 0.7;        // 70% failure rate over window opens the breaker
const MIN_SAMPLES = 5;                // don't trip on tiny sample sizes

export function recordOutcome(platform: string, success: boolean): void { /* ... */ }
export function isOpen(platform: string): boolean { /* ... */ }
export function successRate(platform: string): number { /* ... */ }
```

**Telemetry requirement (PIPE-07):** at minimum, log a structured event per job outcome (`{ platform, outcome, failureReason, durationMs }`) — given `CONCERNS.md` already flags "No Monitoring/Observability" project-wide, this phase should NOT silently inherit that gap for its highest-risk component. A simple `platform_stats` Mongo collection (daily rollup: platform, date, attempts, successes, failuresByReason) is sufficient for MVP — a full metrics pipeline (Prometheus/Datadog) is out of scope for this phase.

**Confidence:** MEDIUM-LOW — this is architectural reasoning proposed to satisfy D-02/PIPE-07, not a documented pattern with an existing citation; the planner should treat the exact thresholds (70% failure, 5 samples, 5 min cooldown) as a reasonable starting point to implement and tune, not a hard external spec.

### Pattern 4: Guaranteed Cleanup (PIPE-05)

**What:** Delete raw video/audio files even when the job crashes mid-pipeline.

**Two layers, both required:**

1. **Per-job `try/finally`:** wrap the entire download→transcribe→keyframe sequence; the `finally` block deletes the job's temp directory unconditionally, whether the job succeeded or threw.
2. **Worker-startup sweep:** a `finally` block does NOT run if the process is `SIGKILL`ed (OOM, Render force-restart, crash) — so on worker boot, sweep the temp directory for any leftover job folders older than a threshold (e.g., anything not matching an in-flight `ImportJob` in `downloading`/`transcribing` status) and delete them.

```typescript
// src/workers/import-worker.ts (excerpt)
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

async function processJob(jobId: string): Promise<void> {
  const jobDir = await mkdtemp(path.join(tmpdir(), `import-${jobId}-`));
  try {
    // download → jobDir/video.mp4
    // ffmpeg extract audio → jobDir/audio.mp3
    // ffmpeg extract keyframe → jobDir/keyframe.jpg
    // ... pipeline steps, each updating ImportJob status ...
  } finally {
    // Guaranteed even on thrown error — but NOT on SIGKILL, hence layer 2.
    await rm(jobDir, { recursive: true, force: true }).catch((e) =>
      console.error(`[cleanup] failed to remove ${jobDir}`, e),
    );
  }
}

// On worker boot, before consuming SQS:
async function sweepStaleTempDirs(): Promise<void> {
  // list tmpdir() entries matching `import-*` prefix; for each, check if a
  // corresponding ImportJob is still actively "downloading"/"transcribing"
  // (a legitimately in-flight job on THIS process would only exist if we
  // crashed and restarted mid-job — rare, but the sweep must not delete a
  // directory belonging to a job another worker instance might still own
  // if horizontally scaled later). At single-instance MVP scale, any
  // `import-*` dir found at startup is safe to delete — the process that
  // owned it is the one restarting.
}
```

**S3 note:** the keyframe is the ONLY thing uploaded to S3 for this pipeline (per D-09/D-10) — raw video/audio never touch S3 at all, so there is no S3-side cleanup step, only local disk. This is simpler than a "delete from S3 after processing" pattern and should be enforced by never writing raw media to S3 in the first place (not writing-then-deleting).

**Confidence:** HIGH — this is a standard, well-established Node.js pattern (try/finally + startup sweep for crash recovery), not time-sensitive or platform-specific.

### Anti-Patterns to Avoid

- **Using `fluent-ffmpeg`:** Archived by its maintainer (May 2025), its own README states it no longer works reliably with current ffmpeg. Use direct `child_process.execFile`/`spawn` calls to the `ffmpeg` binary instead — this is a small amount of extra code (build an args array, spawn, capture stdout/stderr) for a meaningful reliability gain over depending on an unmaintained wrapper.
- **Trusting Whisper's raw output as ground truth for silence/music-only clips:** per project PITFALLS.md, Whisper hallucinates plausible text over silence with HIGH confidence — the `no_speech_prob` field alone is not a reliable filter. Run `ffmpeg silencedetect` as an independent pre-check BEFORE calling Groq (cheaper AND more reliable than post-hoc Whisper confidence heuristics).
- **Retrying an `anti_bot_blocked` failure immediately via SQS's built-in redelivery:** accelerates the block. Fail the job explicitly and let the circuit breaker's cooldown window (not per-message backoff) govern when to try that platform again.
- **Writing raw video/audio to S3 "to make cleanup easier":** directly contradicts D-09/PIPE-05 and the project's legal posture (no re-hosting third-party media). Never let raw media leave local worker disk.
- **Reusing the Lambda `SQSEvent` handler shape for the new worker:** `src/lambda/ingest-handler.ts` is Lambda-invocation-shaped (one `handler(event)` call per Lambda cold/warm start). The Render worker is a standalone long-running process — it needs an actual poll loop (`sqs-consumer`), not an event-handler function signature.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| SQS long-polling with visibility-timeout heartbeat | Custom `while(true)` + `ReceiveMessageCommand`/`ChangeMessageVisibilityCommand` loop | `sqs-consumer` | Heartbeating during a long-running job (download+transcribe can exceed the default visibility timeout) is easy to get subtly wrong; `sqs-consumer` handles this and batch error semantics correctly |
| yt-dlp CLI argument construction/escaping | Hand-built argv array passed to `child_process.spawn` | `youtube-dl-exec` | Dozens of possible yt-dlp flags, wrapper already maps a typed options object to CLI flags correctly |
| ffmpeg command construction for common operations (audio extract, keyframe select, silencedetect) | A custom fluent builder (i.e., don't reinvent what `fluent-ffmpeg` was) | Small, purpose-built helper functions in `ffmpeg.exec.ts` that build ONE well-tested command each (per the "ffmpeg wrappers are just command generators, write your specific commands once" lesson from `fluent-ffmpeg`'s own deprecation rationale) | A general-purpose fluent builder is exactly the abstraction that just got deprecated project-wide in the Node ecosystem — three or four fixed, well-tested command templates (extract-audio, extract-keyframe, silencedetect) are simpler and more maintainable than a generic builder |
| Voice activity detection from scratch | A custom energy-threshold audio analyzer | ffmpeg's built-in `silencedetect` filter | Battle-tested, zero extra dependency (ffmpeg is already required), sufficient for a binary "has speech / no speech" gate — do not build a custom Silero-VAD integration for this phase's coarse-grained need |
| Ingredient canonicalization / embedding for the stubbed extraction step | Anything — this phase stubs extraction entirely | N/A this phase | Explicitly out of scope; Phase 2 wires the real extraction call, and it MUST reuse `resolveCanonicalForIngestion()`/`embeddings.embedDocuments()` unmodified per ARCHITECTURE.md Anti-Pattern 1 — noted here only so the planner doesn't accidentally scaffold a parallel path in Phase 1's stub |

**Key insight:** The dominant "don't hand-roll" lesson from this research pass is specifically about NOT reaching for a generic ffmpeg wrapper library — the ecosystem itself just taught this lesson by deprecating the most popular one. Purpose-built command functions for this pipeline's exact, small set of ffmpeg operations (extract audio, detect silence, extract best keyframe) are both simpler to write and more resilient to ffmpeg version drift than a generic abstraction layer would have been.

## Common Pitfalls

### Pitfall 0: `fluent-ffmpeg` is archived and no longer works reliably (NEW finding, supersedes project-level STACK.md)

**What goes wrong:** Following the project-level STACK.md recommendation verbatim leads to installing a maintainer-abandoned package whose own documentation now states it doesn't work correctly with current ffmpeg builds — audio extraction or keyframe extraction could silently produce corrupt/empty output, or throw cryptic errors unrelated to the actual ffmpeg invocation.

**Why it happens:** STACK.md was researched the same day as this document but did not surface the May 2025 archival — training-data-era familiarity with `fluent-ffmpeg` as "the standard Node ffmpeg wrapper" is now stale.

**How to avoid:** Do not install `fluent-ffmpeg`. Use `child_process.execFile("ffmpeg", [...args])` directly for the phase's three fixed operations (extract audio, `silencedetect`, extract keyframe via `select='gt(scene,N)'`). Each is a single, well-documented ffmpeg CLI invocation — see Code Examples below.

**Warning signs:** `npm install fluent-ffmpeg` printing a deprecation warning; any ffmpeg-related error mentioning an unrecognized filter/option that works fine when run manually via the CLI.

**Phase to address:** This phase, at initial dependency selection — do not let it land in `package.json` at all.

---

### Pitfall 1: yt-dlp anti-bot failures look identical to generic network errors without explicit classification

**What goes wrong:** A block/rate-limit surfaces as just "yt-dlp exited with code 1" — indistinguishable in logs from a malformed URL or a genuinely deleted video, making PIPE-07's "distinct, monitored failed state" impossible to build.

**Why it happens:** yt-dlp's stderr output is human-readable prose, not a structured error code; different failure modes produce different substrings ("Sign in to confirm...", "HTTP Error 429", "Video unavailable") that must be pattern-matched.

**How to avoid:** Implement `classifyYtdlpError()` (see Code Examples §1) as a first-class part of the downloader adapter, not an afterthought. Treat the string-matching as inherently fragile and re-verify the patterns periodically — yt-dlp's own error message wording is not a stable API and can change between versions.

**Warning signs:** All download failures land in a single generic `failed` state with no `failureReason` breakdown; the circuit breaker has no signal to distinguish "this platform is blocking us" from "this one URL is broken."

**Phase to address:** This phase — PIPE-07 is explicitly a phase-blocking requirement.

---

### Pitfall 2: Groq's 25MB free-tier file size limit silently truncates or rejects longer/higher-bitrate clips

**What goes wrong:** A cooking video with a few minutes of higher-bitrate audio can exceed 25MB as a raw extracted audio file (less likely if audio is compressed to a modest bitrate, but a real risk if the extraction step naively dumps a large intermediate format); the Groq API call fails or (per a documented GitHub issue) can silently fail rather than raising a clear error on some client configurations.

**Why it happens:** Groq's file size ceiling is real infrastructure (25MB free tier / 100MB paid-tier-via-URL), and it's easy to assume "audio is small" without verifying the actual extracted file size for realistic clip lengths.

**How to avoid:** When extracting audio with ffmpeg, use a modest bitrate/format (e.g., `-ar 16000 -ac 1 -b:a 64k` mono 16kHz — Whisper-class models don't benefit from higher fidelity and this keeps file size predictable for short-form video audio tracks). Validate the extracted audio file size before calling Groq; if it exceeds the limit, either compress further or fail explicitly with a clear reason rather than let the SDK call fail ambiguously.

**Warning signs:** Transcription requests failing only for longer clips; Groq SDK calls that appear to hang or return empty results without a clear HTTP error (flagged as a known community-reported gotcha, not just theoretical).

**Phase to address:** This phase — directly affects PIPE-02 reliability.

---

### Pitfall 3: Whisper hallucinates on music/silence-only clips even with `no_speech_prob` available

**What goes wrong:** (Inherited from project PITFALLS.md, restated with the concrete mitigation this phase must implement.) Groq's `verbose_json` response includes per-segment `no_speech_prob`/`avg_logprob`, but these are documented as unreliable specifically on hallucinated segments — they're generated with artificially high confidence.

**How to avoid:** Run `ffmpeg silencedetect` as an independent pre-check BEFORE spending money on the Groq call at all. If the clip is mostly silence/low-energy audio (e.g., >80% of duration below the noise threshold), mark `noSpeechDetected: true` and skip transcription entirely rather than trusting Whisper's self-reported confidence. This satisfies D-06 more reliably and more cheaply than a post-hoc Whisper-confidence filter.

**Phase to address:** This phase — PIPE-02 requires the pre-filter explicitly.

---

### Pitfall 4: SQS visibility timeout too short for a 30s-3min pipeline causes duplicate processing

**What goes wrong:** If the queue's default visibility timeout (often 30s) is left unchanged, SQS will redeliver the message to a second consumer while the first is still mid-download, causing two workers to process the same job simultaneously — direct violation of PIPE-06's idempotency requirement.

**Why it happens:** The default SQS visibility timeout is tuned for fast, sub-second message processing, not multi-minute binary-heavy pipelines; this is explicitly called out in the project's own PITFALLS.md as Pitfall 6/7 but needs a concrete number here.

**How to avoid:** Set the import queue's visibility timeout to roughly 6x expected p95 processing time (project's own recommendation) — with realistic 30s-3min processing, set to 15-20 minutes. Additionally, use `sqs-consumer`'s heartbeat/visibility-extension capability if actual processing time proves variable, rather than only relying on a static long timeout.

**Phase to address:** This phase — queue configuration is part of PIPE-06.

---

### Pitfall 5: Render Background Worker costs scale with continuous uptime, not per-job

**What goes wrong:** Unlike Lambda (pay-per-invocation), a Render Background Worker bills continuously whether or not it's processing a job — the Starter plan ($7/mo, 512MB/0.5CPU) may be undersized for concurrent yt-dlp+ffmpeg+Whisper-API work (CPU-bound video decode), pushing toward Standard ($25/mo) sooner than expected.

**Why it happens:** This is a genuine architectural tradeoff already acknowledged in ARCHITECTURE.md ("Render worker instances are billed continuously... cost scales with plan tier, not per-job") — but the actual resource needs of ffmpeg keyframe/audio extraction under concurrent jobs weren't load-tested in prior research.

**How to avoid:** Start with Starter plan for initial validation (low job volume expected at MVP), but budget for Standard as the realistic production tier — ffmpeg video decode is CPU-bound and 0.5 CPU is thin for concurrent jobs. Cap worker concurrency via `p-queue` (e.g., 2-3 concurrent jobs max) to stay within whatever tier is chosen rather than letting the worker attempt unlimited parallel ffmpeg processes.

**Phase to address:** This phase, deployment/infra task — the planner should size the Render plan explicitly rather than defaulting silently to Starter.

---

### Pitfall 6: `finally`-block cleanup doesn't survive a process crash (SIGKILL/OOM)

**What goes wrong:** A `try/finally` around the job's temp directory handles thrown JS errors correctly, but if the worker process is killed abruptly (OOM from a large video, Render force-restarting a stuck deploy, host-level crash), the `finally` block never runs — orphaned video/audio files accumulate on disk, silently violating PIPE-05's "no raw video/audio remains after the job finishes" guarantee.

**How to avoid:** Implement BOTH layers described in Architecture Pattern 4 — per-job `try/finally` for the common case, PLUS a worker-startup sweep that clears any leftover `import-*` temp directories from a prior crashed instance. Treat the startup sweep as a required task, not an edge-case nice-to-have — this is precisely the kind of "looks done but isn't" gap the project's own PITFALLS.md checklist calls out.

**Phase to address:** This phase — directly required by PIPE-05's success criterion ("no raw video/audio file remains on disk or in S3 after the job finishes").

## Code Examples

### 1. yt-dlp download + metadata + error classification
See Architecture Pattern 1 above — full example provided there (source: youtube-dl-exec README + yt-dlp community error patterns, MEDIUM confidence).

### 2. Circuit breaker check before attempting download
```typescript
// src/workers/import-worker.ts (excerpt)
import { isOpen, recordOutcome } from "@/infra/video/platform-breaker.js";
import { DownloadError, downloadVideo } from "@/infra/video/ytdlp.downloader.js";

async function downloadStage(job: ImportJob, videoPath: string): Promise<void> {
  if (isOpen(job.platform)) {
    throw new PipelineFailure("anti_bot_blocked", "platform temporarily unavailable (circuit open)");
  }
  try {
    await downloadVideo(job.sourceUrl, videoPath);
    recordOutcome(job.platform, true);
  } catch (err) {
    recordOutcome(job.platform, false);
    if (err instanceof DownloadError) {
      throw new PipelineFailure(err.reason, err.message);
    }
    throw err;
  }
}
```

### 3. ffmpeg audio extraction (direct child_process, NOT fluent-ffmpeg)
```typescript
// src/infra/video/ffmpeg.exec.ts
// Source: standard ffmpeg CLI usage, no library dependency — HIGH confidence
// (ffmpeg's CLI interface itself is stable and well-documented, unlike the
// deprecated Node wrapper).
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const FFMPEG_BIN = process.env.FFMPEG_PATH ?? "ffmpeg"; // apt-installed in worker Docker image

export async function extractAudio(videoPath: string, audioPath: string): Promise<void> {
  // Mono, 16kHz, 64kbps — Whisper-class models don't need higher fidelity,
  // and this keeps the file well under Groq's 25MB free-tier limit for any
  // realistic short-form video duration (see Common Pitfalls §2).
  await execFileAsync(FFMPEG_BIN, [
    "-y", "-i", videoPath,
    "-vn", "-ar", "16000", "-ac", "1", "-b:a", "64k",
    audioPath,
  ]);
}
```

### 4. ffmpeg silencedetect pre-check (VAD-adjacent gate)
```typescript
// src/infra/video/vad.ts
// Source: ffmpeg silencedetect filter documentation (ffmpeg.org) — MEDIUM
// confidence (filter itself is stable/documented; the specific threshold
// values below are a reasonable starting point, not an externally-specified
// standard — tune against real onFeed clips per D-05/D-06).
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const FFMPEG_BIN = process.env.FFMPEG_PATH ?? "ffmpeg";

const NOISE_THRESHOLD_DB = "-30dB";
const MIN_SILENCE_SEC = "1.0";

export async function detectSilenceRatio(audioPath: string, totalDurationSec: number): Promise<number> {
  // silencedetect logs to stderr, not stdout — ffmpeg with -f null discards
  // actual output, we only want the filter's log lines.
  const { stderr } = await execFileAsync(FFMPEG_BIN, [
    "-i", audioPath,
    "-af", `silencedetect=noise=${NOISE_THRESHOLD_DB}:d=${MIN_SILENCE_SEC}`,
    "-f", "null", "-",
  ]).catch((e) => ({ stderr: (e as { stderr?: string }).stderr ?? "" }));

  const silenceDurations = [...stderr.matchAll(/silence_duration:\s*([\d.]+)/g)]
    .map((m) => parseFloat(m[1]));
  const totalSilence = silenceDurations.reduce((a, b) => a + b, 0);
  return totalDurationSec > 0 ? totalSilence / totalDurationSec : 0;
}

// Usage in the worker pipeline:
// const ratio = await detectSilenceRatio(audioPath, job.sourceMeta.durationSec);
// if (ratio > 0.8) { job.noSpeechDetected = true; /* skip Groq call */ }
```

### 5. ffmpeg scene-score keyframe extraction
```typescript
// src/infra/video/keyframe.ts
// Source: ffmpeg select filter with scene-change scoring (ffmpeg.org filters
// docs; scene threshold convention widely documented) — MEDIUM confidence
// on the exact threshold value (0.4), which is a commonly cited middle-ground
// starting point, not a hard spec — STACK.md itself flags this as "start
// simple (25/50/75% split), invest in scene-detection only if needed", but
// scene-detection is barely more code than a fixed-percentage split and
// avoids landing on blurry transition frames, so it's worth doing from day 1.
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const FFMPEG_BIN = process.env.FFMPEG_PATH ?? "ffmpeg";
const SCENE_THRESHOLD = "0.4";

export async function extractKeyframe(videoPath: string, outputPath: string): Promise<void> {
  try {
    await execFileAsync(FFMPEG_BIN, [
      "-y", "-i", videoPath,
      "-vf", `select='gt(scene\\,${SCENE_THRESHOLD})'`,
      "-frames:v", "1", "-vsync", "vfr",
      outputPath,
    ]);
  } catch {
    // Fallback: scene-score filter can find zero qualifying frames on very
    // short/static clips (e.g., a still shot with no cuts). Fall back to a
    // frame at the midpoint of the video — always succeeds.
    await execFileAsync(FFMPEG_BIN, [
      "-y", "-i", videoPath,
      "-vf", "select='eq(n\\,0)'", // will be replaced with a seek-to-midpoint approach at implementation time
      "-frames:v", "1", "-vsync", "vfr",
      outputPath,
    ]);
  }
}

// After extraction, normalize via the EXISTING image service pattern —
// do not reimplement resize/encode logic:
// import { toThumbnailFromPath } from "@/infra/images/image.service.js"; (planner:
// export a path-based variant of the existing Buffer-based toThumbnail(),
// or read the file into a Buffer first — either is fine, just reuse the
// sharp(...).resize(512,512,{fit:"cover"}).jpeg({quality:82,mozjpeg:true}) logic verbatim)
```

### 6. SQS DLQ + idempotency (worker consumer, NOT Lambda)
```typescript
// src/workers/import-worker.ts
// Source: sqs-consumer README (github.com/bbc/sqs-consumer) + AWS SQS DLQ
// redrive policy docs — MEDIUM-HIGH confidence (library API is stable,
// AWS DLQ mechanics are well-documented/stable).
import { Consumer } from "sqs-consumer";
import { sqsClient } from "@/infra/queue/sqs.client.js";
import { env } from "@/config/env.js";
import { ImportJobModel } from "@/modules/import/import-job.model.js";

const consumer = Consumer.create({
  queueUrl: env.sqs.importQueueUrl,
  sqs: sqsClient,
  // Match the visibility timeout headroom recommendation (Pitfall 4).
  visibilityTimeout: 20 * 60, // 20 min
  handleMessage: async (message) => {
    const { jobId } = JSON.parse(message.Body ?? "{}") as { jobId: string };

    // Idempotency: ImportJob document is the source of truth, NOT the SQS
    // message. A redelivered message for an already-terminal job is a no-op.
    const job = await ImportJobModel.findById(jobId);
    if (!job) return; // defensive — shouldn't happen, job created before enqueue
    if (job.status === "ready_for_review" || job.status === "failed") {
      return; // already processed — ack (delete) without redoing work
    }

    await processImportJob(job); // drives the full pipeline, updates status at each stage
  },
});

consumer.on("processing_error", (err) => {
  console.error("[import-worker] processing error", err);
  // sqs-consumer leaves the message on the queue on error (does not delete);
  // SQS redrive policy (maxReceiveCount: 3, configured at the QUEUE level in
  // AWS, not in this code) moves it to the DLQ after repeated failures.
});

consumer.start();
```

**DLQ setup (infra-level, not application code):** the import queue's redrive policy needs `deadLetterTargetArn` pointing at a new `onfeed-import-dlq` and `maxReceiveCount: 3`. This mirrors the exact gap CONCERNS.md flags as missing on the existing ingest queue — this phase is the natural place to establish the correct pattern, not inherit the gap.

### 7. Platform detection + URL normalization (CAP-02)
```typescript
// src/modules/import/import.service.ts
// Source: derived from ARCHITECTURE.md's detectPlatform() sketch, made concrete.
export type SupportedPlatform = "instagram" | "tiktok" | "youtube";

const PLATFORM_PATTERNS: Array<[SupportedPlatform, RegExp]> = [
  ["youtube", /^https?:\/\/(www\.)?(youtube\.com\/(watch\?v=|shorts\/)|youtu\.be\/)/i],
  ["tiktok", /^https?:\/\/(www\.|vm\.)?tiktok\.com\//i],
  ["instagram", /^https?:\/\/(www\.)?instagram\.com\/(reel|p)\//i],
];

export function detectPlatform(url: string): SupportedPlatform | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null; // malformed URL entirely
  }
  if (!["http:", "https:"].includes(parsed.protocol)) return null;

  for (const [platform, pattern] of PLATFORM_PATTERNS) {
    if (pattern.test(url)) return platform;
  }
  return null;
}

export function normalizeUrl(url: string): string {
  const parsed = new URL(url);
  // Strip tracking params (utm_*, igshid, etc.) that would otherwise defeat
  // future dedup (CAP-03, Phase 3) — groundwork laid now even though dedup
  // logic itself is out of scope this phase.
  const stripParams = ["utm_source", "utm_medium", "utm_campaign", "igshid", "si"];
  stripParams.forEach((p) => parsed.searchParams.delete(p));
  return parsed.toString();
}

// In the route handler:
// const platform = detectPlatform(url);
// if (!platform) {
//   return reply.code(400).send({ error: "unsupported_platform_or_invalid_url" });
// }
```

**Confidence:** MEDIUM — the regex patterns cover the common URL shapes (youtube.com/watch, youtu.be, youtube.com/shorts, tiktok.com/@user/video, vm.tiktok.com short links, instagram.com/reel, instagram.com/p) but platform URL formats do drift (e.g., YouTube periodically adds new shape variants) — treat this as a starting set to validate against real URLs, not an exhaustive final list. yt-dlp itself is far more permissive/robust at URL recognition than any hand-written regex could be, so a defensible fallback is: if the regex doesn't match but the domain is one of the three known domains, still attempt yt-dlp's own `--dump-json` as a soft validation before hard-rejecting (deferred as an implementation nuance for the planner).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `fluent-ffmpeg` as the standard Node ffmpeg wrapper | Direct `child_process` calls to the ffmpeg binary | Archived May 2025 | Any plan/tutorial referencing `fluent-ffmpeg` (including this project's own STACK.md, written the same day as this document) is now stale — verified via npm's own deprecation notice and the maintainer's GitHub issue #1324 ("Phasing out fluent-ffmpeg") |
| `ffmpeg-kit` (mobile/cross-platform ffmpeg wrapper) | Also archived (June 2025) | June 2025 | Not directly relevant to this Node backend worker, but confirms a broader ecosystem consolidation away from ffmpeg wrapper libraries toward direct binary invocation or WASM builds |
| Groq `whisper-large-v3` as the only turbo-tier option | `whisper-large-v3-turbo` now the recommended default for price/performance | Already the case per D-04 — confirmed still current | No change needed; D-04's choice is validated by current Groq docs |

**Deprecated/outdated:**
- `fluent-ffmpeg`: archived, non-functional against current ffmpeg per maintainer's own statement. Do not add to `package.json`.
- `ffmpeg-kit`: also archived — not relevant to this phase (mobile-focused), noted only as corroborating evidence of the ecosystem shift.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|----------------|
| A1 | yt-dlp error string patterns ("sign in to confirm", "429", "403") reliably distinguish anti-bot blocks from other failures | Architecture Pattern 1, Pitfall 1 | If yt-dlp changes its error message wording (not a stable API), the classifier silently misroutes failures into "unknown" — circuit breaker loses signal. Mitigation: log raw stderr alongside the classified reason so misclassification is debuggable, not silent. |
| A2 | Render Standard plan ($25/mo) is likely necessary vs Starter ($7/mo) for concurrent ffmpeg/yt-dlp workloads | Common Pitfalls §5 | If wrong (Starter proves sufficient at MVP volume), only a cost overestimate — safe direction to be wrong in. If MVP volume is higher than assumed and Starter is chosen, jobs could queue/timeout under load. |
| A3 | Circuit breaker thresholds (70% failure rate, 5 min cooldown, 5 min sample window) are reasonable starting values | Architecture Pattern 3 | These are proposed, not externally specified — if too aggressive, legitimate transient failures trip the breaker unnecessarily; if too lax, the breaker fails to protect against a genuinely broken platform. Low risk either way since these are tunable constants, not architectural commitments. |
| A4 | Scene-score threshold 0.4 for keyframe selection produces a "representative" (non-blurry, non-transition) frame for short-form cooking video content specifically | Code Examples §5 | If wrong, keyframes could be blurry/transitional on certain content styles (e.g., very fast-cut TikTok edits). Low risk — this is a visual quality concern, not a correctness/reliability one, and is easy to tune empirically once real imports are flowing. |
| A5 | 16kHz mono 64kbps audio extraction keeps files safely under Groq's 25MB limit for realistic recipe-video durations (typically under 3 min) | Common Pitfalls §2 | If a video is unusually long (many minutes), even this compressed format could approach the limit — mitigated by validating file size before the Groq call and failing explicitly rather than silently, but the max-duration cap itself is not yet a locked number (planner should set one, e.g., reject videos over ~10 min at the CAP-02 validation stage, informed by typical recipe-video length). |

## Open Questions

1. **Exact per-platform yt-dlp error-string patterns for 2026's current anti-bot behavior**
   - What we know: general patterns (429, 403, "sign in to confirm") are well-documented as of mid-2026 per GitHub issue threads.
   - What's unclear: whether Instagram/TikTok have introduced new, undocumented block signatures since the last community reporting (this domain changes every few weeks per the project's own PITFALLS.md).
   - Recommendation: the planner should treat `classifyYtdlpError()` as a living function — plan a task to manually run `yt-dlp --dump-json` against 2-3 real URLs per platform during implementation (not just at research time) to confirm current error behavior firsthand, and log unclassified ("unknown") failures verbosely in production so new patterns can be added quickly as they're observed.

2. **Whether `youtube-dl-exec`'s bundled/auto-downloaded yt-dlp binary stays current inside a Docker build, or needs an explicit weekly-update mechanism**
   - What we know: `youtube-dl-exec`'s postinstall script fetches "the latest yt-dlp version available" at `npm install` time; project-level STACK.md recommends a scheduled weekly update job.
   - What's unclear: whether relying on `npm install` (re-run only on deploy) is sufficient cadence, or whether a separate in-container cron/scheduled task to run `yt-dlp -U` (self-update) between deploys is needed given how fast platform-side breakage can occur.
   - Recommendation: for this phase, "current yt-dlp at each deploy" (via `npm install`/Docker build) is sufficient to prove the pipeline works end-to-end. A weekly auto-update mechanism independent of deploy cadence is a reasonable follow-up hardening task but not a phase-blocking requirement — the planner should decide whether to scope it in or explicitly defer it.

3. **Whisper PT-BR quality on real onFeed clips (D-05) — genuinely unresolved, by design**
   - What we know: published WER benchmarks are English-centric; Groq's own turbo-tier WER (12%) is a general (likely English-weighted) number, not PT-BR-specific.
   - What's unclear: actual transcription quality on Brazilian Portuguese cooking slang/informal register/background kitchen noise — this is explicitly called out as needing empirical validation, not research-derivable.
   - Recommendation: this is not a research gap to close via more searching — it requires running real onFeed sample clips through both Groq and OpenAI Whisper during this phase's implementation and comparing output quality manually. The planner should include an early task for this (D-05 mandates it "cedo na fase" — early in the phase), likely as a spike/validation step before the transcription adapter is considered "done," not just a code-complete task.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|--------------|-----------|---------|----------|
| Python 3.9+ | yt-dlp binary runtime (via `youtube-dl-exec`) | Not present in existing `node:22-slim` base image | — | New worker Dockerfile must add `python3` — no fallback, this is a hard requirement for yt-dlp to run at all |
| ffmpeg binary | Audio extraction, silencedetect, keyframe extraction | Not present in existing `node:22-slim` base image | — | New worker Dockerfile must `apt-get install ffmpeg` — no fallback, core to PIPE-02/PIPE-04 |
| yt-dlp binary | Video download | Not present anywhere in current infra | `2026.06.09` (auto-fetched by `youtube-dl-exec` postinstall, or `pip install yt-dlp` explicitly in Dockerfile) | No fallback — this is THE download mechanism per D-01/D-07 |
| Groq API access | Primary transcription | Requires new `GROQ_API_KEY` env var (not yet in `render.yaml`) | groq-sdk 1.3.0 | OpenAI Whisper (already planned as explicit fallback per D-04) |
| OpenAI API access | Fallback transcription | Requires new `OPENAI_API_KEY` env var (not yet in `render.yaml`) | openai 6.45.0 | None — if both Groq and OpenAI are unavailable, transcription fails and the job should land in `failed` with `transcription_failed`, not hang |
| Render Background Worker service type | Deployment topology (D-locked) | Not yet provisioned — new `render.yaml` service block needed | — | None per user decision — Lambda explicitly ruled out for this workload |
| AWS SQS (new dedicated queue + DLQ) | PIPE-06 | Existing SQS infra pattern present (`ingest-queue.ts`), but a NEW queue+DLQ pair must be provisioned | @aws-sdk/client-sqs 3.1077.0 (already in stack) | None — DLQ is a phase requirement, not optional |
| Local dev: yt-dlp/ffmpeg/Python | Developer machine testing | Per project memory, Whisper was already run locally in this environment during ideation — some precedent exists, but yt-dlp/ffmpeg local availability is unconfirmed | — | Document as a dev prerequisite (Homebrew/apt install); not emulated via docker-compose at MVP (per ARCHITECTURE.md's own recommendation — running real binaries locally is more useful for debugging extraction quality than mocking) |

**Missing dependencies with no fallback:**
- Python 3.9+, ffmpeg, yt-dlp binary — all three are new Dockerfile requirements with zero fallback; this worker literally cannot function without them.
- New dedicated SQS queue + DLQ — must be provisioned as part of this phase's infra work (mirrors existing `SQS_INGEST_QUEUE_URL` pattern, needs a new `SQS_IMPORT_QUEUE_URL` / `SQS_IMPORT_DLQ_URL`).
- New Render Background Worker service — must be added to `render.yaml` as a `type: worker` block; does not exist today.

**Missing dependencies with fallback:**
- Groq unavailable → OpenAI Whisper (already the locked fallback design, D-04).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None currently configured — `CONCERNS.md` confirms "No test files exist... no Jest, Vitest, etc." project-wide |
| Config file | none — Wave 0 gap |
| Quick run command | N/A until framework installed |
| Full suite command | N/A until framework installed |

**Recommendation:** Install Vitest (per `CONCERNS.md`'s own recommendation for this Node/TS stack) as part of this phase's Wave 0, given this phase introduces the project's first genuinely high-risk, hard-to-manually-verify logic (error classification, circuit breaker state transitions, cleanup guarantees) — these are exactly the kind of pure-function/state-machine logic that unit tests catch cheaply and manual testing catches expensively (or not at all).

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|---------------------|--------------|
| CAP-02 | `detectPlatform()` correctly classifies valid/invalid URLs per platform | unit | `vitest run src/modules/import/import.service.test.ts` | ❌ Wave 0 |
| CAP-02 | `normalizeUrl()` strips tracking params without altering the canonical video reference | unit | `vitest run src/modules/import/import.service.test.ts` | ❌ Wave 0 |
| PIPE-01 | `fetchMetadata()`/`downloadVideo()` against a real, small, stable public test video (per platform) succeeds and returns expected fields | integration (manual-gated — hits real yt-dlp + real network) | `vitest run src/infra/video/ytdlp.downloader.integration.test.ts` (tag as slow/network-dependent, not part of default fast suite) | ❌ Wave 0 |
| PIPE-01/PIPE-07 | `classifyYtdlpError()` maps known stderr fixtures (recorded from real failures) to the correct `DownloadFailureReason` | unit | `vitest run src/infra/video/ytdlp.downloader.test.ts` | ❌ Wave 0 |
| PIPE-02 | `detectSilenceRatio()` correctly flags a synthetic silent/music-only audio fixture vs a synthetic speech fixture | unit (uses small checked-in fixture audio files or ffmpeg-generated synthetic tones) | `vitest run src/infra/video/vad.test.ts` | ❌ Wave 0 |
| PIPE-02 | Transcription adapter falls back from Groq to OpenAI on a simulated Groq failure | unit (mocked SDK clients) | `vitest run src/infra/video/transcription.test.ts` | ❌ Wave 0 |
| PIPE-04 | `extractKeyframe()` produces a valid JPEG from a real short test video, falls back gracefully on a video with no scene changes | integration (manual-gated) | `vitest run src/infra/video/keyframe.integration.test.ts` | ❌ Wave 0 |
| PIPE-05 | Job cleanup: temp dir is removed after a successful run AND after a simulated mid-pipeline throw | unit (mock the pipeline stages, assert `fs.rm` was called / dir doesn't exist post-run) | `vitest run src/workers/import-worker.test.ts` | ❌ Wave 0 |
| PIPE-06 | Idempotency: processing a message for a job already in `ready_for_review`/`failed` status is a no-op (doesn't re-run the pipeline) | unit (mock `ImportJobModel`, assert pipeline function not called) | `vitest run src/workers/import-worker.test.ts` | ❌ Wave 0 |
| PIPE-07 | Circuit breaker opens after threshold failures, blocks new attempts while open, resets after cooldown | unit | `vitest run src/infra/video/platform-breaker.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** fast unit suite only (exclude integration tests tagged `.integration.test.ts` — these hit real yt-dlp/ffmpeg binaries and are slow/network-dependent)
- **Per wave merge:** full suite including integration tests (requires yt-dlp/ffmpeg/Python installed in the CI or dev environment running the check)
- **Phase gate:** full suite green before `/gsd-verify-work`, PLUS a manual end-to-end run against one real URL per platform (YouTube, TikTok, Instagram) since D-08's success criteria are explicitly about real-world platform reliability, which no amount of mocked unit testing can substitute for

### Wave 0 Gaps
- [ ] Install Vitest + config (`vitest.config.ts`) — no test framework exists project-wide
- [ ] `src/infra/video/ytdlp.downloader.test.ts` — stderr classification fixtures (record real error strings during manual yt-dlp testing early in the phase, don't invent them)
- [ ] `src/infra/video/vad.test.ts` — small checked-in silent/music/speech audio fixtures (a few seconds each, keep the repo light)
- [ ] `src/infra/video/platform-breaker.test.ts` — pure state-machine unit tests, no external dependencies needed
- [ ] `src/workers/import-worker.test.ts` — idempotency + cleanup-guarantee tests with mocked `ImportJobModel` and mocked pipeline stages
- [ ] Integration test tagging convention (`.integration.test.ts` suffix or a Vitest `describe.skipIf` guard) so slow/network tests don't block fast local iteration

*(This is a substantial Wave 0 relative to the rest of the project, but justified: this phase introduces the project's first hard-to-manually-verify state machine and error-classification logic — exactly where automated tests earn their cost fastest.)*

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|----------------|---------|-------------------|
| V2 Authentication | yes | Existing Clerk `requireAuth` guard on `POST /import` — reuse unmodified, no new auth surface this phase |
| V3 Session Management | no | No new session concept introduced |
| V4 Access Control | yes | `GET /import/:jobId` must verify the requesting user owns the job (`job.userId === getUserId(req)`) — a new endpoint, so this check must be added explicitly, not assumed inherited |
| V5 Input Validation | yes | URL validation (CAP-02, `detectPlatform`/`normalizeUrl`) is itself a security control, not just a UX one — prevents SSRF-adjacent risk of the worker fetching arbitrary attacker-supplied URLs disguised as video links (see Threat Patterns below) |
| V6 Cryptography | no | No new cryptographic material introduced this phase (no new secrets beyond API keys, which follow the existing env-var pattern) |
| V12 File Handling (ASVS extended) | yes | Temp file handling (video/audio on local disk) must not be predictable/collidable across concurrent jobs — `mkdtemp` with a random suffix (as shown in Code Examples) satisfies this; never construct temp paths from raw user input (job IDs are server-generated UUIDs, not user-controlled) |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|-----------------------|
| SSRF via crafted "video URL" pointing at internal infra (e.g., `http://169.254.169.254/...` or an internal service) submitted as the import URL | Tampering / Information Disclosure | `detectPlatform()` MUST reject anything not matching the three known public platform domains BEFORE the URL ever reaches yt-dlp — yt-dlp itself will attempt to fetch whatever URL it's given, so domain allowlisting at the validation layer (not just "looks like a URL") is the actual security boundary, not just a UX nicety |
| Zip-bomb-adjacent resource exhaustion via a maliciously long/high-bitrate video URL | Denial of Service | Enforce a max-duration cap (see Open Question/Assumption A5) and rely on yt-dlp's own format selection (`format: "best[ext=mp4]/best"`) rather than always grabbing the highest-bitrate stream available; the worker's `p-queue` concurrency cap also bounds blast radius |
| Job ID enumeration on `GET /import/:jobId` exposing another user's transcript/keyframe/source metadata | Information Disclosure / Broken Access Control | Ownership check (`job.userId === requestUserId`) is mandatory on the polling endpoint — this is new attack surface this phase introduces (no existing precedent to blindly extend, unlike most of this phase's reuse) |
| Command injection via unsanitized URL passed to `child_process`/CLI args | Tampering | `youtube-dl-exec` and `execFile` (not `exec`) both take argument arrays, not concatenated shell strings — this avoids shell interpretation of the URL entirely. Do NOT switch to `child_process.exec()` (string-based) for any of this phase's shell-outs; `execFile`/`spawn` with an args array is a hard requirement, not a style preference |

## Sources

### Primary (HIGH confidence)
- Direct npm registry queries (`npm view <pkg> version/deprecated/time.created/scripts.postinstall`) for `youtube-dl-exec`, `fluent-ffmpeg`, `groq-sdk`, `p-queue`, `openai`, `@ffmpeg-installer/ffmpeg`, `sqs-consumer` — live registry data, this session
- GitHub API direct query (`api.github.com/repos/yt-dlp/yt-dlp/releases/latest`) confirming `2026.06.09` — live API data, this session
- Direct codebase inspection: `src/infra/queue/{ingest-queue,sqs.client}.ts`, `src/lambda/ingest-handler.ts`, `src/infra/images/{image.service,s3.image-store}.ts`, `render.yaml`, `Dockerfile`, `src/config/env.ts` — actual existing patterns being extended

### Secondary (MEDIUM confidence)
- [Groq Speech-to-Text docs](https://console.groq.com/docs/speech-to-text) — official vendor docs, fetched this session (file size limits, request params, verbose_json fields, pricing)
- [youtube-dl-exec on GitHub](https://github.com/microlinkhq/youtube-dl-exec) — official repo README, fetched this session (dumpSingleJson usage, Python requirement, YOUTUBE_DL_SKIP_PYTHON_CHECK)
- [fluent-ffmpeg GitHub issue #1324 "Phasing out fluent-ffmpeg"](https://github.com/fluent-ffmpeg/node-fluent-ffmpeg/issues/1324) — maintainer's own deprecation rationale
- [Render Docs: Background Workers](https://render.com/docs/background-workers) — official Render docs
- [yt-dlp GitHub issue #7143](https://github.com/yt-dlp/yt-dlp/issues/7143) — HTTP 429/error pattern community reporting
- [FFmpeg silencedetect filter docs](https://ffmpeg.org/ffmpeg-filters.html) — official ffmpeg filter reference

### Tertiary (LOW confidence)
- [Groq Whisper file-size GitHub issue (steipete/summarize#124)](https://github.com/steipete/summarize/issues/124) — community-reported silent-failure-on-large-file gotcha, not vendor-confirmed
- [PkgPulse: fluent-ffmpeg vs alternatives 2026](https://www.pkgpulse.com/blog/fluent-ffmpeg-vs-ffmpeg-wasm-vs-node-video-lib-video-processing-nodejs-2026) — third-party blog corroborating the archival, cross-checked against the primary GitHub issue
- [Decodo: YouTube Error 403](https://decodo.com/blog/youtube-error-403) — third-party blog on Cloudflare-fingerprinting-driven 403s
- Project-internal research (already HIGH confidence at project level, reused not re-verified): `.planning/research/{STACK,ARCHITECTURE,PITFALLS}.md`

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH for versions (live-verified), MEDIUM for the fluent-ffmpeg replacement pattern (correct direction, exact command flags should be spot-checked against the actual worker's ffmpeg build during implementation)
- Architecture: HIGH — directly extends already-HIGH-confidence project-level ARCHITECTURE.md patterns with concrete, codebase-grounded examples
- Pitfalls: MEDIUM — the yt-dlp anti-bot and Render cost pitfalls are time-sensitive and should be re-validated against real behavior during implementation, not treated as permanently fixed facts

**Research date:** 2026-07-01
**Valid until:** 14 days for yt-dlp/anti-bot-specific claims (explicitly fast-moving per project PITFALLS.md); 30 days for Render/Groq/package-version claims; the `fluent-ffmpeg` deprecation finding itself is stable (archival is permanent, not time-sensitive)
