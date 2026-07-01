# Architecture Research: onFeed Import Pipeline

**Domain:** URL-to-structured-recipe import pipeline (video ingestion) added to an existing Fastify modular monolith
**Researched:** 2026-07-01
**Confidence:** HIGH (based directly on existing codebase patterns) / MEDIUM (on deployment topology for yt-dlp/Whisper, which is new territory for this stack)

## Standard Architecture

### System Overview

```text
┌──────────────────────────────────────────────────────────────────────────┐
│  CAPTURE (thin producers — just get a URL + userId to the pipeline)      │
│  ┌────────────────┐  ┌────────────────────┐  ┌──────────────────────┐   │
│  │ POST /import    │  │ Browser extension   │  │ (future) Web Share   │   │
│  │ (pasted link)   │  │ POST /import/ext     │  │ Target (PWA)          │   │
│  └────────┬────────┘  └──────────┬──────────┘  └──────────┬────────────┘   │
│           └─────────────────────┴──────────────────────────┘             │
│                              │ enqueueImportJob()                         │
├──────────────────────────────┼────────────────────────────────────────────┤
│  PIPELINE (heavy, async — owns the ImportJob state machine)              │
│                              ▼                                            │
│                    ┌──────────────────┐                                  │
│                    │  Job Queue (SQS)  │                                  │
│                    └────────┬─────────┘                                  │
│                              ▼                                            │
│         ┌─────────────────────────────────────────────┐                 │
│         │  Import Worker (long-running container,       │                 │
│         │  NOT Lambda — see Deployment Topology)         │                 │
│         │  1. download (yt-dlp)                          │                 │
│         │  2. transcribe (Whisper) + read caption         │                 │
│         │  3. extract keyframes (ffmpeg)                  │                 │
│         │  4. extract structured recipe (Claude — reuse   │                 │
│         │     recipe.extraction.ts pattern)                │                 │
│         │  5. canonicalize ingredients (reuse)             │                 │
│         │  6. embed (reuse Voyage)                          │                 │
│         │  7. images: pick keyframe(s) or generate (reuse   │                 │
│         │     ImageGenerator/S3)                             │                 │
│         │  8. persist Recipe (source: "imported", private)   │                 │
│         └─────────────────────┬───────────────────────┘                 │
├──────────────────────────────┼────────────────────────────────────────────┤
│  REVIEW / PUBLISH (existing Recipe + likes machinery, reused as-is)      │
│                              ▼                                            │
│   private recipe (source: imported, visibility: private)                 │
│        │ shareable link (dedicated review/edit screen)                   │
│        ▼                                                                  │
│   likes accumulate (existing LikeModel, reused unmodified)               │
│        │ threshold reached (existing promoteToVariant path, extended)    │
│        ▼                                                                  │
│   public variant (source: "variant", parentRecipeId → imported recipe)   │
└──────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|-------------------------|
| Capture adapters | Accept a URL (+ auth context), validate/normalize it, create an `ImportJob`, enqueue, return `jobId` immediately | Thin Fastify routes in `src/modules/import/import.routes.ts`; no video/LLM logic here |
| ImportJob (state) | Track the lifecycle of one import from URL to publish-ready recipe; source of truth for polling/streaming | New Mongoat model `src/modules/import/import-job.model.ts` |
| Import Worker | Do the actual heavy work: download, transcribe, extract keyframes, call LLM, canonicalize, embed, image, persist | New long-running Node process/container, NOT Lambda (binary/runtime constraints — see below) |
| Extraction service | Turn (transcript + caption + optional OCR) into structured recipe (title, ingredients w/ qty+unit, steps, tips) | New `src/modules/import/import.extraction.ts`, structurally mirrors `recipe.extraction.ts` (Claude + zod) |
| Recipe persistence | Map extracted+canonicalized data onto the existing `Recipe` doc, private + `sourceVideo` metadata | Reuses `persistExtractedRecipe()` shape from `recipe.ingestion.ts`, extended with `source: "imported"` |
| Review/Edit UI | Let user fix extraction errors, choose/generate carousel images, before making it shareable | New frontend route `web/app/(main)/import/[jobId]/page.tsx`; calls existing recipe edit endpoints |
| Like/promote loop | Count likes on a private-but-shared recipe; promote to public variant at threshold | Reuses `like.repository.ts` `maybePromote()`, generalized to also match `source: "imported"` |
| Quota/entitlement | Gate free-tier import volume, OCR, and CheffIA image gen behind PRO | Reuses `usage.repository.ts` pattern (`consumeDailyImportQuota`), `entitlement.repository.ts` (`isProUser`) |

## Recommended Project Structure

```
src/modules/import/
├── import-job.types.ts        # ImportJob state enum, ImportJobMessage shape
├── import-job.model.ts        # Mongoat schema (status, progress, error, costs)
├── import-job.repository.ts   # CRUD + state transitions (atomic $set on status)
├── import.routes.ts           # POST /import, POST /import/ext, GET /import/:jobId (poll)
├── import.service.ts          # enqueueImportJob(), orchestrates capture→queue
├── import.extraction.ts       # Claude prompt: transcript+caption(+ocr) → structured recipe
├── import.recipe-mapping.ts   # Maps ImportJob + extraction → Recipe doc (source: "imported")
└── README.md                  # Obsidian-style module doc (per user's standing instruction)

