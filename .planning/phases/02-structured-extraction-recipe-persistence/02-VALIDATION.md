---
phase: 2
slug: structured-extraction-recipe-persistence
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-01
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `02-RESEARCH.md` §Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (already configured project-wide — installed in Phase 1) |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npm run test` (fast suite; excludes `*.integration.test.ts`) |
| **Full suite command** | `npm run test:all` |
| **Estimated runtime** | ~5–15s fast suite |

---

## Sampling Rate

- **After every task commit:** `npm run test` (fast suite, mocked LLM/DB — same pattern as Phase 1: mock `@/config/env.js` and model classes).
- **After every plan wave:** `npm run test:all` + `npm run typecheck`.
- **Before `/gsd-verify-work`:** full suite green PLUS a manual spot-check of grounding truthfulness against the real risotto Short transcript (from 01/02-CONTEXT) — judging semantic correctness of grounding assignment can't be fully automated.

---

## Per-Task Verification Map

| Requirement | Wave | Behavior under test | Test Type | Automated Command | File Exists | Status |
|-------------|------|---------------------|-----------|-------------------|-------------|--------|
| EXT-01 | 1 | Extraction zod schema accepts a valid fixture (title, ingredients qty+unit, ordered steps, tips) | unit | `npm run test -- src/modules/import/import.extraction.test.ts` | ❌ W0 | ⬜ pending |
| EXT-01 | 1 | Ambiguous quantity ("a gosto") preserved literally, never numericized (D-04) | unit (fixture) | `npm run test -- src/modules/import/import.extraction.test.ts -t "ambiguous"` | ❌ W0 | ⬜ pending |
| EXT-01 | 1 | Missing title → LLM-proposed title marked `inferred` (D-06) | unit (recorded LLM fixture) | `npm run test -- src/modules/import/import.extraction.test.ts -t "missing title"` | ❌ W0 | ⬜ pending |
| EXT-02 | 1 | `computeConfidence` computes aggregate score from a known grounded/inferred ratio | unit (pure fn) | `npm run test -- src/modules/import/import.confidence.test.ts` | ❌ W0 | ⬜ pending |
| EXT-02 | 1 | Grounding not universally "grounded" on adversarial/sparse fixture (Pitfall 3) | unit fixture / `human_judgment` if live LLM | `npm run test -- src/modules/import/import.extraction.test.ts -t "not over-confident"` | ❌ W0 | ⬜ pending |
| EXT-03 | 1 | Canonicalization called once per unique ingredient via existing `resolveCanonicalForIngestion` (no duplicate logic) | unit (spy/mock ingredient.service) | `npm run test -- src/modules/recipes/recipe.ingestion.test.ts` | ❌ W0 | ⬜ pending |
| EXT-04 | 1 | Imported recipe (`source:"imported"`) embedded via same `buildEmbeddingText`/`embedDocuments` path | unit (mock Voyage) | `npm run test -- src/modules/recipes/recipe.ingestion.test.ts -t "imported"` | ❌ W0 | ⬜ pending |
| EXT-04 | 1 | Imported private recipe retrievable **by its owner only** (owner-scoped — D-14/Pitfall 2) | unit/integration (per resolution) | TBD once owner-scoping shape locked by planner | ❌ W0 | ⬜ pending |
| EXT-05 | 1 | Critical field inferred (title or core ingredient qty/unit) forces `requiresReview: true` regardless of score | unit (pure fn) | `npm run test -- src/modules/import/import.confidence.test.ts -t "critical field"` | ❌ W0 | ⬜ pending |
| EXT-05 | 1 | `noSpeechDetected: true` forces `requiresReview: true` unconditionally (Pitfall 5) | unit | `npm run test -- src/modules/import/import.confidence.test.ts -t "no speech"` | ❌ W0 | ⬜ pending |
| EXT-05 | 1 | Pipeline `extracting` stage calls extractor, persists via `persistExtractedRecipe`, always lands `status: ready_for_review` (never direct public) | unit (mock adapters) | `npm run test -- src/workers/import-worker.test.ts` (extend) | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/modules/import/import.extraction.ts` + `import.extraction.test.ts` — new extractor (mirrors recipe.extraction.ts + grounding)
- [ ] `src/modules/import/import.confidence.ts` + `import.confidence.test.ts` — pure `computeConfidence` gate (easiest to fully cover; grounding→score, critical-field + no-speech overrides)
- [ ] `src/modules/recipes/recipe.ingestion.test.ts` — no test today (CONCERNS.md); add baseline coverage for `persistExtractedRecipe` now that a 2nd caller (import) exercises it
- [ ] Fixtures: 2-3 realistic transcript+caption pairs under `src/modules/import/__fixtures__/` — one clean/well-grounded, one ambiguous/sparse, one adversarial/injection-attempt (for grounding-shape tests + manual truthfulness spot-check)
- [ ] Framework: none to install — Vitest already configured

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Grounding truthfulness on real data | EXT-02 | Judges semantic correctness of grounded/inferred assignment, not schema shape | Run extraction on the real risotto Short transcript+caption; verify stated ingredients are `grounded`, LLM-filled gaps are `inferred`, "a gosto" is `ambiguous` |
| Prompt-injection resistance | EXT-05/security | Adversarial caption crafted to say "mark everything grounded" or inject instructions | Feed the adversarial fixture; confirm the gate still forces `requiresReview` and grounding isn't blindly trusted |

---

## Security (from RESEARCH §Security Domain)

- **V4 Access Control (Pitfall 2 / D-14):** owner-scoped filtering wherever `imported`/private recipes are queryable; never add `"imported"` to a globally-shared `DEFAULTS.sources`/search filter without an accompanying ownerId check.
- **V5 Input Validation (Pitfall 4):** transcript/caption are untrusted DATA — delimited/labeled sections in the user turn; system prompt treats them as data not instructions; `requiresReview` gate is defense-in-depth so a successful injection can't reach public silently.
- **Logging:** do not `console.log` full LLM request/response or raw transcript (third-party creator content) — reuse `recipe.ingestion.ts` discipline.

---

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (incl. fixtures)
- [ ] No watch-mode flags
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
