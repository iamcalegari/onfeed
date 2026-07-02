# Phase 3: Capture & Mandatory Review UI - Research

**Researched:** 2026-07-02
**Domain:** Next.js App Router capture/polling/edit UI + a new backend confirm/edit endpoint
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Captura / entrada (CAP-01)**
- D-01: Rota dedicada `/import` (App Router, dentro de `web/app/(main)/import/`), acessível pelo header/menu. Não é FAB global.
- D-02: Botão destacado "Colar link" que lê o clipboard sob permissão (`navigator.clipboard.readText()`), auto-detecta a plataforma (reusa o `detectPlatform`/validação já exposta pela API) e pré-preenche o campo. Também reconhece a URL no evento `paste` manual. É a versão web viável da ideia "clipboard estilo PIX".
- D-03: Nuance registrada: o browser NÃO permite ler o clipboard silenciosamente no load (privacidade; iOS Safari mais restrito) — por isso a leitura acontece sob um gesto do usuário (clicar em "Colar"). O "banner automático ao abrir o app" pleno depende de app nativo/PWA instalado → v2.

**Progresso da importação (CAP-01 SC1)**
- D-04: Após submeter, o `POST /import` retorna imediatamente (job enfileirado) e a UI vai para uma tela de progresso com etapas reais — não um spinner genérico. Mostra o estágio atual (queued → downloading → transcribing → extracting) fazendo polling do `GET /import/:jobId`.
- D-05: Ao chegar em `ready_for_review`, a tela leva o usuário à revisão. Em `failed`, mostra o `failureReason` de forma legível com opção de tentar outra URL.

**Tela de revisão (REV-01..04)**
- D-06: Campos editáveis inline: título, ingredientes (nome + quantidade + unidade), passos, dicas/intro. Nada de redirect silencioso para "pronto" (REV-01).
- D-07: Campos marcados `inferred` ou `ambiguous` no `grounding` ganham destaque visual (cor/badge "confira isto") para o usuário saber o que revisar (REV-02). `grounded` fica neutro. O `grounding` vem por índice paralelo aos arrays (`quantityGrounding[i]`, `stepGrounding[i]`, `titleGrounding`).
- D-08: A receita só é persistida como confirmada após o usuário clicar em confirmar (REV-04). Enquanto não confirma, ela permanece `ready_for_review`/privada. O endpoint de confirmação/edição pode ser novo — o researcher/planner define; hoje a receita já existe `private` desde a Fase 2, então "confirmar" é uma transição de estado + persistir as edições.

**Destino + listagem**
- D-09: Nova seção/rota "Minhas importações" que lista as receitas importadas do usuário via `listMyImportedRecipes(userId)` (owner-scoped, Fase 2). Mostra status (em revisão / confirmada) e leva ao detalhe/revisão.
- D-10: Ao confirmar a revisão, abre o detalhe da receita — que já é cidadã de primeira classe (busca I/E/T/N, adaptar macros, lista de compras, cook mode). Reusa a tela de detalhe existente (`web/app/(main)/recipe/[id]`).

**Branding**
- D-11: O assistente de IA permanece CheffIA. Sem mudança de nome. Não é feature desta fase.

### Claude's Discretion
- Design visual concreto (componentes, cores, badges de grounding), empty states, tratamento de erro/retry na UI, layout mobile vs desktop — o UI-SPEC (gerado no plan-phase) define. Reusar os componentes/estilo existentes do `web/` (Tailwind v4, os Cards e padrões das telas atuais).
- Se "confirmar a revisão" precisa de um endpoint novo (`PATCH /import/:jobId/recipe` ou similar) para salvar as edições + marcar confirmada, ou se reusa um endpoint existente — researcher/planner decide.
- Polling: intervalo, backoff, e se usa SWR/react-query ou fetch manual — seguir o padrão do `web/lib/api.ts` e das telas existentes.

### Deferred Ideas (OUT OF SCOPE)
- Banner de clipboard automático ao abrir o app (nativo/PWA) — v2.
- Extensão de browser como adaptador de captura — v2.
- Carrossel de 3 imagens + geração via CheffIA na revisão — v2.
- Promoção pública / likes / compartilhamento — Fase 5.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CAP-01 | Usuário pode colar a URL de um vídeo (IG/TikTok/YouTube) numa tela do app e iniciar a importação | `/import` route pattern, Clipboard API research, `POST /import` client wrapper, `detectPlatform` reuse |
| REV-01 | Antes de salvar, o usuário vê uma tela de revisão/edição da receita extraída | Review screen architecture, grounding shape, confirm-gate design |
| REV-02 | Campos de baixa confiança são sinalizados visualmente (inferido vs declarado) | `RecipeGrounding` shape mapping, badge pattern |
| REV-03 | Usuário pode editar título, ingredientes (quantidade/unidade), passos e dicas antes de confirmar | Inline-edit form state design, edit payload shape |
| REV-04 | A receita só é persistida como válida após a confirmação do usuário na revisão | New confirm endpoint design (`PATCH /import/:jobId/recipe`), `reviewRequired` gate |
</phase_requirements>

## Summary

Phase 3 is a pure frontend build against an already-complete backend (Phase 1 + 2), with exactly one necessary backend addition: **a confirm/edit endpoint**. The existing API gives `POST /import` (enqueue) and `GET /import/:jobId` (poll status) — both already consumed correctly by the locked decisions. It does **not** give any way to (a) persist the user's inline edits, or (b) transition a recipe out of "awaiting review" into a confirmed state, and it does **not** expose `listMyImportedRecipes` over HTTP. Both gaps must be closed by new routes in `src/modules/import/import.routes.ts` (or `recipe.routes.ts`) before the frontend screens can be wired end-to-end. This is genuinely backend work living inside a frontend-titled phase — flagged explicitly below and must appear as its own task wave in the plan.