src/infra/video/                  # NEW infra namespace — external, swappable, like embeddings/images
├── downloader.port.ts           # interface: download(url) -> { videoPath, platform, author, caption }
├── ytdlp.downloader.ts          # yt-dlp shell-out implementation
├── transcription.port.ts        # interface: transcribe(audioPath) -> { text, segments }
├── whisper.transcriber.ts       # local Whisper (whisper.cpp or faster-whisper via child_process)
├── keyframes.ts                 # ffmpeg: extract N candidate frames from video
└── ocr.port.ts                  # interface: extractText(framePaths) -> string[] (PRO only)

src/workers/                      # NEW — distinct from src/lambda (Lambda unsuitable here)
└── import-worker.ts             # long-running process: polls SQS, drives ImportJob state machine

web/app/(main)/import/
├── page.tsx                     # "Paste a link" entry point + job list
└── [jobId]/page.tsx              # progress poll + review/edit before publish

web/components/
├── ImportUrlForm.tsx
├── ImportProgress.tsx           # polls GET /import/:jobId, renders state machine
└── ImageCarouselEditor.tsx      # pick/edit/regenerate 3 keyframe images
```

### Structure Rationale

- **`src/modules/import/`** follows the exact convention of every other domain module (`types → model → repository → routes → service`), so it slots into `src/modules/index.ts` and `src/app.ts` registration with zero new patterns to learn.
- **`src/infra/video/`** is new because nothing like it exists yet, but it follows the established `src/infra/{service}/` port+adapter convention (mirrors `embeddings/` and `images/`: a `.port.ts` interface + concrete implementation, swappable later — e.g. swap local Whisper for a hosted transcription API without touching the pipeline).
- **`src/workers/import-worker.ts`** is deliberately *not* `src/lambda/` — Lambda is unsuitable for this workload (see Deployment Topology). A new top-level `workers/` directory signals "long-running process," distinct from both the HTTP server (`server.ts`) and Lambda handlers (`lambda/`).

## Architectural Patterns

### Pattern 1: Capture/Pipeline Separation (Producer/Consumer)

**What:** Capture adapters (pasted link, browser extension, future share target) are dumb producers. Their only job is: validate a URL belongs to a supported platform, attach `userId`, create an `ImportJob` row, enqueue a message, return `{ jobId }`. They never touch yt-dlp, Whisper, ffmpeg, or Claude.

**When to use:** Always, for this pipeline — it's the direct generalization of how `enqueueIngestJob()` already decouples the ingest HTTP surface from `ingest-handler.ts`.

**Trade-offs:** Adds one hop (enqueue → poll) vs. doing it inline, but this is non-negotiable given the workload takes 30s-3min+ (download + transcribe + LLM), far beyond any acceptable HTTP request lifetime.

**Example:**
```typescript
// src/modules/import/import.routes.ts
app.post("/import", { preHandler: [requireAuth] }, async (req, reply) => {
  const { url } = req.body as { url: string };
  const userId = getUserId(req);
  const jobId = await enqueueImportJob(url, { userId, captureSource: "paste" });
  return reply.code(202).send({ jobId });
});

