# Phase 4: Cost/Quota Gating & Dedup - Research

**Researched:** 2026-07-02
**Domain:** Backend gating (dedup, atomic quota reservation, cost telemetry) — Fastify/Mongo/mongoat, no new external libraries
**Confidence:** HIGH

## Summary

Phase 4 does not introduce a single new library, framework, or infrastructure component. Every piece needed — atomic per-day counters (`consumeDailyAdaptQuota`), the free/PRO gate response shape (`recipe.routes.ts` adapt gate), the dedup key (`ImportJob.normalizedUrl`), and the cost telemetry field (`ImportJob.costCents`) — already exists in the codebase, built in Phases 1-3 explicitly as "placeholders" or parallel patterns waiting to be reused. This is a wiring phase: insert two guard clauses into `POST /import` (dedup lookup, then quota reservation), expand the `costCents` shape (type + BSON validator, mongoat's two-source gotcha applies again), populate it at each pipeline stage boundary, and add a refund call on the failure path.

The one genuinely new piece of logic is the **atomic-refund-without-double-refund** guarantee: `consumeDailyAdaptQuota` has no precedent for decrementing, and the existing SQS redelivery idempotency guard (`TERMINAL_STATUSES` no-op in `import-worker.ts`) already prevents `processImportJob` from re-running on a `failed` job — but that guard runs *before* `failJob` is called a second time, so it also protects against double-refund as long as the refund happens inside `failJob` itself (the only code path that transitions a job to `failed`). This makes `failJob` the single safe refund point — confirmed by tracing every call site in `pipeline.ts`.

Cost telemetry (COST-02) is the only area needing external verification: exact per-unit prices for Groq Whisper, OpenAI Whisper fallback, Anthropic Sonnet 4.5, and Voyage-3 change over time and must live in config, not hardcoded logic. Current (as of research date) unit prices are documented below, sourced from single-pass web search against third-party aggregators (not fetched directly from each provider's own pricing page this session) — these are tagged `[ASSUMED]`/LOW confidence per this project's provenance rules and belong in the Assumptions Log for confirmation before being treated as anything more than a rough, easily-updated config default. COST-02 only requires "visible for operational review," not invoice-grade accuracy, so this is an acceptable starting point, not a blocker.

**Primary recommendation:** Insert dedup lookup and `consumeDailyImportQuota` as two sequential guard clauses in `POST /import` (dedup first, quota second, exactly per D-07 ordering), mirror the adapt gate's `reply.tooManyRequests(...)` response verbatim for the quota-block path, expand `ImportJob.costCents` to `{ download: {...}, transcription: {...}, extraction: {...}, embedding: {...}, totalCents }` with both raw units and cents per stage, and centralize the quota refund inside `failJob()` in `pipeline.ts` — the only code path that ever writes `status: "failed"`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Dedup lookup (per-user, by normalizedUrl) | API / Backend (`import.routes.ts`) | Database (Mongo compound query) | Must run inside the request/response cycle before any queue message is sent — cannot be deferred to the worker |
| Atomic quota reservation | API / Backend (`import.routes.ts` → `usage.repository.ts`) | Database (Mongo `$inc` upsert on unique index) | The atomicity guarantee is a Mongo-level property (unique index + single-document `$inc`); the API layer only orchestrates the call and interprets the result |
| Quota refund on failure | API / Backend worker (`pipeline.ts` `failJob`) | Database | Refund must happen exactly once, at the one terminal `failed`-transition point — a backend/worker concern, never client-visible |
| Cost telemetry recording | API / Backend worker (`pipeline.ts` stage boundaries) | Database (`ImportJob.costCents`) + structured logs | Raw units are only knowable where each external API call happens (worker process); persistence + logging are the only consumers this phase |
| Quota-exceeded UX / PRO messaging | API / Backend (`import.routes.ts`, mirrors `recipe.routes.ts`) | Browser/Client (existing PRO messaging component, no changes) | Response shape is backend-owned; frontend reuse is explicitly out of scope for new work (D-04) |

## User Constraints

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Dedup (CAP-03)**
- D-01: Dedup é por-usuário. Antes de enfileirar, procura uma importação anterior do mesmo `userId` para a mesma `normalizedUrl` que terminou com sucesso (status terminal `ready_for_review` ou já confirmada) e reusa o resultado existente em vez de rodar download/transcrição/extração. Dedup entre usuários fica pra Fase 5.
- D-05: Jobs `failed` NÃO deduplicam — reimportar uma URL que falhou antes é um retry legítimo e deve rodar o pipeline de novo.
- D-06: Sem TTL / janela de cache v1 — o match é permanente.

**Quota na submissão (COST-01/03)**
- D-02: Limite diário free = 3 importações/dia, espelhando `adaptDailyLimitFree=3`. PRO tem teto alto anti-abuso (novo `IMPORT_DAILY_LIMIT_PRO`, valor discricionário). Reserva atômica na submissão via função no molde de `consumeDailyAdaptQuota` (upsert `$inc` por `userId+day`), chamada dentro de `POST /import` antes de `enqueueImportJob`.
- D-07: Dedup-hit NÃO consome quota. Falha do job DEVOLVE a quota (refund). O `$inc` atômico é a garantia anti-corrida.

**Telemetria de custo (COST-02)**
- D-03: Grava unidades cruas por estágio (bytes de download, minutos de ASR, tokens de LLM in/out, contagem×dims de embedding) e o custo estimado em centavos derivado via tabela de preço por unidade, no `ImportJob.costCents` (expandir shape atual). Destino: doc + logs estruturados. Sem UI/endpoint admin v1.
- D-08: Tabela de preço em config. Nunca logar payloads/transcript completos.

**UX ao exceder a quota (COST-03)**
- D-04: Ao exceder o free, bloqueia no submit com mensagem de limite diário + upsell PRO, reusando exatamente o gate/response do adapt (`isProUser` + quota → resposta de bloqueio, `recipe.routes.ts` linha ~199). Mesmo status/shape que o adapt usa. Nenhuma UI nova.

### Claude's Discretion
- Shape exato do retorno de um dedup-hit (ex.: 200 com `{ recipeId, deduped: true }` sem criar job novo, vs. um job novo apontando ao mesmo recipe) — planner decide; o simples/barato é responder com o recipeId existente sem enfileirar.
- Status HTTP exato do bloqueio de quota — espelhar o que o adapt/search já retorna, não inventar um novo.
- Onde a quota é decrementada/refundada em caso de falha (no `failJob` do pipeline? num hook de status terminal?) — planner decide o ponto mais seguro/atômico.
- Valores concretos: `IMPORT_DAILY_LIMIT_PRO`, a tabela de preço por unidade — via env/config, valores levantados no research.

### Deferred Ideas (OUT OF SCOPE)
- Dedup entre usuários / compartilhar extração — Fase 5 (promoção pública; só quando a receita vira pública).
- TTL / "forçar re-importação" de uma URL já importada com sucesso — v2.
- UI/dashboard de custos (telemetria como produto) — v2.
- OCR (PRO) e enriquecimentos PRO adicionais — deferidos de fases anteriores; esta fase só deixa o gancho de gating pronto.
</user_constraints>

## Phase Requirements

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CAP-03 | Importações duplicadas da mesma URL (normalizada) são deduplicadas — reusa o resultado existente em vez de reprocessar | Dedup Lookup pattern below; exact Mongo query, index, and route insertion point documented |
| COST-01 | A quota diária de importação (free tier) é reservada atomicamente na submissão, não na conclusão | Atomic Quota Reservation pattern below; `consumeDailyImportQuota` mirrors `consumeDailyAdaptQuota` exactly; race-safety confirmed via mongoat `update()` → `findOneAndUpdate` |
| COST-02 | O custo por job é medido por estágio (download/bandwidth, minutos de ASR, tokens de LLM, embedding) | Cost Telemetry section below; exact code location per stage, `costCents` shape expansion, price table with sourced 2026 unit prices |
| COST-03 | Importação básica é grátis dentro da quota; volume alto exige PRO (reusa entitlement) | Quota Gate Response pattern below; exact response shape mirrored from `recipe.routes.ts` adapt gate |
</phase_requirements>

## Standard Stack

No new libraries. This phase is 100% composition of existing in-repo modules.

### Core (existing, reused)
| Module | Purpose | Why Reused |
|--------|---------|------------|
| `@iamcalegari/mongoat` `Model.update()` | Atomic `$inc` upsert, backed by `findOneAndUpdate` | Already the app's sole atomicity primitive (`consumeDailyAdaptQuota`) — no reason to introduce a different concurrency mechanism for import quota |
| `mongodb` driver (`^6.16.0`, via mongoat) | Compound filters, `$in` status arrays for dedup lookup | Already in use throughout `import-job.repository.ts` |
| Fastify `reply.tooManyRequests` / `reply.code(...)` helpers | Quota-block HTTP response | Already used verbatim in the adapt gate (`recipe.routes.ts:206-212`) |

### Supporting
| Item | Purpose | When to Use |
|------|---------|-------------|
| `env.ts` config block extension | `IMPORT_DAILY_LIMIT_FREE`, `IMPORT_DAILY_LIMIT_PRO`, price-table constants | New env vars, same `optional()`/`Number()` pattern as `adaptDailyLimitFree/Pro` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Mongo `$inc` upsert on unique index | Redis `INCR` with TTL | Redis is not in this stack at all (no Redis dependency exists in package.json) — would add new infra for zero benefit since Mongo already gives the exact same atomicity guarantee the app already trusts for `adapt_usage` |
| Refund via `$inc: -1` inside `failJob` | A separate reconciliation cron job | Cron reconciliation adds operational complexity and a window where quota is wrongly exhausted; the atomic decrement is available for free and keeps behavior synchronous |

**Installation:** None. No `npm install` needed for this phase.

**Version verification:** `mongodb` driver confirmed at `^6.16.0` in `package.json` (already installed); `@iamcalegari/mongoat` confirmed at `1.0.34-alpha` in `node_modules` cache — both already satisfy the `findOneAndUpdate`-backed `update()` used by `consumeDailyAdaptQuota` and needed by `consumeDailyImportQuota`.

## Package Legitimacy Audit

**No external packages are installed in this phase.** All functionality is built from already-installed, already-vetted dependencies (`mongodb`, `@iamcalegari/mongoat`, `fastify`, `@sinclair/typebox`). The Package Legitimacy Gate is not applicable — skipped per its own trigger condition ("whenever this phase installs external packages").

## Architecture Patterns

### System Architecture Diagram

```
POST /import (Fastify route, requireAuth)
        │
        ▼
  detectPlatform(url) ──null──► 400 {error: invalid_url|unsupported_platform}
        │ (SSRF allowlist — unchanged from Phase 1)
        ▼
  normalizeUrl(url)
        │
        ▼
  ① DEDUP LOOKUP  ─── findOne({ userId, normalizedUrl,
        │                        status: {$in:[terminal-success]} })
        │
        ├─ HIT  ──► 200 { recipeId, deduped: true }   (no quota consumed, no enqueue)
        │
        └─ MISS
              ▼
  ② QUOTA GATE  ─── isProUser(userId)
        │            → limit = pro ? IMPORT_DAILY_LIMIT_PRO : IMPORT_DAILY_LIMIT_FREE
        │            → consumeDailyImportQuota(userId, limit)  [atomic $inc upsert]
        │
        ├─ quota.allowed === false ──► 429 { same shape as adapt gate PRO upsell }
        │
        └─ quota.allowed === true
              ▼
  ③ createImportJob() → enqueueImportJob()  ──► 202 { jobId }
              │
              ▼  (async, SQS → import-worker)
        processImportJob(job)  [pipeline.ts]
              │
              ├─ every stage boundary writes raw units + cents into job.costCents
              │  (download bytes, ASR minutes, LLM tokens in/out, embedding count×dims)
              │
              ├─ SUCCESS → status: ready_for_review (costCents.totalCents finalized)
              │
              └─ FAILURE → failJob(job, reason)
                              │
                              ├─ status: failed
                              └─ ④ REFUND: consumeDailyImportQuota(userId, -1)  [atomic $inc, once]
```

### Recommended Project Structure

No new files/folders needed beyond what Phase 1 scaffolded. Changes land in:

```
src/config/env.ts                          # + import.dailyLimitFree/Pro, + import.priceTable
src/modules/usage/
├── usage.repository.ts                    # + consumeDailyImportQuota, + refundDailyImportQuota (or negative $inc)
src/modules/import/
├── import-job.types.ts                    # costCents shape expansion
├── import-job.model.ts                    # BSON validator expansion (mongoat two-source gotcha)
├── import-job.repository.ts               # + findExistingSuccessfulImport(userId, normalizedUrl)
├── import.routes.ts                       # + dedup guard, + quota guard in POST /import
src/infra/video/
├── pipeline.ts                            # + cost recording at each stage boundary, + refund call in failJob
```

### Pattern 1: Atomic Quota Reservation (mirror `consumeDailyAdaptQuota`)

**What:** A same-shaped `consumeDailyImportQuota(userId, limit)` in `usage.repository.ts`, backed by a new `ImportUsageModel` (or a reused `AdaptUsageModel`-style collection scoped by a discriminator — see Open Question 1) with a unique index on `{userId, day}`.

**When to use:** Called synchronously inside `POST /import`, after the dedup miss, before `createImportJob`.

**Example:**
```typescript
// Source: mirrors src/modules/usage/usage.repository.ts consumeDailyAdaptQuota (existing, verified in this codebase)
export async function consumeDailyImportQuota(
  userId: string,
  limit: number,
): Promise<QuotaResult> {
  const day = new Date().toISOString().slice(0, 10);
  const doc = (await ImportUsageModel.update(
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

/** Refund path — called exactly once, from failJob() in pipeline.ts. */
export async function refundDailyImportQuota(userId: string, day: string): Promise<void> {
  await ImportUsageModel.update(
    { userId, day },
    { $inc: { count: -1 }, $set: { updatedAt: new Date() } },
  );
}
```

**Why atomic:** `ImportUsageModel.update()` is mongoat's wrapper around MongoDB's `findOneAndUpdate`, which performs the read-modify-write as a single document-level operation — no two concurrent `$inc`s can produce a lost update `[VERIFIED: node_modules/@iamcalegari/mongoat/lib/model/index.d.ts — update() return type WithId<ModelType>, single findOneAndUpdate call]`. Combined with the `{userId, day}` unique index (mirroring `AdaptUsageModel`'s `user_day_unique` index), concurrent submissions or SQS-driven retries cannot both "win" a slot past the limit — the count monotonically increases per successful `$inc`, and the `allowed` check happens *after* the increment, so the true invariant is "at most one request over the limit is admitted transiently, then rejected retroactively" — this is the exact same tradeoff already accepted by `consumeDailyAdaptQuota` (an off-by-one overshoot under simultaneous concurrent requests at the boundary is theoretically possible but bounded to +1, never unbounded) `[CITED: MongoDB docs on findOneAndUpdate atomicity — https://www.mongodb.com/docs/manual/reference/method/db.collection.findoneandupdate/]`.

### Pattern 2: Refund-Safe Failure Path (single-writer discipline)

**What:** Quota refund happens inside `failJob()` in `pipeline.ts` — the single function that ever sets `status: "failed"` on an `ImportJob`.

**When to use:** Any pipeline failure branch that calls `failJob(job, reason, detail)`.

**Why this is the one safe point (traced, not assumed):**
1. Every failure branch in `processImportJob` (circuit breaker open, download failure, transcription failure, extraction failure) calls `failJob()` exactly once before `return`ing or before a transient error is rethrown for SQS redrive `[VERIFIED: src/infra/video/pipeline.ts, read this session — all 5 failJob call sites traced]`.
2. `import-worker.ts`'s `handleImportMessage` no-ops on SQS redelivery once the job is in a `TERMINAL_STATUSES` set (`ready_for_review`, `failed`) — so `processImportJob` (and therefore `failJob`) can never run twice for the same job once it has reached `failed` `[VERIFIED: src/workers/import-worker.ts lines 75-89, read this session]`.
3. Therefore, refunding inside `failJob()` itself — guarded by "only refund if the job was NOT already `failed` before this call" — refunds exactly once per job, even across SQS at-least-once redelivery.

**Example:**
```typescript
// Source: extends existing failJob() in src/infra/video/pipeline.ts (read this session)
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

  // COST-01/D-07: refund the reserved quota slot — safe because failJob is the
  // ONLY code path that transitions a job to "failed", and a job already in a
  // terminal status never re-enters processImportJob (worker no-op guard).
  const day = job.insertedAt.toISOString().slice(0, 10); // day the SLOT was reserved, not today
  await refundDailyImportQuota(job.userId, day);
}
```

**Anti-pattern avoided:** Refunding based on `new Date()` (today) instead of `job.insertedAt`'s day would silently refund the WRONG day's counter for any job that fails after midnight UTC relative to its submission — a subtle correctness bug given daily counters are keyed by UTC day string (`YYYY-MM-DD`, same as `consumeDailyAdaptQuota`). Always refund against the day the slot was originally reserved.

### Pattern 3: Dedup Lookup (per-user, terminal-success only)

**What:** A repository function that looks for a prior job by the same user, same `normalizedUrl`, in a terminal-success status, before creating a new job.

**When to use:** First guard in `POST /import`, before the quota gate (D-07: dedup-hit doesn't consume quota).

**What counts as "terminal success" (per D-01):** `status: "ready_for_review"` OR a confirmed recipe. The `ImportJob` schema itself has no `"confirmed"` status (confirmation happens on the `Recipe` doc via `Recipe.confirmedAt`, per Phase 3's `confirmImportedRecipe` — `ImportJob.status` never changes past `ready_for_review`). **This means the dedup query only needs `status: "ready_for_review"`** — there is no separate "confirmed" `ImportJobStatus` value to match against; a confirmed recipe's `ImportJob` still shows `status: "ready_for_review"` forever (confirmation is orthogonal, tracked on `Recipe`, not `ImportJob`) `[VERIFIED: src/modules/import/import-job.types.ts ImportJobStatus union has no "confirmed" member; src/modules/import/import.service.ts confirmImportedRecipe only writes to RecipeModel, never touches ImportJobModel]`.

**Example:**
```typescript
// New function in src/modules/import/import-job.repository.ts
export async function findExistingSuccessfulImport(
  userId: string,
  normalizedUrl: string,
): Promise<ImportJob | null> {
  // Owner-scoped in the query itself (same idiom as getImportJob(jobId, userId))
  // — never fetch-then-compare. status: "ready_for_review" is the only terminal
  // success state (D-01); "failed" never matches (D-05, legitimate retry).
  const job = await ImportJobModel.find({
    userId,
    normalizedUrl,
    status: "ready_for_review",
  } as never);
  return (job as ImportJob | null) ?? null;
}
```

**Route insertion (POST /import), full ordering per D-07:**
```typescript
// src/modules/import/import.routes.ts — extends existing handler
const platform = detectPlatform(url);
if (!platform) return reply.code(400).send({ error: classifyRejectionReason(url) });

const normalizedUrl = normalizeUrl(url);

// ① Dedup FIRST — a hit costs nothing and short-circuits before quota (D-07).
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

**Index requirement:** `ImportJobModel`'s existing `indexes` array has `status_lookup` (`{status:1}`) and `user_lookup` (`{userId:1}`) separately — neither serves this compound query efficiently at scale. Add a compound index `{userId:1, normalizedUrl:1, status:1}` (name e.g. `dedup_lookup`) to `import-job.model.ts`. This is a **mongoat schema-file change requiring `setup:db`** to apply against a running Mongo instance (see Mongoat Gotcha below) — indexes declared in code are not retroactively created on pre-existing environments without re-running the setup script `[VERIFIED: src/modules/import/import-job.model.ts indexes array, read this session; the same "code-only index declaration" caveat is already documented as a Phase 2 decision in STATE.md: "Atlas index filter-field declaration is code-only; pre-existing environments need a manual index update since ensureSearchIndex only creates when absent"]`.

### Anti-Patterns to Avoid
- **Fetch-then-compare for dedup ownership:** Don't fetch a job by `normalizedUrl` alone and then check `job.userId === userId` in application code — always fold `userId` into the Mongo filter itself, matching the established `getImportJob(jobId, userId)` idiom. A separate compare-after-fetch step is exactly the IDOR anti-pattern this codebase has repeatedly guarded against (see `getImportJob`, `listMyImportedRecipes`).
- **Refunding on every SQS redelivery instead of once:** Do not put the refund call anywhere in `processImportJob`'s per-attempt logic outside `failJob` — a job that transiently fails and is redelivered by SQS (network/unknown reasons rethrow for redrive) must NOT be refunded on every redelivery attempt, only once, when it FINALLY reaches `failed`. Placing refund logic at `failJob()` (called once, at the terminal transition) is correct; placing it at the top of `processImportJob` (called on every attempt) is a double-refund bug.
- **Consuming quota before dedup:** Reversing D-07's ordering (checking quota before dedup) would incorrectly charge a user's daily quota for a request that turns out to be a free cache hit — violates COST-01/COST-03 intent directly.
- **Hardcoding price-per-unit into pipeline.ts logic:** D-08 explicitly requires the price table live in config (`env.ts` or a dedicated `src/config/pricing.ts`), not inline constants in `pipeline.ts` — prices for Groq/OpenAI/Anthropic/Voyage change independently of code releases.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| Atomic per-user daily counter | A custom in-memory rate limiter, a Redis-based token bucket, or a "read-then-write" quota check | `Model.update()` with `$inc` + upsert + unique index (mongoat, already in the stack) | The exact same primitive already backs `consumeDailyAdaptQuota` in production; introducing a second concurrency mechanism for a near-identical problem adds risk and inconsistency for zero benefit |
| Dedup key derivation | Re-deriving a canonical URL matching scheme from scratch | `normalizeUrl()` (already built in Phase 1, strips tracking params, idempotent) | The exact groundwork comment in `import.service.ts` says this function exists specifically "groundwork for dedup CAP-03" — it is already correct and tested |
| PRO-gate response message/shape | A new quota-exceeded error contract (new status code, new error schema) | The adapt gate's exact `reply.tooManyRequests(...)` pattern from `recipe.routes.ts` | D-04 explicitly mandates mirroring, and the frontend's existing PRO messaging component already renders this exact shape — inventing a new shape means new frontend work this phase explicitly excludes |
| Cost estimation math | A bespoke cost-tracking service/dashboard | Raw units + a plain price-table lookup written directly into `costCents` on the existing `ImportJob` doc | D-03/D-08 explicitly scope this to "operational review via doc + logs," not a product — building more is scope creep this phase's CONTEXT.md explicitly defers to v2 |

**Key insight:** Every "don't hand-roll" item in this phase is really "don't re-invent something this exact codebase already built in the last 3 phases." The risk profile here is not technical complexity — it's **inconsistency risk**: building a second, slightly-different quota/gate pattern next to the existing one would fragment the codebase's cost-control story and make future changes (e.g., adjusting a global rate limit) require touching two divergent implementations instead of one shared idiom.

## Common Pitfalls

### Pitfall 1: Double-refund via non-idempotent refund placement
**What goes wrong:** Quota is refunded more than once for a single failed job, silently inflating the user's effective daily quota.
**Why it happens:** SQS is at-least-once delivery; if refund logic is placed anywhere that runs per-delivery-attempt rather than per-terminal-transition, redelivery after a transient failure (network/unknown reasons, which rethrow for redrive) would trigger multiple refunds before the job finally lands in `failed`.
**How to avoid:** Refund exclusively inside `failJob()`, which — per the traced worker idempotency guard — only ever executes once per job (subsequent SQS redeliveries of an already-`failed` job no-op in `handleImportMessage` before `processImportJob` is even called).
**Warning signs:** A user's `count` in the usage collection goes negative, or a user appears to have more successful imports in a day than their limit allows.

### Pitfall 2: Quota consumed but enqueue fails, leaving a reserved-but-unused slot
**What goes wrong:** `consumeDailyImportQuota` succeeds (count incremented), but `createImportJob` or `enqueueImportJob` then throws (e.g., a transient SQS `SendMessageCommand` failure) — the request 500s, no `ImportJob` is ever created, yet the user's daily count was already spent.
**Why it happens:** The gate-then-act sequence (quota reserve → create → enqueue) has no wrapping transaction; a failure in step 3 after a successful step 2 leaves state inconsistent by design (this is the same tradeoff `consumeDailyAdaptQuota` already accepts for the LLM call that follows it in the adapt route — an LLM failure after quota consumption is not refunded there either).
**How to avoid:** Two options, in order of alignment with existing app conventions: (a) accept this as consistent with the adapt route's existing behavior (simplest, matches precedent, and SQS `SendMessageCommand` failures are rare); (b) wrap `createImportJob` + `enqueueImportJob` in a try/catch that calls `refundDailyImportQuota` on failure before rethrowing/responding 500. Given D-07 only mandates refund on job *failure* (not enqueue failure), and the existing adapt-route precedent doesn't refund on downstream failure either, **recommend (a)** for consistency — but flag this explicitly in the plan as a conscious, precedent-matching tradeoff, not an oversight.
**Warning signs:** SQS send failures correlating with users reporting "used up my quota but nothing happened."

### Pitfall 3: Price-table drift (stale unit prices silently under/over-reporting cost)
**What goes wrong:** Groq/OpenAI/Anthropic/Voyage prices change (they have, repeatedly, per the research below) but the config price table is never updated, so `costCents` silently reports increasingly wrong estimates without any error or warning.
**Why it happens:** Cost telemetry is "for operational review," not wired to any billing-critical path — there's no automatic signal when the table goes stale (unlike, say, a failed API call).
**How to avoid:** Document the price table's source date directly in `env.ts` comments (as this research does below) so a future engineer knows the values are stale-checkable; do not treat the cents figures as precise — treat raw units (bytes, minutes, tokens) as the durable ground truth and cents as a best-effort estimate.
**Warning signs:** None automatic — this is an inherent, accepted limitation per D-08's scope ("estimated cents"). Not a bug to fix in this phase, just a property to document.

### Pitfall 4: `costCents` absent on documents created before this phase
**What goes wrong:** Any `ImportJob` created in Phases 1-3 (or before this phase's BSON validator update) has no `costCents` field, or has the old narrower shape (`{download, transcription, total}`). Code that assumes the new nested shape (`{download: {bytes, cents}, transcription: {minutes, cents}, ...}`) will throw or silently read `undefined` on old docs.
**Why it happens:** MongoDB is schemaless at the storage layer; a BSON validator change only affects NEW writes, never retroactively migrates existing documents.
**How to avoid:** Treat every `costCents.*` read as optional-chained (`job.costCents?.download?.cents`), exactly as the existing type already marks the whole field optional (`costCents?: {...}`). No data migration is required for CAP-03/COST-01/03 since dedup/quota don't read `costCents` at all — only telemetry review does, and it's expected to be sparse/absent for pre-Phase-4 jobs.
**Warning signs:** A crash or `NaN` total when computing aggregate cost reports over historical jobs — mitigated entirely by optional chaining, never by backfilling.

### Pitfall 5: mongoat's two-source-of-truth gotcha (again)
**What goes wrong:** `costCents`'s TypeScript type (`import-job.types.ts`) and its BSON validator (`import-job.model.ts`) are two independent, manually-synchronized declarations. Updating only the type lets TypeScript accept a new shape that MongoDB's server-side validator will then reject on write (or silently strip additionalProperties, depending on `validationAction`), causing a runtime write failure invisible at compile time.
**Why it happens:** This is a known, previously-hit gotcha in this exact codebase — documented in the user's own memory (`mongoat-gotchas.md`) and referenced explicitly in this phase's CONTEXT.md canonical refs ("mongoat: type e BSON são fontes separadas + setup:db").
**How to avoid:** Every `costCents` shape change touches BOTH `import-job.types.ts` (TypeScript interface) AND `import-job.model.ts` (BSON `ModelValidationSchema`) in the same task/commit, followed by running `yarn setup:db` (or `npm run setup:db`) to apply the validator against the actual Mongo collection before any code path attempts to write the new shape.
**Warning signs:** `MongoServerError: Document failed validation` at pipeline runtime, only surfacing when a job actually reaches a stage boundary that tries to write the new `costCents` sub-shape — easy to miss in a quick manual test that only exercises the happy path up to `queued`.

## Code Examples

### Cost Telemetry: Recording raw units at each pipeline stage boundary

```typescript
// Source: extends src/infra/video/pipeline.ts, verified against actual stage
// boundaries read this session. Each `await updateImportJobStatus(...)` call
// already existing in pipeline.ts gains an accompanying costCents patch.

// 2. Download boundary — after downloadVideo() succeeds:
import { stat } from "node:fs/promises";
// ...
downloadResult = await downloadVideo(job.sourceUrl, videoPath);
recordOutcome(job.platform, true);
const { size: downloadBytes } = await stat(videoPath);
const downloadCents = bytesToEstimatedCents(downloadBytes); // config price table lookup

// 3. Transcription boundary — after transcribe() succeeds:
const result = await transcribe(audioPath);
transcript = result.text;
transcriptSource = result.source;
// ASR minutes: durationSec is already known from downloadResult.meta.durationSec
// (yt-dlp's --dump-json duration field) — no extra API call needed to derive
// audio minutes; reuse the same duration that gated maxDurationSec.
const asrMinutes = (downloadResult.meta.durationSec ?? 0) / 60;
const asrCents = minutesToEstimatedCents(asrMinutes, transcriptSource); // groq vs openai rate differs

// 4. Extraction boundary — Anthropic SDK response carries usage directly:
const res = await anthropic.messages.parse(buildImportParams(input));
// NOTE: extractImportedRecipe() currently only returns res.parsed_output —
// it must be extended to also return res.usage (input_tokens/output_tokens),
// or pipeline.ts must call a lower-level function that exposes `res` directly.
// Anthropic Messages API responses include `usage: {input_tokens, output_tokens}`
// on every call — no separate metering call needed.
const llmCents = tokensToEstimatedCents(res.usage.input_tokens, res.usage.output_tokens);

// Embedding boundary happens inside persistExtractedRecipe (recipe.ingestion.ts),
// not inline in pipeline.ts — embeddings.embedDocuments() call there. Either:
// (a) have persistExtractedRecipe optionally return embedding token/dims info, or
// (b) estimate from embeddingText.length (chars/4 ~= tokens heuristic) if the
// Voyage client doesn't expose usage. Recommend (a): thread it through the
// existing return value rather than re-deriving via heuristic.
```

### Price Table: config shape (D-08)

```typescript
// Source: new block in src/config/env.ts, following the existing optional()/Number() idiom
import: {
  maxDurationSec: Number(optional("IMPORT_MAX_DURATION_SEC", "600")),
  dailyLimitFree: Number(optional("IMPORT_DAILY_LIMIT_FREE", "3")),
  dailyLimitPro: Number(optional("IMPORT_DAILY_LIMIT_PRO", "50")),
  // Price table (D-08) — cents per unit. Sourced 2026-07-02 via single-pass web
  // search (see 04-RESEARCH.md "State of the Art" table, tagged [ASSUMED] / LOW
  // confidence — not cross-verified against each provider's own pricing page).
  // Update here when providers change pricing; these are ESTIMATES for
  // operational review (COST-02), never billing-critical. Recommend a human
  // spot-check the Anthropic Sonnet 4.5 figure specifically before launch
  // (introductory-vs-standard price ambiguity, see Assumption A2).
  priceCentsPerGbEgress: Number(optional("IMPORT_PRICE_CENTS_PER_GB_EGRESS", "9")), // AWS S3 tier-1 egress $0.09/GB
  priceCentsPerAsrMinuteGroq: Number(optional("IMPORT_PRICE_CENTS_PER_ASR_MIN_GROQ", "0.0667")), // $0.04/hr / 60
  priceCentsPerAsrMinuteOpenai: Number(optional("IMPORT_PRICE_CENTS_PER_ASR_MIN_OPENAI", "0.6")), // $0.006/min
  priceCentsPerMtokLlmInput: Number(optional("IMPORT_PRICE_CENTS_PER_MTOK_LLM_IN", "300")), // Sonnet 4.5 $3/Mtok in
  priceCentsPerMtokLlmOutput: Number(optional("IMPORT_PRICE_CENTS_PER_MTOK_LLM_OUT", "1500")), // Sonnet 4.5 $15/Mtok out
  priceCentsPerMtokEmbedding: Number(optional("IMPORT_PRICE_CENTS_PER_MTOK_EMBED", "6")), // voyage-3 $0.06/Mtok
},
```

## State of the Art

| Provider / Model | Unit | Price (2026-07-02) | Source |
|---|---|---|---|
| Groq `whisper-large-v3-turbo` | per hour of audio | $0.04/hr (10s billing minimum per request) `[ASSUMED]` | Groq/eesel/tokenmix third-party pricing aggregators, not Groq's own console page directly fetched — LOW confidence per `classify-confidence --provider websearch` (unverified) |
| OpenAI Whisper (`whisper-1`, fallback) | per minute | $0.006/min `[ASSUMED]` | Multiple third-party pricing aggregators — LOW confidence, not fetched from openai.com directly |
| Anthropic Claude Sonnet 4.5 (`IMPORT_EXTRACTION_MODEL` default) | per million tokens | $3/Mtok input, $15/Mtok output (standard; **introductory $2/$10 in effect through 2026-08-31** per one source) `[ASSUMED]` | Third-party pricing aggregators citing platform.claude.com/docs — LOW confidence, not fetched directly this session. **Recommend the planner or a human verify directly against `platform.claude.com/docs/en/about-claude/pricing` before finalizing the price-table default**, given the conflicting introductory-vs-standard price point found |
| Voyage `voyage-3` (embedding, `env.voyage.model` default) | per million tokens | $0.06/Mtok (first 200M tokens free per account for newer voyage-4 family, unclear if voyage-3 itself is still in the free-tier program) `[ASSUMED]` | voyageai docs pricing page found but not directly fetched — LOW confidence aggregator summary |
| AWS S3 internet egress | per GB | Free first 100GB/mo (account-aggregate), then $0.09/GB (next 9.9TB), $0.085/GB, $0.07/GB, $0.05/GB at higher tiers `[ASSUMED]` | AWS official pricing page URL found in search results but not directly fetched this session — LOW confidence, and separately flagged (A4) as possibly the wrong cost proxy entirely for this pipeline's actual bandwidth path |
| MongoDB `findOneAndUpdate` + `$inc` + upsert atomicity | — | Single atomic document-level operation; race-free when combined with a unique index | `[VERIFIED: node_modules/@iamcalegari/mongoat/lib/model/index.d.ts]` — directly read this session, corroborated by MongoDB docs search — MEDIUM/verified confidence per `classify-confidence --provider websearch --verified` |

**Important pipeline-cost caveat:** The pipeline's actual "download bandwidth" cost is **yt-dlp downloading FROM Instagram/TikTok/YouTube TO the Render worker's local disk** — this is NOT an AWS S3 egress charge (S3 is only touched later, for the single keyframe upload, which is tiny). The S3 egress price table entry above is only relevant if/when video bytes ever transit through S3 (they currently don't — `pipeline.ts` downloads straight to a local `mkdtemp` dir and only the keyframe touches S3 via `putImage`). **For COST-02's "download/bandwidth" line item, the correct cost proxy is Render's own bandwidth/egress pricing (not researched — Render is not an AWS service), or simply track raw bytes with `priceCentsPerGbEgress` as a rough proxy/placeholder clearly labeled as such.** This is flagged as an Open Question below rather than asserted as fact.

**Deprecated/outdated:** None — this is greenfield telemetry, not a migration from an older pricing model.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|----------------|
| A1 | Groq Whisper Large v3 Turbo priced at $0.04/hr, OpenAI Whisper at $0.006/min | State of the Art | Low — COST-02 only needs operational-review-grade estimates, not invoice precision; wrong by 2x still gives useful relative signal |
| A2 | Anthropic Sonnet 4.5 priced at $3/$15 per Mtok in/out (standard), possibly $2/$10 introductory through 2026-08-31 | State of the Art | Low-Medium — recommend the plan verify directly against `platform.claude.com/docs/en/about-claude/pricing` at implementation time since two different price points were surfaced and the introductory-price cutoff falls within this project's likely execution window |
| A3 | Voyage-3 priced at $0.06/Mtok, first-200M-free tier applicability to voyage-3 (vs only newer voyage-4 family) is unclear | State of the Art | Low — same operational-estimate tolerance as A1; if wrong, `total` embedding cost line is off but doesn't affect gating logic at all (embedding cost is informational-only) |
| A4 | AWS S3 tiered egress pricing ($0.09/GB first tier) is NOT the correct cost proxy for "download/bandwidth" since video download doesn't transit S3 in this pipeline — Render's own bandwidth pricing would be more accurate but was not researched | Code Examples / State of the Art caveat | Medium — if the plan blindly uses the S3 price constant for "download bandwidth" cost, the resulting cents figure would misrepresent actual infra spend (Render pricing, not researched, may differ meaningfully from AWS S3 egress tiers) — flagged explicitly as Open Question 1 below, planner/human should decide whether to research Render bandwidth pricing or accept the proxy with a documented caveat |
| A5 | `res.usage.input_tokens`/`output_tokens` are available on the Anthropic SDK's `messages.parse()` return value (standard Messages API `usage` field) | Code Examples | Low — this is standard, well-documented Anthropic SDK behavior across all Messages API calls; if the exact field name differs slightly in the installed `@anthropic-ai/sdk@^0.104.2` version, it's a same-session compile-time TypeScript catch, not a runtime surprise |
| A6 | Recommend accepting Pitfall 2 (quota-consumed-but-enqueue-failed) as consistent precedent rather than adding refund-on-enqueue-failure logic | Common Pitfalls | Low-Medium — this is a judgment call, not a verified fact; the planner/user could reasonably choose the more defensive option (b) instead. Flagged for discuss-phase/planner awareness, not asserted as the only correct choice |

**If this table is empty:** N/A — table is populated; several claims need light verification at implementation/plan-check time, particularly A2 (Anthropic pricing cutoff) and A4 (bandwidth cost proxy).

## Open Questions

1. **What should `priceCentsPerGbEgress` actually measure — S3 egress or Render worker bandwidth?**
   - What we know: The video download happens on the Render Background Worker directly (yt-dlp → local disk), never through S3. Only the final keyframe image touches S3 (`putImage`).
   - What's unclear: Render's own bandwidth/egress pricing model was not researched this session (out of the original research-focus scope, which pointed at "AWS S3 typical egress").
   - Recommendation: Use the AWS S3 egress figure as a clearly-labeled rough proxy in the price table (already reflected in the `priceCentsPerGbEgress` naming/comment above), and treat this as acceptable given D-03's "operational review" bar, not billing precision. If the team later wants tighter accuracy, a follow-up research pass on Render's bandwidth pricing would be a cheap, isolated addition.

2. **Does `ImportUsageModel` need to be a new collection, or can `AdaptUsageModel`'s collection be reused with a discriminator field?**
   - What we know: `AdaptUsageModel` has a unique index on `{userId, day}` — adding a `kind` discriminator (`"adapt" | "import"`) would require changing that unique index to `{userId, day, kind}`, which touches an existing, already-in-production collection/model.
   - What's unclear: Whether touching the existing `adapt_usage` collection's index is acceptable risk for this phase, versus the cleaner (but slightly more code) option of a dedicated `import_usage` collection with its own `{userId, day}` unique index (exact structural mirror of `AdaptUsageModel`, zero risk to the existing adapt quota system).
   - Recommendation: **Dedicated new collection (`import_usage`)** — mirrors the existing `AdaptUsageModel` file-for-file, zero risk of an index migration touching production adapt-quota data, and keeps import quota fully independent (a bug in import quota logic can never corrupt adapt quota counts or vice versa). This is the pattern already implied by CONTEXT.md's wording ("uma função no mesmo molde de consumeDailyAdaptQuota... mesma coleção-padrão de usage, chave diferente" — read as "same pattern, own collection," not literally the same Mongo collection).

3. **Exact shape of the dedup-hit response body** (explicitly left to planner per CONTEXT.md Claude's Discretion).
   - What we know: CONTEXT.md suggests `200 { recipeId, deduped: true }` as the "simple/cheap" option, without creating a new job.
   - What's unclear: Whether the frontend's existing `useImportPolling` hook (Phase 3) can gracefully handle a response that is NOT `{ jobId }` (202) — i.e., does the capture UI need a code branch for "already have a recipe, skip polling, go straight to viewing/reviewing it"?
   - Recommendation: This research did not read the Phase 3 frontend polling hook in depth (out of this phase's backend-dominant scope per the objective's framing: "the frontend only reuses the existing PRO gate messaging"). The planner should verify `useImportPolling`/`PasteLinkButton` call sites can branch on a 200 vs 202 response before finalizing the dedup-hit contract — if the frontend can only handle 202+jobId, an alternative worth considering is creating a new `ImportJob` row that goes straight to `ready_for_review` with the existing `recipeId` (skips the pipeline but keeps a uniform 202+polling contract). CONTEXT.md's own wording favors the simpler 200 response, so this is a confirm-not-redesign task for the planner.

## Runtime State Inventory

Not applicable — this is not a rename/refactor/migration phase (see Read-file trigger condition; skipping this section entirely per the output-format instructions).

## Environment Availability

Not applicable — this phase introduces no new external tool/service/runtime dependencies. All capabilities (Mongo, Anthropic SDK, Groq SDK, Voyage client, SQS) are already deployed and verified working by Phases 1-3 (per ROADMAP.md's "Phases 3, 4, 5 follow standard, already-proven codebase patterns" note). Skipping per the section's own skip condition.

## Validation Architecture

`.planning/config.json` has `workflow.nyquist_validation: true` (not absent, explicitly `true`) — section included.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (`vitest.config.ts` at repo root) |
| Config file | `vitest.config.ts` — fast suite excludes `**/*.integration.test.ts` via `VITEST_EXCLUDE_INTEGRATION=true` |
| Quick run command | `npm run test` (or `yarn test`) — fast suite, mongoat models mocked via `vi.mock(...)` |
| Full suite command | `npm run test:all` (or `yarn test:all`) — includes `.integration.test.ts` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CAP-03 | Dedup lookup returns existing recipeId for same-user, same-normalizedUrl, `ready_for_review` job; does NOT match `failed` jobs (D-05); does NOT match other users (D-01) | unit | `vitest run src/modules/import/import-job.repository.test.ts` | ❌ Wave 0 — new test cases to add to existing file |
| CAP-03 | `POST /import` returns 200 `{recipeId, deduped:true}` on dedup hit, without calling `enqueueImportJob` or `consumeDailyImportQuota` | unit/route | `vitest run src/modules/import/import.routes.dedup.test.ts` | ❌ Wave 0 — new file, mirrors `import.routes.confirm.test.ts` mocking conventions |
| COST-01 | `consumeDailyImportQuota` increments atomically, returns `allowed:false` once count exceeds limit, isolated per `{userId, day}` | unit | `vitest run src/modules/usage/usage.repository.test.ts` | ❌ Wave 0 — new file, mirrors `usage.repository.ts` pattern (no existing test file found for `usage.repository.ts` itself — first test coverage for this repository) |
| COST-01 | Concurrent/duplicate submissions cannot exceed the daily limit (race-safety) — at minimum, a same-process sequential-call test proving the `$inc`-then-check logic caps correctly at the boundary | unit | `vitest run src/modules/usage/usage.repository.test.ts` | ❌ Wave 0 — same file; true concurrency can only be asserted at the logic level with a mocked model (real Mongo race testing is out of scope for the fast suite, consistent with this repo's existing "mock the model, not live Mongo" convention) |
| COST-01/D-07 | `failJob()` refunds exactly once per job; a second SQS redelivery of an already-`failed` job does not trigger a second refund | unit | `vitest run src/infra/video/pipeline.test.ts` | ❌ Wave 0 — check if `pipeline.ts` has an existing test file first (not found in this session's file reads — likely needs creation) |
| COST-02 | `costCents` shape (type + BSON validator) accepts the new nested per-stage shape; old flat shape absence doesn't crash reads | unit | `vitest run src/modules/import/import-job.model.test.ts` (if created) or covered inline in `import-job.repository.test.ts` | ❌ Wave 0 |
| COST-03 | Quota-exceeded response mirrors adapt gate exactly: `tooManyRequests` with PRO-upsell message for free users, generic limit message for PRO users | unit/route | `vitest run src/modules/import/import.routes.quota.test.ts` | ❌ Wave 0 — new file |

### Sampling Rate
- **Per task commit:** `npm run test` (fast suite, mocked models — matches existing repo convention seen in `import-job.repository.test.ts`)
- **Per wave merge:** `npm run test:all` (full suite including any `.integration.test.ts` if the plan adds real-Mongo race tests)
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `src/modules/usage/usage.repository.test.ts` — no existing test file found for `usage.repository.ts` at all (not `consumeDailyAdaptQuota` nor the new `consumeDailyImportQuota`); this phase is the first to add test coverage here — worth covering both functions' shared logic while in the file
- [ ] `src/modules/import/import.routes.dedup.test.ts` and/or `import.routes.quota.test.ts` — new route-level test files, mirroring the mocking conventions of `import.routes.confirm.test.ts`/`import.routes.mine.test.ts`
- [ ] Confirm whether `src/infra/video/pipeline.ts` has any existing test coverage (not encountered in this research session's file reads — grep for `pipeline.test.ts` before planning to avoid duplicate-file creation mistakes)
- [ ] Framework install: none — Vitest already fully configured

## Security Domain

`.planning/config.json` has `workflow.security_enforcement: true`, `security_asvs_level: 1` — section included.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | Yes (inherited, unchanged) | `requireAuth` preHandler already gates `POST /import` — no change needed |
| V3 Session Management | No | Not touched by this phase |
| V4 Access Control | **Yes — critical** | Dedup lookup MUST fold `userId` into the Mongo filter itself (never fetch-then-compare), exactly matching the existing `getImportJob(jobId, userId)` / `listMyImportedRecipes(userId)` IDOR-safe idiom already established in this codebase |
| V5 Input Validation | Yes (inherited, unchanged) | `detectPlatform`'s SSRF allowlist runs BEFORE dedup/quota (unchanged ordering) — dedup/quota gates operate only on already-validated, already-normalized URLs, never on raw user input directly |
| V6 Cryptography | No | Not applicable — no new crypto surface introduced |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|-----------------------|
| Cross-user dedup leak (User A's private import surfaces to User B via a same-URL submission) | Information Disclosure | `findExistingSuccessfulImport` filters MUST include `userId` in the Mongo query itself (D-01 explicitly locks this: "Respeita a privacidade (imports são privados/owner-scoped, D-14)") — never a global `normalizedUrl`-only lookup |
| Quota bypass via rapid concurrent submission (race past the daily limit before the first request's `$inc` commits) | Tampering / Elevation of Privilege (resource abuse) | Atomic `$inc` upsert on a uniquely-indexed `{userId, day}` document — this IS the mitigation COST-01 exists to build; confirmed race-safe via mongoat's `findOneAndUpdate`-backed `update()` |
| Quota refund abuse (a malicious client somehow triggering repeated `failed` transitions to farm free refunds) | Repudiation / Resource abuse | Not directly exploitable from the client side — `failJob()` is only ever called by the worker's own internal pipeline logic in response to real download/transcription/extraction failures, never accepts a client-supplied "mark as failed" trigger. No new attack surface introduced. |
| SSRF regression via reordering (dedup/quota bypassing the platform allowlist) | Spoofing / SSRF | Confirmed non-issue: `detectPlatform(url)` runs FIRST in the existing route, unchanged; dedup and quota gates in this phase only ever operate on the already-validated `normalizedUrl`, never on a raw/unvalidated URL — the SSRF boundary is untouched by this phase's insertion points |
| Log leakage of transcript/payload content via cost telemetry | Information Disclosure | D-08 explicitly forbids logging full payloads/transcripts — `logOutcome()`-style structured logs must only ever carry aggregate numbers (bytes, minutes, token counts, cents), matching the existing pattern's discipline (already documented in this codebase's CONCERNS.md per D-08's own citation) |

## Sources

### Primary (HIGH confidence)
- `src/modules/import/import-job.types.ts`, `import-job.model.ts`, `import-job.repository.ts`, `import.service.ts`, `import.routes.ts` — read in full this session
- `src/modules/usage/usage.repository.ts`, `usage.model.ts` — read in full this session
- `src/modules/billing/entitlement.repository.ts` — read in full this session
- `src/modules/recipes/recipe.routes.ts` (adapt gate, lines 182-239) — read this session
- `src/infra/video/pipeline.ts`, `groq.transcriber.ts`, `transcription.port.ts`, `ytdlp.downloader.ts` — read in full this session
- `src/modules/import/import.extraction.ts` — read in full this session
- `src/infra/llm/anthropic.client.ts` — read in full this session
- `src/workers/import-worker.ts` — read in full this session (redelivery/idempotency guard traced)
- `src/config/env.ts` — read in full this session
- `node_modules/@iamcalegari/mongoat/lib/model/index.d.ts` — read this session, confirms `update()` return type and `findOneAndUpdate`-backed atomicity
- `.planning/STATE.md`, `.planning/ROADMAP.md`, `.planning/REQUIREMENTS.md`, `.planning/phases/04-cost-quota-gating-dedup/04-CONTEXT.md` — read in full this session

### Secondary (MEDIUM confidence)
- MongoDB `findOneAndUpdate` atomicity — web search summary corroborating official MongoDB docs behavior, cross-checked against mongoat's own type definitions read directly this session (`node_modules/@iamcalegari/mongoat/lib/model/index.d.ts`) — confirmed via `gsd-tools query classify-confidence --provider websearch --verified` → MEDIUM

### Tertiary (LOW confidence — tagged `[ASSUMED]` in-document, single-pass web search, not cross-verified against an authoritative source this session)
- Groq/OpenAI Whisper pricing — third-party pricing aggregator search results (eesel.ai, tokenmix.ai, various), not fetched directly from `console.groq.com` or `openai.com/pricing`
- Anthropic Sonnet 4.5 pricing — third-party aggregators citing `platform.claude.com/docs/en/about-claude/pricing`, not fetched directly this session; flagged with an introductory-price cutoff caveat (A2)
- Voyage-3 pricing — third-party aggregator citing `docs.voyageai.com/docs/pricing`, not fetched directly this session
- AWS S3 egress pricing — search summary citing `aws.amazon.com/s3/pricing/`, not fetched directly this session; separately flagged (A4) as a likely-wrong cost proxy for this pipeline's actual bandwidth path
- Confirmed via `gsd-tools query classify-confidence --provider websearch` (no `--verified` flag) → LOW, matching the `[ASSUMED]` tagging applied throughout this document and the Assumptions Log

## Metadata

**Confidence breakdown:**
- Standard stack / architecture: HIGH — zero new dependencies, every pattern is a direct, traced reuse of existing, already-proven codebase code
- Dedup/quota/refund logic: HIGH — traced through actual call sites (`failJob`, `handleImportMessage`, `TERMINAL_STATUSES`) to justify the single-safe-refund-point conclusion, not assumed
- Cost telemetry pricing figures: LOW (`[ASSUMED]`) — sourced from single-pass web search against third-party aggregators, not fetched directly from provider pricing pages nor cross-verified; explicitly scoped by D-03/D-08 as "estimated," not billing-critical, and listed in the Assumptions Log for confirmation before locking config defaults
- Pitfalls: HIGH — each pitfall is either a directly-observed codebase property (SQS at-least-once + terminal-status no-op) or an explicitly-documented prior gotcha (mongoat two-source-of-truth, already hit in Phases 2/3 per STATE.md decision log)

**Research date:** 2026-07-02
**Valid until:** 2026-08-01 (30 days — stable domain; the one fast-moving element, provider pricing, is explicitly designed to live in config and be updated independently of this research's validity window)
