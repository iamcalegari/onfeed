# Phase 4: Cost/Quota Gating & Dedup - Pattern Map

**Mapped:** 2026-07-02
**Files analyzed:** 10
**Analogs found:** 10 / 10

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `src/modules/usage/usage.repository.ts` (+`consumeDailyImportQuota`, +`refundDailyImportQuota`) | service | CRUD (atomic counter) | `consumeDailyAdaptQuota`/`getDailyAdaptCount` in the SAME file | exact |
| `src/modules/usage/import-usage.model.ts` (new, dedicated collection per Open Question 2) | model | CRUD | `src/modules/usage/usage.model.ts` (`AdaptUsageModel`) | exact |
| `src/modules/import/import-job.repository.ts` (+`findExistingSuccessfulImport`) | service/repository | CRUD (owner-scoped lookup) | `getImportJob(jobId, userId)` in the SAME file | exact |
| `src/modules/import/import.routes.ts` (`POST /import`: dedup → quota gate → create/enqueue) | route/controller | request-response | (a) same file's existing `POST /import` handler (structure/ordering to extend); (b) `src/modules/recipes/recipe.routes.ts` ~L196-212 (the gate to mirror) | exact (structure) + exact (gate) |
| `src/modules/import/import-job.types.ts` (+ nested `costCents`) | model/types | transform | same file, existing `costCents?` placeholder shape | exact |
| `src/modules/import/import-job.model.ts` (+ BSON validator for nested `costCents`, +compound index) | model | CRUD (schema/validator) | same file, existing `costCents` BSON block + `indexes` array | exact |
| `src/infra/video/pipeline.ts` (+ per-stage cost recording, +refund call in `failJob`) | service/orchestrator | event-driven (stage pipeline) | same file, existing `updateImportJobStatus` stage-boundary calls + `failJob` | exact |
| `src/config/env.ts` (+`import.dailyLimitFree/Pro` +price table) | config | config | same file, existing `env.anthropic.adaptDailyLimitFree/Pro` block | exact |
| `src/modules/usage/usage.repository.test.ts` (new) | test | request-response (unit) | `src/modules/import/import-job.repository.test.ts` (mongoat model-mocking convention) | role-match |
| `src/modules/import/import.routes.dedup.test.ts` / `import.routes.quota.test.ts` (new) | test | request-response (unit, Fastify inject) | `src/modules/import/import.routes.confirm.test.ts` (Fastify `inject` + module-mock conventions) | exact |

## Pattern Assignments

### `src/modules/usage/usage.repository.ts` (service, CRUD atomic counter)

**Analog:** same file, `consumeDailyAdaptQuota` / `getDailyAdaptCount` (`src/modules/usage/usage.repository.ts:1-38`, read in full)

**Imports pattern** (line 1):
```typescript
import { AdaptUsageModel } from "./usage.model.js";
```
For the new function, import the new dedicated model instead:
```typescript
import { ImportUsageModel } from "./import-usage.model.js";
```

**Core atomic-upsert pattern** (lines 14-31, copy verbatim structure):
```typescript
export async function consumeDailyAdaptQuota(
  userId: string,
  limit: number,
): Promise<QuotaResult> {
  const day = new Date().toISOString().slice(0, 10);
  const doc = (await AdaptUsageModel.update(
    { userId, day },
    {
      $inc: { count: 1 },
      $setOnInsert: { insertedAt: new Date() },
      $set: { updatedAt: new Date() },
    },
    { upsert: true },
  )) as { count?: number } | null;

  const count = doc?.count ?? 1;
  return { allowed: count <= limit, count, limit };
}
```
`consumeDailyImportQuota(userId, limit)` is a 1:1 copy of this against `ImportUsageModel`. `refundDailyImportQuota(userId, day)` is a NEW pattern (no precedent in this file) — negative `$inc`, no upsert needed since the day-doc must already exist (quota was reserved before the job could fail):
```typescript
export async function refundDailyImportQuota(userId: string, day: string): Promise<void> {
  await ImportUsageModel.update(
    { userId, day },
    { $inc: { count: -1 }, $set: { updatedAt: new Date() } },
  );
}
```

**Read-only pattern** (lines 33-38, mirror if a `/me`-style read is needed):
```typescript
export async function getDailyAdaptCount(userId: string): Promise<number> {
  const day = new Date().toISOString().slice(0, 10);
  const doc = (await AdaptUsageModel.find({ userId, day })) as { count?: number } | null;
  return doc?.count ?? 0;
}
```

