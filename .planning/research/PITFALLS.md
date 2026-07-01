# Pitfalls Research: onFeed Import

**Domain:** URL-to-structured-recipe import pipeline (social video scraping + ASR + LLM extraction) for an existing recipe app
**Researched:** 2026-07-01
**Confidence:** MEDIUM (web search only — no Context7/curated docs provider was available this run; findings are broadly corroborated across multiple independent sources but should be re-verified against yt-dlp/Whisper/AWS official docs at implementation time, especially anything with a "changes every few weeks" characteristic like anti-bot behavior)

## Critical Pitfalls

### Pitfall 1: Treating yt-dlp as a stable, "install once" dependency

**What goes wrong:**
The download step is architected as a thin wrapper around yt-dlp, assumed to keep working like any other library dependency. Weeks later, Instagram or TikTok imports start silently failing or return empty/wrong media, and the team scrambles to debug what looks like an app bug but is actually upstream breakage.

**Why it happens:**
Instagram rotates its internal GraphQL `doc_id` values roughly every 2-4 weeks as a deliberate anti-scraping measure; TikTok runs some of the most aggressive anti-bot fingerprinting of any major platform and blocklists datacenter IP ranges (AWS, GCP — i.e., exactly where this backend runs) on sight. yt-dlp is actively maintained and usually patches within days, but "days" is not "zero," and a pinned/stale yt-dlp version won't get the fix automatically. This is explicitly called out as a central risk in `PROJECT.md` ("casos de borda de download são risco de confiabilidade central").

**How to avoid:**
- Pin yt-dlp but add a scheduled job (weekly) that checks for and applies updates, with a smoke test against one known-good URL per platform before promoting.
- Never call yt-dlp/download logic directly from request-handling code running on AWS IPs without an egress strategy — expect to need a residential/mobile proxy or an allowlisted egress path for IG/TikTok specifically (YouTube is comparatively more tolerant of datacenter IPs but still enforces "confirm you're not a bot" challenges).
- Wrap the download step in a circuit breaker per platform: if failure rate for a platform crosses a threshold in a rolling window, degrade to "paste caption manually" instead of hard-failing the whole import.
- Track per-platform success rate as a first-class metric from day one (ties to the existing "no monitoring/observability" gap noted in `CONCERNS.md`).

**Warning signs:**
- Download success rate for one platform drops while others stay stable (platform-specific breakage, not infra-wide).
- Error logs show HTTP 403/429 clustering in short windows (anti-bot rate limiting, not random failure).
- Support/user reports mention "Instagram import stopped working" days apart from a yt-dlp release note about IG changes.

**Phase to address:** Download/capture phase (build the circuit breaker and update-check job as part of the pipeline, not bolted on later)

---

### Pitfall 2: Confusing "yt-dlp is legal" with "our usage is risk-free"

**What goes wrong:**
The team either over-blocks the feature out of legal fear, or under-thinks it and builds a workflow that inadvertently re-distributes creator media, exposing the product to takedowns/account bans on the platforms it depends on.

**Why it happens:**
The legal reality is nuanced and easy to oversimplify: yt-dlp itself is legal (EFF successfully defended it; it has substantial non-infringing uses). Downloading a video for **transformation into structured data you don't redistribute** (extracting ingredients/steps, not re-serving the video) is meaningfully lower-risk than **re-hosting or re-uploading** the original media — which is where most real DMCA/enforcement action actually lands. Platform ToS violations (most platforms' ToS technically prohibit downloading at all) are a separate axis from copyright infringement — a ToS violation risks *your account/IP being rate-limited or banned*, not necessarily a lawsuit.

**How to avoid:**
- The `PROJECT.md` decision to never re-host the source video is exactly the right call — keep it as a hard architectural constraint, not a "nice to have." Enforce it at the storage layer: no video/audio bytes should persist beyond the transient processing window needed to transcribe/extract frames.
- Auto-delete downloaded video/audio files immediately after transcription + keyframe extraction succeed (define a max TTL, e.g., delete within the same job, not "eventually via cron").
- Always store and display: creator handle, profile link, source video URL — this is already an Active requirement; treat it as the legal/ethical mitigation it actually is, not just a UX nicety.
- Document internally (even a short ADR) the stance: "we download transiently to derive facts; we do not redistribute media; we attribute the source." This becomes the answer if a platform or creator ever complains.

