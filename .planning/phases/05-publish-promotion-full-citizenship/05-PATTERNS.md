# Phase 5: Publish, Promotion & Full Citizenship - Pattern Map

**Mapped:** 2026-07-02
**Files analyzed:** 14 (backend: 6 modified/1 new field-set; frontend: 6 modified/1 new)
**Analogs found:** 14 / 14 (all reuse-heavy per CONTEXT — no orphan files)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/modules/likes/like.repository.ts` (`maybePromote` widened) | service | event-driven (trigger on like) | itself (existing `maybePromote`/`toggleLike`) | exact — extend in place |
| `src/modules/recipes/recipe.repository.ts` (new `promoteImportToPublic`, sibling to `promoteToVariant`) | service | CRUD (conditional update) | `promoteToVariant` (~L600) | exact |
| `src/modules/recipes/recipe.repository.ts` (new `getRecipeByShareSlug`) | service | request-response (unauthenticated read) | `getRecipeById(id, userId?)` (~L532-575) | exact — same trusted/untrusted idiom |
| `src/modules/recipes/recipe.repository.ts` (`hybridSearch` DEFAULTS widening — already done for private-owner branch; confirm public-promoted-imported inclusion) | service | CRUD (aggregation filter) | existing `$vectorSearch.filter` block (~L242-253) | exact — already implements D-14 guard; verify public+imported branch covers promoted case |
| `src/modules/recipes/recipe.types.ts` (add `shareSlug?: string` to `Recipe`) | model/types | n/a (schema/type) | `importJobId?: string` / `confirmedAt?: Date` fields (L114-128) | exact — same optional-field-with-comment convention |
| `src/modules/recipes/recipe.model.ts` (add `shareSlug` BSON prop + sparse unique index) | model | n/a (schema/index) | `importJobId` BSON prop (L118) + `import_job_lookup` sparse index (L174-175) | exact |
| `src/modules/recipes/recipe.routes.ts` (new `GET /recipes/share/:token` or similar) | route | request-response (unauthenticated read) | `GET /recipes/:id` soft-auth handler (L117-180) | exact — same soft-auth via `getUserId(request)`, same 404-on-not-found-or-not-yours idiom |
| `src/config/env.ts` (add `import.promoteConfidence`) | config | n/a | `variants.promoteThreshold` (L78-85) pattern + `import.*` block (L126-176) | exact |
| `src/modules/import/import-job.repository.ts` (model for owner-vs-public resolver idiom, not modified) | service (reference only) | request-response | `getImportJob(jobId, userId?)` (L34-44) | exact — cited idiom for "fold ownership into one filter" |
| `web/middleware.ts` (add `isPublicRoute` allowlist for `/r/:token`) | middleware | request-response | itself — currently has NO public-route allowlist, must add `createRouteMatcher` | no analog in repo — see Gap below |
| `web/app/r/[token]/page.tsx` (NEW public share page) | component (page) | request-response (server component) | `web/app/(main)/recipe/[id]/page.tsx` (699 lines) | exact — byte-for-byte visual reuse per UI-SPEC |
| `web/components/LikeButton.tsx` (add sign-in redirect branch) | component | event-driven (click handler) | itself | exact — extend in place |
| `web/components/ResultCard.tsx` (add "imported" ownership badge) | component | transform (render) | existing rank badge block (L154-167) | exact — same absolute-positioned pill idiom |
| `web/components/SwipeDeck.tsx` `DeckCard` (add "imported" static badge) | component | transform (render) | existing `isVariant` badge block (L1052-1054) + `variant-glow` class (L997-999) | exact — explicitly do NOT reuse the glow/shimmer, only the pill |
| `web/components/ShareButton.tsx` (wire `getUrl` to `/r/[shareSlug]` from caller) | component | event-driven | itself — `getUrl` prop already exists (L6, L11, L19) | exact — zero component change, only caller wiring |

## Pattern Assignments

### `src/modules/likes/like.repository.ts` — widen `maybePromote`

**Analog:** itself (`toggleLike` / `maybePromote`, full file read, 40 lines)

**Current pattern (lines 14-40) — to extend, not replace:**
```typescript
export async function toggleLike(
  userId: string,
  recipeId: string,
): Promise<{ liked: boolean; count: number }> {
  const existing = await LikeModel.find({ userId, recipeId });

  if (existing) {
    await LikeModel.deleteMany({ userId, recipeId });
  } else {
    await LikeModel.insert({ userId, recipeId, insertedAt: new Date(), updatedAt: new Date() });
    await maybePromote(recipeId);
  }

  const count = await LikeModel.total({ recipeId });
  return { liked: !existing, count };
}

