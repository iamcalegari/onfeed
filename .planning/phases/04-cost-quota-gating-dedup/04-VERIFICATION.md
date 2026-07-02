---
phase: 04-cost-quota-gating-dedup
verified: 2026-07-02T14:15:00Z
status: human_needed
score: 7/7 must-haves verified
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "npm run setup:db against live Atlas (04-02 Task 1, blocking gate)"
    expected: "collMod applies the expanded costCents $jsonSchema validator and provisions the dedup_lookup {userId,normalizedUrl,status} compound index on the live import_jobs collection without error. Also provisions the import_usage collection/unique index if not auto-created on first write."
    why_human: "Requires live MongoDB Atlas credentials (MONGODB_URI/USERNAME/PASSWORD/DB_NAME) the automated executor cannot read, and mutates a production/staging schema validator — the project's established human-gate convention (same class of gate as Phase 3's confirmedAt sync)."
  - test: "04-05 Task 4 checkpoint — live dedup-hit routing + quota-exceeded PRO upsell end-to-end"
    expected: "(1) Free user imports a URL to success, re-submits the SAME URL from /import → lands on /recipe/[id] (existing recipe), NOT a new progress screen; import_usage counter unchanged for the reuse. (2) Free user exceeding the daily import limit (default 3/day) is blocked with the same PRO-upsell message the adapt/search gate shows; no job enqueued. (3) A previously-FAILED URL is NOT deduped — re-submitting it re-runs the pipeline (D-05)."
    why_human: "Requires a live Mongo/SQS pipeline run (depends on setup:db above) plus human observation of routing/UI behavior that a mocked unit test cannot simulate. Explicitly declared `gate=\"blocking\"` in 04-05-PLAN.md Task 4 and reported NOT executed in 04-05-SUMMARY.md (`status: paused`)."
  - test: "Cost figures sane on real data (COST-02 pricing review)"
    expected: "Import a real Short; inspect the ImportJob.costCents — raw units plausible (ASR minutes ≈ video length, LLM tokens > 0, bytes > 0), cents = units × env.import price table. Human should also spot-check the Anthropic Sonnet 4.5 input price (RESEARCH A2 flagged ambiguity between introductory and standard pricing)."
    why_human: "Pricing values are explicitly documented as LOW-confidence estimates (04-VALIDATION.md Manual-Only Verifications) — recording is unit-tested, accuracy against real data is a judgment/config review, not a code-level truth."
---

# Phase 4: Cost, Quota Gating & Dedup Verification Report

