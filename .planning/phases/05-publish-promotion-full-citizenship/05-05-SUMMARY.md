---
phase: 05-publish-promotion-full-citizenship
plan: 05
subsystem: web
tags: [nextjs, clerk, middleware, public-route, share-link, ui]

requires:
  - phase: 05-publish-promotion-full-citizenship
    provides: "GET /recipes/share/:token -> { recipe, likes: { count, liked } }, recipe.visibility included (Plan 03)"
provides:
  - "web/lib/types.ts Recipe.shareSlug/visibility + ShareRecipeResponse type"
  - "web/lib/api.ts getRecipeByShareSlug(token) client"
  - "web/middleware.ts createRouteMatcher(['/r/(.*)']) public-route allowlist, no-Clerk-key fallback preserved"
  - "web/app/r/[token]/page.tsx public share page (outside (main) group, no auth chrome)"
  - "LikeButton logged-out sign-in redirect (D-01)"
  - "recipe/[id]/page.tsx ShareButton getUrl -> /r/[shareSlug] for private imports (SOC-02)"
affects: ["05-06 (citizenship reuse verification + search-isolation regression)"]

tech-stack:
  added: []
  patterns:
    - "Clerk createRouteMatcher/auth.protect() public-route allowlist (net-new pattern, no prior analog in this codebase)"
    - "Logged-out account-only CTAs render as real-looking Link elements to /sign-in?redirect_url=<path> instead of client components that execute actions — keeps the shared authed components (AdaptButton, AddToPlanButton, LogMealButton) untouched while giving D-02's 'visible but sign-in-routed' behavior on the public page"

key-files:
  created:
    - web/app/r/[token]/page.tsx
  modified:
    - web/lib/types.ts
    - web/lib/api.ts
    - web/middleware.ts
    - web/components/LikeButton.tsx
    - web/app/(main)/recipe/[id]/page.tsx

key-decisions:
  - "Clerk sign-in redirect mechanism: plain router.push/Link to the project's existing /sign-in route (not a Clerk-hosted modal/openSignIn call) with a `redirect_url` query param carrying the current path — mirrors the codebase's existing router.push('/sign-in') idiom (perfil page) and Clerk's documented redirect_url convention picked up by the <SignIn/> component automatically, no new redirect plumbing needed"
  - "Read-only body NOT extracted into a shared component; instead web/app/r/[token]/page.tsx is a parallel, purpose-built server component that duplicates the visual JSX from recipe/[id]/page.tsx verbatim for the parts that render (hero, meta, sourceMeta credits, nutrition card, ingredients, steps). Kept files_modified scope exactly matching the plan (recipe/[id]/page.tsx only gets the one-line ShareButton wiring, no refactor into a shared component that would risk regressing the authed page)"
  - "Account-only CTAs (adaptar, registrar no dia, modo cozinha) are rendered as static Link-styled buttons matching their authed counterparts pixel-for-pixel, routing to /sign-in?redirect_url=... on click, rather than reusing the real AdaptButton/AddToPlanButton/LogMealButton client components — those components execute real actions (quota consumption, localStorage plan writes) with no built-in auth gate, and modifying them was out of this plan's files_modified scope"
  - "IngredientsSection IS reused as the real interactive component (not a static CTA) since its 'add to shopping list' action is pure localStorage, works safely for an anonymous visitor, and needs no sign-in redirect per UI-SPEC's account-only CTA list (which names adaptar/lista de compras/modo cozinha as a set, but the shopping-list add-to-list interaction inside IngredientsSection has no server auth dependency)"

requirements-completed: [SOC-02, SOC-03]