The frontend itself has zero net-new architectural risk: the codebase already has every pattern needed. `web/lib/useLazyThumbnail.ts` is a byte-for-byte template for job-status polling (`setTimeout`-recursion polling with a hard timeout, IntersectionObserver-gated start, cleanup on unmount) — Phase 3's progress screen should copy this shape almost verbatim rather than reach for SWR/react-query (neither is installed; `web/package.json` has zero data-fetching libraries). Server actions in `web/app/actions.ts` wrap every `web/lib/api.ts` call; the same wrapper-per-endpoint pattern applies to the three new API calls (`POST /import`, `PATCH /import/:jobId/recipe`, `GET /import/mine`). Ownership/auth follows the exact `requireAuth` + scoped-Mongo-query pattern already used in `GET /import/:jobId` (IDOR-safe by construction, not by after-the-fact check).

The Clipboard API research confirms D-03's premise is correct and adds a concrete cross-browser gap: Safari does not support `navigator.permissions.query({name:"clipboard-read"})` at all, and `readText()` there only works transparently inside a genuine user-activation call stack (no permission prompt UI exists in Safari — it silently denies outside a gesture). The implementation must treat `navigator.clipboard?.readText` as possibly `undefined`/rejecting and always keep the native `paste` event listener on the URL `<input>` as the reliable fallback — this is not an edge case to handle later, it is the primary path on iOS Safari.

**Primary recommendation:** Build `/import`, the progress screen, and the review screen entirely with the existing manual-fetch + server-action pattern (no new dependency), add one new backend endpoint `PATCH /import/:jobId/recipe` that accepts full edited recipe fields and flips `reviewRequired: false` + sets a new `Recipe.confirmedAt` field, and add `GET /import/mine` as a thin HTTP wrapper over the already-correct `listMyImportedRecipes` service function.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Clipboard read + paste detection | Browser / Client | — | `navigator.clipboard` and `paste` events only exist in the browser; must run in a `"use client"` component under a user gesture |
| URL validation before submit | Browser / Client (soft) | API / Backend (hard) | Client does a cheap regex/URL parse for instant UX feedback; `detectPlatform()` in the backend remains the actual SSRF security boundary (never trust client-side validation as the gate) |
| Import job creation | API / Backend | — | `POST /import` already exists; enqueues SQS message, returns `jobId` |
| Import progress polling | Frontend Server (SSR) for initial load, Browser / Client for polling loop | API / Backend | Initial job state fetched server-side (page load); the repeating poll itself must run client-side (`setTimeout` in a client component) since Server Components can't run in a loop after render |
| Grounding badge rendering | Browser / Client | — | Purely presentational, driven by `Recipe.grounding` already returned by the API |
| Inline edit state (title/ingredients/steps) | Browser / Client | — | Local React state during editing; nothing persisted until explicit confirm (REV-04) |
| Confirm + persist edits | API / Backend | Database / Storage | New `PATCH /import/:jobId/recipe` — owner-checked, writes to `Recipe` collection, must be atomic (single update call) |
| "My imports" list | API / Backend | Database / Storage | New `GET /import/mine` HTTP wrapper around existing `listMyImportedRecipes(userId)` — the search/scoring logic already exists, only the route is missing |
| Recipe detail rendering (post-confirm) | Frontend Server (SSR) | — | Reuses existing `web/app/(main)/recipe/[id]/page.tsx` unchanged — no new work here per D-10 |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js | ^15.3.0 (installed) | App Router pages, server actions, RSC | Already the project's frontend framework; no version change needed |
| React | ^19.0.0 (installed) | Client components, hooks (`useState`, `useEffect`, `useRef`) | Already installed; `useTransition` already used in `AdaptButton.tsx` for the same "trigger async, show loader" pattern this phase needs |
| @clerk/nextjs | ^7.5.3 (installed) | Auth guard (`auth()` in server components, token forwarding in `web/lib/api.ts`) | Already the project's auth; `/import` and `/import/mine` must follow the exact `userId` check pattern already in `favorites/page.tsx` |
| @sinclair/typebox | ^0.34.9 (installed, backend) | Request/response schema for the new `PATCH /import/:jobId/recipe` and `GET /import/mine` routes | Matches every existing route in `import.routes.ts`/`recipe.routes.ts` — do not introduce zod or another validator for two new routes |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none — no new frontend dependency needed) | — | Polling, clipboard, inline edit | The codebase deliberately has zero data-fetching libraries (no SWR/react-query in `web/package.json`); introducing one for two polling screens would be inconsistent with `useLazyThumbnail.ts`'s existing hand-rolled pattern and is unjustified scope |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled `setTimeout` polling hook (`useImportJobPolling`, mirroring `useLazyThumbnail`) | SWR / `swr`'s `refetchInterval`, or TanStack Query | Would add a new dependency for one call site; the existing `useLazyThumbnail` pattern already solves start/stop/timeout/cleanup correctly and is the codebase's established idiom — consistency outweighs the marginal ergonomics of a library |
| `navigator.clipboard.readText()` as the only capture path | Server-side URL bookmarklet / share target | Deferred to v2 explicitly (D-03, SHARE-01/02) — out of scope |
| New `PATCH /import/:jobId/recipe` endpoint | Reuse generic `PUT /recipes/:id` | `/recipes/:id` has no route today (only GET) and conflating "generic recipe edit" with "confirm an import" muddies the REV-04 state-machine guarantee (never lets a recipe silently update outside the confirm flow); a job-scoped route keeps the confirm semantics explicit and ownership-checked via the same `getImportJob(jobId, userId)` pattern already used for polling |

**Installation:**
No new packages required — this phase uses only what's already in `package.json` (backend) and `web/package.json` (frontend).

