# Phase 3: Capture & Mandatory Review UI - Pattern Map

**Mapped:** 2026-07-02
**Files analyzed:** 16 (11 frontend, 5 backend)
**Analogs found:** 16 / 16

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `web/app/(main)/import/page.tsx` | route (server component) | request-response | `web/app/(main)/pantry/page.tsx` | role-match |
| `web/app/(main)/import/[jobId]/page.tsx` | route (server component + client polling child) | streaming/polling | `web/app/(main)/favorites/page.tsx` (auth-guard shell) + `web/lib/useLazyThumbnail.ts` (poll) | role-match |
| `web/app/(main)/import/[jobId]/review/page.tsx` | route (server component, fetch + hand off) | request-response | `web/app/(main)/favorites/page.tsx` | role-match |
| `web/app/(main)/import/mine/page.tsx` | route (server component, owner-scoped list) | CRUD (read) | `web/app/(main)/favorites/page.tsx` | exact |
| `web/components/PasteLinkButton.tsx` | component | event-driven (clipboard/paste) | `web/components/SearchForm.tsx` (input+state) | role-match |
| `web/components/ImportProgress.tsx` | component | streaming/polling | `web/lib/useLazyThumbnail.ts` (logic) + `web/components/AdaptButton.tsx` (loading/error UI shape) | role-match |
| `web/components/ImportReviewForm.tsx` | component | CRUD (edit + submit) | `web/components/IngredientsSection.tsx` (list-of-rows form) + `web/components/AdaptButton.tsx` (async mutation w/ useTransition) | role-match |
| `web/components/GroundingBadge.tsx` | component | transform (presentational) | `web/components/NutritionBadge.tsx` | exact |
| `web/components/ImportsList.tsx` | component | CRUD (read, owner-scoped list) | `web/components/FavoritesList.tsx` | exact |
| `web/lib/useImportPolling.ts` | hook | streaming/polling | `web/lib/useLazyThumbnail.ts` | exact |
| `web/lib/api.ts` (additions: `startImport`, `getImportJob`, `confirmImportRecipe`, `listMyImports`) | service (fetch client) | request-response | `web/lib/api.ts` existing functions (`searchRecipes`, `getRecipe`, `triggerThumbnail`) | exact |
| `web/app/actions.ts` (additions) | service (server action wrapper) | request-response | `web/app/actions.ts` existing (`adaptRecipeAction`, `triggerThumbnailAction`) | exact |
| `src/modules/import/import.routes.ts` (add `PATCH /import/:jobId/recipe`, `GET /import/mine`) | route (Fastify) | CRUD / request-response | `src/modules/import/import.routes.ts` `GET /import/:jobId` (existing, same file) | exact |
| `src/modules/import/import.service.ts` or new `confirmImportedRecipe` fn | service | CRUD (mutation) | `src/modules/recipes/recipe.repository.ts` `setThumbnail`/`setTranslation` (partial-update pattern) | role-match |
| `src/modules/recipes/recipe.routes.ts` (`GET /recipes/:id` visibility guard) | route (Fastify) | request-response | `src/modules/recipes/recipe.repository.ts` `getRecipeById(id, userId?)` (already supports the guard — just unused by the route) | exact |
| `src/modules/import/import.routes.ts` (`ImportRecipeEditSchema`) | validation (TypeBox) | — | `src/modules/recipes/recipe.routes.ts` `SubmitRecipeSchema`/`AdaptRequestSchema` | exact |

## Pattern Assignments

### `web/lib/useImportPolling.ts` (hook, streaming/polling)

**Analog:** `web/lib/useLazyThumbnail.ts` (full file, 87 lines — read in one pass)

**Core polling pattern** (lines 20-63, adapt directly, drop the IntersectionObserver gate since this hook starts immediately on mount rather than on-scroll):
```typescript
"use client";
import { useEffect, useRef, useState } from "react";
import { getImportJobAction } from "@/app/actions";

const POLL_INTERVAL_MS = 2_000;
const POLL_TIMEOUT_MS = 10 * 60_000;

export function useImportPolling(jobId: string, initialJob: ImportJob) {
  const [job, setJob] = useState(initialJob);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedAtRef = useRef(Date.now());

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (job.status === "ready_for_review" || job.status === "failed") return;

    function schedulePoll() {
      pollTimerRef.current = setTimeout(async () => {
        if (Date.now() - startedAtRef.current > POLL_TIMEOUT_MS) {
          setJob((j) => ({ ...j, __timedOut: true }) as never); // surfaces the stuck-state UI (Pitfall 2) — do NOT go silent like useLazyThumbnail's stopPolling()
          return;
        }
        try {
          const next = await getImportJobAction(jobId);
          setJob(next);
          if (next.status !== "ready_for_review" && next.status !== "failed") schedulePoll();
        } catch {
          schedulePoll(); // transient network error — keep trying
        }
      }, POLL_INTERVAL_MS);
    }
    schedulePoll();
    return () => { if (pollTimerRef.current) clearTimeout(pollTimerRef.current); };
  }, [jobId, job.status]);

  return job;
}
```

