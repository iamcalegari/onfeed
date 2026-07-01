# Stack Research

**Domain:** Video-to-recipe extraction pipeline ("onFeed Import") — adds video download, transcription, keyframe/OCR extraction, and two capture adapters (browser extension + pasted-link form) to an existing recipe app
**Researched:** 2026-07-01
**Confidence:** MEDIUM (individual claims range LOW-MEDIUM; this is a fast-moving, adversarial domain — see Sources)

**Scope note:** This is a SUBSEQUENT milestone. The existing stack (TypeScript, Fastify 5, Mongoat/MongoDB Atlas, Voyage embeddings, Claude/Anthropic SDK, Next.js 15, AWS S3/Bedrock/SQS/Lambda, Clerk, Mercado Pago, Render+Vercel) is NOT re-researched here — see `.planning/codebase/STACK.md`. This file covers ONLY the new pipeline.

## Legal & ToS Reality (read before building)

Be honest about this up front, since it underpins the whole pipeline:

- **yt-dlp the tool is legal.** It's an open-source, general-purpose downloader with no inherent illegality in the US, EU, or most jurisdictions — courts and industry consensus treat it like a neutral tool (comparable to a VCR/browser), not a piracy device.
- **Using it against Instagram/TikTok/YouTube very likely violates each platform's Terms of Service.** All three platforms' ToS prohibit automated downloading/scraping without explicit permission. This is a **civil/contract matter** (grounds for account suspension, IP ban, or in theory a breach-of-contract claim), **not a criminal one** — but it is real risk, not a technicality to wave away.
- **Copyright is a separate axis from ToS.** Downloading a video does not itself infringe copyright if what you do with it stays within fair-use-like bounds (the onFeed use case — extracting factual recipe information: ingredients, steps — is closer to "facts are not copyrightable" territory than "redistributing the creative work"). Re-hosting or redistributing the source video WOULD be a copyright problem, which is exactly why PROJECT.md already scopes that out ("não re-hospedar o vídeo original").
- **Enforcement differs by platform and is inconsistent, not absent.** Reported patterns: YouTube is the most aggressive on anti-bot defenses (frequent "sign in to confirm you're not a bot" cookie challenges) but relatively hands-off on ToS enforcement against small-scale tools. Instagram in 2026 is reported as the most aggressive on both technical anti-bot AND fast IP-flagging. TikTok rate-limits hard but its enforcement focus (per third-party sources) skews toward large-scale/commercial scraping rather than individual users. None of this is a legal green light — treat all three as "will actively try to block this, and technically has a contractual right to object."
- **Practical implication for the roadmap:** design the pipeline assuming intermittent breakage is normal operating condition (extractor updates, cookie expiry, IP flags), not an edge case — this shapes the "pin yt-dlp + weekly auto-update" and "explicit re-auth failure state" recommendations below. Do NOT build anything that re-hosts, redistributes, or publicly displays the source video itself — attribution + linking back to the source (already a Key Decision in PROJECT.md) is both the ethical and the legally safer posture.
- **This is not legal advice.** If PRO revenue or scale materially increases exposure, a real ToS/copyright legal review before wide launch is warranted — this research flags the shape of the risk, not a legal sign-off.

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `yt-dlp` (Python binary, not a library) | `2026.06.09` (latest as of research date; pin and auto-update monthly) | Download video+audio from IG/TikTok/YouTube given a URL | De-facto universal downloader — actively maintained fork of youtube-dl with per-site extractors for all three target platforms in one tool. No serious alternative covers all three with one engine. Confidence: HIGH (this claim is stable/well-established, not time-sensitive) |
| `youtube-dl-exec` (npm) | `^3.1.8` | Node.js wrapper around the yt-dlp binary (auto-downloads binary, Promise/stream API, typed args) | Thin wrapper, actively maintained, avoids hand-rolling `child_process.spawn` argument escaping. Confidence: MEDIUM |
| `ffmpeg` (binary) + `fluent-ffmpeg` (npm) | ffmpeg 6.x/7.x via `@ffmpeg-installer/ffmpeg` or `ffmpeg-static`; `fluent-ffmpeg@^2.1.3` | Extract audio track for ASR, extract keyframes for carousel | Standard, no real alternative for server-side video/audio manipulation. Confidence: HIGH |
| Groq-hosted `whisper-large-v3-turbo` via `groq-sdk` | `groq-sdk@^1.3.0`, model `whisper-large-v3-turbo` | Primary transcription (ASR) of the extracted audio track | Cheapest + fastest hosted Whisper-quality option (~$0.04/hr, ~200ms latency, 164-299x realtime throughput per public benchmarks). Confidence: LOW-MEDIUM (pricing/latency claims are web-search-sourced, not verified against Groq's own pricing page in this pass — verify before committing budget) |
| Claude (already in stack) — vision input on 1-3 sampled frames | existing `@anthropic-ai/sdk@0.104.2` | OCR of on-screen text (PRO feature) + secondary signal for recipe extraction | Reuses the SDK/API key already paid for and wired; Claude's vision OCR is reported strong on text-heavy/structured content (recipe cards, on-screen ingredient lists) and returns structured JSON directly — no separate OCR engine, no separate parsing step. Confidence: LOW-MEDIUM (qualitative claim from web sources, not a controlled benchmark) |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `openai` (npm, official SDK) | `^6.45.0` | Fallback ASR via OpenAI's hosted Whisper API (`whisper-1` / `gpt-4o-transcribe`) | Use as a fallback/quality-check path if Groq's Whisper output is unreliable for PT-BR cooking slang, or if Groq has an outage. Not primary — costs ~9x more per hour than Groq per public pricing pages. |
| `@aws-sdk/client-s3` (already in stack) | existing | Store downloaded video (transient), extracted audio, extracted keyframes | Reuse — no new dependency. Treat video/audio as ephemeral (delete after pipeline completes; do not build a permanent video store — see Anti-Patterns/legal note). |
| `zod` (already in stack) | existing | Validate yt-dlp `--dump-json` output shape, LLM extraction output | Reuse existing validation pattern already used for Claude structured outputs. |
| `p-queue` (npm) | `^9.x` | Concurrency limiter for the download/transcribe worker (avoid saturating the worker or triggering platform rate limits) | Use in the worker process that runs yt-dlp — cap concurrent downloads per platform (e.g. max 2-3 concurrent IG downloads) to reduce anti-bot flagging risk. |
| `tesseract.js` | `^7.0.0` | NOT recommended as primary OCR — listed only as the "what not to use" baseline for comparison | See "What NOT to Use" below. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Docker (already used for MinIO locally) | Local dev container bundling `yt-dlp` + `ffmpeg` binaries + Python 3.9+ runtime | Extend the existing `docker compose` setup so devs don't need to `pip install yt-dlp` and `apt install ffmpeg` manually on the host. |
| `yt-dlp --dump-json` (CLI, via wrapper) | Inspect available metadata fields per platform before writing extraction code | Run manually against sample IG/TikTok/YouTube URLs early in phase 1 to confirm which fields (caption, uploader, uploader_url, webpage_url, thumbnail) are actually populated per platform — coverage varies by site extractor and changes over time. |

## Where Each Step Runs

This is the most consequential architectural decision and it diverges from the existing Lambda-based ingest pattern:

| Step | Recommended runtime | Why NOT Lambda |
|------|---------------------|-----------------|
| Download (yt-dlp) | **Dedicated worker on Render** (new background worker service, or a container-based job), triggered async via the existing SQS pattern | `yt-dlp` is a Python binary with a Python 3.9+ dependency, not a native Node.js/JS library. AWS Lambda's default Node.js runtime doesn't have Python; you'd need either (a) a Lambda **container image** (up to 10GB, supports arbitrary binaries) or (b) a Lambda layer with a statically-built yt-dlp + Python. Both are workable but add real packaging complexity (manylinux ABI mismatches are a known Lambda Python-layer pitfall) and Lambda's execution time limit (15 min max) plus lack of persistent local disk beyond `/tmp` (512MB-10GB) makes long video downloads riskier. A long-running Render worker process has none of these constraints, can hold `yt-dlp`+`ffmpeg`+Python as normal system packages (like the existing Render API service already does with Node), and is simpler to debug/retry. Confidence: MEDIUM (architectural reasoning, not a documented anti-pattern with citations) |
| Audio extraction (ffmpeg) | Same worker, immediately after download (single process, same container) | Avoid a network hop between download and audio-extract; do both in the worker before uploading only the small audio file (not the raw video) onward. |
| Transcription (Whisper via Groq API) | **Called from the same Render worker** as an outbound HTTPS API call | Hosted API call — no binary/runtime constraint, works from Lambda OR Render equally. Kept in the worker for pipeline locality (avoid another SQS hop) but this step alone COULD run in Lambda if you later split the pipeline. |
| Keyframe extraction (ffmpeg) | Same worker, same pass as audio extraction | ffmpeg already invoked; extract 3 frames in the same process before uploading. |
| Caption/metadata extraction | Same worker, comes for free from `yt-dlp --dump-json` in the download step | No extra step. |
| OCR (Claude vision on sampled frames, PRO only) | **Existing Fastify API / existing LLM service layer**, NOT the video worker | This is a stateless LLM call, identical shape to the existing `recipe.generation.ts` Claude calls. Reuse `src/infra/llm/anthropic.client.ts`. Only needs the already-uploaded S3 frame URLs, so it can run after the worker hands off, decoupled from the heavy binary work. |
| Structured recipe extraction (Claude, transcript+caption+OCR text → recipe JSON) | **Existing Fastify API / existing LLM service layer** | Same reasoning — this is the same "Claude structured output" pattern the app already uses for `adaptRecipe`/ingest. New prompt, same infra. |
| Image carousel generation (CheffIA/Bedrock, PRO) | **Existing Bedrock image-gen infra** (`src/infra/images/bedrock.image-generator.ts`) | No new infra — the "generate via CheffIA" path is literally the existing `ImageGenerator` port, just invoked once per carousel slot instead of once per recipe. |

**Practical shape:** extend the existing SQS/Lambda ingest pattern with ONE new hop: `API enqueues import job → SQS → new Render background worker (not Lambda) does download+ffmpeg+Whisper-API-call → worker uploads audio-transcript-text + keyframe images to S3 and writes a "ready for extraction" status → existing Fastify API (or a second, lightweight Lambda) picks up from there and does the Claude structured-extraction call`, reusing 90% of the current ingest service code. Only the video-native step (download+ffmpeg) needs a new binary-capable host.

## Installation

```bash
# Core — new backend worker (yt-dlp + ffmpeg via Node wrappers)
npm install youtube-dl-exec fluent-ffmpeg
npm install -D @types/fluent-ffmpeg

# Transcription (hosted Whisper via Groq)
npm install groq-sdk

# Fallback transcription (optional, only if Groq path proves unreliable)
# openai SDK likely already usable via existing @anthropic-ai/sdk peer setup, but is a separate package:
npm install openai

# Concurrency control for the worker
npm install p-queue

# System-level (Dockerfile / Render worker build, NOT npm):
# apt-get install -y python3 ffmpeg
# pip install -U yt-dlp   (or vendor the yt-dlp binary release directly and skip pip)
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|--------------------------|
| `yt-dlp` binary via `youtube-dl-exec` wrapper | Platform-specific unofficial APIs / scraping libraries (e.g. `instagram-private-api`, raw TikTok signature reverse-engineering libs) | Never as the primary path — these break constantly as platforms change internals and carry higher legal/ToS exposure per-platform (vs. yt-dlp's community-maintained extractor updates). Only consider if yt-dlp's extractor for one specific platform breaks and a fix hasn't landed yet — as a stopgap, not a strategy. |
| Groq-hosted `whisper-large-v3-turbo` | Self-hosted `faster-whisper` (CTranslate2) on a GPU/CPU box | Use if (a) you hit sustained volume where hosted API cost exceeds a dedicated box, or (b) you need guaranteed data residency (audio never leaves your infra) for privacy/compliance reasons. Adds ops burden (model weights, GPU or slow CPU inference, scaling) — not worth it for MVP volume. |
| Groq-hosted Whisper | OpenAI hosted Whisper API (`whisper-1`/`gpt-4o-transcribe`) | Use as a fallback path or if Groq quality/PT-BR accuracy proves worse in testing — OpenAI is the "safe default" with the widest language documentation, at ~9x the per-hour cost of Groq per current public pricing. |
| Claude vision on sampled frames for OCR | AWS Textract, `tesseract.js`, Google Cloud Vision OCR | Use a dedicated OCR engine (Textract) only if OCR needs to scale to a volume where per-call Claude vision cost becomes the dominant cost driver, or if you need bounding-box-level text positions (Textract gives geometry; an LLM does not natively). For this app's PRO-gated, per-import OCR use case, Claude vision avoids adding a whole new vendor + parsing layer for marginal accuracy gain. |
| `fluent-ffmpeg` `.screenshots()` at 25/50/75% | Full scene-detection pipeline (`select='gt(scene,0.4)'` filter + custom scoring) | Use scene-detection scoring if user feedback shows the naive 25/50/75% split frequently lands on blurry/transition frames (common in fast-cut cooking reels). This is a legitimate v2 upgrade, not needed for MVP — start simple, measure, then invest. |
| Render background worker for download+ffmpeg | Lambda container image running yt-dlp+ffmpeg | Revisit if the team wants everything on Lambda for uniformity/cost-at-idle reasons. Feasible (10GB container image limit covers yt-dlp+ffmpeg+Python easily) but adds cold-start latency and 15-minute hard timeout risk for slow downloads; only reconsider once traffic patterns are known. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|--------------|
| `tesseract.js` as the OCR engine | Local/WASM Tesseract has materially worse accuracy than modern LLM vision on stylized on-screen recipe text (varied fonts, motion blur, colored backgrounds common in Reels/TikTok overlays) — you'd still need an LLM pass afterward to clean up and structure Tesseract's raw noisy output, doubling the work | Claude vision directly on the sampled frame — single call, gets clean text AND structure in one pass |
| Bundling `yt-dlp` as an AWS Lambda zip layer with `pip install` done on a non-matching OS | Classic Lambda Python packaging trap: wheels built on macOS/Windows/Debian-container often use an incompatible glibc ABI (manylinux_2_28) vs Lambda's Amazon Linux 2 (manylinux_2_17), causing runtime import errors that only show up in prod | Either build inside `public.ecr.aws/lambda/python` build containers, OR (recommended here) skip Lambda entirely for this step and use a Render worker/container where you control the full OS image |
| Treating IG/TikTok cookie-based auth as a "set once and forget" credential | Session cookies expire (weeks to months) and platforms (especially Instagram in 2026) actively fingerprint inconsistent/stale cookies as bot signals, causing silent download failures | Build the downloader with explicit cookie-refresh/rotation as a first-class failure mode from day one — surface "source platform requires re-auth" as a distinct, monitored error state, not a generic download failure |
| Re-hosting/permanently storing the downloaded source video | Already flagged as Out of Scope in PROJECT.md for rights/attribution reasons, and it also multiplies S3 storage cost for no product value — the app only needs the transcript text + 3 keyframe images going forward | Delete the raw downloaded video (and full audio file, once transcribed) from the worker's local disk and S3 as soon as the pipeline step consuming it completes; keep only extracted artifacts (transcript, keyframes, metadata) |
| A generic "any URL" scraper/importer | Out of scope per PROJECT.md, and also technically a much harder, unbounded problem (arbitrary site layouts) vs. three well-known short-video platforms with one shared tool (yt-dlp) | Keep the importer's input contract narrow: URL must match one of the three supported platform's domain patterns; validate and reject early with a clear "unsupported source" message |

## Stack Patterns by Variant

**If a platform's yt-dlp extractor breaks (common — IG/TikTok change internals periodically):**
- Pin `yt-dlp` to a specific release but set up a scheduled job (weekly) that checks for and applies new `yt-dlp` releases automatically in the worker's Docker image
- Because yt-dlp's maintainers typically ship extractor fixes within days of a platform break; staying current is the single highest-leverage reliability action for this pipeline

**If PT-BR transcription quality from Groq's Whisper proves insufficient in testing:**
- Fall back to OpenAI's `gpt-4o-transcribe` (newer than `whisper-1`, reportedly better on accented/informal speech) for the affected language, keep Groq as the default for cost
- Because published WER benchmarks are English-centric; Brazilian Portuguese cooking-slang audio (informal register, background kitchen noise) is exactly the "real-world audio" condition where WER climbs from the ~3% clean-audio number toward 8-12%+ — validate empirically with real onFeed sample clips before locking in one provider

**If import volume is low at MVP (few imports/day):**
- Skip building a separate Render worker service initially; run the download+ffmpeg+transcribe step as a longer-running job inside the EXISTING API process (behind the existing SQS-triggered handler pattern, just with a longer timeout/different queue) rather than standing up new infrastructure
- Because provisioning a whole new Render service is overhead that isn't justified until concurrent import volume risks blocking the main API's event loop or exceeding a single-process resource budget — revisit as a phase-2 infra hardening step, not an MVP requirement

**If import volume grows (many concurrent imports/day):**
- Split into the dedicated worker service described above, with `p-queue`-style concurrency caps per platform to manage anti-bot risk
- Because at volume, both resource isolation (heavy ffmpeg/yt-dlp CPU work shouldn't share a process with API request handling) and platform-side rate-limit risk become real

## Browser Extension (Manifest V3) — Capture Adapter

**What it is:** A one-click "Import to onFeed" button that reads the current tab's URL and posts it to the existing backend.

**Core pieces:**
- `manifest_version: 3`, `action` (toolbar button, no popup needed for MVP — clicking directly triggers the action's `onClicked` handler in the background service worker), `permissions: ["activeTab", "storage"]`, `host_permissions` scoped to the onFeed API origin only (not `<all_urls>` — minimizes review friction and user trust concerns)
- **Get the URL:** `chrome.tabs.query({ active: true, currentWindow: true })` in the service worker (or `activeTab` permission + `chrome.action.onClicked` listener, which grants temporary host access to the current tab without a broad host permission)
- **Auth against the existing Clerk-backed API:** the pragmatic MVP pattern is **not** a full OAuth/PKCE flow in the extension — instead, generate a long-lived, revocable **personal import token** from the onFeed web app (user logged in via Clerk on the website generates a token in account settings), and the extension stores that token via `chrome.storage.local`, sending it as the existing `Authorization: Bearer` header the API already expects. This reuses the existing Clerk-gated API surface without teaching the extension to speak Clerk's session protocol directly. Confidence: MEDIUM (this is an architectural recommendation based on general MV3 patterns, not a documented onFeed-specific precedent)
- **Install handoff:** the web app detects "extension not installed" (e.g., via a `postMessage`/custom-event ping the extension content-script responds to) and shows an "Install the onFeed extension" CTA linking to the Chrome Web Store listing; after install, a first-run onboarding page (opened via `chrome.runtime.onInstalled`) prompts the user to paste/confirm their import token
- **Submit:** `fetch()` from the service worker (or popup) directly to the existing import endpoint (e.g. `POST /api/v1/import`) with `{ url: tab.url }` — reuses the SAME endpoint the pasted-link web form uses; the extension is just a second, lower-friction way to feed the same URL-in pipeline

**Do NOT build:** a content script that scrapes the page DOM for captions/metadata on the extension side. `yt-dlp` already extracts caption/metadata server-side from the URL alone — duplicating that in the extension adds fragile per-site DOM-scraping code for no benefit and creates a second thing to break when platforms change their frontend.

## Pasted-Link Web Form — Capture Adapter

**What it is:** A simple form (mobile + desktop) in the existing Next.js app where the user pastes a video URL.

- Client-side: a single URL `<input>` + submit button in `web/app/(main)/import/page.tsx` (or similar route); light client-side regex validation (matches instagram.com/reel, tiktok.com/@*/video, youtube.com/shorts or youtu.be) purely for fast UX feedback — real validation happens server-side
- Server-side: same `POST /api/v1/import` endpoint the extension calls; enqueues the SQS job exactly like the existing `enqueueIngestJob()` pattern
- Mobile-first requirement (per PROJECT.md): make paste effortless — support `navigator.clipboard.readText()` behind a user gesture ("Paste from clipboard" button) since mobile users are typically switching apps (IG/TikTok → onFeed) and a one-tap paste beats manual long-press-paste
- This is the ONLY capture path required for mobile at MVP — no native share sheet needed yet

## Future: Web Share Target API (PWA) — Noted, Not Built Now

Per PROJECT.md, native share sheet / PWA Web Share Target is explicitly deferred past MVP. For when it's picked up:

- Requires the Next.js frontend to be installed as a PWA first (valid manifest.json, service worker, meets Chrome/Android installability criteria) — this is a prerequisite the app doesn't currently have and would need to be scoped as its own small phase before Share Target can work at all
- Once installed, add a `share_target` entry to `web/public/manifest.json`: `{ "action": "/import/share-target", "method": "GET", "params": { "title": "title", "text": "text", "url": "url" } }` — GET is sufficient since we only need the URL (Instagram/TikTok/YouTube share sheets pass the link in `text` or `url` depending on platform/OS), not file sharing, so no multipart/POST complexity needed
- The `/import/share-target` route parses `text`/`url` query params (IG/TikTok often place the URL inside the `text` param, not `url` — needs URL-extraction regex fallback) and forwards to the same `POST /api/v1/import` endpoint — same backend contract as the other two adapters
- Platform caveat: Web Share Target is Android/Chrome-first; iOS Safari PWA support for `share_target` has historically lagged and should be re-verified at implementation time, not assumed from this research pass
- Net effect: when built, this becomes a THIRD thin adapter over the same import endpoint — validates the "decouple capture from pipeline" decision already logged in PROJECT.md's Key Decisions

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|------------------|-------|
| `yt-dlp` binary | Node.js `youtube-dl-exec@^3.1.8` | Wrapper shells out to whatever yt-dlp binary is on PATH/auto-downloaded; keep binary current independently of the npm wrapper's own version. |
| `yt-dlp` binary | Python ≥3.9 | Hard runtime requirement; must be present in the worker's container image. |
| `fluent-ffmpeg@^2.1.3` | `ffmpeg` binary 6.x/7.x (via `@ffmpeg-installer/ffmpeg@^1.1.0` or system package) | fluent-ffmpeg is a thin CLI wrapper — verify the installed ffmpeg build includes the codecs needed for IG/TikTok/YouTube's typical H.264/AAC or VP9/Opus containers (standard builds do). |
| `groq-sdk@^1.3.0` | Node.js ≥18 (project already on ≥22, no issue) | No known conflicts with existing `@anthropic-ai/sdk` or `openai` SDKs — separate API surfaces. |
| Manifest V3 extension | Chrome/Edge (Chromium) only for MVP | Firefox/Safari extension support for MV3 differs enough (especially service worker lifecycle) that cross-browser should be a deliberate later decision, not assumed to "just work." |

## Sources

- [youtube-dl-exec on npm](https://www.npmjs.com/package/youtube-dl-exec) — wrapper API confirmation, LOW confidence (websearch, unverified against source)
- [ytdlp-nodejs on GitHub](https://github.com/iqbal-rashed/ytdlp-nodejs) — alternative wrapper, LOW confidence
- [AWS Lambda Python layers docs](https://docs.aws.amazon.com/lambda/latest/dg/python-layers.html) — official AWS docs, MEDIUM confidence (official source via websearch)
- [Bridging the Gap: Packaging Python for AWS Lambda with Debian-Based Containers](https://www.paulserban.eu/blog/post/bridging-the-gap-packaging-python-for-aws-lambda-with-debian-based-containers/) — manylinux ABI mismatch detail, LOW confidence
- [Groq vs OpenAI Whisper: Real Benchmarks (2026)](https://dev.to/howmindswork/groq-vs-openai-whisper-real-benchmarks-for-voice-transcription-2026-46lk) — cost/latency figures, LOW confidence (unverified third-party benchmark, recommend re-verifying against groq.com/pricing before budgeting)
- [Whisper Large v3 Turbo on Groq — official Groq blog](https://groq.com/blog/whisper-large-v3-turbo-now-available-on-groq-combining-speed-quality-for-speech-recognition) — MEDIUM confidence (vendor's own blog)
- [freds0/distil-whisper-large-v3-ptbr on Hugging Face](https://huggingface.co/freds0/distil-whisper-large-v3-ptbr) — PT-BR WER data point (8.2% on Common Voice 16), LOW-MEDIUM confidence (community benchmark, not vendor-published)
- [node-fluent-ffmpeg on GitHub](https://github.com/fluent-ffmpeg/node-fluent-ffmpeg) — `.screenshots()` API, MEDIUM confidence (official repo)
- [Claude Vision in 2026: OCR, Charts, Screenshots — Claudexia](https://claudexia.tech/blog/claude-vision-image-understanding) — OCR quality claims, LOW confidence (third-party blog)
- [MDN: share_target manifest reference](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/share_target) — MEDIUM-HIGH confidence (MDN, authoritative)
- [Chrome for Developers: Receiving shared data with Web Share Target API](https://developer.chrome.com/docs/capabilities/web-apis/web-share-target) — MEDIUM-HIGH confidence (official Chrome docs)
- [yt-dlp GitHub releases](https://github.com/yt-dlp/yt-dlp) — version `2026.06.09` confirmed via GitHub API, HIGH confidence (direct API query, not search)
- [Is yt-dlp Safe and Legal to Use in 2026](https://yt-dlpc.github.io/safe-legal.html) and [What Happens If Platforms Catch You Scraping? — ScrapeCreators](https://scrapecreators.com/blog/what-happens-when-social-media-companies-catch-you-scraping-a-platform-by-platform-guide) — legal/ToS framing, LOW confidence (third-party, not legal advice — flagged explicitly below)
- npm registry direct queries (`npm view <pkg> version`) for `youtube-dl-exec`, `fluent-ffmpeg`, `groq-sdk`, `tesseract.js`, `openai`, `ffmpeg-static`, `@ffmpeg-installer/ffmpeg` — HIGH confidence (live registry data, not search)

---
*Stack research for: onFeed Import (video-to-recipe pipeline + capture adapters)*
*Researched: 2026-07-01*
