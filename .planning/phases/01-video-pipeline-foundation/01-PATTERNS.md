# Phase 1: Video Pipeline Foundation - Pattern Map

**Mapped:** 2026-07-01
**Files analyzed:** 22 (new/modified)
**Analogs found:** 18 / 22

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/modules/import/import-job.types.ts` | model (types) | CRUD | `src/infra/queue/ingest-job.types.ts` + `src/modules/recipes/recipe.ingestion.ts` (interfaces) | role-match |
| `src/modules/import/import-job.model.ts` | model | CRUD | `src/modules/favorites/favorite.model.ts` | exact |
| `src/modules/import/import-job.repository.ts` | service (repository) | CRUD | `src/modules/favorites/favorite.repository.ts` | exact |
| `src/modules/import/import.routes.ts` | route | request-response | `src/modules/favorites/favorite.routes.ts` | exact |
| `src/modules/import/import.service.ts` | service | request-response | `src/infra/queue/ingest-queue.ts` (`enqueueIngestJob`) + Pattern 7 in RESEARCH.md | role-match |
| `src/modules/import/README.md` | docs | — | `src/modules/favorites/README.md` | exact |
| `src/infra/video/downloader.port.ts` | utility (port/interface) | transform | none (new namespace) — mirror interface style of `src/infra/images/image.service.ts` exports | no analog |
| `src/infra/video/ytdlp.downloader.ts` | service (adapter) | file-I/O | `src/infra/images/s3.image-store.ts` (adapter shape: client getter + typed ops) | role-match |
| `src/infra/video/transcription.port.ts` | utility (port/interface) | request-response | none | no analog |
| `src/infra/video/groq.transcriber.ts` | service (adapter) | request-response | `src/infra/images/image.service.ts` (`generateImage` swap-by-env pattern) | role-match |
| `src/infra/video/openai.transcriber.ts` | service (adapter) | request-response | same as above (fallback adapter, mirrors `bedrock.image-generator.js`/`fake.image-generator.js` dual-adapter split) | role-match |
| `src/infra/video/vad.ts` | utility | transform | none (new, ffmpeg child_process) | no analog |
| `src/infra/video/keyframe.ts` | utility | file-I/O | `src/infra/images/image.service.ts` (`toThumbnail`, normalize-then-store flow) | role-match |
| `src/infra/video/ffmpeg.exec.ts` | utility (shared exec wrapper) | file-I/O | none — closest shape is `src/infra/queue/sqs.client.ts` (thin singleton/client wrapper pattern, imports from env) | partial |
| `src/infra/video/platform-breaker.ts` | service (in-process state) | event-driven | none — greenfield state machine | no analog |
| `src/workers/import-worker.ts` | worker (standalone process entrypoint) | event-driven | `src/lambda/ingest-handler.ts` (flow shape to mirror) — **topology differs**: sqs-consumer poll loop, not `SQSEvent` handler | role-match (flow only) |
| SQS import queue infra (`SQS_IMPORT_QUEUE_URL`, DLQ) | config/infra | pub-sub | `src/infra/queue/ingest-queue.ts` + `sqs.client.ts` | exact (extend, add DLQ) |
| `src/config/env.ts` (modified — add `groq`, `openai`, `sqs.import*` blocks) | config | — | existing `env.ts` `sqs`/`images`/`mp` blocks (same file, additive) | exact |
| `src/modules/index.ts` (modified — register `ImportJobModel`) | config | — | existing file, one-line addition | exact |
| `vitest.config.ts` | config (test) | — | none (Wave 0 gap — no test framework in repo) | no analog |
| `src/infra/video/ytdlp.downloader.test.ts` | test | — | none — no test files exist project-wide | no analog |
| `src/infra/video/platform-breaker.test.ts` | test | — | none | no analog |

## Pattern Assignments

### `src/modules/import/import-job.model.ts` (model, CRUD)

**Analog:** `src/modules/favorites/favorite.model.ts` (full file, 41 lines)

**Full pattern to copy** (Mongoat `Model` construction):
```typescript
import { Model, METHODS } from "@iamcalegari/mongoat";
import type { ModelValidationSchema } from "@iamcalegari/mongoat";

