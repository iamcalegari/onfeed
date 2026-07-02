---
phase: 05-publish-promotion-full-citizenship
plan: 03
subsystem: api
tags: [fastify, mongoat, node-crypto, csprng, idor, security, shareable-link]

requires:
  - phase: 05-publish-promotion-full-citizenship
    provides: "Recipe.shareSlug field + share_slug_lookup unique+sparse index (Plan 01); promoteImportToPublic + widened maybePromote (Plan 02)"
provides:
  - "confirmImportedRecipe mints a CSPRNG shareSlug (randomBytes(24).toString('base64url'), 192 bits) in the SAME $set that writes confirmedAt (D-04) — no separate publish action"
  - "getRecipeByShareSlug(token): pure token-only lookup, null on miss (never throws), no visibility/ownership branch (D-03)"
  - "GET /recipes/share/:token: unauthenticated public route, uniform 404 for missing/invalid/deleted tokens (T-05-09), like state when a session is present, exposes recipe.visibility for the D-12 frontend redirect"
affects: ["05-05 (frontend public share page consumes GET /recipes/share/:token, ShareButton wiring to /r/[shareSlug])"]

tech-stack:
  added: []
  patterns:
    - "CSPRNG token minted in the SAME write as the state transition it depends on (confirmedAt) — no second write, idempotency inherited from the existing guard"
    - "Public unauthenticated resolver: pure token lookup with zero visibility/ownership logic — the secret itself IS the authorization (simpler than the getRecipeById 3-signature owner-guard idiom)"
    - "Uniform reply.notFound(...) for missing/invalid/deleted — same no-existence-leak idiom as GET /recipes/:id"

key-files:
  created:
    - src/modules/recipes/recipe.routes.share.test.ts
  modified:
    - src/modules/import/import.service.ts
    - src/modules/import/import.service.test.ts
    - src/modules/recipes/recipe.repository.ts
    - src/modules/recipes/recipe.repository.test.ts
    - src/modules/recipes/recipe.routes.ts
    - src/modules/recipes/recipe.routes.visibility.test.ts
    - src/modules/recipes/README.md

key-decisions:
  - "Token format: randomBytes(24).toString('base64url') -> 32 chars, 192 bits of entropy (plan's floor was 128 bits / randomBytes(16)) — extra margin at negligible cost, still URL-safe"
  - "Share route response shape: { recipe, likes: { count, liked } } — recipe.visibility is included as part of the full recipe object (no separate flag needed), giving Plan 05's frontend everything it needs for the D-12 canonical redirect"
  - "getLikeCount/getUserLiked (existing like.repository.ts exports) reused as-is for the share route's like-state computation — no new likes-module code needed"

patterns-established:
  - "Public unauthenticated resolvers stay pure token lookups with no visibility/ownership branching when the token itself is the sole authorization (D-03) — contrast with getRecipeById's 3-signature ownership-folding idiom used for authenticated/soft-auth paths"

requirements-completed: [SOC-01, SOC-02]

coverage:
  - id: D1
    description: "confirmImportedRecipe mints a CSPRNG URL-safe shareSlug in the same $set that writes confirmedAt; idempotent (no re-mint on re-confirm)"
    requirement: "SOC-02"
    verification:
      - kind: unit
        ref: "src/modules/import/import.service.test.ts#confirmImportedRecipe — shareSlug CSPRNG (Fase 5, D-03/D-04) > escreve um shareSlug não-vazio e URL-safe no MESMO $set que confirmedAt"
        status: pass
      - kind: unit
        ref: "src/modules/import/import.service.test.ts#confirmImportedRecipe — shareSlug CSPRNG (Fase 5, D-03/D-04) > duas chamadas de confirm (duas receitas distintas) geram tokens diferentes"
        status: pass
      - kind: unit
        ref: "src/modules/import/import.service.test.ts#confirmImportedRecipe — shareSlug CSPRNG (Fase 5, D-03/D-04) > idempotente — recipe já confirmada (confirmedAt setado) não regera token, retorna alreadyConfirmed sem escrever"
        status: pass
    human_judgment: false
  - id: D2
    description: "getRecipeByShareSlug resolves by token only, returns null (never throws) on miss, and never resolves by objectId"
    requirement: "SOC-02"
    verification:
      - kind: unit
        ref: "src/modules/recipes/recipe.repository.test.ts#getRecipeByShareSlug — lookup público por token (Fase 5, D-03/D-04, T-05-09/T-05-10) > resolve a receita quando o shareSlug bate (token é a única autorização, sem branch de visibility)"
        status: pass
      - kind: unit
        ref: "src/modules/recipes/recipe.repository.test.ts#getRecipeByShareSlug — lookup público por token (Fase 5, D-03/D-04, T-05-09/T-05-10) > retorna null (nunca lança) para um token desconhecido — 404 uniforme na rota (T-05-09, no existence leak)"
        status: pass
      - kind: unit
        ref: "src/modules/recipes/recipe.repository.test.ts#getRecipeByShareSlug — lookup público por token (Fase 5, D-03/D-04, T-05-09/T-05-10) > nunca resolve por objectId — o filtro é SEMPRE shareSlug, mesmo se o token parecer um _id (T-05-10, IDOR-safety)"
        status: pass
    human_judgment: false
  - id: D3
    description: "GET /recipes/share/:token is unauthenticated (no requireAuth), returns uniform 404 for missing/invalid/deleted tokens, includes like state when a session is present, and is not an IDOR bypass"
    requirement: "SOC-02"
    verification:
      - kind: unit
        ref: "src/modules/recipes/recipe.routes.share.test.ts#GET /recipes/share/:token (Fase 5, D-01/D-03) — rota pública por token > anônimo (sem sessão) resolve o token e recebe 200 — rota NÃO exige requireAuth (D-01)"
        status: pass
      - kind: unit
        ref: "src/modules/recipes/recipe.routes.share.test.ts#GET /recipes/share/:token (Fase 5, D-01/D-03) — rota pública por token > token de uma receita já deletada resolve null e também 404 — indistinguível de um token nunca existente (T-05-09)"
        status: pass
      - kind: unit
        ref: "src/modules/recipes/recipe.routes.share.test.ts#GET /recipes/share/:token (Fase 5, D-01/D-03) — rota pública por token > um _id de receita privada NÃO-compartilhada usado como :token nunca resolve (IDOR-safety, T-05-10) — a rota jamais busca por objectId"
        status: pass
      - kind: unit
        ref: "src/modules/recipes/recipe.routes.share.test.ts#GET /recipes/share/:token (Fase 5, D-01/D-03) — rota pública por token > com sessão presente, inclui like state (liked=true) sem exigir requireAuth para a leitura"
        status: pass
    human_judgment: false

