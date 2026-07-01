# Project Research Summary

**Project:** onFeed Import
**Domain:** Video-to-recipe extraction pipeline (social video scraping + ASR + LLM structured extraction), added as a subsequent milestone to an existing TypeScript/Fastify/MongoDB recipe app
**Researched:** 2026-07-01
**Confidence:** MEDIUM

## Executive Summary

onFeed Import turns a pasted Instagram/TikTok/YouTube link into a trustworthy, structured recipe. All four research tracks converge on the same shape: `yt-dlp` (via a Node wrapper) is the only credible universal downloader for the three target platforms, hosted Whisper (Groq, cheapest/fastest) handles transcription, and Claude -- already wired into the app for structured extraction -- turns transcript+caption(+OCR) into title/ingredients/steps. Roughly 80% of the pipeline is reuse: ingredient canonicalization, Voyage embeddings, the `ImageGenerator`/Bedrock port, S3 storage, the SQS async-job pattern, the like-based private-to-public promotion mechanic, and the PRO quota/entitlement system all extend directly from existing code. The genuinely new surface is narrow: a downloader/transcription/keyframe adapter layer, an `ImportJob` state machine, and -- critically -- a dedicated worker deployment target, because `yt-dlp`/`ffmpeg`/Whisper are Python/native-binary dependencies that don't fit the existing pure-Node Lambda ingest pattern.

The recommended approach: stand up a new Render Background Worker (Docker, same deploy muscle memory as the existing API service) rather than forcing this workload into Lambda, which has a hard 15-minute timeout and painful Python/native-binary packaging story. Sequence the build to de-risk the least-familiar, highest-uncertainty piece first -- get one video through download-transcribe-keyframes-deployed-worker before investing in extraction quality -- since everything downstream of that is applying well-understood patterns already proven in the existing ingest pipeline.

The dominant risk, repeated across all four research files, is not "will we build this" but "will this stay working and stay trustworthy." Platform anti-bot measures (IG/TikTok rotate defenses every few weeks; datacenter IPs get flagged) make download reliability a structural, ongoing operational concern, not a one-time integration task -- it needs a circuit breaker and per-platform monitoring from day one. Separately, and more importantly given the Core Value ("se a extracao for imprecisa, nada mais importa"), LLM extraction from lossy ASR/caption input will hallucinate plausible-but-wrong ingredients and quantities unless the schema forces per-field confidence/grounding and a mandatory human-review gate sits before any recipe -- especially any recipe eligible for public promotion via the existing +5-likes mechanic. Cost/dedup gating (quota reserved at submission, not completion; dedupe by source URL) is a prerequisite that must land alongside or before the download phase, not as later hardening -- async pipelines make it easy to spend money before quota logic ever notices.

## Key Findings

### Recommended Stack

The new pipeline layers on top of the existing TypeScript/Fastify/MongoDB(Mongoat)/Voyage/Claude/Next.js/AWS stack without introducing a new framework. Legal framing matters here: `yt-dlp` itself is legal, but using it against IG/TikTok/YouTube likely violates their ToS (civil/contract risk, not criminal) -- this is why the pipeline must never re-host source video and must treat download breakage as a structural operating condition, not an edge case.

**Core technologies:**
- `yt-dlp` (binary) via `youtube-dl-exec` (npm) -- the only tool that covers download for IG/TikTok/YouTube with one engine; pin version, auto-update weekly
- `ffmpeg` via `fluent-ffmpeg` -- audio extraction for ASR + keyframe extraction for the carousel; no real alternative
- Groq-hosted `whisper-large-v3-turbo` via `groq-sdk` -- primary transcription; cheapest/fastest hosted Whisper option (verify PT-BR accuracy empirically; OpenAI Whisper as fallback at ~9x cost)
- Claude vision (existing SDK) on 1-3 sampled frames -- OCR of on-screen text (PRO) and structured recipe extraction; reuses the SDK/key/pattern already paid for
- `p-queue` -- concurrency limiter in the worker to cap per-platform concurrent downloads and reduce anti-bot flagging