**Warning signs:**
- Any code path that serves the original downloaded video/audio file back to a client (even for debugging/preview) — this crosses from "transient derivation" into "redistribution."
- Frames/thumbnails extracted from video that include visible platform watermarks or the creator's face/logo used as the *primary* recipe image without an alternative (CheffIA-generated) option.

**Phase to address:** Download/capture phase (delete-after-use policy) and Publish phase (attribution UI is mandatory, not optional)

---

### Pitfall 3: Silently publishing low-confidence extractions (the Core Value risk)

**What goes wrong:**
This is explicitly called out in `PROJECT.md`: "Se a extração for imprecisa, nada mais importa." An LLM extracting a recipe from a noisy transcript + caption will sometimes invent a plausible-sounding but wrong ingredient, miss a step mentioned only visually (no narration), guess a quantity when the creator said "a bit" or "to taste," or default to the wrong measurement system. If these are written straight into a `Recipe` document with no confidence signal, users get a recipe that looks complete and correct but silently isn't — and worse, if it later gets promoted to a public variant via the +5-likes mechanism, a wrong recipe becomes discoverable catalog content.

**Why it happens:**
LLMs asked to "extract the recipe" from an imperfect transcript will fill gaps with the statistically likely answer rather than admitting uncertainty, unless explicitly instructed and structured to do otherwise. This is compounded here because the input itself is lossy (ASR errors, someone talking fast over B-roll, ingredients only shown as on-screen text/OCR which is gated to PRO-only in the MVP) — meaning the *free tier* extraction has strictly less signal than the eventual PRO/OCR-enhanced one, so free-tier hallucination risk is structurally higher, not lower.

**How to avoid:**
- Extend the recipe extraction schema (reuse the existing Zod-structured-output pattern from `recipe.extraction.ts`) to require the LLM to emit a **per-field confidence** or at minimum a binary `sourceGrounded: boolean` per ingredient/step — i.e., force the model to distinguish "explicitly stated in transcript/caption" from "inferred."
- When overall confidence is low (e.g., many ungrounded fields, or transcript was near-empty), route the recipe into a **mandatory human-review / edit-before-save state** rather than auto-publishing to the user's private book. The existing `generated_pending` state pattern is the natural fit — reuse it, don't invent a new status.
- Never auto-promote a low-confidence import straight into the +5-likes public promotion path; confidence gating should sit *before* the private→public promotion trigger, not just at creation.
- For ambiguous quantity phrases ("a pinch," "to taste," "a splash"), do not force a numeric conversion — preserve the qualitative phrase as a valid ingredient amount (the app's own quantity+unit work — `formatIngredientLabel` — already needs to support non-numeric display; make sure this pipeline doesn't fight that by inventing a fake number to satisfy a strict schema).
- Show the user, in the review UI, which fields came from audio vs. caption vs. were inferred — this builds trust and gives the user an actual editing signal instead of a wall of text to blindly trust.

**Warning signs:**
- Extraction schema has no way to represent "unknown" or "not stated" — every field is a required string/number, forcing invention.
- QA sampling of imported recipes shows ingredients that never appear in the transcript or caption.
- User edit rate on imported recipes is very high right after import (signal that first-pass extraction is routinely wrong) but there's no telemetry to see it.

**Phase to address:** Extraction phase (schema + confidence design) and Review/publish phase (gating logic) — this is the single highest-priority pitfall given it's the stated Core Value

---

### Pitfall 4: Whisper hallucinating on music-only or low-speech clips

**What goes wrong:**
Many recipe Reels/TikToks/Shorts have music-only intros, B-roll with no narration, or narration that's mostly "let's get started!" with the actual ingredient list only shown as on-screen text (OCR territory, PRO-gated). Whisper doesn't reliably say "no speech here" — it can hallucinate plausible-sounding sentences over silence or music, *with high confidence scores*, because some training data paired music segments with arbitrary captions. This means the transcript itself can contain fabricated content before the LLM extraction step even runs, silently poisoning the input to Pitfall 3.

**Why it happens:**
Whisper's `no_speech_prob` and average log-probability are both often unreliable signals precisely on the hallucinated segments — the classic detection heuristic (low avg-logprob + high no_speech_prob = discard) frequently fails to catch hallucinations, because they get generated with *high* confidence. Short clips (15-30s, common for Reels) are especially prone since there's less real speech to anchor the model.