// src/modules/import/import.service.ts
export async function enqueueImportJob(url: string, opts: CaptureOpts): Promise<string> {
  const platform = detectPlatform(url); // ig | tiktok | youtube | unsupported
  if (!platform) throw new Error("unsupported_platform");

  // dedupe: same user + same source URL → return existing job, don't re-run pipeline
  const existing = await findExistingJob(opts.userId, url);
  if (existing) return existing._id as string;

  const job = await ImportJobModel.insert({
    userId: opts.userId, sourceUrl: url, platform,
    captureSource: opts.captureSource, status: "queued",
    insertedAt: new Date(), updatedAt: new Date(),
  });
  await sqsClient.send(new SendMessageCommand({
    QueueUrl: env.sqs.importQueueUrl,
    MessageBody: JSON.stringify({ jobId: job._id }),
  }));
  return job._id as string;
}
```

### Pattern 2: ImportJob State Machine (Polling Contract)

**What:** A single Mongoat document per import, with a `status` enum the worker advances through, `progress` (percent or step label), and `error` on failure. Frontend polls `GET /import/:jobId` every 1-2s; no websockets/SSE needed for MVP given job counts are low per user.

**When to use:** Any multi-step async job where the user is actively waiting and needs visible progress — directly mirrors the mental model of `consumeDailyAdaptQuota` + SQS ingest, but adds a *readable* state (existing ingest is fire-and-forget with no user-facing state).

**States:**
```
queued → downloading → transcribing → extracting → generating_images → ready_for_review → published
                                                                       ↘ failed (from any state, with `error` + `failedStep`)
```

**Trade-offs:** Polling is simpler to build/operate than SSE/websockets on Render's infra, but has higher latency (1-2s granularity) and slightly higher request volume. Acceptable given import jobs are infrequent per user (not a chat-like high-frequency stream). Revisit SSE only if user testing shows polling feels laggy.

**Example:**
```typescript
// src/modules/import/import-job.types.ts
export type ImportJobStatus =
  | "queued" | "downloading" | "transcribing" | "extracting"
  | "generating_images" | "ready_for_review" | "published" | "failed";

export interface ImportJob {
  _id?: string;
  userId: string;
  sourceUrl: string;
  platform: "instagram" | "tiktok" | "youtube";
  captureSource: "paste" | "extension" | "share_target";
  status: ImportJobStatus;
  failedStep?: ImportJobStatus;
  error?: string;
  recipeId?: string;           // set once the private Recipe doc exists
  costCents?: number;          // running cost accounting for this job
  insertedAt: Date;
  updatedAt: Date;
}
```

### Pattern 3: Reuse Extraction-Then-Persist Split (mirrors `recipe.ingestion.ts`)

**What:** Keep "extract structured data" (`import.extraction.ts`) and "map+persist into Recipe" (`import.recipe-mapping.ts`) as two separate functions, exactly like `extractRecipe()` vs `persistExtractedRecipe()` in the existing ingest module. This lets the worker retry extraction independently of persistence, and lets a future batch/backfill script reuse the mapping function directly.

**When to use:** Always — this is the single highest-leverage reuse in the whole pipeline, since ingredient canonicalization, embedding, and Recipe-doc-building logic must NOT be duplicated.

**Trade-offs:** None significant — this is a proven pattern already in the codebase.

**Example:**
```typescript
// src/modules/import/import.recipe-mapping.ts
import { resolveCanonicalForIngestion } from "@/modules/ingredients/ingredient.service.js";
import { embeddings } from "@/infra/embeddings/voyage.client.js";
import { RecipeModel } from "@/modules/recipes/recipe.model.js";

