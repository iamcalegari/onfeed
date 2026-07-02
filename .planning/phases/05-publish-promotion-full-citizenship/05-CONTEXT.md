# Phase 5: Publish, Promotion & Full Citizenship - Context

**Gathered:** 2026-07-02
**Status:** Ready for planning

<domain>
## Phase Boundary

An imported recipe becomes a first-class citizen of onFeed: privately owned and
shareable via an unguessable link the moment it's confirmed, credited to its
creator, promotable to the **public** catalog only when both trusted
(confidence bar) AND liked (+5), and usable everywhere any other recipe is
usable (macro adaptation, shopping list, cook mode, search/swipe with I/E/T/N).

Covers **SOC-01..05** (private ownership, shareable link, creator attribution,
likes→public promotion gated on confidence, credit retention) and **RCP-01..04**
(adapt, shopping list, cook mode, search citizenship).

**NOT this phase:** anything about *capture* (paste-link UX, clipboard detection),
the video pipeline, extraction, or the review UI — those are Phases 1–3 and are
already shipped. Capture bugs surfaced during discussion are logged under
Deferred Ideas, not part of Phase 5 scope.

</domain>

<decisions>
## Implementation Decisions

### Shareable link & access model (SOC-02)
- **D-01:** The public share page is viewable **without login** (a public route,
  outside the `(main)`/Clerk-protected group). **Liking requires an account** —
  the like action redirects a logged-out visitor to sign-in and returns them to
  the recipe. Rationale: keeps the promotion gate honest (1 account = 1 like, no
  anonymous like-fraud inflating the +5) while removing the view barrier so the
  link works as an acquisition loop. No anonymous-like identity is needed.
- **D-02:** The public/link view renders the **full recipe read-only** (title,
  image, ingredients, steps, tips, creator credits) + a like button + conversion
  CTAs ("crie sua conta / importe a sua"). Account-only actions (adaptRecipe,
  shopping list, cook mode, import) are shown but route to sign-in. Maximizes
  link→signup conversion — the point of the shareable link.

### Link format & privacy (SOC-01/02)
- **D-03:** Each confirmed import gets a **secret, unguessable `shareSlug`
  (token)**. The public route resolves **by token** (`/r/[token]` or similar),
  **never by raw objectId**. This prevents enumeration: Mongo objectIds are
  semi-sequential (timestamp-derived), so an id-based public route would leak
  private recipes. `visibility:"private"` stays invisible in search; the token is
  the only door while private.
- **D-04:** Every confirmed import is **linkable immediately** — the `shareSlug`
  exists as soon as `confirmedAt` is set (no separate "publish link" action).

### Promotion semantics (SOC-04/05)
- **D-05:** On the promotion gate firing, the recipe **keeps `source:"imported"`
  and flips `visibility: private → public`** — it does NOT become
  `source:"variant"`. Rationale: preserves the imported identity so per-field
  grounding and creator credits (`sourceMeta`) keep rendering. "Public catalog
  citizen" is achieved by the visibility flip + widening search to include
  `source:"imported" AND visibility:"public"`.
- **D-06:** Promotion is gated on a **dedicated confidence bar** (new env
  threshold, e.g. `IMPORT_PROMOTE_CONFIDENCE`) **AND** `confirmedAt` being set
  (human review done) — NOT the `reviewRequired` threshold (which only decides
  "needs a human", not "ready for the public catalog"). Full gate:
  `likeCount >= promoteThreshold  AND  confidenceScore >= promoteConfidence  AND  confirmedAt != null`.
- **D-07:** The like threshold **reuses `env.variants.promoteThreshold` (= 5)**.
  The existing `maybePromote()` trigger (in `like.repository.ts`, today only
  handles `source:"generated_pending"`) is **widened** to recognize
  `source:"imported"` and apply the D-06 gate before flipping visibility.
- **D-08:** The **owner/importer's own like does NOT count** toward the +5 — only
  third-party likes count, preventing self-promotion to public.