/** Promove generated_pending → variant se atingiu o threshold de likes. */
async function maybePromote(recipeId: string): Promise<void> {
  const recipe = await getRecipeById(recipeId);
  if (!recipe || recipe.source !== "generated_pending") return;

  const count = await LikeModel.total({ recipeId });
  if (count >= env.variants.promoteThreshold) {
    await promoteToVariant(recipeId);
  }
}
```

**Widening required (D-05..D-08):**
- `toggleLike` needs the owner's userId available to `maybePromote` so it can exclude the owner's own like from the count (D-08) — pass `recipeId` + the liker's `userId` is already in scope; `maybePromote` must additionally fetch the recipe's owner (`recipe.createdBy[0].userId` — already populated per `import.recipe-mapping.ts` L76, contrary to the CONTEXT.md note that it's unpopulated — verify at plan time) and use `LikeModel.total({ recipeId, userId: { $ne: ownerId } })`-equivalent count, OR filter client-side after `LikeModel.find({ recipeId })`. Check whatever `LikeModel.total` supports for exclusion filters before assuming `$ne` works with mongoat's `total()` signature.
- New branch: `if (recipe.source === "imported") { ... }` parallel to the existing `generated_pending` branch, gated on `confidenceScore >= env.import.promoteConfidence && confirmedAt != null` (D-06), calling a NEW `promoteImportToPublic(recipeId)` (visibility flip) instead of `promoteToVariant` (source flip).
- Import at top: add `promoteImportToPublic` alongside existing `promoteToVariant` import (L2).

---

### `src/modules/recipes/recipe.repository.ts` — new `promoteImportToPublic`

**Analog:** `promoteToVariant` (lines 599-605, adjacent function — read in same pass as `rejectVariant`/`addCreatorToVariant`)

```typescript
/** Promove generated_pending → variant. */
export async function promoteToVariant(recipeId: string): Promise<void> {
  await RecipeModel.update(
    { _id: new ObjectId(recipeId), source: "generated_pending" } as never,
    { $set: { source: "variant", updatedAt: new Date() } },
  );
}
```

**Pattern to copy for the new function** — same shape, condition on `source: "imported", visibility: "private"` in the filter (idempotency guard, mirrors the `source: "generated_pending"` guard above so a second trigger is a no-op), `$set: { visibility: "public", updatedAt: new Date() }` (per D-05, `source` stays `"imported"` — do NOT touch it).

---

### `src/modules/recipes/recipe.repository.ts` — new `getRecipeByShareSlug`

**Analog:** `getRecipeById(id, userId?)` (lines 500-575) — full JSDoc + implementation already establishes the exact "untrusted caller, fold ownership into the Mongo filter, never leak existence" idiom this new function must follow, but for token lookup (always-anonymous-safe) rather than id+ownership.

**Core idiom to replicate (lines 537-575):**
```typescript
export async function getRecipeById(
  id: string,
  ...rest: [userId: string | null] | []
): Promise<Recipe | null> {
  const projection = { embedding: 0, embeddingText: 0 };

  if (rest.length === 0) {
    const recipe = await RecipeModel.findById(id, { projection });
    return recipe as Recipe | null;
  }
  const [userId] = rest;

  const recipe = (await RecipeModel.find(
    {
      _id: new ObjectId(id),
      $or: [
        { visibility: { $ne: "private" } },
        ...(userId ? [{ visibility: "private", "createdBy.userId": userId }] : []),
      ],
    } as never,
    { projection },
  )) as Recipe | null;
  if (recipe) return recipe;
  if (!userId) return null;

  const candidate = (await RecipeModel.findById(id, { projection })) as Recipe | null;
  if (!candidate || candidate.visibility !== "private" || !candidate.importJobId) {
    return null;
  }
  const job = await getImportJob(candidate.importJobId);
  if (job?.userId === userId) return candidate;
  return null;
}
```

**New function shape:** `getRecipeByShareSlug(token: string): Promise<Recipe | null>` — simpler than `getRecipeById` because D-03/D-04 make the token itself the sole authorization (secret+unguessable), so NO visibility branch is needed — just `RecipeModel.find({ shareSlug: token } as never, { projection })`. Still return `null` (not throw) on miss, matching the "same 404 whether missing or unauthorized" idiom used throughout this file, so the route can 404 uniformly. Per D-12, once `visibility` flips to `public`, the route consuming this should redirect to `/recipe/[id]` (canonical) — that redirect decision belongs in the route/page layer, not this repository function (keep this function a pure lookup).

---

### `src/modules/recipes/recipe.repository.ts` — `hybridSearch` widening (verify, likely already correct)

**Analog:** existing `$vectorSearch.filter` block (lines 242-253) — this ALREADY implements D-14 (owner-scoped private inclusion). Re-read carefully before changing:

```typescript
filter: {
  source: { $in: params.sources ?? DEFAULTS.sources },
  ...(isDrinks && { occasions: "drinks" }),
  // D-14: receitas privadas (imports não promovidos) só entram no
  // resultado se params.ownerId for o dono — nunca globalmente.
  ...(params.ownerId && {
    $or: [
      { visibility: { $ne: "private" } },
      { visibility: "private", "createdBy.userId": params.ownerId },
    ],
  }),
},
```

**What Phase 5 needs to confirm/add:**
- Public catalog search (no `ownerId` passed) must surface promoted imports: `DEFAULTS.sources` (line 66) is `["curated", "generated_validated", "variant", "user"]` — does NOT include `"imported"`. Per D-05, a promoted import keeps `source:"imported"` + flips to `visibility:"public"`. **This means `DEFAULTS.sources` must add `"imported"`** for public search to surface promoted imports — but D-14's guardrail comment explicitly says "NEVER add 'imported' to DEFAULTS.sources unconditionally". Resolve this by scoping the addition: either (a) always include `"imported"` in `DEFAULTS.sources` now that the `visibility` guard in the `$or` above already excludes private imports from public (no-`ownerId`) queries, making the DEFAULTS change safe — the CONTEXT/UI-SPEC doesn't flag this as unsafe once the visibility filter is unconditional; OR (b) keep DEFAULTS unchanged and require public callers to explicitly pass `sources` including `"imported"`. **Flag for planner: this is the single highest-risk edit in the phase — re-verify D-14's exact intent (is the ban on `imported` in DEFAULTS about visibility leak, now closed by the `$or`, or an intentional catalog-composition choice?) before touching line 66.**
- `listImportedRecipesByOwner` (lines 466-499) is the model for a **pure-filter, non-`$vectorSearch`** owner listing — cited as reference only, not modified this phase.

---

### `src/modules/recipes/recipe.types.ts` — add `shareSlug`

**Analog:** `importJobId?: string` / `confirmedAt?: Date` field additions (lines 114-128) — same inline-comment-per-field convention:

```typescript
  /** Grounding por campo — só presente em receitas source: "imported" (Fase 2). */
  grounding?: RecipeGrounding;
  /** Back-reference ao ImportJob que originou esta receita (Fase 2). */
  importJobId?: string;
  ...
  /** Setado apenas por confirmImportedRecipe no PATCH de confirmação explícita do usuário (REV-04, Fase 3). */
  confirmedAt?: Date;