**Phase Goal:** Import volume is economically safe before it is exposed to real usage — quota can't be burned past the free tier by retries or concurrent submissions, duplicate URLs don't re-run the expensive pipeline, and every stage's cost is visible.
**Verified:** 2026-07-02
**Status:** human_needed (all code-level truths verified against the real source; the phase correctly discloses one pending live-Mongo human infra gate + its dependent end-to-end UAT checkpoint, plus a pricing-accuracy judgment review — none are code gaps)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | CAP-03 dedup: `findExistingSuccessfulImport` folds `userId` into the Mongo filter with `status:"ready_for_review"` — never matches another user or a failed job | ✓ VERIFIED | `src/modules/import/import-job.repository.ts:64-74` — `ImportJobModel.find({ userId, normalizedUrl, status: "ready_for_review" })`, single-query owner-scope (no fetch-then-compare). Test `import-job.repository.test.ts:131-148` asserts the filter object contains `userId`+`normalizedUrl`+`status:"ready_for_review"` AND explicitly `expect(filterObj.status).not.toBe("failed")` (D-05). No TTL/date clause anywhere in the query (D-06, permanent match). |
| 2 | `POST /import` calls the dedup lookup and returns `200 {recipeId, deduped:true}` on a hit WITHOUT enqueue or quota consume | ✓ VERIFIED | `src/modules/import/import.routes.ts:101-104` — `findExistingSuccessfulImport` called right after `normalizeUrl`, hit short-circuits with `reply.code(200).send({recipeId, deduped:true})` before quota/enqueue code is reached. `import.routes.dedup.test.ts:73-91` asserts `enqueueImportJob` and `consumeDailyImportQuota` are `not.toHaveBeenCalled()` on a HIT; `:109-122` proves a MISS falls through to enqueue. |
| 3 | PasteLinkButton branches on the union to route to the existing recipe instead of the progress screen | ✓ VERIFIED | `web/lib/api.ts:350-370` `startImport` returns a discriminated union `{jobId}\|{deduped:true,recipeId}`; `web/app/actions.ts:112-124` `startImportAction` propagates the 3-way result; `web/components/PasteLinkButton.tsx:59-69` — `if (res.ok && "deduped" in res) router.push(\`/recipe/${res.recipeId}\`)`, else `router.push(\`/import/${res.jobId}\`)`, else `setSubmitError`. Frontend `tsc --noEmit` clean. |
| 4 | COST-01 quota: `consumeDailyImportQuota` is an atomic `$inc` upsert on a dedicated `import_usage` collection with a unique `{userId,day}` index; reserved at submission before enqueue | ✓ VERIFIED | `src/modules/usage/import-usage.model.ts` — dedicated `import_usage` collection, `indexes:[{key:{userId:1,day:1},name:"user_day_unique",unique:true}]`. `usage.repository.ts:47-64` `consumeDailyImportQuota` does `ImportUsageModel.update({userId,day},{$inc:{count:1},...},{upsert:true})`, `allowed:count<=limit`. Called in `import.routes.ts:112` (`consumeDailyImportQuota(userId, limit)`) AFTER the dedup check and BEFORE `createImportJob`/`enqueueImportJob` (line 121-122) — reserve-at-submission confirmed by line order and by `import.routes.quota.test.ts:73` (`reserve-at-submission — ... consumeDailyImportQuota is called BEFORE enqueueImportJob`). |
| 5 | `refundDailyImportQuota` is called ONLY in `failJob()`, keyed by `job.insertedAt`, exactly-once (guarded by worker `TERMINAL_STATUSES` no-op) | ✓ VERIFIED | `grep -c "refundDailyImportQuota(" src/infra/video/pipeline.ts` = 1, located inside `failJob` (`pipeline.ts:133-154`), called with `day = job.insertedAt.toISOString().slice(0,10)` — never `new Date()`. `insertedAt` is a required, non-optional field in both the TS type and BSON validator, so no undefined-access risk. Worker `TERMINAL_STATUSES = new Set(["ready_for_review","failed"])` no-ops redelivery of an already-terminal job (`import-worker.ts:75-89`) before `processImportJob`/`failJob` can re-run. `import-worker.test.ts:344-384` proves refund fires exactly once, does NOT double-refund on redelivery, and keys off a stale `insertedAt` (2020-01-15) rather than "today" — a deliberately adversarial test case. |
| 6 | COST-02 telemetry: `ImportJob.costCents` nested per-stage in BOTH TS type and BSON validator; pipeline records raw units + estimated cents via `env.import` price table; cost LOG is aggregate-only | ✓ VERIFIED | `import-job.types.ts:54-60` and `import-job.model.ts:34-68` declare the identical nested shape (`download{bytes,cents}`, `transcription{minutes,cents}`, `extraction{inputTokens,outputTokens,cents}`, `embedding{tokens,cents}`, `totalCents`), `costCents` absent from `required[]` in both. `pipeline.ts:109-126` pure helpers (`downloadBytesToCents`/`asrMinutesToCents`/`llmTokensToCents`) read exclusively from `env.import.priceCents*` (grep confirms 5 occurrences, zero hardcoded price constants). `pipeline.ts:342-352` log line `"[pipeline] cost"` JSON-stringifies only `platform, downloadBytes, asrMinutes, llmInputTokens, llmOutputTokens, totalCents` — all numeric/string fields, no transcript/caption/payload. |
| 7 | COST-03 gate: quota-exceeded block MIRRORS the adapt gate exactly; `env.import` has `dailyLimitFree=3`/`Pro=50` WITHOUT clobbering the Phase-1 `maxDurationSec` | ✓ VERIFIED | `recipe.routes.ts:207-211` adapt gate: `reply.tooManyRequests(pro ? "Limite diário de adaptações..." : "Você usou suas...")`. `import.routes.ts:114-118`: identical `reply.tooManyRequests(pro ? "Limite diário de importações..." : "Você usou suas...")` — same shape, only text/config keys differ. `env.ts:126-176` — single `import:` block (grep confirms exactly 1 `^  import: {`) contains `maxDurationSec` (preserved, line 129) + `dailyLimitFree:3`/`dailyLimitPro:50` (lines 135-136) + the 6-key price table, all via the `Number(optional(...))` idiom. |

