---
phase: 05-publish-promotion-full-citizenship
plan: 04
subsystem: search
tags: [mongodb, atlas-vector-search, hybrid-search, visibility, badge, react]

# Dependency graph
requires:
  - phase: 05-publish-promotion-full-citizenship
    provides: "Plan 02's promoteImportToPublic (visibility flip private->public, source stays imported)"
provides:
  - "hybridSearch surfaces public-promoted imports globally and owner-private imports for their owner only, via an unconditional visibility guard in the $vectorSearch.filter"
  - "Search-isolation regression test proving a private import of user A can never appear in user B's or a no-ownerId (public) query"
  - "Neutral '🎬 sua importação' badge on ResultCard (list) and SwipeDeck DeckCard (swipe), rendered on hit.source === 'imported' without the variant glow/shimmer treatment"
affects: [05-05, 05-06, search, swipe-deck]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Unconditional visibility guard in $vectorSearch.filter: no-ownerId branch excludes visibility:private outright, ownerId branch keeps the existing owner-scoped $or -- this is what makes widening DEFAULTS.sources to include 'imported' safe"
    - "Repository-level search test mocks RecipeModel.aggregate and captures the constructed pipeline's $vectorSearch.filter object -- no live Atlas/$vectorSearch needed to assert filter correctness"
    - "Standalone static pill badge guarded by isImported && !medal && !isVariant -- explicitly does not join medalClass/variant-glow so it never inherits the shimmer sweep animation"

key-files:
  created:
    - src/modules/recipes/recipe.repository.search.test.ts
  modified:
    - src/modules/recipes/recipe.repository.ts
    - src/modules/recipes/recipe.repository.test.ts
    - web/components/ResultCard.tsx
    - web/components/SwipeDeck.tsx

key-decisions:
  - "Chose PATTERNS.md option (a): added 'imported' to DEFAULTS.sources directly, paired with making the $or/visibility guard unconditional (applies with or without ownerId) instead of leaving DEFAULTS unchanged and requiring callers to opt in explicitly"
  - "Updated the D-14 JSDoc/comments (HybridSearchParams.ownerId, DEFAULTS.sources, DEFAULT_SEARCH_SOURCES, the filter block itself) in place to describe the new invariant, rather than leaving the old 'NEVER add imported to DEFAULTS' language stale"
  - "Fixed a pre-existing Phase 2 test (recipe.repository.test.ts) that asserted the OLD D-14 invariant (DEFAULT_SEARCH_SOURCES excludes 'imported') -- this plan deliberately supersedes that behavior, so the assertion was updated plus a companion test added proving the no-ownerId branch still excludes visibility:private unconditionally"

requirements-completed: [RCP-04]

coverage:
  - id: D1
    description: "hybridSearch widened: DEFAULTS.sources includes 'imported', $vectorSearch.filter applies an unconditional visibility guard (excludes private with no ownerId, owner-scoped $or with ownerId)"
    requirement: "RCP-04"
    verification:
      - kind: unit
        ref: "src/modules/recipes/recipe.repository.test.ts#hybridSearch — owner-scoped $vectorSearch filter (D-14 / T-02-06)"
        status: pass
      - kind: unit
        ref: "src/modules/recipes/recipe.repository.search.test.ts#hybridSearch — search isolation (Fase 5, D-10/D-14)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Search-isolation regression: a private import of user A never appears in user B's or a no-ownerId (public) search"
    requirement: "RCP-04"
    verification:
      - kind: unit
        ref: "src/modules/recipes/recipe.repository.search.test.ts#um import privado de A ... NUNCA satisfaz o $or de uma busca com ownerId === 'B'"
        status: pass
    human_judgment: false
  - id: D3
    description: "Neutral '🎬 sua importação' badge renders on ResultCard and SwipeDeck DeckCard for hit.source === 'imported', without the variant glow/shimmer treatment, using neutral (not warn/terracota) tokens"
    requirement: "RCP-04"
    verification:
      - kind: other
        ref: "grep 'sua importação' web/components/ResultCard.tsx web/components/SwipeDeck.tsx (both >= 1); grep 'isImported && !medal && !isVariant' confirms standalone guard"
        status: pass
    human_judgment: true
    rationale: "Visual placement/stacking (rank badge + imported badge co-occurrence, exact pixel offset) and the absence of any unintended shimmer inheritance are best confirmed by a human looking at the rendered ResultCard/SwipeDeck in the app, per UI-SPEC's own Open Question 2 (co-occurrence risk flagged but not blocking)."

# Metrics
duration: 25min
completed: 2026-07-02
status: complete
---

# Phase 5 Plan 4: Search & Swipe Citizenship for Imported Recipes Summary

