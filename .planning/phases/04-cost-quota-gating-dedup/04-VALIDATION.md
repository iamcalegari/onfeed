---
phase: 4
slug: cost-quota-gating-dedup
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-02
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `04-RESEARCH.md` §Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (configured project-wide; models mocked via `vi.mock`, no live Mongo in the fast suite) |
| **Config file** | `vitest.config.ts` (fast suite excludes `**/*.integration.test.ts`) |
| **Quick run command** | `npm run test` (fast suite) |
| **Full suite command** | `npm run test:all` |
| **Estimated runtime** | ~5–15s fast suite |

> **Backend-only phase.** Every requirement is automatable in Vitest with mocked models. The one small frontend touch (PasteLinkButton branching on a `200 {deduped:true}` response → route to the existing recipe/review instead of the progress screen) is manual-UAT (no frontend test runner, same justified stance as Phase 3). Cost **pricing accuracy** is a config/judgment review, not a unit test — the telemetry *recording* is tested; the cents *values* are LOW-confidence assumptions to confirm (RESEARCH Assumptions A1–A4).

---

## Sampling Rate

- **After every task commit:** `npm run test` (fast suite, mocked models) + `npm run typecheck`.
- **After every wave merge:** `npm run test:all`.
- **Before `/gsd-verify-work`:** full suite green PLUS a manual spot-check of a real import's recorded `costCents` (units look sane; cents match the config price table) and a live dedup hit (re-submit an already-imported URL → reused, no new pipeline run, quota not consumed).
- **Max feedback latency:** <15s.

---

## Per-Task Verification Map