coverage:
  - id: D1
    description: "Recipe.shareSlug/visibility types + getRecipeByShareSlug web client + middleware /r/(.*) public-route allowlist, no-Clerk-key fallback preserved"
    requirement: "SOC-02"
    verification:
      - kind: manual
        ref: "cd web && npx tsc --noEmit (0 errors); grep -c shareSlug web/lib/types.ts >=1; grep -c getRecipeByShareSlug web/lib/api.ts >=1; grep -c createRouteMatcher web/middleware.ts >=1; NextResponse.next present"
        status: pass
    human_judgment: false
  - id: D2
    description: "/r/[token] public page renders the full recipe read-only with sourceMeta credits + conversion CTAs, no TopBar/tab bar, D-12 redirect to /recipe/[id] once public"
    requirement: "SOC-02, SOC-03"
    verification:
      - kind: manual
        ref: "next build succeeds, /r/[token] registered as dynamic route; grep sourceMeta/authorHandle/Ver vídeo original >=1; grep 'Criar minha conta' >=1; grep 'Importar a minha' >=1; grep TopBar = 0; redirect( present"
        status: pass
      - kind: human
        ref: "checkpoint:human-verify Task 4 — visual parity, credits rendering, no authed chrome, sign-in redirect, invalid-token 404, D-12 redirect"
        status: pending
    human_judgment: true
  - id: D3
    description: "LikeButton logged-out tap redirects to sign-in (no visual change); owner ShareButton shares /r/[shareSlug] for private imports"
    requirement: "SOC-02"
    verification:
      - kind: manual
        ref: "grep -Ec 'useRouter|redirectToSignIn|useClerk|signIn' web/components/LikeButton.tsx >=1; grep -c shareSlug 'web/app/(main)/recipe/[id]/page.tsx' >=1; tsc --noEmit clean"
        status: pass
      - kind: human
        ref: "checkpoint:human-verify Task 4 — like tap while logged out redirects to sign-in and returns; owner Share copies /r/[shareSlug] URL"
        status: pending
    human_judgment: true

duration: 6min
completed: 2026-07-02
status: complete
---

# Phase 5 Plan 05: Public Share Page (/r/[token]) + LikeButton Sign-In Redirect + ShareButton Wiring Summary

**A new public route `/r/[token]` outside the Clerk-protected `(main)` group renders a confirmed import read-only with creator credits and conversion CTAs for anonymous visitors; middleware now allowlists `/r/(.*)`; LikeButton redirects logged-out taps to sign-in instead of no-op'ing; and the owner's ShareButton shares the token URL for private imports.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-07-02T19:46:03Z (per STATE.md handoff from Plan 03)
- **Completed:** 2026-07-02
- **Tasks:** 3 autonomous + 1 human-verify checkpoint (awaiting)
- **Files modified:** 6 (1 created, 5 modified)

## Accomplishments