```

**New field to add**, same style: `/** Token secreto e não-adivinhável para o link público (Fase 5, D-03/D-04) — gerado quando confirmedAt é setado. */ shareSlug?: string;`

---

### `src/modules/recipes/recipe.model.ts` — add `shareSlug` BSON + index

**Analog:** `importJobId` BSON property (line 118) + its sparse index (lines 174-175):

```typescript
    importJobId: { bsonType: "string" },
```
```typescript
    // sparse: só receitas importadas (source: "imported") têm importJobId.
    { key: { importJobId: 1 }, name: "import_job_lookup", sparse: true },
```

**New additions, same shape:** `shareSlug: { bsonType: "string" }` in `properties`, and `{ key: { shareSlug: 1 }, name: "share_slug_lookup", unique: true, sparse: true }` in `indexes` (unique because it's a lookup key like `externalId` — see `external_id_unique` index at line 170 as a second, closer analog for the *unique+sparse* combo specifically:
```typescript
    { key: { externalId: 1 }, name: "external_id_unique", unique: true, sparse: true },
```

---

### `src/modules/recipes/recipe.routes.ts` — new public-by-token route

**Analog:** `GET /recipes/:id` (lines 117-141, soft-auth read)

```typescript
  app.get(
    "/recipes/:id",
    {
      schema: {
        tags: ["recipes"],
        params: Type.Object({ id: Type.String() }),
        querystring: Type.Object({
          lang: Type.Optional(Type.Union([Type.Literal("pt"), Type.Literal("en")])),
        }),
      },
    },
    async (request, reply) => {
      // Soft-auth (T-03-05): NÃO usa requireAuth — a rota continua pública
      // para receitas do catálogo (anônimo deve seguir funcionando).
      const recipe = await getRecipeById(request.params.id, getUserId(request));
      if (!recipe) return reply.notFound("Receita não encontrada");
      ...
    },
  );