**Note:** `QuotaResult` interface (lines 3-7) is already generic (`{allowed, count, limit}`) — reuse it directly for `consumeDailyImportQuota`'s return type, no new type needed.

---

### `src/modules/usage/import-usage.model.ts` (model, new dedicated collection)

**Analog:** `src/modules/usage/usage.model.ts` (`AdaptUsageModel`, full file, 37 lines)

**Full pattern to copy** (rename `AdaptUsage`→`ImportUsage`, `adapt_usage`→`import_usage`):
```typescript
import { Model, METHODS } from "@iamcalegari/mongoat";
import type { ModelValidationSchema } from "@iamcalegari/mongoat";

export interface ImportUsage {
  _id?: string;
  userId: string;
  day: string; // YYYY-MM-DD (UTC)
  count: number;
  insertedAt: Date;
  updatedAt: Date;
}

const schema: ModelValidationSchema = {
  bsonType: "object",
  required: ["userId", "day", "count", "insertedAt", "updatedAt"],
  properties: {
    userId: { bsonType: "string" },
    day: { bsonType: "string" },
    count: { bsonType: "number" },
    insertedAt: { bsonType: "date" },
    updatedAt: { bsonType: "date" },
  },
};

export const ImportUsageModel = new Model<ImportUsage>({
  collectionName: "import_usage",
  schema,
  allowedMethods: [METHODS.UPDATE, METHODS.FIND],
  documentDefaults: {
    count: 0,
    insertedAt: new Date(),
    updatedAt: new Date(),
  } as never,
  indexes: [
    { key: { userId: 1, day: 1 }, name: "user_day_unique", unique: true },
  ],
});
```
Per RESEARCH.md Open Question 2: a **dedicated new collection**, not a discriminator field on `AdaptUsageModel` — zero risk to the existing production `adapt_usage` index.

---

### `src/modules/import/import-job.repository.ts` (service/repository, CRUD owner-scoped lookup)

**Analog:** same file, `getImportJob(jobId, userId)` (`src/modules/import/import-job.repository.ts:34-44`, full file read, 60 lines)

**Imports** (lines 1-4, unchanged, reuse):
```typescript
import { ObjectId } from "mongodb";

import { ImportJobModel } from "./import-job.model.js";
import type { ImportJob } from "./import-job.types.js";
```

**Owner-scoped query pattern to copy** (lines 34-44 — the exact idiom: `userId` folded into the Mongo filter itself, never fetch-then-compare):
```typescript
export async function getImportJob(
  jobId: string,
  userId?: string,
): Promise<ImportJob | null> {
  if (userId) {
    const job = await ImportJobModel.find({ _id: new ObjectId(jobId), userId } as never);
    return (job as ImportJob | null) ?? null;
  }
  const job = await ImportJobModel.findById(jobId);
  return (job as ImportJob | null) ?? null;
}
```

**New function to add**, same idiom, filtering by `normalizedUrl` + `status` instead of `_id`:
```typescript
export async function findExistingSuccessfulImport(
  userId: string,
  normalizedUrl: string,
): Promise<ImportJob | null> {
  const job = await ImportJobModel.find({
    userId,
    normalizedUrl,
    status: "ready_for_review",
  } as never);
  return (job as ImportJob | null) ?? null;
}
```
Note (RESEARCH Pattern 3): `status: "ready_for_review"` is the ONLY terminal-success state to match — there is no separate `"confirmed"` `ImportJobStatus` value (confirmation lives on `Recipe.confirmedAt`, orthogonal to `ImportJob.status`). `"failed"` must never match (D-05).

---

### `src/modules/import/import.routes.ts` (route/controller, request-response)

**Analog A (structure to extend):** same file, existing `POST /import` handler (`src/modules/import/import.routes.ts:70-94`, full file read, 165 lines)

**Analog B (the gate to mirror verbatim):** `src/modules/recipes/recipe.routes.ts` lines 196-212 (adapt quota gate)