**Version verification:** All libraries listed above are already installed (verified via `cat web/package.json` and `cat package.json`), so no registry lookup was needed — no new packages are introduced by this phase. `[VERIFIED: package.json]`

## Package Legitimacy Audit

Not applicable — this phase introduces zero new external packages (backend or frontend). Every capability (clipboard read, polling, inline forms, new TypeBox routes) is achievable with the already-installed, already-verified dependency set.

**Packages removed due to [SLOP] verdict:** none — no new packages evaluated
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```text
┌─────────────────────────────────────────────────────────────────────┐
│ Browser                                                              │
│                                                                       │
│  /import (client component)                                         │
│   ├─ "Colar link" button ── click (user gesture) ──► navigator      │
│   │                                                    .clipboard    │
│   │                                                    .readText()   │
│   ├─ <input> paste event ── fallback for Safari/denied perms        │
│   └─ submit ──► detectPlatform() cheap client check ──► POST /import│
│                                                            (via action)│
│         │                                                             │
│         ▼ jobId                                                      │
│  /import/[jobId] progress screen (client component)                  │
│   └─ useImportJobPolling(jobId) — setTimeout loop, mirrors           │
│      useLazyThumbnail.ts shape                                       │
│         │ GET /import/:jobId every N sec                             │
│         ▼ status transitions: queued→downloading→transcribing→       │
│           extracting→ready_for_review | failed                       │
│      on ready_for_review ──► router.push(/import/[jobId]/review)     │
│      on failed ──► inline failureReason + "tentar outra URL"         │
│                                                                       │
│  /import/[jobId]/review (client component, hydrated from RSC fetch)  │
│   ├─ renders Recipe fields + RecipeGrounding badges                  │
│   │   (titleGrounding, quantityGrounding[i], stepGrounding[i])       │
│   ├─ inline-editable state (local, not persisted until confirm)      │
│   └─ "Confirmar" ──► PATCH /import/:jobId/recipe (edited fields)     │
│         │                                                             │
│         ▼ 200 { recipeId }                                           │
│      router.push(/recipe/[recipeId])  ── existing detail page (D-10) │
│                                                                       │
│  /import/mine (server component, list)                               │
│   └─ GET /import/mine (NEW) ──► listMyImportedRecipes(userId)        │
│      shows status per item (em revisão / confirmada) → deep-links    │
│      into /import/[jobId]/review or /recipe/[id]                     │
└─────────────────────────┬─────────────────────────────────────────────┘
                           │ Authorization: Bearer <clerk token>
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│ API Server (Fastify)                                                  │
│                                                                        │
│  POST /import              existing — enqueues ImportJob (SQS)        │
│  GET  /import/:jobId       existing — owner-scoped status poll        │
│  PATCH /import/:jobId/recipe   NEW — persist edits + confirm gate     │
│  GET  /import/mine          NEW — thin wrapper over                   │
│                               listMyImportedRecipes(userId)           │
└─────────────────────────┬─────────────────────────────────────────────┘
                           ▼
                  MongoDB: ImportJob + Recipe collections
                  (Recipe.reviewRequired flips false on confirm)
```

### Recommended Project Structure
```
web/app/(main)/import/
├── page.tsx                    # /import — paste form, "Colar link" button
├── [jobId]/
│   ├── page.tsx                 # progress screen — polls GET /import/:jobId
│   └── review/
│       └── page.tsx             # review/edit screen — fetches job+recipe, renders grounded fields
└── mine/
    └── page.tsx                 # "Minhas importações" list

web/components/
├── PasteLinkButton.tsx          # clipboard read + paste-event fallback, "use client"
├── ImportProgress.tsx           # stage indicator + polling hook consumer
├── ImportReviewForm.tsx         # inline-editable recipe form with grounding badges
├── GroundingBadge.tsx           # small reusable badge: grounded/inferred/ambiguous
└── ImportsList.tsx              # "Minhas importações" list (mirrors FavoritesList.tsx shape)

web/lib/
├── useImportPolling.ts          # new hook, mirrors useLazyThumbnail.ts exactly
└── api.ts                        # add: startImport(), getImportJob(), confirmImportRecipe(), listMyImports()

web/app/actions.ts                # add: startImportAction, confirmImportRecipeAction, listMyImportsAction

src/modules/import/
├── import.routes.ts              # add PATCH /import/:jobId/recipe, GET /import/mine
├── import.service.ts             # listMyImportedRecipes already exists — no change
└── import-job.repository.ts      # no change (getImportJob already ownership-scoped)

src/modules/recipes/
└── recipe.repository.ts          # add updateRecipeFields(id, patch) or reuse RecipeModel.update inline in the route
```

### Pattern 1: Polling hook mirroring `useLazyThumbnail`
**What:** A client-side hook that starts a `setTimeout`-based poll loop against `GET /import/:jobId`, stops on a terminal status (`ready_for_review` or `failed`) or after a hard timeout, and cleans up on unmount.
**When to use:** The `/import/[jobId]` progress screen.
**Example:**
```typescript
// Source: web/lib/useLazyThumbnail.ts (existing codebase pattern, adapt directly)
const POLL_INTERVAL_MS = 2_000; // faster than thumbnail's 3s — user is actively watching this screen
const POLL_TIMEOUT_MS = 10 * 60_000; // video pipeline can run several minutes (download+transcribe+extract)

export function useImportJobPolling(jobId: string, initialJob: ImportJob) {
  const [job, setJob] = useState(initialJob);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedAtRef = useRef(Date.now());

  useEffect(() => {
    if (job.status === "ready_for_review" || job.status === "failed") return;

    function schedulePoll() {
      pollTimerRef.current = setTimeout(async () => {
        if (Date.now() - startedAtRef.current > POLL_TIMEOUT_MS) return; // give up silently, show timeout state
        try {
          const next = await getImportJobAction(jobId);
          setJob(next);
          if (next.status !== "ready_for_review" && next.status !== "failed") schedulePoll();
        } catch {
          schedulePoll(); // transient network error — keep trying, don't kill the poll
        }
      }, POLL_INTERVAL_MS);
    }
    schedulePoll();
    return () => { if (pollTimerRef.current) clearTimeout(pollTimerRef.current); };
  }, [jobId, job.status]);

  return job;
}
```