```

**New route shape:** `GET /recipes/share/:token` (or `/r/:token` if backend mirrors frontend path — planner's call, see UI-SPEC Open Question 1). No `getUserId`/soft-auth needed for the LOOKUP itself (token is the sole gate per D-03) — but the response should still indicate `liked`/`canLike` state if `getUserId(request)` resolves a session, mirroring how `recipe/[id]/page.tsx` computes `userId` for the like button. Reuse `reply.notFound("Receita não encontrada")` idiom for invalid/expired tokens (matches D-13's "link stays valid forever unless recipe deleted" — deletion cascades via existing like-cascade pattern, cited from D-13, not a new pattern).

**Auth guard import pattern** (top of file, lines 12-13, reuse verbatim):
```typescript
import { getUserId, requireAuth } from "@/modules/auth/auth.guard.js";
```

---

### `src/config/env.ts` — add `import.promoteConfidence`

**Analog:** `variants.promoteThreshold` (lines 78-85) for the sibling threshold shape, and the `import` block's existing `Number(optional(...))` convention (lines 126-176):

```typescript
  variants: {
    promoteThreshold: Number(optional("VARIANT_PROMOTE_THRESHOLD", "5")),
    ...
  },
```

**New field**, added inside the existing `import: { ... }` block (after `dailyLimitPro`, before the pricing table, per D-06's naming suggestion `IMPORT_PROMOTE_CONFIDENCE`):
```typescript
    // Gate de promoção pública (D-06, Fase 5): confiança mínima da extração
    // para uma receita importada poder virar pública via likes — separado do
    // threshold de reviewRequired (que só decide "precisa de revisão humana").
    promoteConfidence: Number(optional("IMPORT_PROMOTE_CONFIDENCE", "0.7")),
```
(default value is planner/executor's discretion per CONTEXT — 0.7 shown as illustrative, cross-check against existing `confidenceScore` scale in `import.confidence.ts` before finalizing.)

---

### `web/middleware.ts` — public route allowlist for `/r/[token]`

**No analog in repo** — this is a genuine gap. Current file (21 lines, full contents):

```typescript
import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export default process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
  ? clerkMiddleware()
  : () => NextResponse.next();

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/__clerk/:path*",
    "/(api|trpc)(.*)",
  ],
};
```

**Gap:** `clerkMiddleware()` is called with ZERO arguments — no `isPublicRoute`/`createRouteMatcher` allowlist exists anywhere in the codebase to copy from. This must be added net-new, following Clerk's standard pattern (not project-specific):
```typescript
const isPublicRoute = createRouteMatcher(["/r/(.*)"]);
export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) await auth.protect();
});
```
Confirm at plan time whether Next route-group placement (`web/app/r/[token]/page.tsx` outside `(main)`) alone is sufficient without touching middleware — UI-SPEC Open Question 1 flags this as unresolved; the route WILL still hit `clerkMiddleware()` regardless of route-group, since the matcher is path-based, not group-based. Treat the middleware change as required, not optional.

---

### `web/app/r/[token]/page.tsx` — new public share page

**Analog:** `web/app/(main)/recipe/[id]/page.tsx` (699 lines total — read imports L1-31, top action row L160-231, sourceMeta credits block L375-419 in three non-overlapping passes)

**Imports pattern** (lines 1-31) — same server-component + Clerk `auth()` + `cookies()` shape to replicate, swapping `getRecipe(id)` for the new `getRecipeByShareSlug`/`/recipes/share/:token` client call:
```typescript
import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";