**Current imports** (lines 1-13, extend with new imports):
```typescript
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { type Static, Type } from "@sinclair/typebox";
import type { FastifyPluginAsync } from "fastify";

import { getUserId, requireAuth } from "@/modules/auth/auth.guard.js";
import { createImportJob, getImportJob } from "./import-job.repository.js";
import {
  confirmImportedRecipe,
  detectPlatform,
  enqueueImportJob,
  listMyImportedRecipes,
  normalizeUrl,
} from "./import.service.js";
```
Add: `findExistingSuccessfulImport` from `./import-job.repository.js`; `isProUser` from `@/modules/billing/entitlement.repository.js`; `consumeDailyImportQuota` from `@/modules/usage/usage.repository.js`; `env` from `@/config/env.js`.

**Auth/guard pattern** (unchanged, already present at line 73): `preHandler: requireAuth`.

**Gate pattern to mirror verbatim** (recipe.routes.ts:196-212, read this session):
```typescript
const userId = getUserId(request)!;

// Gate de custo: o limite depende do plano (fonte de verdade no módulo
// billing). PRO tem teto alto só como guarda anti-abuso; free bate cedo
// porque cada adaptação é uma chamada paga de LLM.
const pro = await isProUser(userId);
const limit = pro
  ? env.anthropic.adaptDailyLimitPro
  : env.anthropic.adaptDailyLimitFree;
const quota = await consumeDailyAdaptQuota(userId, limit);
if (!quota.allowed) {
  return reply.tooManyRequests(
    pro
      ? `Limite diário de adaptações atingido (${quota.limit}/dia). Tente amanhã.`
      : `Você usou suas ${quota.limit} adaptações grátis de hoje. Assine o onFeed Pro para adaptações ilimitadas.`,
  );
}
```
Substitute `adaptDailyLimitPro/Free`→`env.import.dailyLimitPro/Free`, `consumeDailyAdaptQuota`→`consumeDailyImportQuota`, message text "adaptações"→"importações".

**Current core handler to extend** (import.routes.ts:70-94, full body):
```typescript
app.post(
  "/import",
  {
    preHandler: requireAuth,
    schema: { body: Type.Object({ url: Type.String() }) },
  },
  async (request, reply) => {
    const userId = getUserId(request)!;
    const { url } = request.body;

    const platform = detectPlatform(url);
    if (!platform) {
      return reply.code(400).send({ error: classifyRejectionReason(url) });
    }

    const normalizedUrl = normalizeUrl(url);
    const job = await createImportJob(userId, url, normalizedUrl, platform);
    await enqueueImportJob(job._id!);

    return reply.code(202).send({ jobId: job._id });
  },
);
```
Insert dedup guard, then quota guard, between `normalizeUrl(url)` and `createImportJob` (D-07 ordering — dedup first, quota second):
```typescript
const normalizedUrl = normalizeUrl(url);

// ① Dedup FIRST — a hit costs nothing, short-circuits before quota (D-07).
const existing = await findExistingSuccessfulImport(userId, normalizedUrl);
if (existing?.recipeId) {
  return reply.code(200).send({ recipeId: existing.recipeId, deduped: true });
}

// ② Quota gate — mirrors recipe.routes.ts adapt gate verbatim (D-04).
const pro = await isProUser(userId);
const limit = pro ? env.import.dailyLimitPro : env.import.dailyLimitFree;
const quota = await consumeDailyImportQuota(userId, limit);
if (!quota.allowed) {
  return reply.tooManyRequests(
    pro
      ? `Limite diário de importações atingido (${quota.limit}/dia). Tente amanhã.`
      : `Você usou suas ${quota.limit} importações grátis de hoje. Assine o onFeed Pro para importar mais.`,
  );
}

// ③ Create + enqueue (unchanged).
const job = await createImportJob(userId, url, normalizedUrl, platform);
await enqueueImportJob(job._id!);
return reply.code(202).send({ jobId: job._id });
```

**IDOR/ownership discipline** (already established in this file, lines 105-109 comment): dedup lookup must fold `userId` into the Mongo filter itself — never fetch by `normalizedUrl` alone then compare in application code.

---

### `src/modules/import/import-job.types.ts` (model/types, transform)

**Analog:** same file, existing `costCents?` placeholder (`src/modules/import/import-job.types.ts:51-56`, full file read, 66 lines)