### Pattern 2: Server action wrapper for every new endpoint
**What:** Each new `web/lib/api.ts` function gets a matching `"use server"` wrapper in `web/app/actions.ts`, exactly like `triggerThumbnailAction`/`getThumbnailUrlAction`.
**When to use:** All three new API calls (`startImport`, `confirmImportRecipe`, `listMyImports`) — client components never call `fetch` directly against the backend; they call the server action, which calls `web/lib/api.ts`, which attaches the Clerk bearer token.
**Example:**
```typescript
// Source: web/app/actions.ts (existing pattern)
"use server";
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
```

### Pattern 3: Clipboard read under user gesture with paste-event fallback
**What:** `readText()` is attempted only inside the button's `onClick` handler (preserves user-activation); a native `paste` listener on the URL input is the fallback that also handles Safari (which has no readable Permissions API entry for clipboard-read).
**When to use:** The "Colar link" button (D-02/D-03).
**Example:**
```typescript
// Source: MDN Clipboard API + web.dev/articles/async-clipboard (verified 2026)
async function handlePasteClick() {
  try {
    if (!navigator.clipboard?.readText) throw new Error("unsupported");
    const text = await navigator.clipboard.readText(); // must be called directly in the click handler — no await before this call breaks the user-activation chain in some browsers
    if (isLikelyUrl(text)) setUrlField(text);
    else showToast("Nenhum link válido na área de transferência", "⚠");
  } catch {
    // Denied, unsupported (Safari commonly), or empty clipboard — no crash,
    // just fall back silently to manual paste/typing. Never show a scary error
    // for what is an expected path on iOS Safari.
  }
}

// Always-on fallback, works even where readText() is blocked entirely:
<input
  onPaste={(e) => {
    const text = e.clipboardData.getData("text");
    if (isLikelyUrl(text)) setUrlField(text); // let default paste behavior continue too
  }}
/>
```

### Pattern 4: Owner-scoped confirm endpoint (backend)
**What:** `PATCH /import/:jobId/recipe` re-uses the exact ownership pattern from `GET /import/:jobId` — look up the job scoped to `(jobId, userId)` first (never fetch-then-compare), then update the linked `Recipe` by `recipeId`.
**When to use:** The new backend route this phase must add.
**Example:**
```typescript
// Source: pattern from src/modules/import/import.routes.ts (GET /import/:jobId) + recipe.repository.ts (RecipeModel.update)
app.patch(
  "/import/:jobId/recipe",
  {
    preHandler: requireAuth,
    schema: {
      params: Type.Object({ jobId: Type.String() }),
      body: ImportRecipeEditSchema, // title, intro, ingredients[], steps[]
    },
  },
  async (request, reply) => {
    const userId = getUserId(request)!;
    const job = await getImportJob(request.params.jobId, userId); // ownership boundary, same as GET
    if (!job) return reply.notFound();
    if (job.status !== "ready_for_review") {
      return reply.code(409).send({ error: "job_not_ready_for_review" });
    }
    if (!job.recipeId) return reply.internalServerError();

    await confirmImportedRecipe(job.recipeId, userId, request.body); // sets reviewRequired:false, confirmedAt:new Date(), applies edited fields
    return reply.send({ recipeId: job.recipeId });
  },
);
```