export interface Favorite {
  _id?: string;
  userId: string; // Clerk userId
  recipeId: string;
  insertedAt: Date;
  updatedAt: Date;
}

const schema: ModelValidationSchema = {
  bsonType: "object",
  required: ["userId", "recipeId", "insertedAt", "updatedAt"],
  properties: {
    userId: { bsonType: "string" },
    recipeId: { bsonType: "string" },
    insertedAt: { bsonType: "date" },
    updatedAt: { bsonType: "date" },
  },
};

export const FavoriteModel = new Model<Favorite>({
  collectionName: "favorites",
  schema,
  allowedMethods: [
    METHODS.FIND, METHODS.FIND_MANY, METHODS.INSERT,
    METHODS.DELETE_MANY, METHODS.TOTAL,
  ],
  documentDefaults: {
    insertedAt: new Date(),
    updatedAt: new Date(),
  } as never,
  indexes: [
    { key: { userId: 1, recipeId: 1 }, name: "user_recipe_unique", unique: true },
  ],
});
```

**Adaptation for `ImportJobModel`:**
- `collectionName: "import_jobs"`.
- `allowedMethods` must additionally include `METHODS.FIND_BY_ID` and `METHODS.UPDATE` (or `UPDATE_BY_ID`, whatever mongoat exposes) — favorites never updates a doc in place, but ImportJob is a state machine and needs atomic status transitions. Check mongoat's `METHODS` enum for the exact update-by-id member name before writing.
- Add a non-unique index on `status` (worker/idempotency queries) and optionally on `userId` (for `GET /import/:jobId` ownership + future job-list views).
- **Mongoat gotcha (from project memory):** import order matters — `import-job.model.ts` must be imported via `src/modules/index.ts` (see below) before any code calls `ImportJobModel.insert`/`findById`, and `findById` calls with a string `_id` need whatever coercion the existing models already use — check `RecipeModel`/`FavoriteModel` usage of `findById` for the exact idiom (none of the read files above call `findById` directly; `recipe.repository.ts` — not yet read — is the next place to check before implementation if `findById` behavior is unclear).
- `documentDefaults` should default `status: "queued"`, `retryCount: 0`, `insertedAt`/`updatedAt`.

**Registration** — `src/modules/index.ts` (full file, 15 lines, additive one-liner):
```typescript
import "@/modules/ingredients/ingredient.model.js";
import "@/modules/recipes/recipe.model.js";
import "@/modules/favorites/favorite.model.js";
// ... existing imports ...
import "@/modules/mealplan/mealplan.model.js";
```
Add `import "@/modules/import/import-job.model.js";` to this file — this is what makes `setupCollections()`/schema registration see the new model. Forgetting this line is the exact "Database not found" gotcha from project memory.

---

### `src/modules/import/import-job.repository.ts` (repository, CRUD)

**Analog:** `src/modules/favorites/favorite.repository.ts` (full file, 76 lines)

**Core CRUD + idempotent-insert pattern** (lines 17-29 of analog):
```typescript
export async function addFavorite(userId: string, recipeId: string): Promise<void> {
  const existing = await FavoriteModel.find({ userId, recipeId });
  if (existing) return; // idempotente
  await FavoriteModel.insert({ userId, recipeId, insertedAt: new Date(), updatedAt: new Date() });
}
```
Mirror this "check-then-insert" idempotency shape for `createImportJob`, but the real idempotency boundary for this phase is at the **worker** level (`ImportJobModel.findById` + status check per RESEARCH.md Code Example §6), not at insert time — the repository itself is straightforward CRUD:
- `createImportJob(userId, sourceUrl, normalizedUrl, platform): Promise<ImportJob>` → `ImportJobModel.insert(...)`.
- `getImportJob(jobId): Promise<ImportJob | null>` → wraps `findById`.
- `updateImportJobStatus(jobId, patch: Partial<ImportJob>): Promise<void>` — atomic partial update at each pipeline stage boundary (new capability vs. favorites, which never updates).
- `findMany`/projection idiom to reuse verbatim from lines 39-42 (`favs.map`, `{ projection: {...} }`) when listing.

---

### `src/modules/import/import.routes.ts` (route, request-response)

**Analog:** `src/modules/favorites/favorite.routes.ts` (full file, 52 lines)

**Imports + TypeBox route pattern** (lines 1-15):
```typescript
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";
import type { FastifyPluginAsync } from "fastify";