**Widened hybridSearch's $vectorSearch.filter to surface owner-private and public-promoted imported recipes via an unconditional visibility guard, backed by a search-isolation regression test, plus a neutral "🎬 sua importação" badge on ResultCard and SwipeDeck.**

## Performance

- **Duration:** 25 min
- **Started:** 2026-07-02T19:35:50Z (approx, per STATE.md)
- **Completed:** 2026-07-02
- **Tasks:** 3
- **Files modified:** 5 (1 created, 4 modified — including 1 pre-existing test fixed as a direct consequence of the invariant flip)

## Accomplishments

- `DEFAULTS.sources` now includes `"imported"`, and the `$vectorSearch.filter` visibility guard is unconditional: without `ownerId` it excludes `visibility:"private"` outright (only public-promoted imports can match by source); with `ownerId` it keeps the existing owner-scoped `$or` (non-private OR the owner's own private import).
- New `recipe.repository.search.test.ts` mocks `RecipeModel.aggregate` and asserts directly on the constructed `$vectorSearch.filter` object for three cases: no-ownerId (public, private excluded + imported included), ownerId==="A" (A's own private admitted), and ownerId==="B" (an A-owned private import's `createdBy.userId` cannot satisfy B's `$or`) — the explicit cross-user leak regression required by the phase.
- `ResultCard.tsx` and `SwipeDeck.tsx` `DeckCard` both render a neutral "🎬 sua importação" pill on `hit.source === "imported"`, using `var(--t-bg-section)`/`var(--t-text-secondary)` (no terracota/warn), and the `DeckCard` version is a standalone pill guarded by `isImported && !medal && !isVariant` — never joining `medalClass`/`variant-glow`, so no shimmer sweep.

## Task Commits

Each task was committed atomically:

1. **Task 1: Widen hybridSearch to surface owner-private + public-promoted imports (D-10/D-14 safe)** - `cda7166` (feat)
2. **Task 2: Search-isolation + citizenship test** - `73dac8f` (test)
3. **Task 3: Add "🎬 sua importação" neutral badge to ResultCard + DeckCard (no glow)** - `33e8c31` (feat)

**Deviation fix (Rule 1):** `045836d` (fix) — updated a pre-existing Phase 2 test asserting the now-superseded D-14 invariant.

_Note: no plan metadata commit hash yet — this SUMMARY commit is the metadata commit._

## Files Created/Modified

- `src/modules/recipes/recipe.repository.ts` - `DEFAULTS.sources` widened to include `"imported"`; `$vectorSearch.filter` visibility guard made unconditional; D-14 comments (JSDoc on `HybridSearchParams.ownerId`, `DEFAULTS.sources`, `DEFAULT_SEARCH_SOURCES`, filter block) updated to describe the new invariant
- `src/modules/recipes/recipe.repository.search.test.ts` - new search-isolation regression test (mocks `RecipeModel.aggregate`, asserts on the captured filter shape for public/owner-A/owner-B cases)
- `src/modules/recipes/recipe.repository.test.ts` - updated the pre-existing "DEFAULT_SEARCH_SOURCES does not contain 'imported'" test to the new invariant (now asserts it DOES contain `"imported"`), added a companion test proving the no-ownerId branch still excludes `visibility:private` unconditionally
- `web/components/ResultCard.tsx` - added the "🎬 sua importação" badge (absolute-positioned pill, stacks below the rank badge with a 34px offset when both present)
- `web/components/SwipeDeck.tsx` - added `isImported` const and a standalone badge block in `DeckCard`, guarded to never co-occur with medal/variant badges and never join `medalClass`/`variant-glow`

## Decisions Made

- **Widening approach:** Chose PATTERNS.md's option (a) — add `"imported"` to `DEFAULTS.sources` directly and make the visibility guard unconditional — over option (b) (leave `DEFAULTS` unchanged, require explicit opt-in per caller). Option (a) keeps a single source of truth and matches the plan's explicit instruction; the unconditional guard is what neutralizes the risk option (a) would otherwise introduce.
- **Caller impact:** Re-verified via grep that no existing caller relies on `DEFAULTS.sources` excluding `"imported"` as its *only* private-import guard. The single real caller of `hybridSearch` today (`search.service.ts::searchRecipes`) never passes `ownerId` at all — meaning after this change it will see only public-promoted imports (never private ones, from anyone), which is the exact intended and safe behavior. `DEFAULT_SEARCH_SOURCES` itself is referenced only in comments elsewhere (`import.service.ts`, `import.routes.ts`), not actually imported/used as a runtime value by any other module.
- **Route-level `ownerId` wiring is explicitly out of scope for this plan.** `search.service.ts`/`search.routes.ts`/`search.dto.ts` are not in this plan's `files_modified` and were not touched — `searchRecipes` still does not accept/forward an `ownerId` today. This plan only makes the repository-level filter *correct and safe* for whenever a future plan wires `ownerId` through the route (or D-10's "owner sees their own private import in search" fully activates). The search-isolation test covers the repository contract regardless of route wiring.
- **Pre-existing test fixed as a direct, in-scope consequence:** `recipe.repository.test.ts` (authored in Phase 2/plan 02-03) asserted the *old* D-14 invariant (`DEFAULT_SEARCH_SOURCES` excludes `"imported"`). Since Task 1's explicit acceptance criteria required flipping this exact invariant, the old assertion was necessarily going to fail after Task 1 — this is not scope creep, it is the direct test-side consequence of implementing the plan's core edit. Updated per Rule 1 (bug: test now encodes stale/incorrect expected behavior).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated pre-existing D-14 test asserting the now-superseded invariant**
- **Found during:** Post-Task-1 full test suite run (`npm run test`)
- **Issue:** `recipe.repository.test.ts` (Phase 2, plan 02-03) contained `it("DEFAULTS.sources (exported as DEFAULT_SEARCH_SOURCES) does not contain 'imported'", ...)`. This test encoded the *pre-Phase-5* D-14 invariant, which Task 1 of this plan deliberately supersedes per its explicit acceptance criteria ("DEFAULTS.sources includes 'imported'"). Left as-is, this test would fail on every future run, misrepresenting current intended behavior as a regression.
- **Fix:** Updated the test to assert `DEFAULT_SEARCH_SOURCES` now contains `"imported"`, and added a companion test explicitly proving the no-ownerId branch still excludes `visibility:"private"` unconditionally — preserving the *spirit* of the original test (no private leak) while correcting the outdated *literal* assertion (source-set membership).
- **Files modified:** `src/modules/recipes/recipe.repository.test.ts`
- **Verification:** `npm run test -- src/modules/recipes/recipe.repository.test.ts` — 18/18 pass; full `npm run test` — 172/172 pass (excluding one pre-existing unrelated failure, see Issues Encountered)
- **Committed in:** `045836d`

---

**Total deviations:** 1 auto-fixed (1 Rule 1 — stale test assertion)
**Impact on plan:** Necessary and in-scope — this test was directly invalidated by Task 1's intended behavior change, not an unrelated pre-existing issue. No scope creep.

## Issues Encountered

- `src/workers/import-worker.test.ts` fails with "Database not found" when running the full `npm run test` suite. This is **pre-existing and out of scope**: `src/workers/import-worker.ts` and its test file are part of the working-tree drift explicitly called out in this plan's `project_specifics` ("leave it untouched, do not commit it"). Confirmed via `git log` that this test file has no local modifications from this plan's work, and the failure is unrelated to the `recipe.repository.ts`/badge changes (it fails at `RecipeModel` construction time via a different import chain, before any of this plan's code runs). Not fixed — out of scope per the plan's explicit instruction.
- A concurrent commit (`e6ad234`, "fix: teto de tempo em toda chamada externa do pipeline de import") landed on top of this plan's commits during execution, touching `import-job.repository.ts`/`.test.ts`, `import/README.md`, and `web/components/TopBar.tsx`. This is unrelated parallel work (another wave/plan), not part of 05-04's scope — left untouched, not committed by this plan.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The repository-level `hybridSearch` filter is now correct and leak-proof for imported recipes (RCP-04, D-10, D-14) — Plan 05 (public Next page, middleware, LikeButton redirect, ShareButton wiring) and Plan 06 (citizenship reuse verification + search-isolation regression) can build on this without further repository-layer changes.
- Route-level `ownerId` wiring (making `search.service.ts`/`search.routes.ts` actually pass the authenticated user's id into `hybridSearch`) remains open — flagged as out of scope for this plan since it wasn't in `files_modified`, but Plan 06 ("citizenship reuse verification") should confirm whether that wiring is needed to fully realize D-10's "owner sees their private import in their own search" or whether it's covered by a different existing code path (e.g. `listImportedRecipesByOwner` for the dedicated "Minhas importações" screen vs. the general search/swipe surfaces).
- Badge visual QA (rank badge + imported badge co-occurrence stacking, exact pixel rendering) is best confirmed with a running dev server per UI-SPEC's own Open Question 2 — not blocking, flagged as `human_judgment: true` in the coverage block above.

---
*Phase: 05-publish-promotion-full-citizenship*
*Completed: 2026-07-02*