### Anti-Patterns to Avoid
- **Polling from a Server Component / on every page navigation:** Server Components render once per request; they cannot run a `setInterval` loop. The poll loop must live in a `"use client"` component, same as `useLazyThumbnail`.
- **Trusting client-side URL validation as security:** The client-side `detectPlatform`-alike check is UX only. `POST /import` on the backend already re-validates via the real `detectPlatform()` allowlist (SSRF boundary) — do not skip or weaken that check, and do not add a second, looser validator on the frontend that could diverge.
- **Calling `readText()` after an `await` inside the click handler:** Some browsers only honor the user-activation flag for a short synchronous window; wrapping the clipboard call behind other async work first can cause silent denial. Call it as the first async operation in the handler.
- **Persisting edits on every field blur / auto-save:** Violates REV-04 explicitly — nothing should reach the `Recipe` document until the explicit "Confirmar" action fires the `PATCH`.
- **Reusing `hybridSearch` directly with `sources: ["imported"]` in the new `GET /import/mine` route:** Must call `listMyImportedRecipes(userId)` — it already guarantees `ownerId` and `'imported'` are always passed together (D-14 security note in `import.service.ts`); a direct `hybridSearch` call in the new route could accidentally omit `ownerId` and leak other users' private imports.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Job status polling | A new polling library or `setInterval` from scratch | Copy `useLazyThumbnail.ts`'s `setTimeout`-recursion shape into a new `useImportPolling.ts` | Already solves cleanup-on-unmount, timeout, and "stop when terminal" correctly; recursion via `setTimeout` (not `setInterval`) also avoids overlapping requests if one poll is slow |
| Clipboard permission handling | Custom `navigator.permissions.query` gating logic | Try/catch around `readText()` directly, no upfront permission check | Safari doesn't expose `clipboard-read` in the Permissions API at all — a permission-check-first approach silently breaks Safari; try/catch on the read itself is the only approach that degrades gracefully everywhere |
| Recipe ownership check for the confirm endpoint | A separate `RecipeModel.findOne({_id, userId})` guard | The existing `getImportJob(jobId, userId)` ownership-scoped lookup (job already links `userId` → `recipeId`) | The `ImportJob` is already the authoritative owner record (Recipe itself doesn't reliably carry `userId` — it carries `createdBy[]` for variants); scoping through the job avoids adding a redundant/potentially-inconsistent ownership field to Recipe |
| Ingredient re-canonicalization on edit | Re-running the full `resolveCanonicalForIngestion` pipeline when the user edits an ingredient name in the review screen | Store the edited raw text/quantity/unit directly on the existing `RecipeIngredient` (name/quantity/unit fields) without re-triggering canonicalization | Canonicalization already ran once at Phase 2 persist time; re-triggering it on every review edit adds a Voyage embedding call + potential new `pending` ingredient creation into a UI-blocking request path, which is out of scope for "let the user fix a typo/quantity" — flag as an **Open Question** below since a materially different ingredient name (not just quantity fix) may need it eventually |

**Key insight:** Every "new" capability this phase needs (polling, clipboard, owner-scoped mutation) already has a proven, working precedent somewhere in this exact codebase. The research risk in this phase is near-zero on the frontend side — the actual work is precise reuse, not invention. The only genuinely new surface is the two backend routes, and both follow existing route/ownership idioms almost mechanically.

## Common Pitfalls

### Pitfall 1: Treating `readText()` rejection as an error to surface
**What goes wrong:** Showing a toast/error every time clipboard read fails (denied, unsupported, empty) trains users to distrust the button, and on Safari it will fail on essentially every first attempt.
**Why it happens:** Developers reflexively `catch` and log/alert.
**How to avoid:** Silently fall back to focusing the input for manual paste; only show a soft hint ("cole o link aqui" placeholder) — never a red error state for a denied/unsupported clipboard read.
**Warning signs:** QA reports "paste button shows an error on iPhone every time."

### Pitfall 2: Progress screen polling forever on a `queued` job that never starts (worker down)
**What goes wrong:** If the SQS worker isn't running (local dev, or a deploy issue), the job sits in `queued` forever and the polling loop runs until `POLL_TIMEOUT_MS`, showing an indefinite spinner with no useful message.
**Why it happens:** The terminal-status check only looks for `ready_for_review`/`failed`; there's no separate "stuck" heuristic.
**How to avoid:** After the timeout, show an explicit "isso está demorando mais que o esperado" state with a manual retry/cancel action rather than silently stopping the poll with no UI change (this was `useLazyThumbnail`'s original bug class — its `stopPolling()` on timeout also just goes silent, which is acceptable for a background thumbnail but not for a screen the user is actively staring at).
**Warning signs:** Manual test: stop the worker locally (`npm run worker:import` not running), submit an import, watch the progress screen never resolve.

### Pitfall 3: Confirm endpoint allowing a PATCH when job isn't `ready_for_review`
**What goes wrong:** If the endpoint doesn't check `job.status === "ready_for_review"` before applying edits, a stale review tab (job re-processed, failed, or already confirmed) could silently overwrite fields on an inconsistent recipe, or double-confirm.
**Why it happens:** Easy to only check `job.recipeId` exists and skip the status check.
**How to avoid:** Reject with 409 if `job.status !== "ready_for_review"` (mirrors Phase 2's own structural guarantee that `ready_for_review` is the only pre-confirm terminal). Also reject a second confirm attempt once `Recipe.reviewRequired` is already `false` — confirm should be idempotent-safe, not silently double-apply.
**Warning signs:** Integration test: call confirm twice, assert the second call either no-ops safely or 409s — never silently succeeds with different data.

### Pitfall 4: Grounding array index drift between review-screen edit state and the original arrays
**What goes wrong:** `quantityGrounding[i]`/`stepGrounding[i]` are positional, not keyed by a stable id. If the review form lets the user reorder or delete an ingredient/step before confirming, the grounding badge can end up pointing at the wrong field after a re-render.
**Why it happens:** React list rendering with `key={index}` plus array mutation (remove/reorder) is a classic index-drift bug.
**How to avoid:** Zip `ingredients[i]` with `quantityGrounding[i]` (and `steps[i]` with `stepGrounding[i]`) into a single combined array **once**, immediately after fetch, before it ever enters React state — treat `{ ingredient, grounding }` as one unit from that point on. If the plan allows add/remove of ingredients/steps in this phase (not required by REV-03, which only asks for edit of existing fields), any newly-added row must get an explicit `grounding: "grounded"` (user-authored = ground truth) rather than an `undefined` index lookup.
**Warning signs:** Code review: any place that does `groundingArray[index]` using a `.map((_, index) => ...)` where the array was previously filtered or reordered.

### Pitfall 5: Backend confirm endpoint silently trusting client-submitted grounding
**What goes wrong:** If the `PATCH` body accepts a `grounding` object from the client, a malicious or buggy client could mark everything `"grounded"` regardless of what was actually verified, defeating REV-02's entire honesty guarantee for future reads of this recipe.
**Why it happens:** Naive PATCH implementations spread `request.body` directly onto the document.
**How to avoid:** The `PATCH` body schema should accept only editable content fields (`title`, `intro`, `ingredients[].{name,quantity,unit}`, `steps[].text`) — never `grounding`, `confidenceScore`, or `reviewRequired` from the client. The server sets `reviewRequired: false` itself upon successful confirm; grounding values are immutable after Phase 2 persisted them (they describe extraction provenance, not current field values).
**Warning signs:** Code review: `ImportRecipeEditSchema` (TypeBox) must not include `grounding` or `reviewRequired` as accepted body fields; `additionalProperties: false` on the schema catches this automatically if forgotten.

## Code Examples

Verified patterns from official sources / existing codebase:

### Owner-scoped Mongo lookup (existing pattern to replicate for the new routes)
```typescript
// Source: src/modules/import/import-job.repository.ts (existing, verified in this codebase)
export async function getImportJob(
  jobId: string,
  userId?: string,
): Promise<ImportJob | null> {
  if (userId) {
    const job = await ImportJobModel.find({ _id: new ObjectId(jobId), userId } as never);
    return (job as ImportJob | null) ?? null;
  }
  const job = await ImportJobModel.findById(jobId);
  return (job as ImportJob | null) ?? null;
}
```

### Clipboard read with graceful degradation (2026 cross-browser reality)
```typescript
// Source: MDN "Interact with the clipboard", web.dev/articles/async-clipboard (verified via WebSearch, 2026)
// Chrome: prompts a permission dialog on first programmatic read.
// Firefox/Safari: no permission prompt UI for clipboard-read; Safari has no
// Permissions API entry for "clipboard-read" at all — treat as always-try,
// never gate on a permissions.query() result.
async function pasteFromClipboard(): Promise<string | null> {
  if (typeof navigator === "undefined" || !navigator.clipboard?.readText) return null;
  try {
    return await navigator.clipboard.readText();
  } catch {
    return null; // denied / no permission / insecure context — caller falls back to manual paste
  }
}
```

### Server action pattern for a new mutating endpoint
```typescript
// Source: web/app/actions.ts (existing pattern — adaptRecipeAction is the closest analog:
// async mutation, error normalized to a string, id returned for router.push navigation)
export async function confirmImportRecipeAction(
  jobId: string,
  patch: ImportRecipeEditPatch,
): Promise<{ ok: true; recipeId: string } | { ok: false; error: string }> {
  try {
    const { recipeId } = await confirmImportRecipe(jobId, patch);
    return { ok: true, recipeId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Falha ao confirmar a revisão" };
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `document.execCommand('paste')` | Async Clipboard API (`navigator.clipboard.readText()`) | execCommand deprecated across all major browsers years ago | Must use the Promise-based API; the codebase has no prior clipboard code to reference, this is genuinely new for this project |
| Polling via `setInterval` | Polling via recursive `setTimeout` | Already the established codebase pattern (`useLazyThumbnail.ts`) | Avoids overlapping in-flight requests if a single poll response is slow; scheduling the next poll only after the previous one resolves is strictly safer for a job-status endpoint that could occasionally be slow (backend query load) |

**Deprecated/outdated:**
- `document.execCommand('paste')`: unsupported/unreliable in current browsers; not applicable to this codebase (no prior usage found).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The new confirm endpoint should be named `PATCH /import/:jobId/recipe` (job-scoped) rather than `POST /recipes/:id` or a `/import/:jobId/confirm` action-style route | Architecture Patterns, Don't Hand-Roll | Low — this is a naming/routing convention choice within Claude's Discretion per CONTEXT.md; any owner-scoped, `ready_for_review`-gated route shape satisfies REV-04 equally. Planner should confirm the exact route name against REST conventions already in the codebase (`:id` sub-resource pattern used elsewhere, e.g. `/recipes/:id/thumbnail`, `/recipes/:id/rate`) before finalizing |
| A2 | A new `Recipe.confirmedAt` field (or reusing `reviewRequired: false` alone) is sufficient to model "confirmed" state, with no new `ImportJob` status needed | Summary, Architecture Patterns | Medium — if the planner instead wants an explicit `ImportJob.status: "confirmed"` terminal state (extending the enum beyond `ready_for_review`/`failed`), that changes the type in `import-job.types.ts` and could affect Phase 2's structural EXT-05 guarantee tests (which currently assert no path writes a "public/published" status — a new "confirmed" status wouldn't violate that guarantee, but should be a deliberate decision, not implicit) |
| A3 | Editing an ingredient's name in the review screen does NOT need to re-trigger `resolveCanonicalForIngestion` | Don't Hand-Roll | Medium — if a user meaningfully renames an ingredient (not just fixing a typo/quantity) rather than just adjusting quantity/unit, the `canonicalId` on that `RecipeIngredient` would go stale, making pantry-matching (haveIds) silently wrong for that ingredient going forward. Flagged as an Open Question below — needs explicit product/planner decision on whether REV-03's ingredient editing includes name changes that require re-canonicalization, or whether v1 scope only covers quantity/unit edits (title/steps freely editable, ingredient names editable but understood as "may desync canonical match until reconciled") |
| A4 | `GET /import/mine` is the correct new route name/shape for exposing `listMyImportedRecipes` over HTTP | Architecture Patterns | Low — CONTEXT.md's `code_context` section explicitly floats this as "novo endpoint HTTP provável, ou expor via rota" without committing to a name; any owner-scoped GET wrapping the existing service function satisfies D-09 |

**If this table is empty:** N/A — table populated above; four assumptions require lightweight confirmation but none block starting the plan (all have a safe, reversible default).

## Open Questions

1. **Does REV-03 "editar ingredientes" include renaming (not just quantity/unit fixes)?**
   - What we know: The confirm endpoint can trivially persist a new `name` string onto `RecipeIngredient` without touching `canonicalId`.
   - What's unclear: Whether a renamed ingredient should re-run `resolveCanonicalForIngestion` (costs a Voyage embed call, may create a new `pending` ingredient) so that pantry-matching (`haveIds`) and search stay correct, or whether v1 accepts that edited ingredient text may desync from its `canonicalId` until a later reconciliation pass.
   - Recommendation: Default to NOT re-canonicalizing on edit for v1 (matches "Don't Hand-Roll" guidance above — keeps the confirm request fast and synchronous). Planner should note this as a known limitation in the plan's scope notes, or explicitly descope ingredient *name* editing (only quantity/unit) if simpler.

2. **Should `GET /import/:jobId` (used by the progress screen poll) also return the full `Recipe` once `ready_for_review`, or does the review screen need a second fetch?**
   - What we know: `ImportJob.recipeId` is populated on success; the review screen needs the full `Recipe` document (title/ingredients/steps/grounding), which `GET /import/:jobId` does not currently include (it returns the `ImportJob` shape only).
   - What's unclear: Whether to extend `GET /import/:jobId`'s response to embed the linked Recipe when status is `ready_for_review` (one round-trip) vs. having the review page do `GET /import/:jobId` then `GET /recipes/:recipeId` (two round-trips, but zero backend changes since `GET /recipes/:id` already exists).
   - Recommendation: Two round-trips — reuse the existing `GET /recipes/:id` unchanged (already public/no-auth-required today; confirm during planning whether it should require ownership for `reviewRequired: true` private imports, since currently it has no auth check at all per `recipe.routes.ts` line 117-132). This is simpler and touches less existing code than modifying the polling response shape.

3. **Does `GET /recipes/:id` need an ownership/visibility check added for `private` + `reviewRequired: true` recipes?**
   - What we know: Today's `GET /recipes/:id` (recipe.routes.ts) has no `preHandler: requireAuth` and no ownership filter — it returns any recipe by id regardless of `visibility`.
   - What's unclear: Whether an unconfirmed, unreviewed import (potentially containing not-yet-verified/embarrassing extracted content) should be fetchable by anyone who guesses/enumerates the `recipeId`, before the owner has even reviewed it.
   - Recommendation: This is a security gap worth flagging explicitly to the planner — likely needs a lightweight visibility check added to `getRecipeById`/the route (`visibility === "private"` → require `userId` match) as part of this phase's backend work, not deferred. See Security Domain section below (V4 Access Control).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Frontend + backend dev servers | ✓ (project `engines.node >=22`) | assumed installed per project | — |
| Clerk (`@clerk/nextjs`) | Auth guard on `/import`, `/import/mine` | ✓ | ^7.5.3 (installed) | If Clerk disabled in env, `auth()` calls already fail gracefully to `userId: null` per existing pattern in every page — import routes should show the same "entre na sua conta" gate as `favorites/page.tsx` |
| SQS import queue + worker (`npm run worker:import`) | End-to-end manual testing of the progress screen | Not verifiable from static research — must be confirmed running locally during implementation/testing | — | If worker isn't running locally, progress screen will hang at `queued` — see Pitfall 2; developer must run `npm run worker:import` locally to test the full flow |
| Browser secure context (HTTPS or localhost) | Clipboard API (`navigator.clipboard`) | Assumed ✓ for `localhost:3001` dev and any HTTPS deploy | — | On a non-secure context, `navigator.clipboard` is `undefined` — code already handles this via the `typeof`/optional-chaining guard in Pattern 3 |

**Missing dependencies with no fallback:** none identified.

**Missing dependencies with fallback:** SQS worker availability during local dev/testing (must be manually started; not a code dependency, an operational one).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (backend, `^` version per `package.json` — already configured via `vitest.config.ts`) |
| Config file | `vitest.config.ts` (backend); **no frontend test config exists** — `web/` has `playwright` as a devDependency but zero `.spec.ts` files or `playwright.config.ts` |
| Quick run command | `npm run test` (excludes `.integration.test.ts`) |
| Full suite command | `npm run test:all` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CAP-01 | `POST /import` triggered from `/import` page with a valid pasted URL enqueues a job | integration (backend, already covered) / manual (frontend submit flow) | `npm run test -- import.routes` (existing route already tested) for backend; frontend submit flow is manual-only (no frontend test runner configured) | ✅ backend / ❌ frontend Wave 0 |
| CAP-01 (clipboard) | "Colar" button reads clipboard under gesture, falls back to paste-event | manual-only | — (Clipboard API cannot be reliably simulated in Vitest/node environment; requires real browser) | ❌ manual only, justified |
| REV-04 | Confirm gate: no recipe treated as final/confirmed until explicit `PATCH` succeeds | unit + integration (backend) | `npm run test -- import.routes` (new test file, e.g. `import.routes.confirm.test.ts`) asserting `reviewRequired` stays `true` until PATCH called, and PATCH sets it `false` | ❌ Wave 0 — new endpoint, new test file needed |
| REV-04 | PATCH rejects when `job.status !== "ready_for_review"` (409) | unit (backend) | same new test file — table-test each non-terminal/failed status | ❌ Wave 0 |
| REV-02 | Grounding badge renders `inferred`/`ambiguous` distinctly from `grounded` | component test (frontend) OR manual visual check | No frontend test runner configured — recommend manual UAT against the risoto fixture (title=inferred, "a gosto"=ambiguous, per CONTEXT.md `<specifics>`) unless Wave 0 adds a minimal frontend test setup | ❌ manual only, justified (no frontend test infra exists yet; adding one is disproportionate to this phase's scope) |
| REV-01/03 | Inline edits held in local state, not persisted until confirm | manual UAT | — | ❌ manual only, justified |
| D-09 (My imports) | `GET /import/mine` returns only the caller's imported recipes, never another user's | unit (backend) | New test asserting `listMyImportedRecipes` call always includes matching `ownerId` — extend existing `import.service.test.ts` if it doesn't already cover the HTTP route layer | ❌ Wave 0 — route is new |
| Polling terminal-state | Progress screen polling stops on `ready_for_review`/`failed`, doesn't stop early, doesn't poll forever | unit (frontend hook logic, if a minimal test setup is added) or manual | If no frontend test infra: manual QA script covering all three terminal-adjacent states (success, failure, timeout) | ❌ manual only unless Wave 0 adds frontend test tooling (not recommended for this phase's scope — flag as a separate future investment) |

### Sampling Rate
- **Per task commit:** `npm run test` (backend fast suite) for every backend route/service change; manual click-through in dev (`npm run dev` + `cd web && npm run dev`) for every frontend screen change
- **Per wave merge:** `npm run test:all` (backend) + full manual walkthrough of paste→progress→review→confirm→detail→my-imports
- **Phase gate:** Full backend suite green before `/gsd-verify-work`; frontend has no automated suite — Phase gate relies on the manual UAT checklist above (explicitly flagged, not silently skipped)

### Wave 0 Gaps
- [ ] `src/modules/import/import.routes.confirm.test.ts` (or extend `import.routes.ts` coverage) — covers REV-04 confirm gate + 409 rejection
- [ ] `src/modules/import/import.routes.mine.test.ts` (or similar) — covers `GET /import/mine` owner-scoping
- [ ] No frontend test framework exists (`web/` has `playwright` installed but unconfigured) — **explicitly not recommending** standing up Playwright in this phase (disproportionate scope for a UI-only phase with no prior frontend test precedent in the codebase); all frontend-facing requirements (CAP-01 clipboard, REV-01/02/03 visual/inline-edit, polling UX) are manual-UAT-only for this phase, tracked in the map above
- [ ] Manual UAT script (not a file, a plan deliverable): paste→progress(success)→review(grounding visible)→edit→confirm→detail page; paste→progress(failure)→retry; clipboard denied/Safari fallback; "my imports" list shows correct status per item

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Clerk `requireAuth` preHandler on `/import`, `PATCH /import/:jobId/recipe`, `GET /import/mine` — already the codebase standard, apply identically to the two new routes |
| V3 Session Management | no | Delegated entirely to Clerk (`@clerk/nextjs`, `@clerk/fastify`) — no session logic added by this phase |
| V4 Access Control | yes | Owner-scoped Mongo queries (`getImportJob(jobId, userId)` pattern) for the new confirm route; **gap identified** (see Open Question 3): `GET /recipes/:id` currently has no visibility/ownership check at all, which becomes a real exposure the moment `reviewRequired: true` private imports exist and are linkable by id before the owner reviews them |
| V5 Input Validation | yes | TypeBox schema (`additionalProperties: false`) on the new `PATCH /import/:jobId/recipe` body — must NOT accept `grounding`, `reviewRequired`, or `confidenceScore` from the client (see Pitfall 5); string length limits on `title`/`intro`/ingredient fields mirroring `SubmitRecipeSchema`'s existing bounds (`maxLength: 200` for title, etc.) |
| V6 Cryptography | no | No new cryptographic operations introduced by this phase |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| IDOR on `PATCH /import/:jobId/recipe` (editing/confirming another user's import) | Tampering / Elevation of Privilege | Scope the job lookup by `(jobId, userId)` in one query, exactly like existing `GET /import/:jobId` — never fetch-then-compare, never trust a `recipeId` in the request body over the job-derived one |
| Unauthenticated enumeration of not-yet-reviewed private recipes via `GET /recipes/:id` | Information Disclosure | Add a visibility check to `getRecipeById`/the route: if `visibility === "private"`, require the requester's `userId` to match the recipe's owner (via its `importJobId` → `ImportJob.userId`, since `Recipe` itself has no direct `userId` field today) — flagged as a concrete fix this phase should make, not a future TODO |
| Client-supplied `grounding`/`reviewRequired`/`confidenceScore` overwrite via the confirm PATCH | Tampering | `additionalProperties: false` TypeBox schema restricted to editable content fields only (see V5 above) |
| SSRF via a weakened/duplicated client-side URL validator diverging from `detectPlatform()`'s allowlist | Tampering (bypassing the existing security boundary) | Frontend validation stays UX-only (fast feedback); `POST /import`'s server-side `detectPlatform()` allowlist remains the sole security boundary — do not introduce a second server-side URL check with different rules |

## Sources

### Primary (HIGH confidence)
- `src/modules/import/import.routes.ts`, `import.service.ts`, `import-job.types.ts`, `import-job.repository.ts` — read directly, this session — existing backend contract Phase 3 must consume
- `src/modules/recipes/recipe.types.ts`, `recipe.routes.ts`, `recipe.repository.ts` — read directly, this session — Recipe/RecipeGrounding shape and existing route patterns
- `web/lib/api.ts`, `web/app/actions.ts`, `web/lib/useLazyThumbnail.ts`, `web/components/LazyThumbnail.tsx`, `web/components/AdaptButton.tsx`, `web/components/FavoritesList.tsx` — read directly, this session — the exact patterns to replicate
- `.planning/phases/02-structured-extraction-recipe-persistence/02-05-SUMMARY.md` — Phase 2 completion summary confirming `ready_for_review` structural guarantee and what's available to Phase 3
- `web/package.json`, `package.json` — read directly, this session — confirmed no new dependencies needed (no SWR/react-query/zod installed frontend-side)

### Secondary (MEDIUM confidence)
- [MDN: Interact with the clipboard](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Interact_with_the_clipboard) — general Clipboard API behavior
- [web.dev: Unblocking clipboard access](https://web.dev/articles/async-clipboard) — user-gesture requirement, Chrome permission prompt behavior, Firefox/Safari paste-affordance-instead-of-prompt behavior
- [W3docs: JavaScript Clipboard API](https://www.w3docs.com/learn-javascript/clipboard-api) — corroborating secure-context requirement

### Tertiary (LOW confidence)
- None — all clipboard claims cross-checked against 2+ sources (MDN + web.dev) before inclusion.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new dependencies, entirely verified against installed `package.json`/`web/package.json`
- Architecture: HIGH — every pattern (polling, server actions, ownership scoping) has a direct, read-verified precedent in this exact codebase
- Pitfalls: HIGH for backend/ownership pitfalls (grounded in codebase patterns); MEDIUM for Clipboard API specifics (grounded in 2 independent web sources, not hands-on browser testing this session)

**Research date:** 2026-07-02
**Valid until:** 30 days (stable domain — Next.js App Router and Clipboard API behavior change slowly; re-verify Clipboard API browser support if implementation is delayed past ~August 2026)
