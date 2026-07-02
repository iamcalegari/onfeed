# Roadmap: onFeed Import

## Overview

onFeed Import turns a pasted Instagram/TikTok/YouTube link into a trustworthy, structured recipe inside the existing onFeed app. The build order is deliberately risk-ordered, not feature-ordered: Phase 1 proves the genuinely new, highest-uncertainty piece (video download + transcription + a new Render Background Worker deployment topology) with extraction stubbed out, so infrastructure surprises surface early rather than late. Phase 2 layers in structured extraction with mandatory per-field confidence/grounding — the single highest-priority safeguard given the Core Value ("se a extração for imprecisa, nada mais importa"). Phase 3 wires up the two capture/review surfaces the pipeline needs to be usable by a human (paste-link + mandatory review-before-save). Phase 4 makes the pipeline economically safe before real volume arrives (quota reserved at submission, dedup by URL, per-stage cost telemetry) — a prerequisite, not polish. Phase 5 is purely additive: it extends the existing likes/promotion/citizenship machinery (search, macro adaptation, shopping list, cook mode) to imported recipes, gated on confidence AND likes together so the public catalog never inherits an unreviewed hallucination. Browser extension, 3-image carousel + CheffIA regeneration, and OCR are explicitly v2 — noted at the end as Future scope, not committed phases.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Video Pipeline Foundation** - ImportJob state machine + yt-dlp/ffmpeg/Whisper adapters proven end-to-end on a deployed Render Background Worker, extraction stubbed (completed 2026-07-02)
- [ ] **Phase 2: Structured Extraction & Recipe Persistence** - Claude turns transcript+caption into a confidence-graded structured recipe, persisted as the user's first private imported recipe
- [ ] **Phase 3: Capture & Mandatory Review UI** - Paste-link entry point, live status polling, and a mandatory review/edit screen before any recipe is considered saved
- [ ] **Phase 4: Cost/Quota Gating & Dedup** - Quota reserved at submission, duplicate URLs served from cache, per-stage cost telemetry live before real volume
- [ ] **Phase 5: Publish, Promotion & Full Citizenship** - Private recipe gets a shareable link, likes drive promotion (gated on confidence too), and imported recipes behave like any other recipe across search, macros, shopping list, and cook mode

## Phase Details

### Phase 1: Video Pipeline Foundation

**Goal**: Given a supported video URL, the system reliably downloads it, transcribes the audio, captures caption/metadata, extracts a representative keyframe, and cleans up after itself — tracked end-to-end by a resilient `ImportJob` state machine running on a newly deployed worker, with extraction stubbed for now.
**Depends on**: Nothing (first phase)
**Requirements**: PIPE-01, PIPE-02, PIPE-03, PIPE-04, PIPE-05, PIPE-06, PIPE-07, CAP-02
**Success Criteria** (what must be TRUE):

  1. Given a valid Instagram, TikTok, or YouTube video URL, the worker downloads the video and produces a transcript, the post caption, source metadata (platform, video URL, author handle/profile when extractable), and one representative keyframe image.
  2. Given an unsupported platform or malformed URL, submission is rejected before enqueueing with a clear, specific error (not a generic failure).
  3. An `ImportJob` document tracks the job through queued → downloading → transcribing → extracting (stub) → ready_for_review/failed, survives a duplicate/retried message without creating a second job or reprocessing (idempotency + DLQ), and no raw video/audio file remains on disk or in S3 after the job finishes.
  4. When a platform blocks or rate-limits the download, the job lands in a distinct, monitored `failed` state (not a silent hang or generic 500) — per-platform success-rate is observable, and a circuit breaker degrades gracefully instead of hammering a broken platform.
  5. A clip with no real narration (music-only/silent) is flagged as low/no-speech rather than handed to the LLM as if it were a confident transcript.

**Plans**: 6/6 plans complete
Plans:

- [x] 01-01-PLAN.md — Test infra (Vitest), env/config blocks, ImportJob model/repository/types (PIPE-06)
- [x] 01-02-PLAN.md — Pure-logic infra: ffmpeg exec wrapper, silencedetect VAD, keyframe extractor, circuit breaker (PIPE-02/04/07)
- [x] 01-03-PLAN.md — yt-dlp downloader + failure classification, Groq→OpenAI transcription fallback (PIPE-01/02/03)
- [x] 01-04-PLAN.md — Import module: CAP-02 validation/SSRF allowlist, enqueue producer, ownership-scoped routes, README (CAP-02/PIPE-06)
- [x] 01-05-PLAN.md — import-worker: sqs-consumer loop, pipeline orchestration, two-layer cleanup, idempotency (PIPE-01..07)
- [x] 01-06-PLAN.md — Deploy: Dockerfile.import-worker, render.yaml worker block, SQS queue+DLQ, infra/video README (PIPE-06/07)