import { getUserId, requireAuth } from "@/modules/auth/auth.guard.js";
import { addFavorite, listFavoriteRecipeIds, listFavoriteRecipes, removeFavorite } from "./favorite.repository.js";

export const favoriteRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<TypeBoxTypeProvider>();
  app.get("/favorites", { preHandler: requireAuth }, async (request) => {
    const userId = getUserId(request)!;
    return { recipes: await listFavoriteRecipes(userId) };
  });
  ...
```

**POST with body schema** (lines 28-38):
```typescript
app.post(
  "/favorites",
  { preHandler: requireAuth, schema: { body: Type.Object({ recipeId: Type.String() }) } },
  async (request) => {
    await addFavorite(getUserId(request)!, request.body.recipeId);
    return { ok: true };
  },
);
```

**Adaptation for `import.routes.ts`:**
- `POST /import` — body `Type.Object({ url: Type.String() })`, `preHandler: requireAuth`. Inside: call `detectPlatform`/`normalizeUrl` (CAP-02) BEFORE creating the job; on rejection, `reply.code(400).send({ error: "unsupported_platform_or_invalid_url" })` (Fastify pattern — check `@fastify/sensible` usage elsewhere, e.g. `reply.unauthorized(...)` in `auth.guard.ts`, for the house style of error replies). On success: create `ImportJob` doc, call `enqueueImportJob`, return `202` with `{ jobId }`.
- `GET /import/:jobId` — **NEW pattern not present in favorites**: needs an ownership check. Mirror `Type.Object({ jobId: Type.String() })` params schema (line 44 of analog for the params-schema shape used in `DELETE /favorites/:recipeId`), then:
  ```typescript
  const job = await getImportJob(request.params.jobId);
  if (!job || job.userId !== getUserId(request)!) {
    return reply.notFound(); // or 403 — decide consistent with existing @fastify/sensible usage
  }
  return job;
  ```
  This ownership check (`job.userId === getUserId(req)`) has **no existing precedent to copy verbatim** in the codebase (per RESEARCH.md Security Domain V4) — it's new attack surface this phase introduces. Treat it as a required, explicit line, not something inherited from the auth guard alone.

---

### `src/modules/import/import.service.ts` (service, request-response + pub-sub producer)

**Analog (enqueue pattern):** `src/infra/queue/ingest-queue.ts` (full file, 27 lines)
```typescript
import { SendMessageCommand } from "@aws-sdk/client-sqs";
import { randomUUID } from "node:crypto";

import { env } from "@/config/env.js";
import type { IngestOptions, IngestRecipeInput } from "@/modules/recipes/recipe.ingestion.js";
import type { IngestJobMessage } from "./ingest-job.types.js";
import { sqsClient } from "./sqs.client.js";