**How to avoid:**
- Run voice activity detection (VAD) as a pre-filter before sending audio to Whisper — segments with no detected speech energy should be marked as `no_narration` rather than transcribed at all, rather than trusting Whisper's internal silence handling.
- Treat "Music" or repeated short fragments as a signal to fall back to caption-only extraction, not to trust the transcript.
- Cross-check: if the transcript disagrees with the caption on a key fact (e.g., transcript says "add sugar," caption says nothing about sugar, or vice versa), surface this as a lower-confidence extraction rather than silently picking one source.
- Don't treat "Whisper returned text" as "Whisper returned true narration" — always pipe transcript + caption + (PRO: OCR) as separately labeled inputs to the extraction LLM, and instruct it explicitly to flag conflicts rather than merge silently.

**Warning signs:**
- Transcripts consisting mostly of repeated single words/phrases ("Music," "Thank you," "Wow") — a hallucination tell.
- Extraction quality noticeably worse on clips under ~20 seconds or clips tagged as "no dialogue" by users.

**Phase to address:** Transcription phase (VAD pre-filter, source labeling) — feeds directly into Extraction phase confidence design (Pitfall 3)

---

### Pitfall 5: Cost stacking silently past the free-tier economics

**What goes wrong:**
`PROJECT.md` and `CONCERNS.md` both already flag this as a known concern ("custo de IA escala mais rápido que usuários"), but the risk is specifically underestimated for *this* feature because the cost isn't one LLM call — it's a stack: bandwidth for video download (even transient), Whisper/ASR minutes, LLM extraction, embedding for the new recipe, and — if it reaches PRO territory — OCR + image generation via Bedrock. If any single step is un-metered or un-gated, the whole pipeline's marginal cost per import can exceed what the free quota economically supports, and a single abusive user (or scripted abuse of the paste-a-link flow) can run up real infrastructure cost before quota logic even notices, because quota is typically checked at the *request* boundary, not enforced per pipeline stage.

**Why it happens:**
Async pipelines (SQS/Lambda here) decouple the "user made a request" moment from "money is actually being spent" moment across several stages. It's easy to gate "can this user submit an import" at the API layer while forgetting that a *retried* or *duplicated* SQS message (see Pitfall 6) will re-run the expensive stages without re-checking quota, or that someone can queue thousands of URLs via the paste-link endpoint before the daily quota check catches up (race condition on quota decrement, especially under the app's existing entitlement cache with up to 60s staleness noted in `CONCERNS.md`).

**How to avoid:**
- Gate quota **before enqueueing**, not just before starting the pipeline — decrement/reserve quota atomically at submission time (not at completion), and release/refund only on legitimate failure (not on every retry).
- **Dedupe by source URL** aggressively: if a URL has already been imported (by anyone, or by this user) recently, serve the cached structured result instead of re-running the full pipeline. This is a strict requirement, not a nice-to-have, since recipe Reels get shared/re-shared constantly — many users will paste the same viral video URL.
- Set hard per-user rate limits independent of the daily quota count (e.g., max N imports per hour) to blunt scripted abuse even within an otherwise-valid quota.
- Instrument cost per pipeline stage from day one (download bandwidth, ASR minutes, LLM tokens, embedding calls) so a runaway stage is visible before the monthly bill is the first signal — this is a direct extension of the "No Monitoring/Observability" gap already flagged in `CONCERNS.md`, and this feature is exactly where that gap becomes expensive.
- Make the expensive PRO-only stages (OCR, image gen) genuinely optional and lazily triggered — don't run them speculatively "in case the user upgrades."

**Warning signs:**
- No cache/dedupe table keyed on normalized source URL exists before the pipeline ships.
- Quota decrement happens after pipeline completion rather than at submission.
- No per-stage cost telemetry — the first sign of a cost problem is the AWS/Anthropic invoice, not a dashboard.

**Phase to address:** Quota/monetization phase (must land before or alongside the download/capture phase — sequencing matters here since this is a prerequisite gate, not a polish item) — corroborates the `PROJECT.md` constraint that quota/gate is "obrigatório antes de liberar volume."

---

### Pitfall 6: Async job retries causing duplicate recipes or double-charged quota

**What goes wrong:**
SQS + Lambda is at-least-once delivery by design — duplicate invocations for the same message *will* happen (visibility timeout races, Lambda failing to ack in time, transient errors). If the import pipeline isn't explicitly idempotent, a single user-submitted URL can produce two private recipes, or consume quota twice, or (worse) trigger the paid image-generation stage twice for the same import.