| Requirement | Behavior under test | Test Type | Automated Command | File Exists | Status |
|-------------|---------------------|-----------|-------------------|-------------|--------|
| CAP-03 | Dedup lookup returns the existing recipeId for same-user + same-normalizedUrl + `ready_for_review` job; does NOT match `failed` jobs (D-05); does NOT match another user's job (D-01) | unit | `npm run test -- src/modules/import/import-job.repository.test.ts` | ✅ extend | ⬜ pending |
| CAP-03 | `POST /import` on a dedup hit returns `200 { recipeId, deduped:true }` WITHOUT calling `enqueueImportJob` or `consumeDailyImportQuota` | unit/route | `npm run test -- src/modules/import/import.routes.dedup.test.ts` | ❌ W0 | ⬜ pending |
| COST-01 | `consumeDailyImportQuota` increments atomically (`$inc` upsert) and returns `allowed:false` once count exceeds the limit, isolated per `{userId, day}` | unit | `npm run test -- src/modules/usage/usage.repository.test.ts` | ❌ W0 | ⬜ pending |
| COST-01 | Sequential/duplicate submissions cap correctly at the boundary — the `$inc`-then-check caps at the limit (race-safety at the logic level; real-Mongo race is out of the fast suite per repo convention) | unit | `npm run test -- src/modules/usage/usage.repository.test.ts -t "boundary"` | ❌ W0 | ⬜ pending |
| COST-01 / D-07 | Quota reserved at submission (before enqueue); a dedup hit does NOT consume it | unit/route | `npm run test -- src/modules/import/import.routes.quota.test.ts` | ❌ W0 | ⬜ pending |
| COST-01 / D-07 | `failJob()` refunds the quota exactly once; a second SQS redelivery of an already-`failed` job does NOT double-refund (guarded by the worker `TERMINAL_STATUSES` no-op) | unit | `npm run test -- src/workers/import-worker.test.ts` (extend) or new `pipeline.test.ts` | ❌ W0 | ⬜ pending |
| COST-02 | Expanded `costCents` shape (nested per-stage: download bytes, ASR min, LLM tokens in/out, embedding) accepted by BSON validator + TS type; absence on old docs doesn't crash reads | unit | `npm run test -- src/modules/import/import-job.repository.test.ts -t "costCents"` | ✅ extend | ⬜ pending |
| COST-02 | Pipeline records per-stage raw units + estimated cents (via config price table) into `costCents` at each stage boundary | unit | `npm run test -- src/workers/import-worker.test.ts -t "cost"` | ✅ extend | ⬜ pending |
| COST-03 | Quota-exceeded response MIRRORS the adapt gate exactly (same status + PRO-upsell message for free; generic limit message for PRO) so the existing frontend PRO messaging renders | unit/route | `npm run test -- src/modules/import/import.routes.quota.test.ts -t "PRO"` | ❌ W0 | ⬜ pending |
| CAP-03 (frontend) | On a `200 {deduped:true}`, PasteLinkButton routes to the existing recipe/review, not the progress screen | manual UAT | — (no frontend runner) | ❌ manual | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/modules/usage/usage.repository.test.ts` — NEW: first coverage for this repository; cover `consumeDailyImportQuota` (atomic `$inc`, boundary cap, per-`{userId,day}` isolation) and the shared logic with `consumeDailyAdaptQuota`.
- [ ] `src/modules/import/import.routes.dedup.test.ts` — NEW: dedup hit returns `200 {recipeId, deduped:true}`, no enqueue, no quota consume (mirror `import.routes.confirm.test.ts` mocking).
- [ ] `src/modules/import/import.routes.quota.test.ts` — NEW: reserve-at-submission, PRO-mirroring block response, dedup-hit doesn't consume.
- [ ] Extend `src/modules/import/import-job.repository.test.ts` — dedup lookup cases + expanded `costCents` shape.
- [ ] Refund-once test: FIRST grep for an existing `src/infra/video/pipeline.test.ts`; if none, extend `src/workers/import-worker.test.ts` (which already exercises `processImportJob`/`failJob`) rather than creating a duplicate file.
- [ ] Framework: none to install — Vitest already configured. NO frontend test runner (the one FE touch is manual UAT, justified).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Cost figures sane on real data | COST-02 | Pricing values are LOW-confidence assumptions (RESEARCH A1–A4); recording is tested, accuracy is a config review | Import a real Short; inspect the ImportJob `costCents` — raw units plausible (ASR min ≈ video length, LLM tokens > 0, bytes > 0), cents = units × config price table. |
| Live dedup hit | CAP-03 | End-to-end reuse across a real submission | Import a URL to success; re-submit the SAME URL → reused result, NO new pipeline run, quota NOT decremented (check the daily counter). |
| Dedup-hit frontend routing | CAP-03 | No frontend test runner | Re-submit an already-imported URL from `/import` → lands on the existing recipe/review, not a fresh progress screen. |
| Quota-exceeded upsell | COST-03 | Reuses existing PRO gate UI | As a free user, exceed the daily import limit → the same PRO-upsell block message the adapt/search gate shows appears; import is not enqueued. |

---

## Security (from RESEARCH §Security Domain)

- **Owner-scoped dedup (V4):** the dedup lookup MUST filter by `userId` — never return another user's private import for the same URL (per-user, D-01). A `{normalizedUrl, status}`-only query would leak; the `userId` predicate is mandatory.
- **Quota keyed by userId (V4):** the daily counter is per `{userId, day}`; one user cannot spend another's quota, and the `$inc` upsert is the atomicity boundary (COST-01 race-safety).
- **No SSRF regression (V5):** dedup + quota run AFTER `detectPlatform()` in `POST /import` — the SSRF allowlist stays the first gate; dedup/quota never see a URL `detectPlatform` rejected.
- **No sensitive logging:** cost telemetry logs aggregate units/cents only — never transcript/caption/LLM payloads (CONCERNS.md discipline).
- **Refund idempotency (integrity):** refund happens only in `failJob()` (the sole writer of `status:"failed"`), guarded by the worker's `TERMINAL_STATUSES` no-op so SQS at-least-once redelivery can't double-refund.

---

## Validation Sign-Off

- [ ] All backend requirements have automated verify or Wave 0 dependencies
- [ ] The one frontend touch + cost-accuracy review are enumerated as manual-only (not silently skipped)
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (usage/dedup/quota tests, refund-once)
- [ ] No watch-mode flags
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