import { AdaptButton } from "@/components/AdaptButton";
import IngredientsSection from "@/components/IngredientsSection";
import { AddToPlanButton } from "@/components/AddToPlanButton";
import { BackButton } from "@/components/BackButton";
import { FavoriteButton } from "@/components/FavoriteButton";
import { LazyThumbnail } from "@/components/LazyThumbnail";
import { LikeButton } from "@/components/LikeButton";
import { LogMealButton } from "@/components/LogMealButton";
import { ShareButton } from "@/components/ShareButton";
import { StepTimer } from "@/components/StepTimer";
```

**Auth resolution pattern** (lines 89-94) — reuse verbatim, this already handles "no session" gracefully:
```typescript
let userId: string | null = null;
try {
  userId = (await auth()).userId;
} catch {
  userId = null;
}
```

**Top action row** (lines 201-230) — reuse structure, DROP `FavoriteButton` for logged-out per UI-SPEC §1, wire `ShareButton`'s implicit `getUrl` (currently defaults to `window.location.href`, which is already correct for `/r/[token]` since that IS the page URL — no override needed here, contrary to point 3's note about the OWNER's `/recipe/[id]` page needing the override):
```typescript
<LikeButton
  recipeId={recipe._id}
  initialLiked={likes.liked}
  initialCount={likes.count}
  canLike={Boolean(userId)}
/>
{userId && (
  <FavoriteButton recipeId={recipe._id} initiallyFavorited={favorited} compact />
)}
<ShareButton
  title={recipe.title}
  text={`Receita de ${recipe.title} no onFeed`}
  className="flex h-9 w-9 items-center justify-center rounded-full border border-areia bg-white/90 text-carvao/50 transition-colors hover:text-carvao"