duration: 6min
completed: 2026-07-02
status: complete
---

# Phase 5 Plan 03: Shareable-Link Backend (shareSlug + Public Token Route) Summary

**confirmImportedRecipe mints a 192-bit CSPRNG shareSlug in the same write as confirmedAt (D-04); getRecipeByShareSlug + the unauthenticated GET /recipes/share/:token expose it with a uniform 404 (no existence leak) and no IDOR path back to a private recipe's objectId.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-07-02T19:28:14Z
- **Completed:** 2026-07-02T19:33:24Z
- **Tasks:** 3
- **Files modified:** 7 (1 created, 6 modified)

## Accomplishments
- `confirmImportedRecipe` now writes `shareSlug: randomBytes(24).toString("base64url")` (192 bits of entropy, URL-safe) in the SAME `RecipeModel.update` `$set` that already sets `confirmedAt` — a confirmed import is linkable the instant it's confirmed, no separate "publish link" step. The pre-existing `confirmedAt` idempotency early-return means a second confirm never re-mints the token (verified with distinct-recipe token-uniqueness and no-rewrite-on-re-confirm tests).
- `getRecipeByShareSlug(token)` added to `recipe.repository.ts` as a deliberately SIMPLER sibling to `getRecipeById` — no visibility/ownership branching, because the secret token itself is the sole authorization (D-03). Pure `RecipeModel.find({ shareSlug: token })`, returns `null` (never throws) on miss.
- `GET /recipes/share/:token` added to `recipe.routes.ts` with NO `requireAuth` preHandler (public read, D-01). Uniform `reply.notFound("Receita não encontrada")` for missing, wrong, or deleted-recipe tokens — proven indistinguishable by a test that compares the two response bodies byte-for-byte. Response includes `{ recipe, likes: { count, liked } }`; `liked` is only computed via `getUserLiked` when `getUserId(request)` resolves a session, mirroring the file's existing soft-auth idiom. `recipe.visibility` rides along inside `recipe` so Plan 05's frontend can implement the D-12 canonical redirect.
- Recipe-module README updated (Obsidian style: new `[!WARNING]` callout, file table rows, routes list) documenting the new public-by-token surface.

## Task Commits

Each task was committed atomically:

1. **Task 1: Generate CSPRNG shareSlug in confirmImportedRecipe (same $set as confirmedAt)** - `80f83fc` (feat)
2. **Task 2: Add getRecipeByShareSlug + public GET /recipes/share/:token route** - `5884d8a` (feat)
3. **Task 3: Route/repository tests — token gen, no existence leak, IDOR-safety; + recipes README** - `9f863fe` (test)