export async function persistImportedRecipe(
  job: ImportJob,
  extracted: ExtractedImportRecipe, // same shape as ExtractedRecipe + sourceVideo fields
  images: string[], // S3 URLs, 1-3 keyframes/generated
): Promise<Recipe> {
  // identical canonicalize→embed loop as persistExtractedRecipe() —
  // literally call the same helper, do not reimplement.
  const ingredients = await canonicalizeAll(extracted.ingredients);
  const embeddingText = buildEmbeddingText(/* ... */);
  const [embedding] = await embeddings.embedDocuments([embeddingText]);

  return RecipeModel.insert({
    title: extracted.title,
    intro: extracted.intro,
    thumbnailUrl: images[0] ?? "",
    images,                                  // NEW: carousel array
    ingredients, steps: extracted.steps,
    source: "imported",
    visibility: "private",                    // NEW field
    sourceVideo: {                             // NEW subdocument
      platform: job.platform, url: job.sourceUrl,
      authorHandle: extracted.authorHandle, authorUrl: extracted.authorUrl,
    },
    createdBy: [{ userId: job.userId, username: extracted.importedByUsername }],
    embeddingText, embedding, embeddingModel: env.voyage.model,
    insertedAt: new Date(), updatedAt: new Date(),
  });
}
```

## Data Flow

### Request Flow: URL → Published Recipe

```
[User pastes URL / clicks extension]
    ↓
[POST /import] → validate platform → dedupe check → ImportJobModel.insert(status: queued)
    ↓
[SQS enqueue: { jobId }]  ← 202 Accepted returned to client immediately, client starts polling
    ↓
[Import Worker picks up message]
    ↓ status: downloading
[yt-dlp: download video + caption/description + author metadata]
    ↓ status: transcribing
[Whisper: transcribe audio track]  (parallel-safe with ffmpeg keyframe extraction)
    ↓ status: extracting
[Claude: transcript + caption (+ OCR text if PRO) → structured recipe]
    ↓
[ingredient canonicalization (reuse) → Voyage embedding (reuse)]
    ↓ status: generating_images
[ffmpeg keyframes → pick best 3 OR CheffIA-generate (reuse ImageGenerator) if PRO] → S3 (reuse)
    ↓
[RecipeModel.insert(source: "imported", visibility: "private", sourceVideo: {...})]
    ↓ status: ready_for_review
[ImportJobModel.update({ status: "ready_for_review", recipeId })]
    ↓
[Frontend polls, shows review/edit screen] → user confirms/edits → [status: published]
    ↓
[Recipe stays private, gets shareable link] → likes accumulate (existing LikeModel)
    ↓ (threshold: +5 likes, existing promoteThreshold pattern, extended to match source: "imported")
[promoteToVariant(): creates/marks public "variant" doc, parentRecipeId → imported recipe]
```

### State Management

```
ImportJobModel (MongoDB)
    ↓ (poll every 1-2s)
[ImportProgress.tsx] ←→ [GET /import/:jobId] → [import-job.repository.ts] → [ImportJobModel]
    ↓ status === "ready_for_review"