**Current shape to expand:**
```typescript
costCents?: {
  // placeholders — populados na Fase 4, mas o shape já existe agora
  download?: number;
  transcription?: number;
  total?: number;
};
```
**Target nested shape** (per RESEARCH.md "Primary recommendation" and Code Examples section — raw units + cents per stage):
```typescript
costCents?: {
  download?: { bytes?: number; cents?: number };
  transcription?: { minutes?: number; cents?: number };
  extraction?: { inputTokens?: number; outputTokens?: number; cents?: number };
  embedding?: { tokens?: number; cents?: number };
  totalCents?: number;
};
```
Precedent for "how Phase 2/3 added optional fields to types" (same file, lines 49-50):
```typescript
reviewRequired?: boolean; // de computeConfidence — Fase 3 consome para UI
confidenceScore?: number; // 0..1, de computeConfidence — Fase 3 consome
```
Follow the same optional-field + inline Portuguese comment convention.

---

### `src/modules/import/import-job.model.ts` (model, BSON validator + index)

**Analog:** same file, existing `costCents` BSON block + `indexes` array (`src/modules/import/import-job.model.ts`, full file read, 74 lines)

**Current BSON block to expand** (lines 34-41):
```typescript
costCents: {
  bsonType: "object",
  properties: {
    download: { bsonType: "number" },
    transcription: { bsonType: "number" },
    total: { bsonType: "number" },
  },
},
```
**Target nested BSON validator** (mirrors the new type shape, must be updated in the SAME commit per mongoat two-source gotcha):
```typescript
costCents: {
  bsonType: "object",
  properties: {
    download: {
      bsonType: "object",
      properties: { bytes: { bsonType: "number" }, cents: { bsonType: "number" } },
    },
    transcription: {
      bsonType: "object",
      properties: { minutes: { bsonType: "number" }, cents: { bsonType: "number" } },
    },
    extraction: {
      bsonType: "object",
      properties: {
        inputTokens: { bsonType: "number" },
        outputTokens: { bsonType: "number" },
        cents: { bsonType: "number" },
      },
    },
    embedding: {
      bsonType: "object",
      properties: { tokens: { bsonType: "number" }, cents: { bsonType: "number" } },
    },
    totalCents: { bsonType: "number" },
  },
},
```

**Existing `indexes` array to extend** (lines 67-72):
```typescript
indexes: [
  // consultas do worker/painel por estado do pipeline
  { key: { status: 1 }, name: "status_lookup" },
  // GET /import/:jobId (ownership) e futuras listagens por usuário
  { key: { userId: 1 }, name: "user_lookup" },
],
```
Add compound index for the dedup query (per RESEARCH.md, `{userId:1, normalizedUrl:1, status:1}`):
```typescript
{ key: { userId: 1, normalizedUrl: 1, status: 1 }, name: "dedup_lookup" },
```

**CRITICAL — mongoat two-source gotcha (per project memory + RESEARCH Pitfall 5):** the `costCents` type (types.ts) and BSON validator (model.ts) are independently maintained. Both files MUST change in the same task, followed by `yarn setup:db` to apply the validator + new index against the running Mongo instance before any pipeline code writes the new shape.

---

### `src/infra/video/pipeline.ts` (service/orchestrator, event-driven stage pipeline)

**Analog:** same file, existing `updateImportJobStatus` stage-boundary calls + `failJob` (`src/infra/video/pipeline.ts:1-175+`, read this session — imports, `failJob`, and download/transcribing stage boundaries confirmed)

**Imports pattern** (lines 23-39, extend with cost-table helpers):
```typescript
import { updateImportJobStatus } from "@/modules/import/import-job.repository.js";
import type { ImportFailureReason, ImportJob } from "@/modules/import/import-job.types.js";
import { extractImportedRecipe } from "@/modules/import/import.extraction.js";
import { computeConfidence } from "@/modules/import/import.confidence.js";
import { mapExtractedToRecipe } from "@/modules/import/import.recipe-mapping.js";
import { persistExtractedRecipe } from "@/modules/recipes/recipe.ingestion.js";
import { DownloadError, downloadVideo, type DownloadFailureReason } from "./ytdlp.downloader.js";
import { extractAudio } from "./ffmpeg.exec.js";
import { detectSilenceRatio, NO_SPEECH_RATIO_THRESHOLD } from "./vad.js";
import { extractNormalizedKeyframe } from "./keyframe.js";
import { transcribe, TranscriptionError } from "./transcription.port.js";
import { isOpen, recordOutcome } from "./platform-breaker.js";
import { putImage } from "@/infra/images/s3.image-store.js";
```
Add: `refundDailyImportQuota` from `@/modules/usage/usage.repository.js`; `env` from `@/config/env.js` (price table); `stat` from `node:fs/promises` (download bytes).