/>
```

**sourceMeta credits block** (lines 382-418) — reuse VERBATIM, unchanged, on the public page (this is the D-02 "creator attribution" requirement, already fully built):
```typescript
{recipe.source === "imported" && recipe.sourceMeta && (
  <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-areia/20 px-3 py-2 text-xs text-carvao/60"
       style={{ border: "1px solid var(--t-bd-card)" }}>
    <span>🎬 Importado de vídeo</span>
    {recipe.sourceMeta.authorHandle && (recipe.sourceMeta.authorUrl ? (
      <a href={recipe.sourceMeta.authorUrl} target="_blank" rel="noopener noreferrer nofollow" className="font-semibold text-terracota">
        @{recipe.sourceMeta.authorHandle}
      </a>
    ) : (
      <span className="font-semibold text-carvao/80">@{recipe.sourceMeta.authorHandle}</span>
    ))}
    {recipe.sourceMeta.sourceUrl && (
      <>
        <span className="text-carvao/30">·</span>
        <a href={recipe.sourceMeta.sourceUrl} target="_blank" rel="noopener noreferrer nofollow" className="font-medium text-terracota">
          Ver vídeo original ↗
        </a>
      </>
    )}
  </div>
)}
```

**404 pattern** (line 82): `if (!recipe) notFound();` — reuse verbatim for invalid/expired tokens per UI-SPEC's Copywriting Contract (uses Next's default `notFound()`, no bespoke branded 404).

**Conversion CTA block (NEW, no analog)** — the "Criar minha conta" / "Importar a minha receita" two-button stack (UI-SPEC §1) has no existing analog; closest visual precedent is the existing "Irei fazer esta receita" hero CTA button style (`background: var(--t-bg-hero)`, `color: var(--t-hero-fg)`, `borderRadius: 18`, `padding: 17`) — locate that exact button in the same file (search for `t-bg-hero` further down in `recipe/[id]/page.tsx`, not yet read in this pass — planner should grep at implementation time) and copy its inline-style object for the primary CTA; ghost/outline variant is a one-line style diff (transparent background, `border: 1px solid var(--t-bd-card)`).

---

### `web/components/LikeButton.tsx` — add sign-in redirect

**Analog:** itself (full file, 75 lines) — extend the `toggle()` function only:

```typescript
function toggle() {
  if (!canLike || pending) return;
  const nextLiked = !liked;
  ...
}
```

**Required change (D-01):** the `if (!canLike || pending) return;` early-return currently no-ops silently when logged out. Split the condition: keep `pending` as a no-op guard, but when `!canLike` specifically, redirect instead of no-op — needs `useRouter` from `next/navigation` (already the import used by `BackButton.tsx`, cite as the router-usage analog) and a sign-in URL (check how other components construct sign-in redirects — likely `@clerk/nextjs` `SignInButton`/`redirectToSignIn` idiom used elsewhere in the codebase; grep `signIn\|SignInButton\|redirectToSignIn` at plan time if no result was found in this pass, none surfaced in the files read so far — flag as a possible net-new pattern requiring a Clerk-standard call, not a project-specific one).

---

### `web/components/ResultCard.tsx` — "imported" ownership badge

**Analog:** existing rank badge block (lines 154-167, read as part of full-file pass):

```typescript
{rk && (
  <div style={{
    position: "absolute", top: 10, left: 10,
    display: "flex", alignItems: "center", gap: 5,
    background: rk.bg, color: rk.fg,
    fontSize: 11, fontWeight: 800,
    padding: "4px 9px", borderRadius: 20,
    boxShadow: "0 2px 6px rgba(0,0,0,.18)",
  }}>
    <span>{rk.icon}</span>
    {rank}º
  </div>
)}
```

**New badge, same positioned-pill idiom**, per UI-SPEC's exact visual spec (neutral, not warn/terracota):
```typescript
{hit.source === "imported" && (
  <div style={{
    position: "absolute", top: rk ? 44 : 10, left: 10,   // stack below rank badge if present, 6px gap per UI-SPEC
    background: "var(--t-bg-section)", color: "var(--t-text-secondary)",
    fontSize: 10.5, fontWeight: 700,
    padding: "4px 9px", borderRadius: 20,
  }}>
    🎬 sua importação
  </div>
)}
```
`hit.source` is already typed on `SearchHit`/`RecipeSearchHit` (`web/lib/types.ts` L56 per UI-SPEC, `src/modules/recipes/recipe.types.ts` L167 `source: RecipeSource`) — no new field needed, confirmed during this pass.

---

### `web/components/SwipeDeck.tsx` `DeckCard` — "imported" static badge

**Analog:** existing `isVariant` badge (lines 997-999, 1052-1054+ — read in the 980-1055 pass)

```typescript
const isVariant = hit.source === "variant";
const medalClass = medal ? (rank === 1 ? "medal-gold" : "") : isVariant ? "variant-glow" : "";
...
{isVariant && !medal && (
  <div className="absolute left-3 top-3 z-30 flex items-center gap-1.5 rounded-full bg-carvao/70 px-2.5 py-1 backdrop-blur-sm">
    <span className="text-[10px] text-amber-300">✦</span>
    ...
```

**Required difference (explicit UI-SPEC instruction):** DO NOT extend `medalClass`/`variant-glow`/shimmer for `source === "imported"` — render a separate static pill only, sibling to (not reusing) the `isVariant` badge block:
```typescript
const isImported = hit.source === "imported";
...
{isImported && !medal && !isVariant && (
  <div className="absolute left-3 top-3 z-30 rounded-full px-2.5 py-1"
       style={{ background: "var(--t-bg-section)", color: "var(--t-text-secondary)" }}>
    <span className="text-[10.5px] font-bold">🎬 sua importação</span>
  </div>
)}
```
No shimmer sweep, no `medalClass` addition — this badge only ever appears in owner-scoped swipe results (D-10), so co-occurrence with `medal`/`isVariant` is unlikely but the guard clauses above prevent visual collision regardless.

---

### `web/components/ShareButton.tsx` — no component change, caller wiring only

**Analog:** itself — the `getUrl` prop already exists and is unused today (recipe page always falls back to `window.location.href`, line 19: `const url = getUrl ? getUrl() : window.location.href;`). On the OWNER's `/recipe/[id]` page, when `recipe.visibility === "private"` (unpromoted import), Phase 5 needs:
```typescript
<ShareButton
  title={recipe.title}
  text={`Receita de ${recipe.title} no onFeed`}
  getUrl={recipe.shareSlug ? () => `${window.location.origin}/r/${recipe.shareSlug}` : undefined}
  className="..."
/>
```
This is a one-line prop addition on the EXISTING `recipe/[id]/page.tsx` (line 225-229), not a new file.

---

## Shared Patterns

### Soft-auth / trusted-vs-untrusted resolver idiom
**Source:** `src/modules/recipes/recipe.repository.ts::getRecipeById` (L500-575) + `src/modules/import/import-job.repository.ts::getImportJob` (L34-44) + `src/modules/recipes/recipe.routes.ts` `GET /recipes/:id` (L130-138)
**Apply to:** `getRecipeByShareSlug`, the new share route, and any future public-read endpoint. Rule: fold ownership/visibility into the SAME Mongo filter as the existence check — never fetch-then-compare (IDOR-safety, no existence leak). Applies verbatim to this phase's new share-lookup path.

### Env threshold/gate convention
**Source:** `src/config/env.ts` `variants.promoteThreshold` (L78-85) + `import` block (L126-176)
**Apply to:** new `import.promoteConfidence` field — same `Number(optional("ENV_VAR_NAME", "default"))` shape, same placement (grouped with related thresholds), same Portuguese comment convention explaining WHY the default was chosen.

### Optional-field-with-comment convention (types + BSON schema)
**Source:** `src/modules/recipes/recipe.types.ts` L110-128 (`visibility`, `grounding`, `importJobId`, `confirmedAt`) + `src/modules/recipes/recipe.model.ts` L113-125
**Apply to:** `shareSlug` addition — every optional Recipe field added since Phase 2 documents WHY it's optional (backward compat with pre-existing docs) directly above the field; `shareSlug` should follow suit ("only present once confirmedAt is set").

### Source-gated promotion trigger
**Source:** `src/modules/likes/like.repository.ts::maybePromote` (L31-40) + `src/modules/recipes/recipe.repository.ts::promoteToVariant` (L599-605)
**Apply to:** the new imported-recipe promotion branch — same "check source, check threshold, call a dedicated promote-mutation function with an idempotency guard in its own filter" shape.

### Absolute-positioned pill badge (frontend)
**Source:** `web/components/ResultCard.tsx` rank badge (L154-167) + `web/components/SwipeDeck.tsx` `DeckCard` variant badge (L1052-1054)
**Apply to:** the new "🎬 sua importação" badge on both `ResultCard` and `DeckCard` — same `position: absolute`, same pill shape (`borderRadius: 20`, `padding: "4px 9px"`), but explicitly WITHOUT the shimmer/glow treatment reserved for medals/variants (UI-SPEC is explicit on this distinction).

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `web/middleware.ts` public-route allowlist (`isPublicRoute`/`createRouteMatcher`) | middleware | request-response | No prior public route exists in this Clerk-protected app — `clerkMiddleware()` is currently called with zero config anywhere in the codebase. Use Clerk's standard `createRouteMatcher`/`auth.protect()` pattern from Clerk's own docs (not a project-specific pattern to copy). |
| Conversion CTA button block (public share page bottom) | component (inline JSX) | n/a (static markup) | New UI element with no prior "logged-out conversion funnel" surface in the app (first anonymous-facing page). UI-SPEC directs reusing the existing "Irei fazer esta receita" hero CTA's inline style object as the closest visual precedent (not yet located precisely — grep `t-bg-hero` in `recipe/[id]/page.tsx` at plan time, likely further down than the L1-419 range read in this pass). |
| LikeButton sign-in redirect construction (exact Clerk redirect URL shape) | component (event handler) | event-driven | No existing component in the files read constructs a Clerk sign-in redirect URL (`SignInButton`/`redirectToSignIn`/`useClerk().openSignIn`) — grep the codebase for any existing sign-in trigger before inventing one; none surfaced in `LikeButton.tsx`, `BackButton.tsx`, `ShareButton.tsx`, or `recipe/[id]/page.tsx`. |

## Metadata

**Analog search scope:** `src/modules/likes/`, `src/modules/recipes/`, `src/modules/import/`, `src/config/`, `web/components/`, `web/app/(main)/recipe/[id]/`, `web/middleware.ts`
**Files scanned:** 14 read directly (like.repository.ts, recipe.repository.ts, recipe.types.ts, recipe.model.ts, recipe.routes.ts, env.ts, import.recipe-mapping.ts, import-job.repository.ts (partial), auth.guard.ts (partial), ShareButton.tsx, LikeButton.tsx, BackButton.tsx, ResultCard.tsx, SwipeDeck.tsx (partial), recipe/[id]/page.tsx (partial), middleware.ts)
**Pattern extraction date:** 2026-07-02
**Note:** Several files inspected during this mapping already show partial/complete Phase-5-adjacent scaffolding (e.g., `getRecipeById`'s 3-signature overload, `hybridSearch`'s `ownerId` param and D-14 comment, `import.recipe-mapping.ts`'s `createdBy` population) — this codebase state is AHEAD of what CONTEXT.md's `code_context` section describes in a couple of specific claims (notably: `createdBy[]` IS populated for imports today, contradicting the CONTEXT.md L523 comment "SEM createdBy[]"). Planner should re-verify these claims against current code rather than trusting CONTEXT.md's prose where it conflicts with the excerpts above.