export async function enqueueIngestJob(input: IngestRecipeInput, opts: IngestOptions): Promise<string> {
  const jobId = randomUUID();
  const message: IngestJobMessage = { jobId, input, opts };
  await sqsClient.send(new SendMessageCommand({
    QueueUrl: env.sqs.queueUrl,
    MessageBody: JSON.stringify(message),
  }));
  return jobId;
}
```

**Adaptation for `enqueueImportJob`:** mirror exactly, but note two REQUIRED deltas per CONTEXT.md/RESEARCH.md — this queue is NOT a straight copy:
1. Use the **existing** `ImportJob._id` (already inserted in Mongo by the route handler / repository) as the `jobId` in the message, rather than generating a fresh `randomUUID()` disconnected from the Mongo doc — the worker's idempotency check depends on `jobId` resolving to a real `ImportJobModel` document (see RESEARCH.md Code Example §6).
2. New queue URL env var (`env.sqs.importQueueUrl`), NOT `env.sqs.queueUrl` — this is a dedicated queue, and per CONCERNS.md the existing ingest queue lacks a DLQ; the import queue's SQS-side redrive policy (`maxReceiveCount: 3` → DLQ) must be provisioned, unlike the ingest queue.

**Platform detection/normalization** — no existing codebase analog (greenfield CAP-02 logic); use RESEARCH.md Code Example §7 verbatim as the starting implementation (regex-based `detectPlatform`/`normalizeUrl`, already vetted against the project's URL shapes).

---

### `src/infra/video/*.ts` (infra namespace — downloader/transcription/keyframe/vad/breaker)

**No direct existing analog** — this is a genuinely new infra namespace (mirrors the *namespacing convention* of `src/infra/images/*`, not any specific file's logic). Key structural pattern to copy from `src/infra/images/image.service.ts` (full file, 106 lines):

**Env-driven adapter swap** (lines 9-12):
```typescript
// Dev local usa o gerador fake (Bedrock não emula); produção usa o Bedrock.
const generateImage = env.images.fakeGenerator ? generateFake : generateViaBedrock;
```
Apply the same idiom for transcription fallback if useful for local dev (e.g., a dry-run/mock transcriber gated by an env flag), though the PRIMARY fallback (Groq → OpenAI) is a runtime try/catch inside `transcription.port.ts`'s orchestrator, not an env-time swap — see RESEARCH.md Architecture Pattern (Groq primary / OpenAI fallback via try/catch, not conditional wiring).

**Normalize-then-store pattern to reuse verbatim** (lines 21-26, 86-96):
```typescript
async function toThumbnail(input: Buffer): Promise<Buffer> {
  return sharp(input)
    .resize(THUMB_SIZE, THUMB_SIZE, { fit: "cover" })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
}
// ...
const raw = await generateImage(prompt, negativePrompt);
const thumb = await toThumbnail(raw);
return putImage(`recipes/${recipe._id}.jpg`, thumb, "image/jpeg");
```
For the extracted keyframe (PIPE-04): after `extractKeyframe()` writes a JPEG to a local temp path, read it into a `Buffer`, run it through **this exact `toThumbnail` logic** (either import/reuse `image.service.ts`'s function directly if exported, or duplicate the identical `sharp(...).resize(512,512,{fit:"cover"}).jpeg({quality:82,mozjpeg:true})` chain — RESEARCH.md explicitly calls this out as "reuse verbatim, do not reimplement"), then `putImage(\`imports/${jobId}/keyframe.jpg\`, thumb, "image/jpeg")`.

**S3 client/store pattern** — `src/infra/images/s3.image-store.ts` (full file, 66 lines) — reuse `putImage()` unmodified (already generic on `key`/`bytes`/`contentType`, no code changes needed, just call it with an `imports/...` key prefix instead of `recipes/...`).

**ffmpeg shell-out pattern** — no codebase analog; use RESEARCH.md Code Examples §3-5 verbatim (`execFile`, NOT `exec`, with an args array — this is also the ASVS V12/command-injection mitigation per RESEARCH.md Security Domain). Key shared pattern across `ffmpeg.exec.ts`, `vad.ts`, `keyframe.ts`:
```typescript
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const execFileAsync = promisify(execFile);
const FFMPEG_BIN = process.env.FFMPEG_PATH ?? "ffmpeg";
```

**yt-dlp adapter + error classification** — no codebase analog; use RESEARCH.md Architecture Pattern 1 verbatim (`classifyYtdlpError`, `DownloadError` class, `DownloadFailureReason` union). Structurally this is closest in shape to `s3.image-store.ts`'s pattern of "one module = one external system boundary, typed functions in/out, errors surfaced as typed classes/reasons rather than raw strings."

---

### `src/workers/import-worker.ts` (worker, event-driven)

**Analog (flow shape only, NOT topology):** `src/lambda/ingest-handler.ts` (full file, 31 lines)
```typescript
// A ordem dos imports é crítica: connection cria o Database singleton do mongoat
// antes que qualquer model tente se registrar.
import { connectDatabase } from "@/infra/database/connection.js";
import "@/modules/index.js";
import type { IngestJobMessage } from "@/infra/queue/ingest-job.types.js";
import { ingestRecipe } from "@/modules/recipes/recipe.ingestion.js";
import type { SQSEvent } from "aws-lambda";

let dbConnected = false;
async function ensureDbConnected(): Promise<void> {
  if (dbConnected) return;
  await connectDatabase();
  dbConnected = true;
}

export const handler = async (event: SQSEvent): Promise<void> => {
  await ensureDbConnected();
  for (const record of event.Records) {
    const message = JSON.parse(record.body) as IngestJobMessage;
    const recipe = await ingestRecipe(message.input, message.opts);
    console.log(`[lambda] salvo: ${recipe._id as string} (job ${message.jobId})`);
  }
};
```

**What to copy:** the import-order comment/discipline (`connectDatabase()` before `@/modules/index.js` before any model use — this is the exact Mongoat "Database not found" gotcha from project memory), the `ensureDbConnected`/connect-once guard, the `JSON.parse(message.Body)` → typed message → call domain function → log shape.

**What NOT to copy — critical topology divergence:** `import-worker.ts` is a **standalone long-running process**, not a Lambda `handler(event: SQSEvent)`. Do not reuse the `SQSEvent`/`event.Records` shape at all. Use `sqs-consumer`'s `Consumer.create({ queueUrl, sqs: sqsClient, handleMessage })` long-poll loop per RESEARCH.md Code Example §6, reusing the **existing** `sqsClient` singleton from `src/infra/queue/sqs.client.ts` (full file, 4 lines):
```typescript
import { SQSClient } from "@aws-sdk/client-sqs";
import { env } from "@/config/env.js";
export const sqsClient = new SQSClient({ region: env.aws.region });
```
This client is generic (region-only) and can be reused as-is for the new import queue — no new SQS client needed, just a new `env.sqs.importQueueUrl` value passed to `Consumer.create`.

---

## Shared Patterns

### Auth guard + ownership check
**Source:** `src/modules/auth/auth.guard.ts` (full file, 22 lines)
```typescript
import { getAuth } from "@clerk/fastify";
import type { FastifyReply, FastifyRequest } from "fastify";

export function getUserId(req: FastifyRequest): string | null {
  try {
    return getAuth(req).userId ?? null;
  } catch {
    return null;
  }
}

export async function requireAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!getUserId(req)) {
    return reply.unauthorized("Autenticação necessária");
  }
}
```
**Apply to:** `POST /import` (reuse `requireAuth` preHandler unmodified). `GET /import/:jobId` additionally needs the manual `job.userId === getUserId(req)` check inside the handler body (no existing route in the codebase does per-resource ownership checks this way — `favorite.routes.ts` scopes every query by `userId` at the repository level instead, which is actually the safer pattern to copy: prefer `getImportJob(jobId, userId)` that filters by both fields in the Mongo query, rather than fetching-then-comparing in the route).

### Env var validation
**Source:** `src/config/env.ts` (full file, 121 lines) — additive block pattern, e.g. lines 95-98 (`sqs`) and lines 100-120 (`images`):
```typescript
sqs: {
  queueUrl: optional("SQS_INGEST_QUEUE_URL", ""),
  enabled: Boolean(process.env.SQS_INGEST_QUEUE_URL),
},
```
**Apply to:** add new blocks (not new files) inside `env.ts`:
```typescript
sqs: {
  queueUrl: optional("SQS_INGEST_QUEUE_URL", ""),
  enabled: Boolean(process.env.SQS_INGEST_QUEUE_URL),
  importQueueUrl: optional("SQS_IMPORT_QUEUE_URL", ""),
  importDlqUrl: optional("SQS_IMPORT_DLQ_URL", ""),
  importEnabled: Boolean(process.env.SQS_IMPORT_QUEUE_URL),
},
groq: {
  apiKey: required("GROQ_API_KEY"), // or optional+enabled flag if Groq should not hard-fail boot in dev
  model: optional("GROQ_WHISPER_MODEL", "whisper-large-v3-turbo"),
},
openaiTranscription: {
  apiKey: optional("OPENAI_API_KEY", ""), // fallback — likely should NOT be `required()`, mirror `mp.enabled` pattern (feature degrades, doesn't hard-fail boot)
},
```
Follow the `required()` vs `optional()`-with-`enabled`-flag decision precedent already in the file: `mongo`/`voyage`/`anthropic` use `required()` (hard boot failure — truly load-bearing), while `mp`/`clerk`/`images` use `optional()` + a derived `enabled: Boolean(...)` (feature gracefully degrades if unconfigured, per the `mp.enabled` comment at lines 60-63). Given Groq is the phase's primary transcription path but the worker is a separate deployable from the API, prefer the `optional()+enabled` style for both Groq/OpenAI keys so a missing key fails a `transcription_failed` job cleanly rather than crashing the whole worker process at boot.

### Module registration (Mongoat)
**Source:** `src/modules/index.ts` (full file, 15 lines) — see full excerpt above under `import-job.model.ts`. **Apply to:** add `import "@/modules/import/import-job.model.js";`.

### Per-module Obsidian README
**Source:** `src/modules/favorites/README.md` (full file, 61 lines) — frontmatter (`tags`, `updated`), `## Arquivos` table, `## Rotas` code block, wikilinks (`[[Recipes]]`, `[[Auth]]`), `> [!TIP]`/`> [!INFO]` callouts for non-obvious behavior.
**Apply to:** new `src/modules/import/README.md` — per project memory (feedback-readme-obsidian), this is a required deliverable, not optional polish, whenever a module is created/modified. Should document: `ImportJob` state machine diagram/table, the `POST /import` / `GET /import/:jobId` routes, the ownership-check note, links to `[[Auth]]` and (once Phase 2 exists) forward-reference to extraction. Should also cross-reference `src/infra/video/` as the infra namespace it depends on (infra dirs don't currently have their own README per the codebase survey — flag to planner whether `src/infra/video/README.md` should also be created, following the same Obsidian convention, since it's a materially large new namespace).

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `src/infra/video/platform-breaker.ts` | service | event-driven | No circuit-breaker or in-process rolling-state pattern exists anywhere in the codebase — greenfield; RESEARCH.md Architecture Pattern 3 is the concrete spec to implement from (thresholds are tunable, not fixed) |
| `src/infra/video/vad.ts` | utility | transform | No audio/media-signal-processing code exists in the codebase — use RESEARCH.md Code Example §4 (`silencedetect` stderr parsing) as the base implementation |
| `src/infra/video/downloader.port.ts` / `transcription.port.ts` | utility (interface) | — | No port/adapter interface convention exists yet in the codebase (existing `infra/images` doesn't define an explicit port type, it just exports functions directly) — planner should decide whether to introduce formal `interface X { ... }` port types (RESEARCH.md's recommended structure) or follow the simpler "just export typed functions" convention `image.service.ts` already uses, for consistency |
| `vitest.config.ts` + all `*.test.ts` files | test/config | — | Confirmed zero test files/framework exist project-wide (CONCERNS.md, re-confirmed via RESEARCH.md Validation Architecture) — this is a Wave 0 gap, not a missing-analog gap; there is nothing to mirror, only RESEARCH.md's own Phase Requirements → Test Map to follow |
| `src/infra/video/ffmpeg.exec.ts` | utility | file-I/O | No `child_process` usage precedent anywhere in `src/` (only npm-package/SDK calls exist) — RESEARCH.md Code Examples §3-5 are the concrete starting implementations |

## Metadata

**Analog search scope:** `src/modules/*` (favorites, ratings, auth, recipes), `src/infra/*` (queue, images), `src/lambda/*`, `src/config/env.ts`
**Files scanned:** ~15 read in full (favorite.model.ts, favorite.repository.ts, favorite.routes.ts, favorite/README.md, ingest-handler.ts, ingest-queue.ts, ingest-job.types.ts, sqs.client.ts, image.service.ts, s3.image-store.ts, env.ts, auth.guard.ts, auth.routes.ts, recipe.ingestion.ts, modules/index.ts) + package.json for dependency/script conventions
**Pattern extraction date:** 2026-07-01
```