**Do NOT use:** `tesseract.js` as primary OCR (worse accuracy than LLM vision on stylized text, still needs an LLM cleanup pass anyway); Lambda zip layers with `pip install` done off-target-OS (manylinux ABI mismatch trap); permanent video storage "for debugging" (undermines the no-rehost legal posture and multiplies storage cost for zero product value).

### Expected Features

**Must have (table stakes):** paste-link import across all three platforms; structured fields (title, ingredients w/ quantity+unit, ordered steps) at a non-negotiable quality bar; visible import states (importing/needs-review/failed); mandatory pre-save review/edit screen (no competitor auto-saves social-video extractions without review); at least one thumbnail image; source attribution (creator handle + profile + video link); graceful, specific failure messaging.

**Should have (differentiators):** full I/E/T/N citizenship for imported recipes (competitors treat imports as inert personal-cookbook cards -- onFeed makes them searchable/macro-adaptable/shopping-list-ready immediately, the actual "why onFeed" answer); private-to-public promotion via +5 likes (no competitor has a social/virality loop on imports); confidence-flagged low-certainty fields; multi-image carousel with CheffIA regeneration; OCR of on-screen text (PRO, rare among competitors); creator attribution as a real discovery surface, not just a footnote.

**Defer (v2+):** Web Share Target/native share sheet (needs an installed PWA base that doesn't exist yet); recipe-steps-linked-to-video-timestamps (cheap later, not core now); human-fallback review queue for failed imports (operationally expensive, unjustified pre-volume). Correctly out of scope per PROJECT.md and confirmed by research: re-hosting video, arbitrary blog/URL import, conversational chatbot, delivery-affiliate deeplinks, auto-save without review.

### Architecture Approach

A clean **capture/pipeline separation**: thin capture adapters (pasted-link route, browser extension route, future share-target) all converge on one `enqueueImportJob()` call that validates the platform, dedupes by URL, creates an `ImportJob` Mongo document, and enqueues to a new SQS queue -- mirroring the existing `enqueueIngestJob()` discipline exactly. The heavy work (download -> transcribe -> extract keyframes -> Claude structured extraction -> canonicalize/embed (reused) -> persist private Recipe) runs in a **new long-running worker process, not Lambda**, because `yt-dlp`/Whisper/ffmpeg are Python/native-binary dependencies Lambda's Node runtime and 15-minute timeout are a poor fit for. A `Recipe` doc gains `visibility`, `images[]` (with provenance: keyframe/generated/upload), and `sourceVideo` fields; the existing `LikeModel`/`promoteToVariant()` mechanism is reused verbatim, just widened to recognize `source: "imported"`.

**Major components:**
1. `src/modules/import/` -- job model, repository, routes, service, extraction, recipe-mapping -- follows the exact existing module convention
2. `src/infra/video/` -- new port+adapter namespace (downloader, transcription, keyframes, OCR) mirroring the existing `embeddings/`/`images/` port pattern
3. `src/workers/import-worker.ts` -- new deployable, distinct from both `server.ts` and `src/lambda/`, deployed as a Render Background Worker
4. Review/Edit frontend (`web/app/(main)/import/`) -- polls `GET /import/:jobId`, hydrates the review screen once `ready_for_review`

### Critical Pitfalls

1. **Treating yt-dlp as a stable dependency** -- platforms rotate anti-bot defenses every 2-4 weeks; without a weekly auto-update job + per-platform circuit breaker + success-rate telemetry, imports silently degrade and look like an app bug.
2. **Silently publishing low-confidence extractions (the Core Value risk)** -- LLMs fill gaps with plausible-sounding invented content unless the schema forces per-field confidence/grounding; low-confidence imports must route to mandatory review, and must never bypass a confidence gate on the way to public (+5-likes) promotion.
3. **Whisper hallucinating on music-only/low-speech clips** -- short-form Reels often have little real narration; Whisper can fabricate confident-sounding text over silence/music, poisoning extraction input before the LLM step even runs. Needs a VAD pre-filter and explicit transcript-vs-caption conflict surfacing.
4. **Cost stacking silently past free-tier economics** -- the pipeline's cost is a stack (bandwidth, ASR, LLM extraction, embedding, optional OCR/image-gen), and async decoupling makes it easy to spend before quota checks catch up; dedupe by source URL and reserve quota atomically at submission, not completion.
5. **Async job retries causing duplicates** -- SQS/Lambda's at-least-once delivery combined with the codebase's known lack of idempotency/DLQ on the sibling ingest queue means this gap will be copied in unless explicitly fixed: dedup key + DLQ + `ReportBatchItemFailures` from the start.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Video Pipeline Foundation (download, transcribe, keyframes, worker deployment)
**Rationale:** This is the least-familiar, highest-uncertainty piece -- binary packaging, platform anti-bot behavior, and a genuinely new deployment topology (Render worker, not Lambda). De-risking it first means everything after is applying proven patterns.
**Delivers:** `ImportJob` state machine; `src/infra/video/*` adapters (yt-dlp, ffmpeg keyframes, Whisper) proven standalone; a deployed Render Background Worker polling a new SQS queue and advancing job status end-to-end (extraction stubbed).
**Addresses:** Paste-link import backend (table stakes), import status UI states.
**Avoids:** Pitfall 1 (yt-dlp fragility -- circuit breaker + update cadence built in from the start, not bolted on), Pitfall 7 (Lambda timeout -- avoided structurally by choosing the worker topology), Pitfall 6 (async duplicate jobs -- idempotency/DLQ designed in at the queue's inception).

### Phase 2: Structured Extraction & Recipe Persistence
**Rationale:** Once transcript+caption data flows reliably from Phase 1, extraction is a prompt/quality problem, not an infra problem -- matches the codebase's proven `recipe.extraction.ts`/`persistExtractedRecipe()` pattern.
**Delivers:** `import.extraction.ts` (Claude, transcript+caption -> structured recipe with per-field confidence/grounding), `import.recipe-mapping.ts` wired through existing canonicalization/embedding, `Recipe` schema additions (`visibility`, `images[]` with provenance, `sourceVideo`), first end-to-end private imported recipe.
**Uses:** Existing `anthropic.client.ts`, zod structured-output pattern, `resolveCanonicalForIngestion()`, Voyage embeddings (all reused unmodified).
**Implements:** Extraction service + Recipe persistence components from ARCHITECTURE.md.
**Avoids:** Pitfall 3 (silent hallucination -- the single highest-priority pitfall given Core Value; confidence/grounding schema must ship here, not retrofitted), Pitfall 4 (Whisper hallucination -- VAD pre-filter and transcript/caption conflict surfacing belongs in this phase's input handling).

### Phase 3: Capture Surfaces & Review UI (paste-link route, mandatory review screen)
**Rationale:** Needs a working pipeline (Phases 1-2) to enqueue into and a `ready_for_review` state to build the review screen against.
**Delivers:** `POST /import` route, import status polling UI, mandatory pre-save review/edit screen with inferred-vs-stated field flagging.
**Addresses:** Table-stakes features (visible import states, pre-save review, graceful failure messaging, thumbnail/image floor, source attribution).
**Avoids:** Pitfall 3's UX corollary (no silent auto-publish), general UX pitfalls (generic spinner, undifferentiated review wall).

### Phase 4: Cost/Quota Gating & Dedup
**Rationale:** PROJECT.md and PITFALLS.md both flag this as a prerequisite gate, not polish -- must land before or alongside real usage, since async decoupling makes retroactive gating expensive to fix (duplicate charges, runaway cost).
**Delivers:** Quota reserved atomically at submission (not completion); dedupe-by-normalized-source-URL (serves cached result instead of re-running the pipeline); per-stage cost telemetry (download bandwidth, ASR minutes, LLM tokens, embedding, image-gen); free-tier daily import quota reusing `consumeDailyAdaptQuota` pattern.
**Avoids:** Pitfall 5 (cost stacking) and its Performance Trap corollary (no-dedupe economics breaking the moment one video goes viral inside onFeed's own user base).

### Phase 5: Publish, Promotion & Full Citizenship
**Rationale:** Purely additive to existing likes machinery; lowest architectural risk of all phases -- extend rather than invent.
**Delivers:** Private recipe + shareable link; `maybePromote()` guard widened to `source: "imported"`, gated on confidence AND like threshold (not likes alone); full I/E/T/N indexing, macro adaptation, shopping-list integration confirmed working on imported recipes (should already work via Phase 2's reuse, this phase verifies/closes gaps).
**Addresses:** Differentiator features (full I/E/T/N citizenship, private-to-public promotion loop).
**Avoids:** Pitfall 9 (spam/low-quality imports polluting the public catalog via likes alone -- confidence gate must sit alongside the like-count gate).

### Phase 6: Multi-Image Carousel, Browser Extension, PRO Enrichment (OCR)
**Rationale:** Per FEATURES.md's MVP definition, these are v1.x "add after validation" items -- accelerants and monetization layers, not validators of the core import-to-trust loop. Sequenced last per both FEATURES.md and ARCHITECTURE.md's build order (PRO gating layers on last, "every prior step should work in a free tier, basic quality mode first").
**Delivers:** 3-keyframe carousel with CheffIA regeneration; browser extension (Manifest V3, scoped `host_permissions`, short-lived auth handoff token -- not raw Clerk session storage); OCR of on-screen text gated to PRO.
**Addresses:** Differentiator features (carousel, OCR); browser extension capture surface.
**Avoids:** Pitfall 8 (extension auth handoff becoming its own project -- treat as a mini-spec before extension UI work begins).

### Phase Ordering Rationale

- **Infra risk before quality risk before polish:** the video download/worker-deployment topology is genuinely new to this stack (no Python/native-binary precedent in production) and is the piece most likely to reveal unknown unknowns -- proving it first prevents late-phase architecture surprises. Extraction quality, by contrast, is a well-trodden pattern (identical shape to existing `recipe.extraction.ts`) and can be iterated safely once the data is flowing.
- **Trust/safety gates (confidence scoring, quota/dedup) are sequenced as prerequisites, not enhancements** -- both PROJECT.md's Core Value statement and PITFALLS.md independently converge on this: an inaccurate recipe or a runaway cost bill is worse than a missing feature, so these gates must exist before the pipeline is exposed to real volume, not added retroactively.
- **Differentiators and monetization (carousel, extension, OCR) come after the core loop is proven**, directly following FEATURES.md's MVP Definition (`Launch With` vs `Add After Validation`) -- this avoids over-investing in polish before "paste link -> trustworthy recipe" is validated as the core value proposition.
- **Promotion/virality (Phase 5) depends on but does not block MVP usability** -- a private, reviewable, fully-cited imported recipe is valuable standalone; the +5-likes public loop is additive and can follow once private-import volume exists to promote from.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 1 (Video Pipeline Foundation):** yt-dlp anti-bot behavior, egress/proxy strategy for IG/TikTok from AWS/Render IPs, and exact Render Background Worker packaging (Python+ffmpeg+yt-dlp base image) all need validation against current platform behavior at implementation time -- this is explicitly the most time-sensitive, fastest-changing domain in the research (STACK.md and PITFALLS.md both flag confidence as LOW-MEDIUM here).
- **Phase 2 (Structured Extraction):** PT-BR Whisper transcription quality (cooking slang, informal register, kitchen background noise) needs empirical validation against real onFeed sample clips before locking in Groq vs. OpenAI Whisper as the default -- published WER benchmarks are English-centric and don't cover this use case.
- **Phase 6 (Browser Extension):** MV3 extension-to-Clerk auth handoff pattern is an architectural recommendation, not a documented onFeed-specific precedent -- worth a focused mini-spec/research pass before extension UI work begins.

Phases with standard patterns (skip research-phase):
- **Phase 3 (Capture Surfaces & Review UI):** Directly mirrors existing `enqueueIngestJob()`/Fastify route conventions -- no new pattern to discover.
- **Phase 4 (Cost/Quota Gating):** Extends `consumeDailyAdaptQuota`/entitlement patterns already proven in the codebase.
- **Phase 5 (Publish, Promotion & Citizenship):** Purely additive extension of existing `LikeModel`/`promoteToVariant()` and search/macro/shopping-list integration -- well-understood existing code paths.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM | Core tool choices (yt-dlp, ffmpeg, Claude reuse) are HIGH confidence and stable; pricing/latency claims for Groq Whisper and OCR quality comparisons are LOW-MEDIUM (web-search-sourced, third-party benchmarks, not independently verified) |
| Features | MEDIUM | Cross-confirmed across multiple competitor sources (ReciMe, Mealie/Tandoor, Preplo, FoodiePrep); no primary platform ToS/legal docs consulted directly |
| Architecture | HIGH (existing patterns) / MEDIUM (new deployment topology) | Directly grounded in actual codebase inspection for reuse patterns; the Render-worker-vs-Lambda-vs-Fargate reasoning is sound architectural inference but not validated against current exact AWS Lambda packaging limits in this research pass |
| Pitfalls | MEDIUM | Broadly corroborated across independent sources but web-search only (no curated/primary docs provider available this run); anti-bot behavior specifically changes every few weeks and should be spot-checked at implementation time |

**Overall confidence:** MEDIUM

### Gaps to Address

- **Groq Whisper PT-BR accuracy on real cooking-slang audio:** not empirically verified -- validate with actual onFeed sample clips early in Phase 2, before committing budget/defaulting the provider.
- **Exact current Lambda packaging limits (container image size, layer limits) if Lambda is reconsidered later:** not verified live in this research pass -- treat Render-worker recommendation as the default path; only re-verify AWS specifics if the team revisits Lambda.
- **Legal/ToS exposure at scale:** flagged explicitly as "not legal advice" in STACK.md -- if PRO revenue or import volume grows materially, a real legal review of ToS/copyright exposure is warranted before wide launch, not assumed safe from this research.
- **Egress/IP strategy for Instagram/TikTok from Render/AWS IPs:** PITFALLS.md flags that datacenter IPs get flagged by IG/TikTok; whether a residential/mobile proxy or managed extraction API is needed (and its cost) is not resolved here -- needs a concrete test against real Render egress IPs during Phase 1.
- **iOS Web Share Target support:** explicitly noted as unverified/lagging in STACK.md -- irrelevant until that phase is picked up (v2+), but flag for re-verification then.

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection: `src/modules/recipes/recipe.ingestion.ts`, `recipe.extraction.ts`, `recipe.model.ts`, `src/lambda/ingest-handler.ts`, `src/infra/queue/*`, `src/infra/images/image.service.ts`, `src/modules/likes/like.repository.ts`, `src/modules/usage/usage.repository.ts`, `render.yaml`, `Dockerfile`
- `.planning/PROJECT.md`, `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/STRUCTURE.md`, `.planning/codebase/CONCERNS.md`
- yt-dlp GitHub releases (direct API query) -- version confirmation
- npm registry direct queries for youtube-dl-exec, fluent-ffmpeg, groq-sdk, tesseract.js, openai, ffmpeg-static

### Secondary (MEDIUM confidence)
- Official Groq blog (Whisper large-v3-turbo availability)
- MDN / Chrome for Developers docs (Web Share Target API)
- AWS official docs (Lambda Python layers, async event processing, idempotency with Lambda Powertools)
- Chrome for Developers (MV3 program policies)
- Competitor product docs/help pages: ReciMe, Mealie, Tandoor, Preplo, FoodiePrep, Cookpad

### Tertiary (LOW confidence -- flagged for validation)
- Groq vs. OpenAI Whisper third-party benchmark (dev.to) -- cost/latency figures, recommend re-verifying against groq.com/pricing
- Claude vision OCR quality claims (third-party blog)
- yt-dlp legal/ToS framing sources (not legal advice)
- PT-BR Whisper WER community benchmark (Hugging Face model card)
- Lambda Python packaging ABI-mismatch blog post

---
*Research completed: 2026-07-01*
*Ready for roadmap: yes*