### Phase 2: Structured Extraction & Recipe Persistence

**Goal**: The transcript + caption produced by Phase 1 becomes a structured, canonicalized, searchable recipe — and every field is honest about whether it was stated in the source or inferred, with low-confidence extractions routed to mandatory review rather than published silently.
**Depends on**: Phase 1
**Requirements**: EXT-01, EXT-02, EXT-03, EXT-04, EXT-05
**Success Criteria** (what must be TRUE):

  1. Given a transcript + caption, Claude extracts title, ingredients with quantity + unit, ordered steps, and tips into a structured recipe.
  2. Every extracted field (each ingredient, each step) carries a confidence/grounding signal distinguishing "stated in transcript/caption" from "inferred by the model" — ambiguous quantities (e.g. "a pinch," "to taste") are preserved as-is rather than forced into a fabricated number.
  3. Extracted ingredients pass through the existing canonicalization pipeline (exact → semantic → pending match) with no parallel/duplicate matching logic.
  4. The persisted recipe has a Voyage embedding and is retrievable through the existing hybrid I/E/T/N search for the importing user.
  5. When overall extraction confidence is low (sparse/conflicting transcript vs. caption, many ungrounded fields), the job is explicitly marked as requiring review — it is structurally impossible for this state to auto-publish.

**Plans**: 4/5 plans executed

- [x] 02-01-PLAN.md
- [x] 02-02-PLAN.md
- [x] 02-03-PLAN.md
- [x] 02-04-PLAN.md
- [ ] 02-05-PLAN.md

**Research flag**: yes — PT-BR Whisper transcription accuracy on cooking slang/informal register needs empirical validation against real onFeed sample clips before locking in a transcription provider default (see research/SUMMARY.md Research Flags).

### Phase 3: Capture & Mandatory Review UI

**Goal**: A user can paste a video link from their phone or desktop, watch the import progress in real terms (not a generic spinner), and must explicitly review and confirm the extracted recipe — correcting anything flagged as inferred — before it is treated as saved.
**Depends on**: Phase 2
**Requirements**: CAP-01, REV-01, REV-02, REV-03, REV-04
**Success Criteria** (what must be TRUE):

  1. A user can paste a supported video URL into the app and start an import; the request returns immediately (job enqueued, not processed inline) and the UI polls/reflects per-stage progress.
  2. Once extraction finishes, the user is shown a review/edit screen with the extracted title, ingredients (quantity/unit), steps, and tips — not a silent redirect to a "done" state.
  3. Fields flagged as inferred (vs. explicitly stated) are visually distinguished in the review screen so the user knows what to double-check.
  4. The user can edit any field (title, ingredients incl. quantity/unit, steps, tips) inline before confirming.
  5. The recipe is only considered valid/saved after the user explicitly confirms the review — there is no code path that treats an unconfirmed extraction as final.

**Plans**: TBD
**UI hint**: yes

### Phase 4: Cost/Quota Gating & Dedup

**Goal**: Import volume is economically safe before it is exposed to real usage — quota can't be burned past the free tier by retries or concurrent submissions, duplicate URLs don't re-run the expensive pipeline, and every stage's cost is visible.
**Depends on**: Phase 1 (queue/job model must exist to gate at submission)
**Requirements**: CAP-03, COST-01, COST-02, COST-03
**Success Criteria** (what must be TRUE):

  1. Submitting a URL that was already imported (normalized match, by this user or platform-wide within the caching window) returns the existing result instead of re-running download/transcribe/extract.
  2. Free-tier daily import quota is reserved atomically at submission time (not at completion), so retried/duplicated jobs or rapid concurrent submissions cannot spend past the daily limit before the gate notices.
  3. Each completed job has a recorded cost breakdown by stage (download/bandwidth, ASR minutes, LLM tokens, embedding) — visible for at least basic operational review, not only discoverable via the monthly invoice.
  4. A free-tier user can import within their daily quota at no charge; exceeding the quota (or requesting future PRO-gated enrichment) is blocked with a clear message pointing at the existing PRO entitlement, reusing `isProUser()`/`consumeDailyAdaptQuota()`-style patterns rather than new billing logic.

**Plans**: TBD

### Phase 5: Publish, Promotion & Full Citizenship

