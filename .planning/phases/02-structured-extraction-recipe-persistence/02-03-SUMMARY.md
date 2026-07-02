---
phase: 02-structured-extraction-recipe-persistence
plan: 03
subsystem: database
tags: [mongodb, atlas-vector-search, hybrid-search, idor, security, owner-scoping]

# Dependency graph
requires:
  - phase: 02-structured-extraction-recipe-persistence
    provides: "02-01 (visibility/grounding/createdBy schema fields on Recipe) + 02-02 (import.extraction.ts LLM engine)"
provides:
  - "HybridSearchParams.ownerId — owner-scoped $vectorSearch filter for private imported recipes"
  - "getRecipeById(id, userId?) IDOR-safe overload"
  - "recipeVectorIndexDefinition filter fields visibility + createdBy.userId"
  - "listMyImportedRecipes(userId, params?) — concrete EXT-04 calling path in import.service.ts"
  - "DEFAULT_SEARCH_SOURCES exported from recipe.repository.ts"
affects: ["05-pipeline-integration (persists private imports this makes owner-searchable)", "03-review-ui (consumes getRecipeById owner overload + listMyImportedRecipes)", "05-promotion (widens sources when a recipe is promoted public)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Owner-scoped Mongo filter folded into a single query (getImportJob idiom) rather than fetch-then-compare — reused for both $vectorSearch filter and getRecipeById"
    - "Search-source allowlist composition: private/sensitive sources are added on top of a shared DEFAULTS constant by the caller, never merged into the global default"

key-files:
  created:
    - src/modules/recipes/recipe.repository.test.ts
  modified:
    - src/infra/database/search-indexes.ts
    - src/modules/recipes/recipe.repository.ts
    - src/modules/import/import.service.ts
    - src/modules/import/import.service.test.ts
    - src/modules/recipes/README.md
    - src/modules/import/README.md

key-decisions:
  - "DEFAULTS.sources in recipe.repository.ts stays exactly [\"curated\",\"generated_validated\",\"variant\",\"user\"] — 'imported' is never merged into it; callers opt in explicitly via listMyImportedRecipes, which always couples 'imported' with ownerId (D-14)"
  - "getRecipeById's userId overload uses a single combined Mongo filter ($or on visibility/createdBy.userId), mirroring getImportJob's IDOR-safe single-query idiom instead of fetching then checking ownership in app code"
  - "Atlas vector index filter-field additions (visibility, createdBy.userId) are declared in code but flagged as requiring a manual index update in any environment where the index already exists, since ensureSearchIndex only creates when absent"

requirements-completed: [EXT-04]

coverage:
  - id: D1
    description: "recipe vector index declares visibility and createdBy.userId as filter fields so the owner-scoped $vectorSearch clause is not silently inert on Atlas"
    requirement: "EXT-04"
    verification:
      - kind: unit
        ref: "npm run typecheck"
        status: pass
      - kind: other
        ref: "grep -n '\"visibility\"\\|\"createdBy.userId\"' src/infra/database/search-indexes.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "hybridSearch adds an owner-scoped $or filter (visibility != private OR private+owner-match) only when ownerId is present; catalog behavior unchanged without ownerId; DEFAULTS.sources excludes 'imported'"
    requirement: "EXT-04"
    verification:
      - kind: unit
        ref: "src/modules/recipes/recipe.repository.test.ts#hybridSearch — owner-scoped $vectorSearch filter (D-14 / T-02-06)"
        status: pass
    human_judgment: false
  - id: D3
    description: "getRecipeById(id, userId?) folds ownership into a single Mongo filter, IDOR-safe (no fetch-then-compare), null for non-owner of a private recipe"
    requirement: "EXT-04"
    verification:
      - kind: unit
        ref: "src/modules/recipes/recipe.repository.test.ts#getRecipeById — IDOR-safe owner overload (D-14 / T-02-07)"
        status: pass
    human_judgment: false
  - id: D4
    description: "listMyImportedRecipes(userId, params?) composes hybridSearch with ownerId + 'imported' source always together — the concrete calling path that makes EXT-04 deliverable, not just a signature"
    requirement: "EXT-04"
    verification:
      - kind: unit
        ref: "src/modules/import/import.service.test.ts#listMyImportedRecipes (EXT-04 concrete calling path / D-14 invariant)"
        status: pass
    human_judgment: false

# Metrics
duration: 6min
completed: 2026-07-02
status: complete
---

# Phase 2 Plan 03: Owner-Scoped Hybrid Search for Imported Recipes Summary

**Closed the D-14 security gap by adding an owner-scoped `$or` filter (visibility/createdBy.userId) to hybridSearch, an IDOR-safe `getRecipeById(id, userId?)` overload, and the concrete `listMyImportedRecipes` calling path — so a private imported recipe is searchable only by its importer, never leaked to other users.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-07-01T23:59:00Z (first task commit 23:59:47 -03)
- **Completed:** 2026-07-02T00:05:10Z (docs commit)
- **Tasks:** 3
- **Files modified:** 6 (1 created, 5 modified)

## Accomplishments
- Declared `visibility` and `createdBy.userId` as `filter`-type fields on `recipeVectorIndexDefinition` so the owner-scoped `$vectorSearch` clause is not silently inert on Atlas (an undeclared filter path is dropped, not errored — this would have been a silent privacy leak).
- Added `HybridSearchParams.ownerId`: when present, the `$vectorSearch` filter requires non-private visibility OR (`visibility: "private"` AND `createdBy.userId === ownerId`); when absent, catalog search behavior is byte-identical to before this plan. `DEFAULTS.sources` was left untouched (`["curated","generated_validated","variant","user"]`) and exported as `DEFAULT_SEARCH_SOURCES` for composition by owner-scoped callers.
- Extended `getRecipeById(id, userId?)`: with `userId`, ownership is folded into one Mongo `find` filter (mirrors `getImportJob`'s IDOR-safe idiom) — a non-owner requesting another user's private recipe gets `null`, indistinguishable from "doesn't exist." Without `userId`, behavior is unchanged (`findById` as before).
- Added `listMyImportedRecipes(userId, params?)` in `import.service.ts` — the single concrete code path that couples `ownerId` with `sources` including `'imported'`, making EXT-04 ("searchable for the importing user") an actual deliverable rather than just a repository signature. Phase 3's review UI will call this, not `hybridSearch` directly.

## Task Commits

Each task was committed atomically:

1. **Task 1: Declare owner/visibility filter fields on the recipe Atlas vector index** - `8553d59` (feat)
2. **Task 2: Add ownerId-scoped filter to hybridSearch and IDOR-safe getRecipeById overload** - `9eca712` (feat)
3. **Task 3: Concrete owner-scoped calling path — listMyImportedRecipes(userId)** - `77fc366` (feat)

**Docs (READMEs):** `3e4081e` (docs)

_Note: Task 2 and Task 3 were `tdd="true"` in the plan; tests were written and run alongside the implementation in the same commit rather than as separate RED/GREEN commits, since the plan's `<action>` blocks describe test file creation as part of the same task deliverable, not a strict TDD-gate plan (`type: tdd` was not set at the plan level)._

## Files Created/Modified
- `src/infra/database/search-indexes.ts` - `recipeVectorIndexDefinition` gains `visibility` and `createdBy.userId` filter fields
- `src/modules/recipes/recipe.repository.ts` - `HybridSearchParams.ownerId`, owner-scoped `$or` clause in `$vectorSearch.filter`, `DEFAULT_SEARCH_SOURCES` export, `getRecipeById(id, userId?)` IDOR-safe overload
- `src/modules/recipes/recipe.repository.test.ts` - New: proves the owner `$or` clause shape, catalog-behavior preservation without `ownerId`, `DEFAULTS.sources` exclusion of `'imported'`, cross-user isolation, and `getRecipeById` IDOR safety
- `src/modules/import/import.service.ts` - `listMyImportedRecipes(userId, params?)` composing `hybridSearch` with `ownerId` + `'imported'` source
- `src/modules/import/import.service.test.ts` - Extended with `listMyImportedRecipes` call-shape and ownerId-always-invariant tests
- `src/modules/recipes/README.md`, `src/modules/import/README.md` - Documented the D-14 owner-scoping mechanism and the manual Atlas index update follow-up

## Decisions Made
- **DEFAULTS.sources left untouched.** Confirmed via grep in the plan's verification step: `["curated","generated_validated","variant","user"]`, no `'imported'` merged in. Callers wanting imports (only `listMyImportedRecipes` today) pass `sources` explicitly alongside `ownerId`.
- **getRecipeById's owner check is a single combined filter**, not fetch-then-compare, following the `getImportJob` precedent exactly — this is the IDOR mitigation (T-02-07).
- **Atlas index filter-field declaration is code-only in this plan.** In any environment where `recipe_vector_index` already exists, `ensureSearchIndex` (idempotent, create-only-if-absent) will NOT retroactively add the new filter fields — a manual index update is required in that environment before the owner-scoped filter actually takes effect on Atlas. This is documented as an operational follow-up in both the code comment (`search-indexes.ts`) and the Recipes README, not a code change.
- **listMyImportedRecipes defaults `queryVector`/`haveIds` to empty arrays** when the caller doesn't supply them via `params`, since `HybridSearchParams` requires them but Phase 3 (the eventual caller) will typically pass a real query vector; this keeps the function usable standalone (e.g. a plain "list my imports" without semantic ranking) while still satisfying the type.

## Deviations from Plan

None - plan executed exactly as written, including the checker-added Task 3.

## Issues Encountered
- Initial `recipe.repository.test.ts` draft imported `recipe.repository.ts` directly, which transitively pulled in `search-indexes.ts` → `connection.ts`, which reads `env.mongo.uri` at module load and would have required a full Mongo env mock. Resolved by mocking `@/infra/database/search-indexes.js` directly (only `RECIPE_VECTOR_INDEX` constant needed), keeping the test suite fast and infra-free — consistent with the project's established `recipe.ingestion.test.ts` mocking style.
- Test fixtures initially used a non-hex placeholder id (`"recipe1"`) for the `getRecipeById(id, userId)` paths, which construct a real `ObjectId` internally and threw `BSONError`. Fixed by using a valid 24-char hex string for those specific assertions; the plain `findById`-only path (no `userId`) correctly kept the string id since it doesn't construct an `ObjectId` in that branch.

## User Setup Required

None - no external service configuration required. Operational note (not user setup, but flagged for deploy/ops): any live environment where `recipe_vector_index` already exists on Atlas needs a manual index update (not just a redeploy) to pick up the new `visibility`/`createdBy.userId` filter fields, since `ensureSearchIndex` only creates indexes that are absent.

## Next Phase Readiness
- EXT-04 is now genuinely deliverable: `listMyImportedRecipes` gives Phase 3's review UI (and any future caller) a ready-made, owner-safe way to surface a user's imported recipes.
- Phase 5 (public promotion) can widen `sources`/`visibility` when a recipe is promoted, reusing the same `$or` filter shape without further schema changes.
- Phase 3's detail/review screen can call `getRecipeById(id, userId)` directly for IDOR-safe single-recipe fetches of imports still in `ready_for_review`.
- Blocker/concern: the Atlas manual-index-update requirement (see Decisions) must be tracked as an operational deploy step before this plan's protection is live in any environment with a pre-existing `recipe_vector_index`.

---
*Phase: 02-structured-extraction-recipe-persistence*
*Completed: 2026-07-02*