**Existing `failJob` — the SINGLE safe refund point** (lines 100-115, verbatim, full function body):
```typescript
async function failJob(job: ImportJob, reason: ImportFailureReason, rawDetail?: string): Promise<void> {
  if (rawDetail !== undefined) {
    console.error(`[pipeline] job ${jobId(job)} failed: ${reason} — ${rawDetail}`);
  }
  await updateImportJobStatus(jobId(job), {
    status: "failed",
    failedStep: job.status,
    failureReason: reason,
    errorMessage: USER_SAFE_MESSAGES[reason],
  });
}
```
Add refund AFTER the status write, keyed by the day the slot was reserved (`job.insertedAt`, NOT `new Date()` — see RESEARCH.md Pattern 2 anti-pattern):
```typescript
  const day = job.insertedAt.toISOString().slice(0, 10);
  await refundDailyImportQuota(job.userId, day);
```
Confirmed as the only safe refund point: every failure branch in `processImportJob` calls `failJob` exactly once (lines 135, 159, 164, 168, 195, 245 — all traced this session), and the worker's `TERMINAL_STATUSES` no-op guard prevents `processImportJob` (hence `failJob`) from ever re-running on an already-`failed` job.

**Stage-boundary write pattern to extend** (e.g. lines 140-146, download boundary):
```typescript
await updateImportJobStatus(id, { status: "downloading" });
const videoPath = path.join(jobDir, "video.mp4");
let downloadResult: Awaited<ReturnType<typeof downloadVideo>>;
try {
  downloadResult = await downloadVideo(job.sourceUrl, videoPath);
  recordOutcome(job.platform, true);
} catch (err) { ... }
```
Add cost recording immediately after each successful stage call (do not invent a new write pattern — accumulate into a local `costCents` object and persist via the SAME `updateImportJobStatus(id, {...})` calls already at each boundary, e.g. the write at lines 203 and 261 already patch multiple fields at once — add `costCents` there).

**Structured logging pattern** (lines 91-98, `logOutcome`, verbatim — reuse for cost telemetry, never log payloads/transcripts per D-08):
```typescript
function logOutcome(entry: {
  platform: string;
  outcome: "success" | "failure";
  failureReason?: ImportFailureReason;
  durationMs: number;
}): void {
  console.log("[pipeline] outcome", JSON.stringify(entry));
}
```
Follow this exact idiom (`console.log("[pipeline] <event>", JSON.stringify({...aggregateNumbersOnly}))`) for a new cost-telemetry log line — aggregate numbers only (bytes, minutes, tokens, cents), never transcript/payload content.

---

### `src/config/env.ts` (config)

**Analog:** same file, existing `env.anthropic.adaptDailyLimitFree/Pro` block (`src/config/env.ts:47-58`, lines read this session)