**Why it happens:**
This exact risk already exists in the codebase for the *dataset* ingestion pipeline — `CONCERNS.md` explicitly notes there's no dead-letter queue and no visible idempotency handling on `ingest-queue.ts`. Copying that same pattern into the import pipeline (which the `PROJECT.md` context explicitly says it will do — "o pipeline reusa o padrão de ingestão assíncrona") means importing the same gap into a feature where duplication has direct cost and UX consequences (duplicate private recipes cluttering a user's book).

**How to avoid:**
- Use a dedup key (`userId + normalizedSourceUrl`, or an explicit `importJobId` generated at submission and stored before enqueueing) and check-and-set against it atomically before running expensive stages — track processed job IDs in Mongo with a TTL, mirroring the DynamoDB-tracking pattern common for Lambda idempotency.
- Configure a dead-letter queue for the import queue (not just leaving failed messages to vanish, which is the exact gap flagged for the existing ingest queue) — this feature is a good forcing function to fix that gap project-wide.
- Set SQS visibility timeout to roughly 6x the expected Lambda processing time for this pipeline stage, since download+transcription+extraction can be a slow, variable-duration chain.
- Use `ReportBatchItemFailures` so a single bad message in a batch doesn't cause the whole batch to be retried.

**Warning signs:**
- No import job status table with a unique constraint on the dedup key.
- Users report seeing the same imported recipe appear twice in their private book.
- No DLQ configured — failures simply disappear with no audit trail (already a known gap for the sibling ingest queue).

**Phase to address:** Download/capture or Extraction phase (wherever the async job is first enqueued) — implement idempotency as part of the initial async pipeline build, not as a later hardening pass

---

### Pitfall 7: Lambda's 15-minute hard timeout silently truncating the pipeline

**What goes wrong:**
If download + transcription + extraction + image work are chained inside a single Lambda invocation (the natural "reuse the existing ingest-handler pattern" instinct), a slow platform response, a long video, or a slow LLM call can push the total past Lambda's hard 15-minute ceiling — which cannot be extended, unlike most other AWS limits. The job doesn't fail gracefully; it gets killed mid-step, potentially after already downloading/transcribing (cost spent) but before persisting a result (no value delivered, and no clean error state for the user).

**Why it happens:**
The existing `ingest-handler` Lambda was designed for text-based dataset ingestion, which is fast and bounded. Import adds genuinely slow, variable-latency external I/O (video download from a platform that might be rate-limiting you, ASR on audio up to a minute or two long, keyframe extraction) — a fundamentally different latency profile that the reused pattern wasn't built for.

**How to avoid:**
- Split the pipeline into discrete stages (download → transcribe → extract → keyframes → [optional PRO: OCR/image gen]), each its own Lambda invocation with state persisted between stages (a `ImportJob` document with a `status` enum), rather than one monolithic function.
- Use SQS chaining (each stage enqueues the next) or Step Functions if stage orchestration logic grows complex enough to need branching/retries per stage — Step Functions is the AWS-native answer specifically for this pattern and is worth evaluating even if it's new infra, given the existing SQS+Lambda foundation.
- Set a stage-level timeout below Lambda's 15-minute cap with margin (e.g., 3-5 min per stage) and treat exceeding it as an explicit, user-visible failure state ("this video is taking too long to process") rather than a silent kill.
- Never let the video download step itself run unbounded — cap max video duration/file size accepted for import (recipe Reels are short-form by definition; reject or warn on anything unusually long, which is also a signal of possible misuse).

**Warning signs:**
- A single Lambda function handles the entire import pipeline end-to-end.
- No per-stage status is persisted — the only signal of progress is "pending" then eventually "done" or silence.
- No max video duration/size validation before download starts.

**Phase to address:** Download/capture and Transcription phases (pipeline architecture decision, made early — changing this after the fact means re-architecting the job model)

---

### Pitfall 8: Extension-to-webapp auth handoff becomes its own project

**What goes wrong:**
The browser extension needs to authenticate against the same Clerk-backed backend as the web app, but naively storing a long-lived session token inside the extension (in `chrome.storage`) is both a security smell (extension storage is a bigger attack surface than an HttpOnly cookie) and awkward to keep in sync with Clerk's own session refresh/expiry lifecycle — teams commonly underestimate this as "just pass the token" and end up rebuilding it after a security review or after users get logged out of the extension silently while still logged into the web app (or vice versa).