**Score:** 7/7 truths verified (0 present-but-behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/modules/usage/import-usage.model.ts` | Dedicated `import_usage` collection, unique `{userId,day}` index | ✓ VERIFIED | File exists, structural mirror of `AdaptUsageModel`, no `adapt_usage` token present. |
| `src/modules/usage/usage.repository.ts` | `consumeDailyImportQuota` + `refundDailyImportQuota` | ✓ VERIFIED | Both present, atomic `$inc` upsert (consume) and no-upsert negative `$inc` (refund). |
| `src/modules/usage/usage.repository.test.ts` | First test coverage for this repository file | ✓ VERIFIED | Exists, boundary-cap case present (grep "boundary" ≥ 1), all cases green (52 tests total across the module's Phase-4 test files). |
| `src/modules/import/import-job.types.ts` | Nested `costCents` shape | ✓ VERIFIED | Lines 54-60, all sub-fields optional. |
| `src/modules/import/import-job.model.ts` | Matching BSON validator + `dedup_lookup` index | ✓ VERIFIED | Lines 34-68 (costCents), line 100 (`dedup_lookup {userId,normalizedUrl,status}`); mirrors the TS type field-for-field. |
| `src/modules/import/import-job.repository.ts` | `findExistingSuccessfulImport` | ✓ VERIFIED | Lines 64-74, owner-scoped, `ready_for_review`-only, no TTL. |
| `src/config/env.ts` | `env.import.dailyLimitFree/Pro` + price table, `maxDurationSec` preserved | ✓ VERIFIED | Single `import:` block, all keys present. |
| `src/modules/import/import.routes.ts` | Dedup + quota guards wired into `POST /import` in D-07 order | ✓ VERIFIED | Lines 90-122, exact order: detectPlatform → normalizeUrl → dedup → quota → create/enqueue. |
| `src/modules/import/import.routes.dedup.test.ts` | HIT/MISS/no-enqueue/no-quota-consume coverage | ✓ VERIFIED | 3 tests, all asserting hard call-count/shape expectations (not just presence). |
| `src/modules/import/import.routes.quota.test.ts` | Reserve-at-submission, PRO-mirroring, dedup-bypasses-quota coverage | ✓ VERIFIED | 4 tests incl. `it.each` for free/PRO boundary. |
| `src/infra/video/pipeline.ts` | Per-stage cost recording + refund-in-failJob | ✓ VERIFIED | Lines 109-126 (helpers), 191-352 (recording at each boundary), 133-154 (`failJob` + sole refund call site). |
| `web/lib/api.ts`, `web/app/actions.ts`, `web/components/PasteLinkButton.tsx` | Dedup-aware union + frontend branch | ✓ VERIFIED | Full 3-file chain confirmed by direct read; frontend typecheck clean. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `POST /import` handler | `findExistingSuccessfulImport(userId, normalizedUrl)` | direct call, AFTER `detectPlatform`+`normalizeUrl`, BEFORE quota | ✓ WIRED | `import.routes.ts:101` |
| `POST /import` handler | `consumeDailyImportQuota(userId, limit)` | direct call, AFTER dedup MISS, BEFORE `createImportJob`/`enqueueImportJob` | ✓ WIRED | `import.routes.ts:112`, ordering also proven by `import.routes.quota.test.ts:73` |
| `failJob()` (pipeline.ts) | `refundDailyImportQuota(job.userId, day)` | single call site, keyed by `job.insertedAt` | ✓ WIRED | `pipeline.ts:153`; `grep -c "refundDailyImportQuota(" pipeline.ts` == 1 |
| `import-worker.ts` `handleImportMessage` | `processImportJob`/`failJob` re-entry guard | `TERMINAL_STATUSES.has(job.status)` no-op | ✓ WIRED | `import-worker.ts:86-89`; proven exactly-once by `import-worker.test.ts:356-374` |
| `env.import.priceCents*` | `pipeline.ts` cost helpers | direct read, no hardcoded constants | ✓ WIRED | `downloadBytesToCents`/`asrMinutesToCents`/`llmTokensToCents` all reference `env.import.priceCents*` exclusively |
| `PasteLinkButton` | `/recipe/[recipeId]` on dedup hit | `router.push` inside `"deduped" in res` branch | ✓ WIRED | `PasteLinkButton.tsx:60-63` |
| `recipe.routes.ts` adapt gate | `import.routes.ts` quota gate | verbatim `reply.tooManyRequests` shape mirror | ✓ WIRED | Confirmed identical response construction, differing only in message text/config keys |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `costCents` (persisted on `ready_for_review`) | Accumulator built across 3 stage boundaries | `stat()` on the real downloaded file (bytes), `durationSec/60` (ASR minutes), `res.usage.input_tokens/output_tokens` from the real Anthropic response (`import.extraction.ts:245-251`) | Yes — every unit derives from a real pipeline artifact, not a static/hardcoded value; only `embedding` is deliberately `undefined` (documented, not silently dropped) | ✓ FLOWING |
| `[pipeline] cost` log line | `costCents.*` fields | Same accumulator, read at the log call site | Yes — reflects the actually-recorded per-job values | ✓ FLOWING |
| `import_usage.count` | `consumeDailyImportQuota`/`refundDailyImportQuota` | Real atomic Mongo `$inc` upsert against `{userId,day}` | Yes (mocked in unit tests, but the production code path is a real DB primitive, not a stub) | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Targeted Phase-4 test files (usage/dedup/quota/pipeline/extraction) | `npm run test -- src/modules/usage/usage.repository.test.ts src/modules/import/import-job.repository.test.ts src/modules/import/import.routes.dedup.test.ts src/modules/import/import.routes.quota.test.ts src/workers/import-worker.test.ts src/modules/import/import.extraction.test.ts` | 6 files, 52/52 tests passed | ✓ PASS |
| Full backend suite (regression, once) | `npm run test` | 19 files, 163/163 tests passed | ✓ PASS |
| Backend typecheck | `npm run typecheck` | clean, 0 errors | ✓ PASS |
| Frontend typecheck | `cd web && npx tsc --noEmit` | clean, 0 errors | ✓ PASS |
| Refund exactly-once / keyed-by-reserved-day (adversarial: stale insertedAt) | reviewed `import-worker.test.ts:344-384` (part of the full suite run above) | 3/3 pass, incl. the stale-date assertion `toHaveBeenCalledWith("user_1","2020-01-15")` | ✓ PASS |
| No debt markers in phase-touched files | `grep -nE "TBD\|FIXME\|XXX\|TODO\|HACK\|PLACEHOLDER"` across all 12 touched files | 1 false-positive match (`"TODO o corpo"` — Portuguese "the whole body", pre-existing Phase-1/2 comment, not a debt marker) | ✓ PASS |

### Probe Execution

Not applicable — no `scripts/*/tests/probe-*.sh` files exist in this project and none were declared by any Phase 4 plan/SUMMARY. Skipped.

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|-----------------|-------------|--------|----------|
| CAP-03 | 04-04, 04-05 | Importações duplicadas da mesma URL são deduplicadas — reusa o resultado existente | ✓ SATISFIED | `findExistingSuccessfulImport` + wired dedup guard in `POST /import`, frontend routes to existing recipe |
| COST-01 | 04-01, 04-05, 04-06 | Quota diária reservada NA SUBMISSÃO, não na conclusão | ✓ SATISFIED | Atomic `consumeDailyImportQuota` called before enqueue; `refundDailyImportQuota` exactly-once in `failJob`, keyed by reserved day |
| COST-02 | 04-02, 04-03, 04-04, 04-06 | Custo por job medido por estágio (download/ASR/LLM/embedding) | ✓ SATISFIED | Nested `costCents` shape (type+validator in sync), per-stage recording from config price table, aggregate-only log |
| COST-03 | 04-01, 04-03, 04-05 | Import básico grátis dentro da quota; volume alto exige PRO | ✓ SATISFIED | `env.import.dailyLimitFree/Pro`, quota gate mirrors adapt gate's PRO-upsell verbatim |

No orphaned requirements — all 4 v1 Phase-4 requirement IDs (CAP-03, COST-01, COST-02, COST-03) are declared across the 6 plans' frontmatter and match `.planning/REQUIREMENTS.md`'s Phase-4 mapping exactly (lines 129-132).

### Anti-Patterns Found

None. Scanned all 12 phase-touched source files (backend + frontend) for `TBD|FIXME|XXX|TODO|HACK|PLACEHOLDER`, silent-error/empty-return stubs, and hardcoded-empty-data patterns. One grep hit was a false positive (Portuguese prose "TODO o corpo" = "the whole body", pre-existing from an earlier phase, not a debt marker). No stub route handlers, no hardcoded price constants outside `env.ts`, no `refundDailyImportQuota` call sites outside `failJob`.

### Known, Correctly-Documented Non-Gaps

- **`npm run setup:db` (04-02 Task 1) intentionally not run by the executor.** A `[BLOCKING]` gate requiring live Atlas credentials the automated executor cannot read and that mutates a production/staging schema validator via `collMod` — same class of gate as Phase 3's `confirmedAt` sync, correctly disclosed and correctly refused to auto-run. The `costCents` type + BSON validator + `dedup_lookup` index are fully in place in code; only the live-Atlas sync is pending. This does not block any automated test (all Phase 4 tests use mocked Models).
- **04-05 Task 4 (`checkpoint:human-verify`, `gate="blocking"`) not executed.** `04-05-SUMMARY.md` frontmatter reports `status: paused` for exactly this reason — Tasks 1-3 (all code + tests) are complete and green, but the live end-to-end dedup/quota UAT depends on `setup:db` running first, and even then requires a human to observe real routing/UI behavior. This is pre-disclosed, not a newly-discovered gap, and is chained to the `setup:db` gate above (04-05-SUMMARY D5 rationale).
- **Cost figures pricing accuracy** is explicitly a judgment review (04-VALIDATION.md Manual-Only Verifications), not a code truth — the *recording mechanism* is fully unit-tested and verified against the real pipeline code in this report; the *cents values themselves* are documented LOW-confidence estimates (`env.ts:138-157`) awaiting a human spot-check against real imported videos, with an explicit callout that the Anthropic Sonnet 4.5 input price is the most uncertain figure (RESEARCH A2).
- **Embedding cost is deliberately omitted** (`costCents.embedding` stays `undefined`) because `persistExtractedRecipe` doesn't currently expose embedding token counts back to the pipeline — documented as a scoped decision in 04-06-SUMMARY.md, not a stub or oversight; `totalCents` correctly sums only the known stages (`?? 0` per term).

### Human Verification Required

See the `human_verification` block in the frontmatter above — 3 items, all pre-disclosed by the phase's own plans/SUMMARYs/VALIDATION.md, none newly discovered by this verification:

1. **`npm run setup:db` against live Atlas** — syncs the expanded `costCents` validator and the `dedup_lookup` index before any real (non-mocked) write of the new shape.
2. **04-05 Task 4 live checkpoint** — dedup-hit routing, quota-not-consumed-on-reuse, PRO upsell, and failed-job-not-deduped, all observed against a real running pipeline (depends on item 1).
3. **Cost-figure sanity/pricing review** — confirm raw units are plausible on a real import and that the Anthropic Sonnet 4.5 input price figure is current before launch.

### Gaps Summary

No code gaps found. Every one of the 7 derived observable truths (covering all 4 requirement IDs — CAP-03, COST-01, COST-02, COST-03 — plus the explicit ordering invariant and the exactly-once refund invariant) is verified directly against the real source, not inferred from SUMMARY claims:

- The dedup lookup is provably owner-scoped in a single Mongo query, matches only `ready_for_review`, explicitly never `failed` (test asserts this negatively), and applies no TTL — read directly in `import-job.repository.ts` and locked by 5 test cases.
- `POST /import` runs the guards in the exact contractual order (`detectPlatform` → `normalizeUrl` → dedup → quota → enqueue) — read directly line-by-line in `import.routes.ts`, not assumed from the plan's `<action>` prose.
- A dedup hit is proven, by hard mock assertions, to call neither `enqueueImportJob` nor `consumeDailyImportQuota` — this is the single most failure-prone invariant in the phase (a naive implementation could easily double-charge or double-enqueue) and it holds.
- The quota gate is a byte-for-byte structural mirror of the existing production adapt gate (`recipe.routes.ts`), confirmed by reading both call sites side by side.
- `env.import` preserves the Phase-1 `maxDurationSec` in the same single block (`grep -c "^  import: {"` == 1) while adding the new limits and 6-key price table — no clobbering.
- `refundDailyImportQuota` has exactly one call site in the entire codebase (`pipeline.ts`, inside `failJob`), keyed by `job.insertedAt` (a required, non-optional field — no undefined-access risk), and a dedicated adversarial test proves it survives SQS redelivery without double-refunding and correctly ignores "today" in favor of the reserved day.
- The nested `costCents` shape is byte-identical between the TS type and the BSON validator (both read directly), all sub-fields optional at every level, and the pipeline populates it from real `stat()`/ASR-duration/LLM-usage values — never a static fallback — while the aggregate cost log line contains only numeric fields, confirmed by direct code read of the `JSON.stringify` call.
- Backend: 163/163 fast-suite tests pass (full regression run, once), typecheck clean. Frontend: typecheck clean. No debt markers, no stub patterns, no hardcoded price constants outside config.
- Requirements coverage is complete and un-orphaned: all 4 Phase-4 requirement IDs are declared across the plans and satisfied by verified code.

The phase's remaining open items are exactly the ones the execution team already and honestly disclosed as a chained pair of human infrastructure/UAT gates (`setup:db` → the 04-05 Task 4 live checkpoint) plus a pricing-accuracy judgment review — none are newly discovered as gaps by this verification, and none indicate incomplete or stubbed code. The phase goal — "quota can't be burned past the free tier by retries or concurrent submissions, duplicate URLs don't re-run the expensive pipeline, and every stage's cost is visible" — is achieved at the code level; what remains is confirming it holds against a live database and real traffic, which is the correct, disclosed scope boundary for an automated executor.

---

*Verified: 2026-07-02*
*Verifier: Claude (gsd-verifier)*