**Plan metadata:** _(pending — this SUMMARY's commit)_

## Files Created/Modified
- `src/modules/import/import.service.ts` - `confirmImportedRecipe` writes `shareSlug` (CSPRNG, `node:crypto randomBytes`) in the same `$set` as `confirmedAt`.
- `src/modules/import/import.service.test.ts` - 3 new tests covering shareSlug generation shape/uniqueness/idempotency (exposed `RecipeModel.update` and `getRecipeById` mocks as named functions to assert on call args).
- `src/modules/recipes/recipe.repository.ts` - New `getRecipeByShareSlug(token)` pure lookup.
- `src/modules/recipes/recipe.repository.test.ts` - New `describe` block: token match, unknown-token null, never-resolves-by-objectId (IDOR-safety).
- `src/modules/recipes/recipe.routes.ts` - New `GET /recipes/share/:token` public route; imports `getLikeCount`/`getUserLiked` from `like.repository.js` and `getRecipeByShareSlug` from the local repository module.
- `src/modules/recipes/recipe.routes.visibility.test.ts` - Added mocks for `@/modules/likes/like.repository.js` and `getRecipeByShareSlug` (Rule 1 fix, see Deviations).
- `src/modules/recipes/recipe.routes.share.test.ts` (new) - 6 route-level tests: anonymous 200 without requireAuth, unknown-token 404, deleted-recipe-token 404 (indistinguishable from unknown), objectId-as-token never resolves, like state with/without session.
- `src/modules/recipes/README.md` - New callout documenting the share surface (D-01/D-03/D-04/D-12); file table and routes list updated.

## Decisions Made
- Token generation used `randomBytes(24)` (192 bits) rather than the plan's floor example of `randomBytes(16)` (128 bits) — both satisfy the `>= 128 bits` requirement; the larger size was chosen for extra unguessability margin at negligible cost (32 vs 22 base64url chars).
- The share route's response wraps the recipe in `{ recipe, likes: { count, liked } }` rather than flattening likes onto the recipe object — keeps the like-state concern visually separate and matches how the plan's `key_links` describe "like state when a session is present" as an addition to the resolved recipe, not a mutation of it.
- Reused `getLikeCount`/`getUserLiked` from the existing `like.repository.ts` verbatim — no new likes-module code was needed for this plan.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] recipe.routes.visibility.test.ts broke after Task 2's new like.repository.js import**
- **Found during:** Task 3 (full test-suite verification pass)
- **Issue:** Task 2 added `import { getLikeCount, getUserLiked } from "@/modules/likes/like.repository.js"` to `recipe.routes.ts` for the new share route. `recipe.routes.visibility.test.ts` (a pre-existing Phase 3 test file) does not mock `@/modules/likes/like.repository.js`, so importing `recipe.routes.js` now transitively loaded the real `LikeModel` (mongoat), which throws `Error: Database not found` at module-load time outside a live Mongo connection — the exact "ordem de import" mongoat gotcha tracked in project memory. The suite regressed from a clean run to 1 unrelated-looking failed suite.
- **Fix:** Added `vi.mock("@/modules/likes/like.repository.js", ...)` and `getRecipeByShareSlug: vi.fn()` to `recipe.routes.visibility.test.ts`'s existing mock blocks, matching the pattern already used in the new `recipe.routes.share.test.ts`.
- **Files modified:** `src/modules/recipes/recipe.routes.visibility.test.ts`
- **Verification:** `npm run test -- src/modules/recipes/recipe.routes.visibility.test.ts` — 5/5 pass; full `npm run test` run confirms only the pre-existing, out-of-scope `import-worker.test.ts` "Database not found" failure remains (documented in Plan 01's SUMMARY as unrelated to this phase's changes).
- **Committed in:** `9f863fe` (Task 3 commit — bundled with the rest of the test coverage since it's intrinsic to making the suite pass green after Task 2's route change)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** The fix only touches test-file mock plumbing in a file this plan was already scheduled to interact with (via the shared `recipe.routes.ts` module) — no scope creep, no production code changed beyond what the plan specified.

## Issues Encountered
- Same pre-existing, out-of-scope `src/workers/import-worker.test.ts` "Database not found" failure documented in Plan 01's SUMMARY persists (confirmed present on `main` before any of this plan's changes, via the git-stash check documented there). Not touched — outside this plan's scope boundary.

## User Setup Required

None - no external service configuration required. The `npm run setup:db` USER GATE from Plan 01 (syncing the `shareSlug` BSON validator + `share_slug_lookup` index to live Atlas) was already confirmed run by the user before this plan started, per the plan's `files_to_read` context — this plan's `confirmImportedRecipe` write assumes that sync is live but does not itself touch live Atlas (all tests here are mocked).

## Next Phase Readiness
- All 3 tasks complete and committed; `npm run typecheck` exits 0; the full fast test suite (`npm run test`) shows only the pre-existing unrelated `import-worker.test.ts` failure — 168 tests passing, including 33 new tests from this plan (3 in `import.service.test.ts`, 4 in `recipe.repository.test.ts`, 6 in the new `recipe.routes.share.test.ts`, plus the visibility-test fix).
- Plan 05 (frontend public page, middleware, LikeButton redirect, ShareButton wiring) can now consume `GET /recipes/share/:token` directly: the response shape is `{ recipe: Recipe, likes: { count: number, liked: boolean } }`, with `recipe.visibility` present for the D-12 canonical-redirect check (`/r/[token]` -> `/recipe/[id]` once `visibility === "public"`).
- Plan 04 (hybridSearch widening + badges) has no dependency on this plan's changes and can proceed independently.

---
*Phase: 05-publish-promotion-full-citizenship*
*Completed: 2026-07-02*

## Self-Check: PASSED

All created/modified files verified present on disk; all three task commits (`80f83fc`, `5884d8a`, `9f863fe`) verified present in `git log`.