**Pattern to copy** (lines 54-57):
```typescript
// Gate de custo de IA por plano (ver módulo billing). Free bate cedo porque
// cada adaptação custa uma chamada de LLM; PRO tem teto alto anti-abuso.
adaptDailyLimitFree: Number(optional("ADAPT_DAILY_LIMIT_FREE", "3")),
adaptDailyLimitPro: Number(optional("ADAPT_DAILY_LIMIT_PRO", "100")),
```
New `env.import` block (extends the existing `import: {...}` section that already has `maxDurationSec` per RESEARCH.md Code Examples — confirm exact existing shape before editing, this session did not read `env.ts`'s full `import` block, only `anthropic`):
```typescript
dailyLimitFree: Number(optional("IMPORT_DAILY_LIMIT_FREE", "3")),
dailyLimitPro: Number(optional("IMPORT_DAILY_LIMIT_PRO", "50")),
// Price table (D-08) — cents per unit, source-dated in comments; estimates
// for operational review (COST-02), never billing-critical.
priceCentsPerGbEgress: Number(optional("IMPORT_PRICE_CENTS_PER_GB_EGRESS", "9")),
priceCentsPerAsrMinuteGroq: Number(optional("IMPORT_PRICE_CENTS_PER_ASR_MIN_GROQ", "0.0667")),
priceCentsPerAsrMinuteOpenai: Number(optional("IMPORT_PRICE_CENTS_PER_ASR_MIN_OPENAI", "0.6")),
priceCentsPerMtokLlmInput: Number(optional("IMPORT_PRICE_CENTS_PER_MTOK_LLM_IN", "300")),
priceCentsPerMtokLlmOutput: Number(optional("IMPORT_PRICE_CENTS_PER_MTOK_LLM_OUT", "1500")),
priceCentsPerMtokEmbedding: Number(optional("IMPORT_PRICE_CENTS_PER_MTOK_EMBED", "6")),
```
Uses the same `Number(optional("ENV_VAR", "default"))` idiom throughout the file.

---

### Test files

#### `src/modules/usage/usage.repository.test.ts` (new — first coverage of this repository file)

**Analog:** `src/modules/import/import-job.repository.test.ts` (full file, 100 lines) — mongoat model-mocking convention

**Mock pattern to copy** (lines 13-19):
```typescript
vi.mock("./import-job.model.js", () => ({
  ImportJobModel: {
    insert: vi.fn(),
    findById: vi.fn(),
    update: vi.fn(),
  },
}));
```
For `usage.repository.test.ts`, mock `./import-usage.model.js` → `{ ImportUsageModel: { update: vi.fn(), find: vi.fn() } }`.

**Assertion pattern** (lines 75-98 — verify filter/update shape, not implementation detail):
```typescript
expect(ImportJobModel.update).toHaveBeenCalledTimes(1);
const [filter, updateDoc] = vi.mocked(ImportJobModel.update).mock.calls[0]!;
expect(updateDoc).toMatchObject({ $set: { ... } });
expect((updateDoc as { $set: { updatedAt: Date } }).$set.updatedAt).toBeInstanceOf(Date);
```
For `consumeDailyImportQuota`, assert the `$inc: { count: 1 }` + `upsert: true` shape; for `refundDailyImportQuota`, assert `$inc: { count: -1 }` with no `upsert` option; for the boundary case, assert `allowed: false` once mocked `update()` resolves `{ count: limit + 1 }`.

#### `src/modules/import/import.routes.dedup.test.ts` / `import.routes.quota.test.ts` (new)

**Analog:** `src/modules/import/import.routes.confirm.test.ts` (full file, 161 lines) — Fastify `inject` + module-mock conventions

**Full app-bootstrap pattern to copy verbatim** (lines 1-42):
```typescript
import Fastify from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { TypeBoxValidatorCompiler } from "@fastify/type-provider-typebox";
import sensible from "@fastify/sensible";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/auth/auth.guard.js", () => ({
  getUserId: vi.fn(() => "user_A"),
  requireAuth: vi.fn(async () => {}),
}));

vi.mock("./import-job.repository.js", () => ({
  getImportJob: vi.fn(),
  createImportJob: vi.fn(),
  findExistingSuccessfulImport: vi.fn(), // new — add to the mock factory
}));

vi.mock("./import.service.js", () => ({
  confirmImportedRecipe: vi.fn(),
  listMyImportedRecipes: vi.fn(),
  detectPlatform: vi.fn(),
  enqueueImportJob: vi.fn(),
  normalizeUrl: vi.fn(),
}));

// New mocks needed for quota test:
// vi.mock("@/modules/billing/entitlement.repository.js", () => ({ isProUser: vi.fn() }));
// vi.mock("@/modules/usage/usage.repository.js", () => ({ consumeDailyImportQuota: vi.fn() }));

const { getUserId } = await import("@/modules/auth/auth.guard.js");
const { getImportJob } = await import("./import-job.repository.js");
const { confirmImportedRecipe } = await import("./import.service.js");
const { importRoutes } = await import("./import.routes.js");

async function buildTestApp() {
  const app = Fastify().withTypeProvider<TypeBoxTypeProvider>();
  app.setValidatorCompiler(TypeBoxValidatorCompiler);
  await app.register(sensible);
  await app.register(importRoutes);
  await app.ready();
  return app;
}
```

**Ownership/IDOR test pattern to mirror** (lines 144-160 — owner scope test):
```typescript
it("owner scope — PATCH on another user's jobId returns 404, never edits", async () => {
  vi.mocked(getImportJob).mockResolvedValue(null);
  const app = await buildTestApp();
  const res = await app.inject({ method: "PATCH", url: "/import/other_users_job/recipe", payload: VALID_EDIT_BODY });
  expect(res.statusCode).toBe(404);
  expect(confirmImportedRecipe).not.toHaveBeenCalled();
  expect(getImportJob).toHaveBeenCalledWith("other_users_job", "user_A");
  await app.close();
});
```
Adapt for dedup: assert `findExistingSuccessfulImport` is called WITH `userId` folded into the call args (never a bare `normalizedUrl`-only lookup) — the codebase's established IDOR-safety assertion idiom.

**Status-table test pattern to mirror** (lines 86-105 — `it.each` over status values):
```typescript
it.each([
  "queued", "downloading", "transcribing", "extracting", "failed",
])("not ready — status=%s returns 409, no write", async (status) => { ... });
```
Use this `it.each` idiom for quota boundary testing (e.g. `it.each([{count: 3, allowed: false}, {count: 2, allowed: true}])`).

---

## Shared Patterns

### Atomic Daily Counter (`$inc` upsert by `{userId, day}`)
**Source:** `src/modules/usage/usage.repository.ts:14-31` (`consumeDailyAdaptQuota`)
**Apply to:** `consumeDailyImportQuota`, `refundDailyImportQuota` — same file, same collection-per-usage-type convention (dedicated `ImportUsageModel`, not a shared/discriminated collection).

### Free/PRO Quota Gate + Blocking Response
**Source:** `src/modules/recipes/recipe.routes.ts:196-212`
**Apply to:** `POST /import` in `import.routes.ts` — reuse `isProUser`, mirror `reply.tooManyRequests(...)` message shape verbatim (only swap "adaptações"→"importações" and the config keys).

### Owner-Scoped Query (never fetch-then-compare)
**Source:** `src/modules/import/import-job.repository.ts:34-44` (`getImportJob`)
**Apply to:** `findExistingSuccessfulImport(userId, normalizedUrl)` — fold `userId` into the Mongo filter itself, exact same idiom already used for `getImportJob` and referenced in `import.routes.ts` comments (lines 105-109) and `listMyImportedRecipes`.

### mongoat Two-Source-of-Truth Discipline
**Source:** `src/modules/import/import-job.types.ts` + `src/modules/import/import-job.model.ts` (both files, `costCents` field)
**Apply to:** Any `costCents` shape change — MUST touch both files in the same commit/task, then run `yarn setup:db` before any pipeline write attempts the new shape. (User memory: `mongoat-gotchas.md` — this is a previously-hit, documented gotcha.)

### Single-Writer Refund Discipline
**Source:** `src/infra/video/pipeline.ts:105-115` (`failJob`) + `src/workers/import-worker.ts` `TERMINAL_STATUSES` no-op guard (not read directly this session, referenced by RESEARCH.md as traced/verified)
**Apply to:** `refundDailyImportQuota` call — insert ONLY inside `failJob`, never inside per-attempt logic in `processImportJob`, to avoid double-refund on SQS redelivery.

### Structured Aggregate-Only Logging (never payloads/transcripts)
**Source:** `src/infra/video/pipeline.ts:91-98` (`logOutcome`)
**Apply to:** New cost-telemetry log line — `console.log("[pipeline] cost", JSON.stringify({...aggregateNumbersOnly}))`, matching D-08's "never log full payloads/transcripts" discipline.

## No Analog Found

None — every file in Phase 4's scope has a direct, strong in-codebase analog (this phase is explicitly a "zero-dependency composition" wiring phase per RESEARCH.md; no new architectural pattern is introduced).

The one genuinely novel piece of logic with no precedent in the codebase is the **refund** (`$inc: -1`) direction of the atomic counter — `consumeDailyAdaptQuota` has no decrement precedent. It is still classified as a strong analog match because it reuses the exact same `Model.update()` atomicity primitive and `{userId, day}` key — only the increment sign and omission of `upsert`/`$setOnInsert` differ.

## Metadata

**Analog search scope:** `src/modules/usage/`, `src/modules/import/`, `src/modules/recipes/recipe.routes.ts`, `src/infra/video/pipeline.ts`, `src/config/env.ts`, existing `*.test.ts` files under `src/modules/import/`
**Files scanned:** 12 (10 target files' analogs + `import-job.repository.test.ts` + `import.routes.mine.test.ts` referenced but not separately excerpted — `import.routes.confirm.test.ts` was the stronger match for both new route test files)
**Pattern extraction date:** 2026-07-02