**Key deviation from the analog:** `useLazyThumbnail` silently goes quiet on timeout (`stopPolling()`, no UI change) because it's a background thumbnail. Per RESEARCH.md Pitfall 2, the import progress screen is actively watched — the timeout branch must set explicit state the component can render into the "isso está demorando mais que o esperado" UI (UI-SPEC copy contract), not just stop.

---

### `web/components/ImportProgress.tsx` (component, streaming/polling)

**Analog A (polling consumption):** `web/lib/useLazyThumbnail.ts` usage in `web/components/LazyThumbnail.tsx` (hook consumer shape — call the hook, branch render on returned state).

**Analog B (loading/error UI shape):** `web/components/AdaptButton.tsx` lines 44-91 — `useTransition`-style pending/error rendering, inline error `<p>` below the action, status tag styling via `--t-*` tokens.

**Stage indicator styling:** Per UI-SPEC, reuse `LogoLoader.tsx`'s spin keyframe for the active-stage ring (do not invent a new spinner) — read `web/components/LogoLoader.tsx` at implementation time for the exact keyframe/class name.

---

### `web/components/GroundingBadge.tsx` (component, presentational)

**Analog:** `web/components/NutritionBadge.tsx` (full file, 31 lines)

**Badge shape to copy** (lines 15-29 — same `rounded-full px-2 py-0.5 text-[10px] font-semibold` pill idiom, swap color tokens per UI-SPEC's warn palette and drop the neutral/"fits" case since `grounded` renders no badge at all):
```typescript
export function GroundingBadge({ level }: { level: GroundingLevel }) {
  if (level === "grounded") return null; // neutral = absence of badge (UI-SPEC)
  const label = level === "inferred" ? "Confira isto — inferido" : "Confira isto — impreciso";
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
      style={{
        background: "var(--t-warn-bg)",
        color: "var(--t-warn-fg)",
        border: "1px solid color-mix(in srgb, var(--t-warn-fg) 25%, transparent)",
      }}
    >
      {label}
    </span>
  );
}
```

---

### `web/components/ImportsList.tsx` (component, owner-scoped list)

**Analog:** `web/components/FavoritesList.tsx` (full file, 267 lines)

**Row shape to copy** (lines 98-134 — `Link` card: thumbnail-left 64px rounded, title+meta right, `rounded-2xl border border-areia bg-surface p-3`). Do **not** copy the `SwipableRow`/swipe-to-delete machinery (lines 17-136 pointer handlers) — UI-SPEC explicitly excludes delete for this phase; render each row as a plain `<Link>` without the drag/pointer wrapper.

**List + empty-state shape to copy** (lines 140-248 — `useState<T[]>(initial)`, search-free since imports don't need a search box, empty-state `<p>` centered). Status label per item comes from `ImportJob.status`/`Recipe.reviewRequired` mapped via the UI-SPEC copy table (`Em revisão`/`Confirmada`/`Falhou`/`Importando…`).

---

### `web/components/PasteLinkButton.tsx` (component, clipboard/paste event)

**Analog:** `web/components/SearchForm.tsx` lines 40-64 (controlled input + draft state pattern) — no existing clipboard code in the codebase (RESEARCH.md confirms this is genuinely new), so only the input/state shape is reused, not the clipboard logic itself (that comes from RESEARCH.md Pattern 3, already verified against MDN/web.dev).

**Input + button shape to copy** (mirrors `SearchForm.tsx`'s `rounded-xl border border-areia bg-surface` input container per UI-SPEC Component Inventory).

**Clipboard read logic (new, no codebase precedent — use RESEARCH.md Pattern 3 verbatim):**
```typescript
async function handlePasteClick() {
  try {
    if (!navigator.clipboard?.readText) throw new Error("unsupported");
    const text = await navigator.clipboard.readText(); // first async op — no await before this
    if (isLikelyUrl(text)) setUrlField(text);
  } catch {
    // silent fallback — never show an error toast (Pitfall 1)
  }
}
```
Native `paste` fallback goes directly on the `<input onPaste={...}>` per RESEARCH.md Pattern 3 (always-on, works even where `readText()` is blocked).

---

### `web/components/ImportReviewForm.tsx` (component, CRUD edit + submit)

**Analog A (list-of-editable-rows layout):** `web/components/IngredientsSection.tsx` lines 63-70+ (props shape: array of rows + per-row rendering) — use for the ingredients list layout only; drop the shopping-list/`got`/`base` cart logic entirely (not relevant to editing).

**Analog B (async submit + useTransition + router.push on success):** `web/components/AdaptButton.tsx` lines 44-58:
```typescript
const [pending, startTransition] = useTransition();
const [error, setError] = useState<string | null>(null);

function confirm() {
  setError(null);
  startTransition(async () => {
    const res = await confirmImportRecipeAction(jobId, patch);
    if (res.ok) router.push(`/recipe/${res.recipeId}`);
    else setError(res.error);
  });
}
```

**Grounding-zip pattern (Pitfall 4 — critical, apply at fetch time, not render time):**
```typescript
// Zip once, immediately after fetch — never index grounding arrays inside .map() during render
const ingredientRows = recipe.ingredients.map((ing, i) => ({
  ingredient: ing,
  grounding: recipe.grounding?.quantityGrounding[i] ?? "grounded",
}));
```

---

### `web/lib/api.ts` additions (service, request-response)

**Analog:** existing functions in the same file, lines 1-92 (`searchRecipes`, `getRecipe`, `triggerThumbnail`, `getThumbnailUrl`).

**Imports pattern** (lines 1-16): `import "server-only"`, `auth` from `@clerk/nextjs/server`, types from `./types`.

**Fetch + auth pattern to copy** (lines 74-92 — POST fire-and-forget + GET-with-fallback shapes):
```typescript
export async function startImport(url: string): Promise<{ jobId: string }> {
  const res = await fetch(`${API_BASE}/api/v1/import`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ url }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Import falhou: ${res.status} ${await res.text()}`);
  return res.json() as Promise<{ jobId: string }>;
}

export async function getImportJob(jobId: string): Promise<ImportJob> {
  const res = await fetch(`${API_BASE}/api/v1/import/${encodeURIComponent(jobId)}`, {
    cache: "no-store",
    headers: { ...(await authHeaders()) },
  });
  if (!res.ok) throw new Error(`Status falhou: ${res.status} ${await res.text()}`);
  return res.json() as Promise<ImportJob>;
}

export async function confirmImportRecipe(
  jobId: string,
  patch: ImportRecipeEditPatch,
): Promise<{ recipeId: string }> {
  const res = await fetch(`${API_BASE}/api/v1/import/${encodeURIComponent(jobId)}/recipe`, {
    method: "PATCH",
    headers: { "content-type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify(patch),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Confirmação falhou: ${res.status} ${await res.text()}`);
  return res.json() as Promise<{ recipeId: string }>;
}

export async function listMyImports(): Promise<ImportedRecipeListItem[]> {
  const res = await fetch(`${API_BASE}/api/v1/import/mine`, {
    cache: "no-store",
    headers: { ...(await authHeaders()) },
  });
  if (!res.ok) throw new Error(`Listagem falhou: ${res.status} ${await res.text()}`);
  return res.json() as Promise<ImportedRecipeListItem[]>;
}
```

---

### `web/app/actions.ts` additions (server action wrapper)

**Analog:** `adaptRecipeAction` (lines 25-39) for the error-normalized mutation shape; `triggerThumbnailAction`/`getThumbnailUrlAction` (lines 42-51) for thin pass-through wrappers.

```typescript
export async function startImportAction(
  url: string,
): Promise<{ ok: true; jobId: string } | { ok: false; error: string }> {
  try {
    const { jobId } = await startImport(url);
    return { ok: true, jobId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Falha ao iniciar importação" };
  }
}

export async function getImportJobAction(jobId: string): Promise<ImportJob> {
  return getImportJob(jobId);
}

export async function confirmImportRecipeAction(
  jobId: string,
  patch: ImportRecipeEditPatch,
): Promise<{ ok: true; recipeId: string } | { ok: false; error: string }> {
  try {
    const { recipeId } = await confirmImportRecipe(jobId, patch);
    return { ok: true, recipeId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Falha ao confirmar" };
  }
}

export async function listMyImportsAction(): Promise<ImportedRecipeListItem[]> {
  return listMyImports();
}
```

---

### `web/app/(main)/import/mine/page.tsx` (route, owner-scoped list)

**Analog:** `web/app/(main)/favorites/page.tsx` (full file, 44 lines — exact structural match).

**Auth-guard + fetch + header pattern to copy verbatim** (lines 1-43): `auth()` try/catch → `userId` null-check → guest copy block → `getFavorites()` (swap for `listMyImportsAction()`) → header with `<Link href="/import">` (swap "buscar" for the UI-SPEC's "Importar" CTA) → pass `initialItems` into `ImportsList`.

---

### `web/app/(main)/import/page.tsx` (route)

**Analog:** `web/app/(main)/pantry/page.tsx` (full file, 29 lines) — `auth()` + `redirect("/sign-in")` guard (harder gate than favorites' soft message; use whichever the planner picks per D-01, pantry's `redirect` pattern is the stricter analog since `/import` requires a user to attribute the job to). H1 + subtitle block (lines 16-24) matches UI-SPEC's typography contract (`font-display text-[2rem] font-bold leading-tight text-forest` + `text-sm text-carvao/55 leading-relaxed` body) exactly — copy directly.

---

### `web/app/(main)/import/[jobId]/page.tsx` and `.../review/page.tsx` (routes)

**Analog:** `web/app/(main)/favorites/page.tsx` auth-guard shell (same as above) + server-side initial fetch via `getImportJobAction`/`getRecipe` before handing off to the client component (`ImportProgress`/`ImportReviewForm`) that takes `initialJob`/`initialRecipe` as a prop — mirrors how `FavoritesPage` fetches `recipes` server-side then passes `initialRecipes` into the client `FavoritesList`.

---

### `src/modules/import/import.routes.ts` — `PATCH /import/:jobId/recipe` (backend route, CRUD mutation)

**Analog:** same file, `GET /import/:jobId` (lines 54-72) — the ownership-scoped lookup pattern to replicate exactly.

**Imports pattern** (lines 1-7): `TypeBoxTypeProvider`, `Type` from `@sinclair/typebox`, `getUserId`/`requireAuth` from `auth.guard.js`, repository functions from `./import-job.repository.js`.

**Ownership + status-gate pattern to copy** (lines 54-72, extend with the 409 status check per RESEARCH.md Pitfall 3):
```typescript
app.patch(
  "/import/:jobId/recipe",
  {
    preHandler: requireAuth,
    schema: {
      params: Type.Object({ jobId: Type.String() }),
      body: ImportRecipeEditSchema, // additionalProperties:false — NEVER accept grounding/reviewRequired/confidenceScore (Pitfall 5)
    },
  },
  async (request, reply) => {
    const userId = getUserId(request)!;
    const job = await getImportJob(request.params.jobId, userId); // same ownership-scoped lookup as GET /import/:jobId
    if (!job) return reply.notFound();
    if (job.status !== "ready_for_review") {
      return reply.code(409).send({ error: "job_not_ready_for_review" });
    }
    if (!job.recipeId) return reply.internalServerError();

    await confirmImportedRecipe(job.recipeId, userId, request.body);
    return reply.send({ recipeId: job.recipeId });
  },
);
```

### `src/modules/import/import.routes.ts` — `GET /import/mine` (backend route, CRUD read)

**Analog:** `listMyImportedRecipes` already exists and is IDOR-safe by construction (`import.service.ts` lines 95-106) — this route is a thin wrapper, do not reimplement the ownerId/sources logic:
```typescript
app.get(
  "/import/mine",
  { preHandler: requireAuth },
  async (request) => {
    const userId = getUserId(request)!;
    return listMyImportedRecipes(userId); // NEVER call hybridSearch directly here (D-14 — see Pitfall/anti-pattern)
  },
);
```

### TypeBox schema for `ImportRecipeEditSchema`

**Analog:** `src/modules/recipes/recipe.routes.ts` `SubmitRecipeSchema` (lines 49-60+) and `AdaptRequestSchema` (lines 34-47) — both use `Type.Object({...}, { additionalProperties: false })` with `minLength`/`maxLength`/`minItems`/`maxItems` bounds. Mirror those bounds (e.g. `title: Type.String({ minLength: 1, maxLength: 200 })`) for the new schema; restrict fields to editable content only per Pitfall 5 (no `grounding`, `reviewRequired`, `confidenceScore`).

---

### `src/modules/recipes/recipe.routes.ts` — `GET /recipes/:id` visibility guard (backend route, security fix)

**Analog:** `src/modules/recipes/recipe.repository.ts` `getRecipeById(id, userId?)` (lines 458-474) — the owner-scoped `$or` visibility filter **already exists and is unused** by the route. This is a one-line wiring fix, not new logic.

**Current route (lines 117-134) — missing the guard:**
```typescript
async (request, reply) => {
  const recipe = await getRecipeById(request.params.id); // BUG: userId never passed — private/reviewRequired recipes leak by id guess (RESEARCH.md Open Question 3)
  ...
```

**Fix — pass the caller's userId through (soft-auth, not requireAuth, since the route must stay usable anonymously for public recipes):**
```typescript
const { userId } = await auth(); // or getUserId(request) if a soft-auth preHandler is added
const recipe = await getRecipeById(request.params.id, userId ?? undefined);
```
Check how anonymous callers reach this route today (no `preHandler` currently) — the fix must not require login for public recipes, only additionally gate private ones, exactly matching what `getRecipeById`'s `$or` clause already encodes.

---

## Shared Patterns

### Auth guard (backend)
**Source:** `src/modules/auth/auth.guard.js` (`getUserId`, `requireAuth`), used identically in `src/modules/import/import.routes.ts` lines 5, 31, 57 and `src/modules/recipes/recipe.routes.ts` lines 12, 76, 180.
**Apply to:** `PATCH /import/:jobId/recipe`, `GET /import/mine` (hard `requireAuth`); `GET /recipes/:id` (soft — read `userId` without rejecting anonymous requests).

### Owner-scoped Mongo lookup (IDOR mitigation)
**Source:** `src/modules/import/import-job.repository.ts` `getImportJob(jobId, userId)` (lines 34-44) and `src/modules/recipes/recipe.repository.ts` `getRecipeById(id, userId)` (lines 458-474). Both encode ownership **inside the query filter** (`$or`/compound `_id + userId`), never fetch-then-compare.
**Apply to:** every new/modified backend route in this phase.

### Server action + fetch-client pairing (frontend)
**Source:** `web/lib/api.ts` + `web/app/actions.ts` — every client component call goes through a `"use server"` action that calls a `server-only` `lib/api.ts` function attaching the Clerk bearer token via `authHeaders()`.
**Apply to:** all 4 new frontend routes/components that mutate or fetch import/recipe data.

### `setTimeout`-recursion polling (frontend)
**Source:** `web/lib/useLazyThumbnail.ts` (full file).
**Apply to:** `web/lib/useImportPolling.ts` — copy the schedule/cleanup/timeout shape; diverge only on the timeout UX (must surface a state, not go silent — Pitfall 2).

### Page shell / auth-guard block (frontend routes)
**Source:** `web/app/(main)/favorites/page.tsx` (soft-guard, guest message) and `web/app/(main)/pantry/page.tsx` (hard-guard, `redirect("/sign-in")`).
**Apply to:** all 4 new `web/app/(main)/import/**/page.tsx` routes — pick hard-guard (pantry-style) since importing requires job attribution to a user.

### Typography / spacing tokens
**Source:** `web/app/(main)/pantry/page.tsx` lines 16-24 (H1 + subtitle exact classes) — per UI-SPEC, zero new tokens introduced.
**Apply to:** H1 blocks on `/import` and `/import/mine`.

## No Analog Found

None. Every file in scope has a strong (exact or role-match) existing analog. The only genuinely novel logic (no codebase precedent) is the Clipboard API read in `PasteLinkButton.tsx` — RESEARCH.md Pattern 3 (MDN/web.dev-verified) is the source of truth for that specific snippet since no prior clipboard code exists in this codebase.

## Metadata

**Analog search scope:** `web/lib/`, `web/components/`, `web/app/(main)/`, `web/app/actions.ts`, `src/modules/import/`, `src/modules/recipes/`
**Files scanned:** ~15 (api.ts, actions.ts, useLazyThumbnail.ts, FavoritesList.tsx, AdaptButton.tsx, SearchForm.tsx, favorites/page.tsx, pantry/page.tsx, NutritionBadge.tsx, IngredientsSection.tsx, import.routes.ts, import-job.repository.ts, import.service.ts, import-job.types.ts, recipe.routes.ts, recipe.repository.ts, recipe.types.ts)
**Pattern extraction date:** 2026-07-02