**Why it happens:**
Extensions and web apps run in different security contexts. MV3 extensions can read cookies from domains they have `host_permissions` for, which is one legitimate path, but Clerk's session model (rotating short-lived JWTs backed by a refresh mechanism) doesn't map cleanly onto "just read the cookie" without replicating Clerk's own refresh logic inside the extension, or without a dedicated handoff endpoint.

**How to avoid:**
- Prefer a short-lived, single-use handoff: user clicks "connect extension" in the web app (already logged in via Clerk), backend mints a short-lived one-time code, extension exchanges that code for its own session artifact via a dedicated backend endpoint — avoid ever putting a long-lived Clerk token directly in extension storage.
- If reading Clerk's own session cookie directly from the extension (via `host_permissions` on the app domain) is simpler and sufficient for MVP, treat it as a v1 shortcut with a known follow-up, not the final design — document the tradeoff.
- Test the "user logs out on web, is extension still authenticated?" and "user's PRO subscription lapses, does extension quota check reflect it?" cases explicitly — these are exactly the kind of edge case that's invisible until a user hits it.
- Keep the auth handoff logic decoupled from the import pipeline logic so a future Clerk API change doesn't require touching import code.

**Warning signs:**
- Extension stores a Clerk session token with no expiry/refresh handling.
- No explicit "disconnect extension" / revoke path exists for a user who loses their device.
- Extension continues to work after the user's session is revoked on the web app.

**Phase to address:** Browser extension capture phase — plan auth handoff as its own mini-spec before writing extension UI, since it gates everything else the extension does

---

### Pitfall 9: Spam/low-quality imports polluting the public catalog via the +5-likes path

**What goes wrong:**
The existing variant-promotion-by-likes mechanic is being reused for imports (`generated_pending → variant` mirrored for imports). This is a good reuse of a proven pattern, but imports introduce a new failure mode the original mechanic wasn't designed for: a **low-confidence or partially-hallucinated** import (Pitfall 3) can still rack up 5 likes from users who liked the *video* concept, not verified the *recipe accuracy* — likes are a popularity signal, not a correctness signal. Promoting an inaccurate imported recipe to the public catalog is worse than the existing risk surface, because it now looks authoritative and is discoverable by users who never saw the source video to sanity-check it.

**Why it happens:**
The like-to-promote mechanic was designed for user-created adaptations of already-vetted base recipes (`adaptRecipe` anchored to a real recipe). Imports have no such anchor — the "ground truth" is a noisy video, not a vetted recipe. Reusing the promotion threshold verbatim conflates two different trust models.

**How to avoid:**
- Gate public promotion on **both** the likes threshold **and** a minimum extraction confidence (Pitfall 3) — a low-confidence import should not be eligible for public promotion regardless of like count, or should require the importing user to explicitly confirm/edit it first.
- Consider requiring at least one human edit-and-save cycle before an imported recipe is promotion-eligible, as a lightweight "someone actually reviewed this" gate.
- Dedupe imported variants by source URL at the public-catalog level too — multiple users importing the same viral video shouldn't create N nearly-identical public variants; consider merging or surfacing "already imported" when a URL match is found (also solves part of the cost-dedup problem in Pitfall 5).
- Watch for gaming: quota-limited users creating multiple accounts to import+self-like, or coordinated like exchanges — the abuse surface here is similar to any UGC-with-social-proof feature, but combined with real infra cost per import it's more expensive to ignore than typical like-gaming.

**Warning signs:**
- No confidence field is checked at the promotion trigger — only the like count.
- Multiple public variants exist for the same source video URL.
- Promoted imports show visible extraction errors when compared against their source video/caption.

