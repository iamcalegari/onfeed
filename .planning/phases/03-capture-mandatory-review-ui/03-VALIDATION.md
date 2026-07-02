---
phase: 3
slug: capture-mandatory-review-ui
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-02
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `03-RESEARCH.md` §Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (backend — already configured project-wide since Phase 1) |
| **Config file** | `vitest.config.ts` (backend). **No frontend test config exists** — `web/` has `playwright` as a devDependency but zero `.spec.ts` files and no `playwright.config.ts` |
| **Quick run command** | `npm run test` (fast suite; excludes `*.integration.test.ts`) |
| **Full suite command** | `npm run test:all` |
| **Estimated runtime** | ~5–15s fast suite |

> **Split reality:** the two new backend routes (`PATCH /import/:jobId/recipe`, `GET /import/mine`) and the `GET /recipes/:id` visibility fix are automatable in Vitest. Every *frontend* requirement (clipboard, grounding badges, inline edit, polling UX) is **manual-only** for this phase — no frontend test runner exists and standing up Playwright is disproportionate to a UI-only phase with no prior frontend-test precedent (RESEARCH §Wave 0 Gaps). This is an explicit, justified decision — not a silent skip.

---

## Sampling Rate

- **After every task commit:** `npm run test` (fast suite) for every backend route/service change; manual click-through in dev (`npm run dev` + `cd web && npm run dev`) for every frontend screen change.
- **After every plan wave:** `npm run test:all` + `npm run typecheck`, PLUS a full manual walkthrough of the vertical slice touched by the wave.
- **Before `/gsd-verify-work`:** full backend suite green PLUS the manual UAT checklist (below) executed once end-to-end against a real import — the risoto Short from CONTEXT (`title=inferred`, "a gosto"=`ambiguous`, stated ingredients=`grounded`).
- **Max feedback latency:** <15s (backend); frontend feedback is human-in-the-loop (dev server hot reload).

---

## Per-Task Verification Map