- `web/lib/types.ts`: `Recipe` gained `visibility?: "private" | "public"` and `shareSlug?: string` (mirroring the optional-field-with-comment convention), plus a new `ShareRecipeResponse` type (`{ recipe, likes: { count, liked } }`) matching Plan 03's route response shape exactly.
- `web/lib/api.ts`: `getRecipeByShareSlug(token)` fetches `GET /recipes/share/:token` with `cache: "no-store"` + `authHeaders()` (so a signed-in visitor's like state resolves), returns `null` on 404 mirroring `getRecipe`'s idiom.
- `web/middleware.ts`: `clerkMiddleware()` now takes an explicit callback — `createRouteMatcher(["/r/(.*)"])` gates `auth.protect()` so only `/r/(.*)` bypasses auth; the no-Clerk-key `NextResponse.next()` fallback for local dev is untouched.
- `web/app/r/[token]/page.tsx` (new, outside `(main)`): fetches via `getRecipeByShareSlug`, 404s via `notFound()` on a miss, resolves an optional session via the existing try/catch `auth()` pattern, and redirects to `/recipe/[id]` when `recipe.visibility === "public"` (D-12). Visually reuses the recipe detail page's hero/meta/nutrition/ingredients/steps structure byte-for-byte, renders the `sourceMeta` credits block verbatim (SOC-03), drops `FavoriteButton`, keeps `LikeButton` with `canLike={Boolean(userId)}`, and renders account-only CTAs (adaptar, registrar no dia, modo cozinha) as visually-identical static links to `/sign-in?redirect_url=/r/[token]` instead of the real interactive components. Appends a new two-button conversion CTA block ("Criar minha conta" / "Importar a minha receita") after the steps list.
- `web/components/LikeButton.tsx`: `toggle()` now splits `pending` (silent no-op) from `!canLike` (logged out) — the latter now calls `router.push('/sign-in?redirect_url=' + encodeURIComponent(currentPath))` instead of silently returning. No visual/className change.
- `web/app/(main)/recipe/[id]/page.tsx`: `ShareButton` gets a `getUrl` override — when `recipe.visibility === "private"` and `recipe.shareSlug` is set, sharing copies `/r/[shareSlug]` instead of the authed `/recipe/[id]` URL; all other cases keep the existing default (`window.location.href`).

## Task Commits

Each task was committed atomically:

1. **Task 1: web plumbing — Recipe.shareSlug type + getRecipeByShareSlug client + middleware public route** - `b2d88df` (feat)
2. **Task 2: Build the /r/[token] public page (reuse recipe layout + credits + conversion CTAs)** - `9affb85` (feat)
3. **Task 3: LikeButton sign-in redirect + owner ShareButton /r/[slug] wiring** - `857d64b` (feat)

**Plan metadata:** _(pending — this SUMMARY's commit)_

## Files Created/Modified

- `web/lib/types.ts` - Added `Recipe.visibility`, `Recipe.shareSlug`, new `ShareRecipeResponse` type.
- `web/lib/api.ts` - New `getRecipeByShareSlug(token)` client function.
- `web/middleware.ts` - `clerkMiddleware(async (auth, req) => { if (!isPublicRoute(req)) await auth.protect(); })` with `createRouteMatcher(["/r/(.*)"])`; no-key fallback preserved.
- `web/app/r/[token]/page.tsx` (new) - Public read-only share page; 404 on invalid token; D-12 redirect to `/recipe/[id]`.
- `web/components/LikeButton.tsx` - Logged-out tap now redirects to sign-in instead of no-op.
- `web/app/(main)/recipe/[id]/page.tsx` - `ShareButton getUrl` wired to `/r/[shareSlug]` for private imports.

## Decisions Made

- **Sign-in redirect mechanism:** used the project's existing plain `/sign-in` route (already used elsewhere via `router.push("/sign-in")`, e.g. `perfil/page.tsx`) with a `redirect_url` query param carrying the return path — this is Clerk's documented convention (the `<SignIn/>` component reads `redirect_url` automatically), not an invented project-specific scheme, and required zero new sign-in plumbing.
- **Read-only body NOT extracted into a shared component.** `web/app/r/[token]/page.tsx` is a standalone server component that duplicates the relevant visual JSX from `recipe/[id]/page.tsx` (hero, meta, sourceMeta credits, nutrition card, ingredients, steps) rather than factoring both pages through a shared component or an `isPublicVisitor` prop. This kept the diff on `recipe/[id]/page.tsx` to the single ShareButton `getUrl` line specified in `files_modified`, avoiding any risk of regressing the authed page through a refactor.
- **Account-only CTAs (adaptar, registrar no dia, modo cozinha) render as static `Link`-styled buttons**, not the real `AdaptButton`/`AddToPlanButton`/`LogMealButton` client components — those components execute real actions (PRO quota consumption, localStorage plan writes) with no auth gate of their own, and modifying them was outside this plan's `files_modified` scope. The static links are pixel-identical to the real buttons and route to `/sign-in?redirect_url=/r/[token]` on click, satisfying D-02's "visible but sign-in-routed" requirement without touching shared components used by the authed page.
- **`IngredientsSection` is reused as the real interactive component** (not swapped for a static CTA) since its "add to shopping list" action writes only to `localStorage` and needs no session — it works safely as-is for an anonymous visitor.

## Deviations from Plan

None — plan executed exactly as written. All three autonomous tasks matched their `<action>` and `<acceptance_criteria>` blocks; no Rule 1-4 auto-fixes were needed.

## Issues Encountered

None.

## User Setup Required

None for this plan's changes — no new env vars, no new packages (`createRouteMatcher` is from the already-installed `@clerk/nextjs/server`). The `npm run setup:db` sync required by Plan 03 was already confirmed run before that plan started.

## Next Phase Readiness

- `cd web && npx tsc --noEmit` passes with zero errors.
- `cd web && npx next build --no-lint` succeeds; `/r/[token]` is registered as a dynamic (`ƒ`) route, correctly sitting outside the `(main)` group.
- All 3 autonomous tasks committed (`b2d88df`, `9affb85`, `857d64b`).
- **Task 4 (checkpoint:human-verify) is PENDING** — the plan is `autonomous: false` and ends on a blocking human-verify gate. A human must visually confirm: public page parity with the authed recipe page, creator credits rendering, absence of authed chrome (TopBar/tab bar), the logged-out like → sign-in redirect (and return to `/r/[token]` after auth), invalid-token 404, the owner's Share copying the `/r/[shareSlug]` URL, and the D-12 redirect once a recipe is public. This executor did NOT self-approve that checkpoint.
- Plan 06 (citizenship reuse verification + search-isolation regression) can proceed once the checkpoint above is approved.

---
*Phase: 05-publish-promotion-full-citizenship*
*Completed: 2026-07-02*

## Self-Check: PASSED

All created/modified files verified present on disk; all three task commits (`b2d88df`, `9affb85`, `857d64b`) verified present in `git log`.