[redirect to review/edit screen, hydrated from recipeId]
```

### Key Data Flows

1. **Capture → Queue:** All three capture adapters (paste, extension, future share-target) converge on the same `enqueueImportJob()` call — this is the seam that makes adding new capture methods cheap (no pipeline changes needed).
2. **Extraction → Recipe:** Structured extraction output never writes directly to `RecipeModel` — it always passes through the same canonicalize+embed steps as the existing ingest pipeline, guaranteeing imported recipes are first-class citizens in hybrid search from the moment they're created (even while private — private recipes should still be searchable in *the user's own* search scope).
3. **Private → Public:** No separate "promotion pipeline" is built. The existing `LikeModel` + `promoteToVariant()` mechanism is reused verbatim, just widened to recognize `source: "imported"` as promotable (today it only checks `source === "generated_pending"`).

## Deployment Topology — Heavy Binaries (yt-dlp / Whisper / ffmpeg)

This is the one area that is genuinely new territory for this stack and deserves an explicit, honest recommendation.

**Current infra:** Render Docker web service (API, `node:22-slim`, always-on, 512MB/0.5CPU `starter` plan) + AWS Lambda (existing ingest worker, pure Node/TS, no native binaries) + SQS + S3 + Bedrock.

**Why Lambda is the wrong home for the import worker:**
- yt-dlp requires Python + ffmpeg binaries bundled or layered; Whisper (even the lightest local models) needs either a Python runtime + torch/onnx, or a compiled `whisper.cpp` binary — both are large, non-trivial to package as Lambda layers, and reportedly are the file/dependency-size headache 
- Lambda's 15-minute max execution time and (without EFS) ephemeral `/tmp` size limit (10GB, but cold-start-unfriendly) are workable in theory, but the packaging/cold-start pain for a Python+native-binary toolchain is a poor fit next to a pure-Node stack that has zero Python today
- The existing Lambda handler (`ingest-handler.ts`) is intentionally lightweight (Node, no native deps) — bolting yt-dlp/ffmpeg/Whisper onto it breaks that simplicity and couples two very different operational profiles (fast structured-data jobs vs. slow binary-heavy jobs) into the same deploy artifact

**Recommendation: a dedicated long-running worker container, NOT Lambda.**

Two viable options, in order of preference given the existing Render footprint:

1. **Render Background Worker (Docker, same repo/monorepo)** — Render supports a `worker` service type (no HTTP port, long-running process) using the *same* Dockerfile pattern already in place, just with a Python+ffmpeg+yt-dlp layer added and a different `CMD`. This keeps ops surface minimal: one more `render.yaml` service block, same provider, same deploy flow (`autoDeploy` on push), same secrets pattern. Trade-off: Render worker instances are billed continuously like the API service; cost scales with plan tier, not per-job (fine at MVP volume, revisit if import volume grows fast).
2. **AWS Fargate (ECS) task or scheduled task, polling the same SQS queue** — better if this needs to scale elastically (spin up N tasks under load, scale to zero when idle) and the team is already comfortable with AWS (they are — S3/Bedrock/SQS/Lambda all present). More ops overhead (task definitions, ECR image push, IAM roles beyond what Lambda already needs) than Render, but avoids paying for an idle worker 24/7 and is the more "correct" AWS-native answer for spiky, binary-heavy batch work.

**MVP recommendation: start with Render Background Worker.** It reuses 100% of the existing Docker/deploy muscle memory (`Dockerfile`, `render.yaml`, secrets via Render dashboard), requires zero new AWS surface beyond the SQS queue that already exists as a pattern, and can be migrated to Fargate later without changing the worker's *code* (it's still "poll SQS, run pipeline, update Mongo") — only the deployment wrapper changes. Given the project explicitly avoids adding new frameworks/infra footprints, this is the path of least architectural surprise.

**Dockerfile implication:** the import worker needs its own Dockerfile (`Dockerfile.import-worker` or a multi-stage variant) — the existing `node:22-slim` base does not have Python, ffmpeg, or yt-dlp. Plan for a heavier base image (`python:3.12-slim` + `ffmpeg` apt package + `pip install yt-dlp` + a Whisper runtime) and a longer build time; this is a new artifact, not a modification of the existing API Dockerfile.

**Local dev implication:** yt-dlp/Whisper/ffmpeg need to be available in the dev environment too (already noted in PROJECT.md: "Whisper local já foi usado para transcrição neste ambiente (dev)" — so precedent exists). Document as a dev prerequisite (Homebrew/apt install), not something `docker-compose.yml` needs to emulate at MVP (unlike MinIO for S3), since running the actual worker locally against real binaries is more useful for debugging extraction quality than mocking it.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|---------------------------|
| MVP / early (dozens-hundreds of imports/day) | Single Render Background Worker instance, SQS with default visibility timeout tuned to worst-case pipeline duration (~3-5 min); no autoscaling needed |
| Growth (thousands/day) | Multiple worker instances/tasks consuming the same SQS queue (SQS handles fan-out naturally, no code change); consider Fargate for elastic scale-to-zero during low-traffic hours to control cost |
| High volume | Split the pipeline into per-step SQS queues (download → transcribe → extract → image) so slow steps (download, Whisper) don't block fast ones (Claude extraction), and each step can scale independently; this is a real re-architecture, not a config tweak — defer until there's evidence of a specific bottleneck |

### Scaling Priorities

1. **First bottleneck: download reliability, not throughput.** IG/TikTok/YouTube endpoint instability (already flagged as a core constraint in PROJECT.md) will cause failed jobs long before worker capacity is an issue. Prioritize retry-with-backoff and clear `failed` states with actionable `error` messages over horizontal scaling.
2. **Second bottleneck: Whisper transcription latency on a single worker instance.** CPU-bound local transcription serializes badly under concurrent jobs on one instance; horizontal worker scaling (more instances/tasks polling SQS) is the correct fix, not a bigger single instance — SQS already makes this a config change (add workers), not a code change.

## Anti-Patterns

### Anti-Pattern 1: Reimplementing Ingredient Canonicalization or Embedding Inside `import.extraction.ts`

**What people do:** Because the import extraction prompt is different (transcript-based, not text-based), it's tempting to write a parallel canonicalization/embedding path "just for imports."

**Why it's wrong:** Creates two divergent ingredient-matching behaviors in the same product; canonicalization has known gotchas (duplicate pendings, token-based reconciliation per project memory) that took real tuning — reimplementing means re-discovering those bugs.

**Do this instead:** Import extraction MUST return the exact same shape as `ExtractedRecipe.ingredients` (raw, name, core, quantity, unit) and pass through the existing `resolveCanonicalForIngestion()` + `buildEmbeddingText()` + Voyage embed call, unmodified. Only the *source* of the raw text differs (transcript+caption vs. dataset row); the pipeline downstream of "raw ingredient strings" is identical.

### Anti-Pattern 2: Making the HTTP Route Wait for the Pipeline

**What people do:** Especially for MVP speed, it's tempting to run download+transcribe+extract synchronously inside `POST /import` "just to ship faster."

**Why it's wrong:** This workload is 30s to several minutes — far past any reasonable HTTP timeout (Render, browsers, and mobile networks will all time out or feel broken). It also blocks the single Fastify event loop (already documented as an architectural constraint: "Long operations can block server").

**Do this instead:** `POST /import` only ever creates the job and enqueues — this is non-negotiable, not a "nice to have." It's the same discipline already applied to `enqueueIngestJob()`.

### Anti-Pattern 3: Coupling Capture Adapters to Platform-Specific Logic

**What people do:** Put IG-specific vs. TikTok-specific vs. YouTube-specific parsing/validation logic inside each capture route (paste vs. extension).

**Why it's wrong:** Platform detection and URL normalization is pipeline-domain logic, not capture-domain logic — duplicating it across `POST /import` and `POST /import/ext` means platform support changes (e.g. new URL format) require touching every adapter.

**Do this instead:** `detectPlatform(url)` and URL normalization live in `import.service.ts` (pipeline-side), called once by `enqueueImportJob()`. Capture adapters only extract the raw URL from their respective input shape (form body vs. extension payload) and hand it to the same shared service function.

### Anti-Pattern 4: One Giant `Recipe.images` Array With No Provenance

**What people do:** Just add `images: string[]` to the Recipe schema and leave it at that.

**Why it's wrong:** Loses the distinction between "extracted keyframe from source video" vs. "AI-generated via CheffIA" vs. "user-uploaded" — this matters for attribution/rights (a core project constraint: never re-host, always credit) and for knowing which images are safe to regenerate/replace.

**Do this instead:** Each carousel entry should carry provenance: `{ url: string; source: "keyframe" | "generated" | "upload" }[]`, not a bare string array. `thumbnailUrl` (existing field) stays as the "primary" pointer for backward compatibility with existing card/list rendering; `images` is the new carousel superset.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|----------------------|-------|
| yt-dlp | shell-out (`child_process`) from worker, writes video file to local/ephemeral disk | New dependency; version-pin and monitor for breakage — platform endpoint changes are the single biggest reliability risk per PROJECT.md constraints |
| Whisper (local) | shell-out or native binding (`whisper.cpp`/`faster-whisper`) from worker | Already used in dev per project memory; confirm the exact binary/wrapper used locally before committing to a specific packaging approach in the worker Dockerfile |
| ffmpeg | shell-out from worker, extracts N candidate keyframes as JPEGs | Standard apt package in the worker's Docker base image |
| Claude (extraction) | Reuse `src/infra/llm/anthropic.client.ts`, new prompt in `import.extraction.ts` | Same client, same zod-structured-output pattern as `recipe.extraction.ts`; prompt differs (transcript+caption input, not raw text) |
| Claude (OCR, PRO) | New capability — extract on-screen text from keyframes via vision-capable Claude call | Gate behind `isProUser()`; frame images already exist from keyframe extraction step, no extra download needed |
| Voyage (embeddings) | Reuse `src/infra/embeddings/voyage.client.ts` unmodified | No changes needed — imported recipes embed exactly like any other recipe |
| Bedrock (image gen, PRO) | Reuse `src/infra/images/image.service.ts` / `ImageGenerator` port unmodified | `ensureThumbnail()`-style flow extends naturally to "generate one of the 3 carousel slots" |
| S3 (image store) | Reuse `s3.image-store.ts` `putImage()` unmodified | Store keyframes and generated images under a new key prefix, e.g. `imports/{jobId}/{n}.jpg` |
| SQS (job queue) | New queue (`IMPORT_QUEUE_URL`), same `@aws-sdk/client-sqs` pattern as `ingest-queue.ts` | Separate queue from the existing ingest queue — different consumer (worker container, not Lambda), different visibility timeout (minutes, not seconds) |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|----------------|-------|
| Capture routes ↔ Import service | Direct function call (`enqueueImportJob()`) | Same-process, same module — no network hop; routes stay thin |
| Import service ↔ Import worker | SQS message (`{ jobId }`) | Async, decoupled process boundary — worker re-reads job state from Mongo, not from the message payload, so the message body can stay minimal (mirrors existing `IngestJobMessage` pattern but intentionally slimmer since job state lives in Mongo, enabling richer progress tracking than the fire-and-forget ingest job) |
| Import worker ↔ Ingredient/Embedding/Image modules | Direct function import (same TS codebase, different process/container) | Worker is a separate deployable but shares the `src/` codebase — same discipline as Lambda sharing `src/modules` today; no HTTP calls between worker and API for these reused pieces |
| Import worker ↔ Recipe module | Direct function import (`persistImportedRecipe` → `RecipeModel.insert`) | Worker writes directly to MongoDB, same as the existing Lambda ingest handler; no API round-trip |
| Frontend ↔ Import module | HTTP polling (`GET /import/:jobId`) | Standard REST, same auth/CORS pattern as every other frontend↔API interaction |
| Import module ↔ Likes module | Extend existing `maybePromote()` guard clause | Minimal, additive change — widen the `source` check from `"generated_pending"` to include `"imported"` (private, shareable) |

## Reuse-vs-New Map

| Concern | Reuse (as-is or extended) | Genuinely New |
|---------|----------------------------|-----------------|
| Ingredient canonicalization | `resolveCanonicalForIngestion()` — reused unmodified | — |
| Embeddings | `embeddings.embedDocuments()` (Voyage) — reused unmodified | — |
| Image generation (CheffIA) | `ImageGenerator` port + Bedrock/fake strategy — reused unmodified | Carousel selection UI (pick keyframe vs. generate) |
| Image storage | `s3.image-store.ts` `putImage()`/`presignUpload()` — reused unmodified | New key prefix convention (`imports/{jobId}/*`) |
| Structured extraction pattern | Prompt/zod-schema *pattern* from `recipe.extraction.ts` — reused as template | New prompt tailored to transcript+caption(+OCR) input; new `ExtractedImportRecipe` type (adds `authorHandle`, `authorUrl`) |
| Recipe persistence | `persistExtractedRecipe()` *shape* — reused as template, called with `source: "imported"` | `visibility` field, `images[]` carousel, `sourceVideo` subdocument on `Recipe` schema |
| Async job infra | SQS pattern (`sqs.client.ts`, send/receive) — reused as template | New dedicated queue; new worker (container, not Lambda) — see Deployment Topology |
| Promotion by likes | `LikeModel` + `promoteToVariant()` — reused, guard clause widened | — |
| Quota/entitlement | `consumeDailyAdaptQuota()` pattern, `isProUser()` — reused as template | New `import_usage` quota type; new PRO-gated checks for OCR + image gen + high-volume import |
| Auth/CORS/rate-limit | Fastify plugins, Clerk guard — reused unmodified | — |
| Download (yt-dlp) | — | New `src/infra/video/ytdlp.downloader.ts` |
| Transcription (Whisper) | Dev precedent exists per project memory | New `src/infra/video/whisper.transcriber.ts`, productionized |
| Keyframe extraction (ffmpeg) | — | New `src/infra/video/keyframes.ts` |
| OCR (PRO) | — | New `src/infra/video/ocr.port.ts` (Claude vision or dedicated OCR call) |
| Job state machine | — | New `ImportJobModel` + repository + polling route |
| Deployment: worker hosting | Render Docker deploy pattern — reused as template | New Render Background Worker service (or Fargate task) — not Lambda |

## Suggested Build Order

Dependencies flow bottom-up: capture needs the pipeline to exist; the pipeline needs the job model; publish/promote needs the recipe mapping; review UI needs a working end-to-end job.

1. **`ImportJob` model + repository + state machine** — no external dependencies, pure Mongo schema/CRUD. Unblocks everything else (worker and routes both need this to exist first).
2. **`src/infra/video/*` adapters (yt-dlp, ffmpeg keyframes) in isolation** — build and manually test download+keyframe extraction as standalone scripts before wiring into the worker; this is the highest-risk, most novel piece (binary packaging, platform quirks) and should be de-risked early and separately from the rest of the pipeline.
3. **Whisper transcription adapter** — same isolation approach; dev precedent already exists, so this is lower-risk than download but still worth validating standalone.
4. **Import Worker skeleton (deployment topology)** — stand up the Render Background Worker (or chosen alternative) polling the new SQS queue, wired to steps 1-3, updating `ImportJob.status` at each stage. Prove the deployment topology works end-to-end (even with a stubbed extraction step) before investing in extraction quality.
5. **`import.extraction.ts` (Claude prompt)** — build once transcript+caption data is reliably flowing from steps 2-4; reuses `anthropic.client.ts`.
6. **`import.recipe-mapping.ts` + `Recipe` schema additions** (`visibility`, `images[]`, `sourceVideo`) — wires extraction output through existing canonicalize/embed/persist, producing the first end-to-end private imported recipe.
7. **Capture routes (`POST /import` pasted-link first)** — thin producer, now has a real pipeline to enqueue into. Browser extension endpoint follows the same shape once the paste route is proven.
8. **Review/Edit frontend + polling** — needs a working `ready_for_review` state from step 6 to build against.
9. **Publish + shareable link + like-promotion extension** — extend `maybePromote()` guard clause; lowest-risk, purely additive to existing likes machinery.
10. **PRO gating (OCR, image gen, volume quota)** — layer on last; every prior step should work in a "free tier, basic quality" mode first, then get gated/enhanced.
11. **Browser extension client (actual extension code, not just the endpoint)** — can be built in parallel with 7-10 once the endpoint contract is stable, since it's a separate deployable artifact (extension package) with its own review/publish cycle (browser store).

**Rationale for this order:** de-risk the least-familiar, highest-uncertainty piece (video download/binary packaging/deployment topology) before investing in the parts that are mostly "reuse existing patterns" (extraction, persistence, likes). Getting one video successfully through download→transcribe→keyframes→deployed-worker proves the riskiest architectural bet; everything after that is applying well-understood patterns from the existing ingest pipeline.

## Sources

- Direct codebase inspection: `src/modules/recipes/recipe.ingestion.ts`, `recipe.extraction.ts`, `recipe.model.ts`, `src/lambda/ingest-handler.ts`, `src/infra/queue/*`, `src/infra/images/image.service.ts`, `src/modules/likes/like.repository.ts`, `src/modules/usage/usage.repository.ts`, `render.yaml`, `Dockerfile` — HIGH confidence, these are the actual existing patterns being extended.
- `.planning/PROJECT.md` — HIGH confidence, direct project requirements/constraints for this milestone.
- `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/STRUCTURE.md` — HIGH confidence, prior codebase mapping.
- Deployment topology reasoning (Lambda vs. Render worker vs. Fargate for yt-dlp/Whisper/ffmpeg) is derived from general knowledge of AWS Lambda packaging constraints (layer size limits, no native Python/binary runtime by default, cold start cost of large images) cross-referenced against the project's existing Render+Docker deploy pattern — MEDIUM confidence; no live web verification of current yt-dlp/Whisper Lambda layer size limits was performed in this pass, so treat exact packaging numbers as directional, not authoritative — verify current Lambda container image size limits (10GB) and layer limits before committing if Lambda is reconsidered later.

---
*Architecture research for: onFeed Import (URL-to-recipe video pipeline)*
*Researched: 2026-07-01*