| Requirement | Wave | Behavior under test | Test Type | Automated Command | File Exists | Status |
|-------------|------|---------------------|-----------|-------------------|-------------|--------|
| REV-04 | backend | Fresh `ready_for_review` import: `Recipe.reviewRequired` stays `true` until confirm PATCH is called | unit/integration | `npm run test -- src/modules/import/import.routes.confirm.test.ts` | ❌ W0 | ⬜ pending |
| REV-04 | backend | Successful `PATCH /import/:jobId/recipe` flips `reviewRequired:false` + sets `confirmedAt`, applies edited fields | unit/integration | `npm run test -- src/modules/import/import.routes.confirm.test.ts -t "confirm applies edits"` | ❌ W0 | ⬜ pending |
| REV-04 | backend | PATCH rejects with 409 when `job.status !== "ready_for_review"` (table-test each non-terminal/failed status — Pitfall 3) | unit | `npm run test -- src/modules/import/import.routes.confirm.test.ts -t "not ready"` | ❌ W0 | ⬜ pending |
| REV-04 | backend | Second confirm attempt (already `reviewRequired:false`) is idempotent-safe — no silent double-apply with different data (Pitfall 3) | unit | `npm run test -- src/modules/import/import.routes.confirm.test.ts -t "idempotent"` | ❌ W0 | ⬜ pending |
| REV-02/security | backend | Confirm body schema (`additionalProperties:false`) REJECTS client-supplied `grounding` / `reviewRequired` / `confidenceScore` (Pitfall 5) | unit | `npm run test -- src/modules/import/import.routes.confirm.test.ts -t "rejects protected fields"` | ❌ W0 | ⬜ pending |
| CAP-01 / IDOR | backend | `PATCH /import/:jobId/recipe` scoped by `(jobId, userId)` — another user's job returns 404, never edits (RESEARCH §Security IDOR) | unit/integration | `npm run test -- src/modules/import/import.routes.confirm.test.ts -t "owner scope"` | ❌ W0 | ⬜ pending |
| D-09 | backend | `GET /import/mine` returns only the caller's imported recipes; call always passes matching `ownerId` (never a bare `hybridSearch` — Anti-pattern) | unit/integration | `npm run test -- src/modules/import/import.routes.mine.test.ts` | ❌ W0 | ⬜ pending |
| Security (V4) | backend | `GET /recipes/:id` on a `private`+`reviewRequired` recipe requires owner `userId` match; anonymous / other user → 404/403 (Open Q3 fix) | unit/integration | `npm run test -- src/modules/recipes/recipe.routes.visibility.test.ts` | ❌ W0 | ⬜ pending |
| CAP-01 (submit) | frontend | Pasting a valid URL on `/import` and submitting calls `POST /import` and routes to the progress screen with the returned `jobId` | manual UAT | — (no frontend runner) | ❌ manual | ⬜ pending |
| CAP-01 (clipboard) | frontend | "Colar" button reads clipboard under gesture; on denied/unsupported (Safari) falls back silently to `paste` event — never a red error (Pitfall 1) | manual UAT | — (Clipboard API not simulable in Vitest/node) | ❌ manual | ⬜ pending |
| REV-01 | frontend | After `ready_for_review`, user lands on a review screen (not a silent redirect to "done") | manual UAT | — | ❌ manual | ⬜ pending |
| REV-02 | frontend | `inferred`/`ambiguous` fields render a distinct "confira isto" badge; `grounded` fields stay neutral | manual UAT (visual) | — | ❌ manual | ⬜ pending |
| REV-03 | frontend | Title, ingredient qty/unit, steps, tips are editable inline; edits held in local state, NOT persisted until confirm (Anti-pattern: no auto-save) | manual UAT | — | ❌ manual | ⬜ pending |
| CAP-01 (progress) | frontend | Progress screen polls `GET /import/:jobId`, shows real stage transitions, stops on terminal status, and after timeout shows an explicit "demorando mais que o esperado" state (Pitfall 2) — not an indefinite silent spinner | manual UAT | — | ❌ manual | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/modules/import/import.routes.confirm.test.ts` — new: REV-04 confirm gate (stays `reviewRequired:true` until PATCH), 409 on non-`ready_for_review`, idempotent second confirm, IDOR owner-scope, protected-field rejection.
- [ ] `src/modules/import/import.routes.mine.test.ts` — new: `GET /import/mine` owner-scoping (only caller's imports; `ownerId` always paired with `'imported'`).
- [ ] `src/modules/recipes/recipe.routes.visibility.test.ts` — new: `GET /recipes/:id` visibility/ownership check for `private`+`reviewRequired` recipes (Open Q3 security fix).
- [ ] Fixtures/helpers: an owned `ready_for_review` ImportJob + linked private Recipe factory (reuse the risoto grounding shape) for the confirm/visibility tests.
- [ ] Framework: none to install — Vitest already configured. **Explicitly NOT installing Playwright** for the frontend (out of proportion for this phase; all frontend requirements are manual-UAT-only, tracked above).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Clipboard read + Safari fallback | CAP-01 | Clipboard API can't be reliably simulated in Vitest/node; needs a real browser + real user gesture | On desktop Chrome: copy a Reel URL, open `/import`, click "Colar" → field pre-fills. On iOS Safari: click "Colar" → no error, then long-press → Paste into the field works. |
| Grounding badge honesty | REV-02 | Judges visual correctness of grounded/inferred/ambiguous mapping, not schema shape | Import the risoto Short; on the review screen confirm the title shows the "confira isto" badge (inferred), "a gosto" quantities show it (ambiguous), and spoken ingredients are neutral (grounded). |
| Inline edit is not persisted early | REV-03/REV-04 | Requires observing that no DB write happens until confirm | Edit a title/quantity, navigate away WITHOUT confirming, re-open via "Minhas importações" → the edit is gone and `reviewRequired` still true (nothing persisted). Then edit + confirm → detail page shows the edit. |
| Progress screen worker-down UX | CAP-01 | Requires an operational state (worker not running) that isn't a code path | Stop `npm run worker:import`, submit an import, watch the progress screen sit at `queued`; after `POLL_TIMEOUT_MS` it must show the explicit "demorando mais que o esperado" retry state (Pitfall 2). |
| Failure path | CAP-01 | Requires a real failing URL (blocked platform / unsupported) | Submit a private/blocked URL; progress screen reaches `failed` and shows a legible `failureReason` with a "tentar outra URL" action (D-05). |
| "Minhas importações" status | D-09 | End-to-end list correctness across states | List shows each import with correct status (em revisão / confirmada) and deep-links into review or the recipe detail accordingly. |

---

## Security (from RESEARCH §Security Domain)

- **V2 Auth:** `requireAuth` preHandler on the two new routes (`PATCH /import/:jobId/recipe`, `GET /import/mine`) — identical to existing `GET /import/:jobId`.
- **V4 Access Control (IDOR):** confirm route scopes the job by `(jobId, userId)` in **one** query (never fetch-then-compare); never trust a `recipeId` from the request body over the job-derived one. `GET /import/mine` must call `listMyImportedRecipes(userId)` — never a bare `hybridSearch({ sources:["imported"] })` that could omit `ownerId` and leak other users' private imports.
- **V4 (new fix — Open Q3):** `GET /recipes/:id` currently has NO auth/ownership check; add a visibility guard so `private`+`reviewRequired` imports require an owner `userId` match (resolved via `Recipe.importJobId → ImportJob.userId`, since Recipe has no direct `userId`). This closes an enumeration/information-disclosure gap this phase creates by making unreviewed private imports linkable by id.
- **V5 Input Validation (Pitfall 5):** the confirm PATCH body is TypeBox with `additionalProperties:false`, accepting only editable content fields (`title`, `intro`, `ingredients[].{name,quantity,unit}`, `steps[].text`) with length bounds mirroring `SubmitRecipeSchema`. It must NOT accept `grounding`, `reviewRequired`, or `confidenceScore` — the server sets `reviewRequired:false` itself; grounding is immutable extraction provenance.
- **Client validation is UX only:** the client-side URL check is for fast feedback; `POST /import`'s server-side `detectPlatform()` allowlist stays the sole SSRF boundary — do not add a second, divergent validator.

---

## Validation Sign-Off

- [ ] All backend tasks have automated verify or Wave 0 dependencies
- [ ] Frontend manual-only verifications are enumerated with concrete steps (not silently skipped)
- [ ] Sampling continuity: no 3 consecutive backend tasks without automated verify
- [ ] Wave 0 covers all MISSING references (confirm, mine, visibility, fixtures)
- [ ] No watch-mode flags
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