- **D-09:** **SOC-05 falls out for free** from D-05: because `source` stays
  `"imported"`, `sourceMeta` (original creator credit) and `createdBy[]`
  (importing user, already populated at persist) both survive promotion — no
  synthetic `createdBy` entry. The **external creator** (only an `@handle`, no
  onFeed `userId`) is credited via **`sourceMeta`**, never `createdBy[]`.

### Catalog citizenship & search (RCP-01..04)
- **D-10:** A private imported recipe appears in the **owner's own search/swipe**
  with an I/E/T/N match score (RCP-04), visually marked with an **"imported"
  badge** (🎬 "sua importação") so the owner can tell it's their private import,
  not public catalog. Requires the search to include `source:"imported"` in the
  owner-scoped branch (the owner-scoped `createdBy.userId` filter already exists;
  `DEFAULTS.sources` excludes `imported` and must include it **only when
  `ownerId` is passed** — never widen the public default).
- **D-11:** RCP-01/02/03 are **direct reuse** of existing flows: adapting an
  imported recipe creates a `generated_pending` child anchored to it (current
  `adaptRecipe` behavior, no special-casing); shopping-list missing-ingredients
  and step-by-step cook mode + timers work identically to any other recipe.

### URL canonicalization & like lifecycle (edge cases)
- **D-12:** While private, `/r/[token]` is the only door. Once public,
  `/r/[token]` **stays valid forever** (don't break already-shared links) but
  **redirects to the canonical `/recipe/[id]`** (public, no token). One recipe,
  one official URL post-promotion.
- **D-13:** Deleting/rejecting an import **removes its likes** (cascade by
  `recipeId`); promotion is moot once the recipe is gone.

### Claude's Discretion
- Exact env var names, public route naming (`/r/[token]` vs `/share/[token]`),
  badge copy/iconography, and CTA wording — planner/executor discretion within
  the decisions above.
- Redirect mechanism for D-12 (server redirect vs canonical link) — implementer's
  call.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase requirements & goal
- `.planning/ROADMAP.md` §"Phase 5: Publish, Promotion & Full Citizenship" — goal + 5 success criteria
- `.planning/REQUIREMENTS.md` §"Social, atribuição e promoção" (SOC-01..05) + §"Cidadania no catálogo" (RCP-01..04)
- `.planning/PROJECT.md` §"Key Decisions" — private→public +5-likes cycle; creator attribution; "não re-hospedar vídeo"

### Promotion / likes machinery (to widen)
- `src/modules/likes/like.repository.ts` — `toggleLike` → `maybePromote` (source-gated, `env.variants.promoteThreshold`) → widen for `source:"imported"` + confidence/confirmedAt gate + exclude owner self-like
- `src/modules/recipes/recipe.repository.ts` — `promoteToVariant` (L600, today flips source→variant; Phase 5 path flips visibility instead), `getRecipeById` visibility guard (L~540-575, importJobId→ImportJob.userId), `hybridSearch` `DEFAULTS.sources` (L63-76) + owner-scoped visibility branch (L243-250), `listImportedRecipesByOwner` (L471)
- `src/config/env.ts` — `variants.promoteThreshold` (L79); `env.import` block (add `promoteConfidence`)

### Recipe model & imported identity
- `src/modules/recipes/recipe.types.ts` — `RecipeVisibility`, `importJobId`, `reviewRequired`, `confirmedAt` (L111-128)
- `src/modules/recipes/recipe.model.ts` — `visibility`/`importJobId` BSON schema (L114-125); add `shareSlug` field + index
- `src/modules/import/import.recipe-mapping.ts` — `createdBy` population (L76, username=userId placeholder wart), `sourceMeta` shape

### Frontend (public page + credits + badge)
- `web/middleware.ts` — `clerkMiddleware` (needs public exception for the share route)
- `web/app/(main)/recipe/[id]/page.tsx` — recipe detail + `sourceMeta` credits block (built Phase 4) — reuse for the public read-only page
- `web/lib/types.ts` — `Recipe.sourceMeta`, `RecipeSource` (already includes `"imported"`)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Promotion trigger**: `toggleLike`/`maybePromote`/`promoteToVariant` + `LikeModel.total` — the whole likes→promotion loop exists; Phase 5 widens the source gate + swaps the "promote" action from source-flip to visibility-flip for imports.
- **Visibility guard**: `getRecipeById(id, userId?)` already folds ownership into one filter and resolves imported-owner via `importJobId → ImportJob.userId` — the public-by-token path is a sibling resolver (by `shareSlug`, no auth).
- **Owner-scoped import listing**: `listImportedRecipesByOwner` (pure `findMany`, no `$vectorSearch`) — model for owner-scoped inclusion in search.
- **Credits block**: the `sourceMeta` render on the recipe detail page (Phase 4) is directly reusable on the public page.

### Established Patterns
- **Source-based lifecycle**: `generated_pending → variant` via likes is the analog; imports use `private → public` on the same trigger, gated additionally on confidence + confirmedAt.
- **`createdBy[]` credits + `sourceMeta`**: keep source `"imported"` so both survive promotion; external creator lives in `sourceMeta` (no `userId`).
- **Owner-scoped queries fold ownership into one Mongo filter** (`getImportJob` idiom) — never fetch-then-compare.
- **D-14 guardrail (from Phase 2):** NEVER add `"imported"` to `DEFAULTS.sources` unconditionally — only include it when an `ownerId` is present (private) or scoped to `visibility:"public"` (promoted).

### Integration Points
- **New public route group** in Next (outside `(main)` Clerk protection) rendering the read-only share page by token.
- **New backend endpoint** resolving a recipe by `shareSlug` (unauthenticated read; like still requires auth).
- **`shareSlug`** new field on Recipe (BSON + type + index + backfill/setup:db) generated at confirm.
- **Search widening**: owner-scoped inclusion of `source:"imported"` (private, owner) + public inclusion of promoted imports.
- **`maybePromote` extension** + owner self-like exclusion in the like count used for the gate.

</code_context>

<specifics>
## Specific Ideas

- Public share page should read as a **conversion funnel** (PIX-app feel): full
  recipe + credits, then "crie sua conta / importe a sua" CTAs.
- The owner should always be able to tell their private import apart from public
  catalog results (🎬 badge), per D-10.

</specifics>

<deferred>
## Deferred Ideas

### Capture-flow items surfaced during discussion (Phase 3 domain, NOT Phase 5)
Reported by the user as live-testing feedback. Being handled as a **separate
batch immediately after this CONTEXT is committed** (user chose option (b)), not
folded into Phase 5:

1. **Bug — "colar link" button opens the native paste menu instead of pasting.**
   `web/components/PasteLinkButton.tsx` likely relies on a native paste target
   instead of reading the clipboard. Fix: `navigator.clipboard.readText()` on
   click, auto-filling the field. Small frontend fix.
2. **Feature — clipboard recipe-link detection on app open (PIX-style).** On
   launch, if the clipboard holds a valid IG/TikTok/YouTube recipe link, show a
   prompt ("detectamos um link — importar?") that lands on `/import` prefilled.
   New *capture* capability (not a bug) with real caveats: browser clipboard-read
   permission, iOS Safari restrictions, privacy of auto-reading the clipboard.
   Candidate for a small "capture v2" phase; needs a permission/UX mini-design.

### v2 (already tracked in ROADMAP.md "Future / v2")
- Browser extension capture (EXTN-01..03), 3-image carousel (IMG-01..03), OCR
  enrichment (PRO-01..02), native/Web-Share-Target capture (SHARE-01..02),
  timestamp-linked steps (TS-01), human review-queue (MOD-01).

</deferred>

---

*Phase: 5-Publish, Promotion & Full Citizenship*
*Context gathered: 2026-07-02*