**Phase to address:** Publish/promotion phase — extend the existing promotion logic rather than treating imports as identical to the existing `adaptRecipe` flow

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|-----------------|------------------|
| One monolithic Lambda for the whole import pipeline | Faster to build, reuses `ingest-handler` pattern directly | Hits the 15-min timeout wall under real-world video/network variance; hard to add retry/observability per stage | Never for production — acceptable only for a throwaway spike/prototype |
| Storing downloaded video/audio in S3 "just in case" instead of deleting after processing | Simplifies debugging failed extractions | Directly undermines the no-rehost legal posture; increases storage cost; creates a GDPR/right-to-delete surface for third-party media | Never — if debugging access is needed, keep a short TTL (hours, not indefinite) and treat it as an internal-only, access-logged bucket |
| Trusting Whisper's raw transcript as ground truth | Simpler prompt, faster to ship | Silently poisons extraction with hallucinated content on music/silence-heavy clips | Never for the free tier where transcript is the primary signal; borderline acceptable once OCR/caption cross-checking exists as a corroborating source |
| Checking quota only at pipeline completion, not at submission | Simpler state machine | Allows queue-flooding abuse and double-charging on retries | Never — always reserve quota at submission |
| Skipping confidence scoring on extraction to ship faster | Faster MVP, one less schema field | Directly threatens the stated Core Value; a wrong recipe is worse than no recipe | Acceptable only for an internal dogfood build never exposed to real users, not for any user-facing milestone |
| Hardcoding a single yt-dlp version with no update cadence | One less moving part to manage | Guaranteed to silently degrade within weeks as platforms rotate anti-bot measures | Never for production; acceptable for a local dev-only spike |

## Integration Gotchas

Common mistakes when connecting to external services.