**Goal**: An imported recipe is a first-class citizen of onFeed — privately owned and shareable from the moment it's confirmed, properly credited to its creator, promotable to the public catalog only when both trusted (confidence) and liked, and usable everywhere any other recipe is usable (macros, shopping list, cook mode, search).
**Depends on**: Phase 2, Phase 3
**Requirements**: SOC-01, SOC-02, SOC-03, SOC-04, SOC-05, RCP-01, RCP-02, RCP-03, RCP-04
**Success Criteria** (what must be TRUE):

  1. A confirmed imported recipe starts private in the importing user's book, and has a shareable link that lets anyone who opens it view the recipe and like it (without requiring them to import it themselves).
  2. The recipe page displays creator attribution (author handle, profile link, source video link) whenever those were extractable — never the re-hosted video itself.
  3. Once a private imported recipe reaches +5 likes AND meets the extraction confidence bar, it is promoted to a public catalog variant via the existing `promoteToVariant()` path, widened to recognize `source: "imported"`; a low-confidence recipe cannot be promoted by likes alone.
  4. The promoted public variant retains credit to both the original creator and the importing user (`createdBy[]`).
  5. An imported recipe can be macro-adapted (`adaptRecipe`), contributes missing ingredients to the shopping list, runs in step-by-step cook mode with timers, and appears in search/swipe results with an I/E/T/N match score — identically to any other recipe in the catalog.

**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Video Pipeline Foundation | 6/6 | Complete   | 2026-07-02 |
| 2. Structured Extraction & Recipe Persistence | 4/5 | In Progress|  |
| 3. Capture & Mandatory Review UI | 0/TBD | Not started | - |
| 4. Cost/Quota Gating & Dedup | 0/TBD | Not started | - |
| 5. Publish, Promotion & Full Citizenship | 0/TBD | Not started | - |

## Future / v2 (Not in This Roadmap)

Deferred per PROJECT.md and REQUIREMENTS.md — tracked, but intentionally out of the committed phases above. Revisit as a follow-up milestone once "paste link → trustworthy recipe" is validated:

- **Browser extension capture** (EXTN-01..03) — one-click import from the IG/TikTok/YouTube tab; needs its own auth-handoff mini-spec (short-lived token exchange, not raw Clerk session storage) before UI work begins.
- **3-image carousel + CheffIA regeneration** (IMG-01..03) — extend the single best-keyframe (Phase 1) to 3 keyframes, user-editable and regenerable via the existing Bedrock/Stability `ImageGenerator`.
- **OCR enrichment, PRO-gated** (PRO-01..02) — Claude vision on sampled frames to reconcile on-screen text with audio+caption; increases confidence but adds cost, reserved for PRO.
- **Native/Web Share Target capture** (SHARE-01..02) — requires an installed PWA base that doesn't exist yet; Android Web Share Target and iOS native share sheet both deferred.
- **Timestamp-linked steps** (TS-01) — cheap byproduct of Whisper segments, not core to the trust loop.
- **Human review-queue for failed extractions** (MOD-01) — operationally expensive, unjustified before real import volume exists.

## Notes for Planning

- **Phase 1 needs phase-research** before/during planning: yt-dlp anti-bot behavior and egress/proxy strategy for IG/TikTok from Render/AWS IPs, and exact Render Background Worker packaging (Python + ffmpeg + yt-dlp base image) — both are fast-moving, LOW-MEDIUM confidence areas per research/SUMMARY.md and research/STACK.md.
- **Phase 2 needs phase-research** before/during planning: empirical validation of PT-BR Whisper transcription quality (cooking slang, informal register, kitchen background noise) against real onFeed sample clips before defaulting to Groq vs. OpenAI Whisper.
- **Phases 3, 4, 5 follow standard, already-proven codebase patterns** (Fastify route/service/repository convention, `consumeDailyAdaptQuota`-style quota, `LikeModel`/`promoteToVariant()`) — no dedicated research phase expected, per research/SUMMARY.md.
- Structural risks that must be designed in from Phase 1 onward, not retrofitted: (1) download reliability/platform anti-bot as an ongoing operating condition (circuit breaker + per-platform telemetry), (2) extraction confidence + mandatory review gate as the Core Value safety net (Phase 2/3), (3) cost/quota/dedup as a prerequisite gate (Phase 4, sequenced before the pipeline is exposed to real volume).
- New deployable: `src/workers/import-worker.ts` on a Render Background Worker (not Lambda — Python/native-binary toolchain + variable-duration jobs exceed Lambda's 15-minute ceiling). New infra namespace: `src/infra/video/*` (downloader, transcription, keyframes, OCR ports). New module: `src/modules/import/*` following the existing `types → model → repository → routes → service` convention.