| Integration | Common Mistake | Correct Approach |
|-------------|-----------------|-------------------|
| yt-dlp (IG/TikTok/YouTube) | Running from cloud/datacenter IPs and expecting reliable success on IG/TikTok | Budget for residential/mobile egress or a managed extraction API for the two riskiest platforms; treat YouTube as the most tolerant of the three |
| Whisper API | Sending raw audio blindly, trusting the transcript as-is | Pre-filter with VAD, label transcript confidence, cross-check against caption text |
| AWS Lambda (SQS-triggered) | Assuming exactly-once delivery | Design explicit idempotency keyed on job/source-URL, always |
| Chrome Web Store (MV3) | Requesting `<all_urls>` because it's easier than scoping to `instagram.com`/`tiktok.com`/`youtube.com` | Scope `host_permissions` to exactly the domains needed; broad permissions are the #1 rejection trigger |
| Clerk (extension context) | Copying the web app's session token directly into extension storage | Use a short-lived handoff code/token exchange, not a raw session token |
| Mercado Pago quota gating (existing) | Reusing the billing entitlement cache's ~60s staleness window for a hard per-import cost gate | For cost-sensitive gates like import quota, don't rely solely on the cached entitlement — reserve quota with a direct, low-latency check at submission, independent of the billing cache TTL |

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|-----------------|
| No dedupe on source URL | Same viral video imported N times by N users, N times the cost | Cache/dedupe table keyed on normalized URL, serve cached structured result | Breaks economics the moment one video goes viral inside the app's own user base — could be within the first few hundred users |
| Single Lambda handles the whole pipeline | Works fine on short test videos, then timeouts appear under real network conditions | Split into staged, independently-timed Lambdas from the start | Breaks as soon as a platform is slow/rate-limiting, not tied to user count |
| No per-stage cost telemetry | Bill looks fine until it doesn't; no early warning | Instrument cost per stage (download, ASR, LLM, embed, image) from day one | Breaks silently — the "symptom" is a surprise invoice, which is itself the failure mode to avoid |
| Entitlement cache TTL used as the quota gate | Fine at low volume; a user can burst-import past quota within the TTL window | Reserve quota atomically at submission, independent of the 60s cache | Breaks with any user attempting to game the free tier, not a scale threshold — should be fixed pre-launch |

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Retaining downloaded video/audio indefinitely | GDPR right-to-erasure exposure for third-party (creator) personal data/likeness embedded in media; unnecessary storage cost | Delete downloaded media immediately after transcription/keyframe extraction; document a max TTL |
| Long-lived auth token stored in extension | Broader attack surface than an HttpOnly cookie; token theft persists past logout | Use a short-lived handoff/exchange pattern, not direct token storage |
| Presigned upload URLs for carousel images reusing the existing image service pattern without ownership checks | The existing image service already has a known gap (no recipe-ownership check on presigned upload URLs, per `CONCERNS.md`) — extending it unchanged to the import carousel inherits the same hole | Add an explicit ownership/ACL check before presigning upload URLs for import-carousel images; don't just extend the existing port as-is |
| No dead-letter queue on the import SQS queue | Failed imports vanish with no audit trail, indistinguishable from "still processing" to the user | Configure a DLQ + alerting, mirroring the fix already recommended for the sibling ingest queue in `CONCERNS.md` |

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-------------------|
| Import shows only a generic spinner for the whole multi-stage pipeline | User has no idea if it's stuck, slow, or failed; abandons or retries (causing duplicates) | Show per-stage progress ("downloading," "transcribing," "extracting") tied to the persisted job status |
| Silently auto-publishing a low-confidence extraction to the user's private book | User trusts a wrong recipe, cooks it wrong, loses trust in the whole app | Route low-confidence imports to an explicit review/edit screen before saving |
| No indication of which fields were inferred vs. explicitly stated | User can't tell what to double-check, review is a wall of undifferentiated text | Visually flag inferred/low-confidence fields in the review UI |
| Import fails on unsupported/edge-case URLs with a generic error | User assumes the whole feature is broken (especially first-time users, top-of-funnel) | Distinguish failure reasons in-product: "this platform isn't supported yet" vs. "this video couldn't be downloaded" vs. "no recipe content detected" |
| Duplicate "import in progress" submissions from double-tapping paste/share on mobile | Users on mobile commonly double-tap; without dedupe this creates duplicate jobs/recipes | Debounce submission client-side AND dedupe server-side by source URL + user within a short window |

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Download step:** Often missing a circuit breaker per platform — verify the pipeline degrades to "paste caption manually" rather than hard-failing when a platform's anti-bot measures change
- [ ] **Extraction step:** Often missing per-field confidence/grounding — verify the schema can represent "not stated in source" instead of forcing every field to a value
- [ ] **Async job handling:** Often missing idempotency — verify a retried/duplicated SQS message cannot create a second recipe or double-decrement quota
- [ ] **Quota gating:** Often checked only at job completion — verify quota is reserved atomically at submission time
- [ ] **Media retention:** Often left "temporarily" in S3 for debugging — verify downloaded video/audio is deleted immediately after processing, not just eventually
- [ ] **Public promotion path:** Often reuses the like-threshold verbatim — verify a confidence gate exists alongside the like-count gate before public promotion
- [ ] **Extension permissions:** Often requests broad `<all_urls>` for convenience during dev — verify `host_permissions` are scoped to exactly `instagram.com`/`tiktok.com`/`youtube.com` before submission
- [ ] **Cost observability:** Often absent until the first surprising invoice — verify per-stage cost (download, ASR, LLM, embedding, image) is logged/metered before opening the feature to real users

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|----------------|-----------------|
| yt-dlp breaks on a platform after a platform-side change | LOW-MEDIUM | Update yt-dlp (usually patched within days by upstream), redeploy; circuit breaker should already have degraded gracefully in the interim |
| Duplicate recipes created from retried jobs | LOW | Add a cleanup script to dedupe by (userId, sourceUrl, createdAt window); backfill the idempotency key going forward |
| Low-confidence recipe already promoted to public catalog | MEDIUM | Add retroactive confidence scoring pass over existing imported variants; demote/flag those below threshold for re-review; notify the importing user |
| Cost overrun discovered after the fact (no telemetry) | MEDIUM-HIGH | Add per-stage instrumentation retroactively; introduce emergency hard caps (max imports/day globally) while telemetry is being added; audit for abuse patterns (single-user URL-flooding) |
| Extension rejected by Chrome Web Store | LOW-MEDIUM | Address the specific policy violation (usually permissions scope or missing privacy policy) and resubmit; keep the paste-link flow as the primary MVP path so extension rejection doesn't block launch |

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|-------------------|----------------|
| yt-dlp breakage / anti-bot churn | Download/capture phase | Per-platform success-rate dashboard exists; circuit breaker tested by simulating a platform failure |
| Legal posture / re-hosting risk | Download/capture + Publish phase | No code path serves original media back to clients; attribution UI is present and required, not optional |
| Silent hallucinated extraction (Core Value risk) | Extraction phase | Schema has a confidence/grounded field; low-confidence imports are routed to mandatory review before save |
| Whisper hallucination on music/silence | Transcription phase | VAD pre-filter implemented; transcript vs. caption conflicts are surfaced, not silently merged |
| Cost stacking past free-tier economics | Quota/monetization phase (must land alongside or before capture) | Dedupe-by-URL exists; quota reserved at submission; per-stage cost telemetry live before public launch |
| Duplicate jobs / double-charged quota | Download/capture phase (async job design) | Idempotency key enforced; DLQ configured; duplicate-submission test passes |
| Lambda 15-min timeout truncation | Download/capture + Transcription phase (pipeline architecture) | Pipeline is staged (not monolithic); each stage has its own timeout well under 15 min; max video length/size validated before download |
| Extension auth handoff complexity | Browser extension capture phase | Logout-on-web reflects in extension; no long-lived token stored in extension storage |
| Spam/low-quality public promotion | Publish/promotion phase | Promotion requires confidence gate + like threshold, not likes alone; duplicate public variants for the same source URL are prevented or merged |

## Sources

All findings below are from general web search (no curated/primary-documentation provider was available in this run — confidence is LOW-MEDIUM per source and should be spot-checked against official docs, especially yt-dlp/platform-specific behavior which changes frequently):

- [yt-dlp Ultimate Guide 2026](https://www.devkantkumar.com/blog/yt-dlp-ultimate-guide-2026/)
- [How yt-dlp Detects and Works Around Site-Specific Anti-Bot Protections](https://instagit.com/yt-dlp/yt-dlp/how-yt-dlp-detects-and-works-around-anti-bot-protections/)
- [How to Scrape Instagram in 2026 — Scrapfly](https://scrapfly.io/blog/posts/how-to-scrape-instagram)
- [How To Scrape TikTok in 2026 — Scrapfly](https://scrapfly.io/blog/posts/how-to-scrape-tiktok-python-json)
- [Is yt-dlp Legal? What You Need to Know](https://audioutils.com/blog/is-yt-dlp-legal)
- [Social media DMCA takedown guide — Red Points](https://www.redpoints.com/blog/dmca-takedowns-on-social-media/)
- [Building a nutritional co-pilot using LLMs: Recipe Extraction](https://medium.com/@kbambalov/building-a-nutritional-co-pilot-using-llms-part-1-recipe-extraction-e112645ef9fd)
- [Large Language Models Hallucination: A Comprehensive Survey](https://arxiv.org/html/2510.06265v2)
- [Whisper Hallucination Detection and Mitigation via Hidden Representation Steering](https://arxiv.org/pdf/2606.07473)
- [Bug: Faster-Whisper fails on no-speech audio — GitHub Issue](https://github.com/SYSTRAN/faster-whisper/issues/1208)
- [Solutions to Repeated Output Issues with Whisper — Memo AI](https://memo.ac/blog/whisper-hallucinations)
- [OpenAI Whisper API Pricing 2026](https://diyai.io/ai-tools/speech-to-text/openai-whisper-api-pricing-2026/)
- [Additional Requirements for Manifest V3 — Chrome for Developers](https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements)
- [Why Chrome Extensions Get Rejected (15 Reasons)](https://www.extensionradar.com/blog/chrome-extension-rejected)
- [Cookie-based Authentication for your Browser Extension and Web App (MV3)](https://boryssey.medium.com/cookie-based-authentication-for-your-browser-extension-and-web-app-mv3-4837d7603f54)
- [Using OAuth and Cookies in Browser Based Apps — Curity](https://curity.io/resources/learn/oauth-cookie-best-practices/)
- [How to handle long running process using Lambda — AWS re:Post](https://repost.aws/questions/QUt8Xg7W_PR5ejN3ABqUS_Lw/how-to-handle-long-running-process-such-as-processing-of-40gb-video-file-using-lambda-function)
- [Process events asynchronously with API Gateway and Lambda — AWS Prescriptive Guidance](https://docs.aws.amazon.com/prescriptive-guidance/latest/patterns/process-events-asynchronously-with-amazon-api-gateway-and-aws-lambda.html)
- [Prevent Lambda function retries for the same SQS message — AWS re:Post](https://repost.aws/knowledge-center/lambda-function-process-sqs-messages)
- [Handling Lambda functions idempotency with AWS Lambda Powertools](https://aws.amazon.com/blogs/compute/handling-lambda-functions-idempotency-with-aws-lambda-powertools/)
- [Does the GDPR's Right to be Forgotten Include Audio/Video Data?](https://www.linkedin.com/pulse/does-gdprs-ccpa-right-forgotten-include-audiovideo-data-bill-tolson)
- [Cracking Down on Spammy Content on Facebook — Meta](https://about.fb.com/news/2025/04/cracking-down-spammy-content-facebook/)
- Project-internal: `.planning/PROJECT.md`, `.planning/codebase/CONCERNS.md` (existing ingest-queue DLQ gap, entitlement cache staleness, extraction schema fragility, image presign ownership gap — all directly relevant precedents inside this same codebase)

---
*Pitfalls research for: onFeed Import (social video → structured recipe pipeline)*
*Researched: 2026-07-01*
