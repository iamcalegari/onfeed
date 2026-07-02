# Phase 2: Structured Extraction & Recipe Persistence - Pattern Map

**Mapped:** 2026-07-01
**Files analyzed:** 9 (3 new, 6 modified)
**Analogs found:** 9 / 9

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `src/modules/import/import.extraction.ts` (new) | service (LLM extraction) | request-response (single LLM call) | `src/modules/recipes/recipe.extraction.ts` | exact |
| `src/modules/import/import.confidence.ts` (new) | utility (pure function) | transform | `src/infra/video/vad.ts` (threshold-style pure check, referenced in RESEARCH) — style only; no computable-confidence analog exists | role-match (style only) |
| `src/modules/import/__fixtures__/*` (new) | test fixtures | batch/data | none (no fixtures dir exists yet) | no analog |
| `src/modules/recipes/recipe.types.ts` (modified) | model (types) | CRUD | itself (extend in place) | exact |
| `src/modules/recipes/recipe.model.ts` (modified) | model (BSON schema) | CRUD | itself (extend in place) | exact |
| `src/modules/recipes/recipe.ingestion.ts` (modified — `IngestOptions`/`persistExtractedRecipe`) | service (persistence pipeline) | CRUD | itself (extend in place) | exact |
| `src/modules/recipes/recipe.repository.ts` (modified — `hybridSearch`, `DEFAULTS.sources`) | service/query (search) | request-response | itself (extend in place); IDOR-safe owner-scoping pattern borrowed from `import-job.repository.ts`'s `getImportJob` | role-match |
| `src/infra/video/pipeline.ts` (modified — `extracting` stage) | orchestrator/pipeline stage | event-driven (worker step) | itself (replace stub in place) | exact |
| `src/modules/import/import-job.types.ts` / `import-job.repository.ts` (modified) | model + repository | CRUD | itself (extend in place) | exact |

## Pattern Assignments

### `src/modules/import/import.extraction.ts` (new — service, request-response)

**Analog:** `src/modules/recipes/recipe.extraction.ts` (134 lines, read in full)

**Imports pattern** (lines 1-8):
```typescript
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

import {
  anthropic,
  effortOption,
  EXTRACTION_MODEL,
} from "@/infra/llm/anthropic.client.js";
```
Mirror verbatim. If a dedicated import-extraction model constant is added (open question in RESEARCH.md, Pitfall 1 — do not hardcode `opus`), define it alongside `EXTRACTION_MODEL` in `anthropic.client.ts` (see Shared Patterns > Model Selection below) and import it here instead of/alongside `EXTRACTION_MODEL`.

**Schema pattern** (lines 17-67, `ExtractedRecipeSchema`): the new `ImportedRecipeSchema` extends this shape 1:1 (`ingredients[]` with `raw/name/quantity/unit/core`, `steps[]` with `text/minutes`, `nutrition` nullable object with `calories/protein/carbs/fat`) but adds:
- `title: z.string()` + `titleGrounding` (base schema has no title field — title comes from outside in the catalog path; here the LLM must propose it, D-06).
- `quantityGrounding` sibling on each ingredient object (inline, per Pattern 2 in RESEARCH.md — NOT a parallel map).
- `grounding` sibling on each step object.
- `sourceDivergence: z.array(z.string())` top-level field (D-08).
- Keep `nutrition` schema and its "estimate or null" phrasing verbatim — D-10 reuses this mechanism unchanged; grounding for nutrition must NOT be asked of the model (hardcode `"inferred"` in `import.confidence.ts`, per RESEARCH.md Anti-Patterns).

**Output-format + params pattern** (lines 94-121, `EXTRACTION_FORMAT` + `buildExtractionParams`):
```typescript
export const EXTRACTION_FORMAT = zodOutputFormat(ExtractedRecipeSchema);

export function buildExtractionParams(input: RawRecipeInput) {
  return {
    model: EXTRACTION_MODEL,
    max_tokens: 4000,
    output_config: { format: EXTRACTION_FORMAT, ...effortOption("low") },
    system: EXTRACTION_SYSTEM_PROMPT,
    messages: [
      { role: "user" as const, content: buildExtractionUserContent(input) },
    ],
  };
}
```
Mirror this shape exactly for `buildImportParams`. RESEARCH.md's Code Examples section recommends `effort: "medium"` (not `"low"`) given the harder reconciliation+grounding task — use `effortOption("medium")`. Bump `max_tokens` to 6000 if truncation is observed on real transcript fixtures (A3 in Assumptions Log).

**Call + error handling pattern** (lines 123-134, `extractRecipe`):
```typescript
export async function extractRecipe(
  input: RawRecipeInput,
): Promise<ExtractedRecipe> {
  const res = await anthropic.messages.parse(buildExtractionParams(input));

  if (!res.parsed_output) {
    throw new Error(
      `Extração falhou (stop_reason=${res.stop_reason}) para "${input.title}"`,
    );
  }
  return res.parsed_output;
}
```
Mirror verbatim for `extractImportedRecipe(job)` — same `res.parsed_output` null-check + `stop_reason` error message pattern, substituting `job._id`/`sourceUrl` for `input.title` in the error string.

**System prompt style** (lines 75-92, `EXTRACTION_SYSTEM_PROMPT`): imperative pt-BR rule list, explicit unit/quantity normalization rules (fraction→decimal, "a gosto" handling). The new `IMPORT_RECONCILIATION_SYSTEM_PROMPT` (already drafted in RESEARCH.md's Code Examples section, "Reconciliation Prompt Skeleton") follows the same imperative-rules style, adding D-07/D-08 source-precedence rules and D-01's grounding definitions with the anti-over-confidence instruction (Pitfall 3) and injection-defense instruction (Pitfall 4). Copy that skeleton directly — it is already codebase-styled, not generic boilerplate.

**User-content builder pattern** (lines 97-107, `buildExtractionUserContent`): delimited, labeled sections joined with `\n\n`. The new `buildImportUserContent` (also drafted in RESEARCH.md) follows this exactly — `Transcrição do áudio:\n"""..."""` / `Legenda do post:\n"""..."""` triple-quote delimiting is the established untrusted-content-labeling convention in this codebase; do not deviate (Pitfall 4 mitigation).

---

### `src/modules/import/import.confidence.ts` (new — utility, transform)

**Analog:** No direct analog exists in the codebase (first pure confidence-scoring function). Style analog: small, pure, synchronous functions elsewhere in `src/infra/video/*` (threshold-based decisions with no I/O) — same "compute deterministic decision from structured input, no mocking needed in tests" shape.

**Pattern to follow:** RESEARCH.md's Architecture Patterns > Pattern 3 already contains a complete, codebase-consistent draft implementation (`computeConfidence`) — use it as the direct starting point:
```typescript
export function computeConfidence(extracted: ImportedRecipe): {
  score: number;
  requiresReview: boolean;
  reasons: string[];
} { /* see RESEARCH.md Pattern 3 for full body */ }
```
Two structural overrides REQUIRED per RESEARCH.md pitfalls (do not skip):
1. **Pitfall 5:** when `noSpeechDetected === true`, force `requiresReview = true` unconditionally, independent of the model's self-reported grounding.
2. **Anti-Pattern (nutrition):** hardcode `nutrition` grounding contribution as `"inferred"` always — never read a model-self-reported nutrition grounding field (the schema should not even expose one, per Pattern 1 above).

Naming convention: match the existing codebase style of exported `const` threshold values with a comment explaining the number (see `SEMANTIC_MATCH_THRESHOLD = 0.82` in `ingredient.service.ts` line 51, and `CORE_WEIGHT`/`wRating` style in `recipe.repository.ts` lines 41-56) — e.g. `const INFERRED_AMBIGUOUS_RATIO_THRESHOLD = 0.35;` with a `// planner tunes exact value` style comment kept until empirically validated.

---

### `src/modules/recipes/recipe.types.ts` (modified)

**Analog:** itself — extend the existing `Recipe` interface and `RecipeSource` union in place (read in full, 136 lines).

**RecipeSource union to extend** (lines 1-7):
```typescript
export type RecipeSource =
  | "curated"
  | "generated_pending"
  | "generated_validated"
  | "variant"
  | "rejected"
  | "user";
```
Add `| "imported"` following the exact same one-line-per-value + trailing comment style used for the other five values.

**New `RecipeVisibility` type** (net-new — no existing analog; follow `NutritionGoal`/`Equipment` string-union style, lines 16-32):
```typescript
export type RecipeVisibility = "private" | "public";
```
Per RESEARCH.md Open Question 2 recommendation: keep it a minimal 2-value enum now; Phase 5 may extend with `"unlisted"`.

**Recipe interface additions** (extend the `Recipe` interface, lines 71-104): add `visibility: RecipeVisibility` (required — every recipe should carry it explicitly, matching how `source` is required, not optional), `grounding?: <per-field grounding blob>` (shape TBD by planner per RESEARCH.md Open Question 4 — keep import-only, so mark optional), `importJobId?: string` (optional, sparse — mirrors the existing optional `externalId?: string` / `parentRecipeId?: string` pattern at lines 73-76). Per RESEARCH.md Open Question 3, also consider `sourceMeta?: { platform, authorHandle?, authorUrl?, sourceUrl }` denormalized onto Recipe (mirrors existing denormalization precedent of `avgRating`/`ratingCount`, lines 81-84).

---

### `src/modules/recipes/recipe.model.ts` (modified)

**Analog:** itself — extend the existing BSON validation schema in place (read in full, 137 lines).

**Source enum to extend** (lines 98-101):
```typescript
source: {
  bsonType: "string",
  enum: ["curated", "generated_pending", "generated_validated", "variant", "rejected", "user"],
},
```
Add `"imported"` to the enum array.

**New field schema additions** — follow the `creatorSchema`/`nutritionSchema` pattern (lines 33-51: small `ModelValidationSchema` const, `bsonType: "object"`, explicit `required`/`properties`) for a `groundingSchema` if grounding is stored as a nested object. For `visibility`, follow the `equipment` array-of-enum precedent (lines 88-94) but as a scalar:
```typescript
visibility: { bsonType: "string", enum: ["private", "public"] },
importJobId: { bsonType: "objectId" },
```
Add `visibility` to the top-level `required` array (line 55-72) since every new recipe should set it explicitly — but note existing recipes lack it, so either (a) backfill via migration, or (b) keep it optional in the BSON schema and default it at the application layer only for `source: "imported"`. Flag this as a planner decision, not silently required (mongoat schema validation runs on every insert/update — see Mongoat gotchas memory note).

**Index pattern** (lines 129-136): follow the existing `{ key: {...}, name: "...", sparse: true }` style used for `parentRecipeId`/`dietaryTags` — add a sparse index on `importJobId` and consider one on `visibility` if owner-scoped queries filter on it frequently:
```typescript
{ key: { importJobId: 1 }, name: "import_job_lookup", sparse: true },
```

---

### `src/modules/recipes/recipe.ingestion.ts` (modified — `IngestOptions` / `persistExtractedRecipe`)

**Analog:** itself — extend in place (read in full, 274 lines).

**IngestOptions extension point** (lines 34-38):
```typescript
export interface IngestOptions {
  source: RecipeSource;
  parentRecipeId?: string;
  createdBy?: import("./recipe.types.js").RecipeCreator[];
}
```
Add `visibility?: RecipeVisibility` and `importJobId?: string` here, following the exact same optional-field style as `parentRecipeId`.

**Persist call site to extend** (lines 121-142, `RecipeModel.insert({...})`): follow the existing conditional-spread convention used throughout this function for optional fields:
```typescript
...(input.externalId && { externalId: input.externalId }),
...(opts.parentRecipeId && { parentRecipeId: opts.parentRecipeId }),
...(opts.createdBy && { createdBy: opts.createdBy }),
source: opts.source,
```
Add `visibility: opts.visibility ?? "public"` (default public preserves existing catalog-ingestion callers' behavior unchanged) and `...(opts.importJobId && { importJobId: opts.importJobId })` in the same block, plus `...(extracted.grounding && { grounding: extracted.grounding })` if grounding is passed through from the extraction result (grounding is NOT part of `ExtractedRecipe` today — it will need to be threaded from `ImportedRecipe` through to this call, likely via a new parameter or by extending `IngestRecipeInput`/reusing `extracted` more loosely; the import path will most likely call a thin wrapper rather than `persistExtractedRecipe` unchanged, since `extracted.ingredients[].quantityGrounding` etc. are extra properties the existing loop (lines 90-103) simply ignores — confirmed no destructuring/whitelisting breaks on extra properties, so passing the `ImportedRecipe`-shaped object through as `extracted: ExtractedRecipe` is structurally safe as long as the required fields match).

**Canonicalization loop — reuse verbatim, no changes** (lines 89-103):
```typescript
const ingredients: RecipeIngredient[] = [];
for (const ing of extracted.ingredients) {
  const { canonicalId, isStaple } = await resolveCanonicalForIngestion(
    ing.name,
  );
  ingredients.push({
    raw: ing.raw,
    canonicalId,
    name: ing.name,
    core: ing.core,
    isStaple,
    ...(ing.quantity !== null && { quantity: ing.quantity }),
    ...(ing.unit !== null && { unit: ing.unit }),
  });
}
```
Do not touch this loop. Per D-12/EXT-03, the import path must call `persistExtractedRecipe` (or a very thin wrapper around it) unchanged for this section — do not write a parallel canonicalization loop in `import.extraction.ts`.

**Embedding pattern — reuse verbatim** (lines 105-116, `buildEmbeddingText` + `embeddings.embedDocuments`): no changes needed; the import path's `title`/`intro`/`country`/`occasions`/`ingredients` map onto this function's existing signature unchanged.

---

### `src/modules/recipes/recipe.repository.ts` (modified — `hybridSearch` + `DEFAULTS.sources`)

**Analog:** itself (read `DEFAULTS` lines 40-56, `$vectorSearch` filter lines 214-227, `getRecipeById` lines 422-428).

**Current DEFAULTS (the gap, per Pitfall 2):**
```typescript
const DEFAULTS = {
  numCandidates: 200,
  limit: 20,
  sources: ["curated", "generated_validated", "variant", "user"] as RecipeSource[],
};
```

**Current $vectorSearch filter (no owner-scoping today):**
```typescript
filter: {
  source: { $in: params.sources ?? DEFAULTS.sources },
  ...(isDrinks && { occasions: "drinks" }),
},
```

**Required change (D-14 — do NOT just add "imported" to DEFAULTS.sources):** Add an explicit owner-scoping parameter to `HybridSearchParams` (e.g. `ownerId?: string`) and extend the `$vectorSearch` filter conditionally:
```typescript
filter: {
  source: { $in: params.sources ?? DEFAULTS.sources },
  ...(isDrinks && { occasions: "drinks" }),
  ...(params.ownerId && {
    $or: [
      { visibility: { $ne: "private" } },
      { visibility: "private", "createdBy.userId": params.ownerId },
    ],
  }),
},
```
This requires `createdBy.userId` (or a new dedicated `ownerId` field) to be a filterable field on the Atlas vector index definition (`search-indexes.ts` — not read in this pass, flagged for planner to check `recipeVectorIndexDefinition.definition.fields`). **Never add `"imported"` to `DEFAULTS.sources` without this owner filter present in the same change** — that is the exact privacy-leak shape Pitfall 2 warns against.

**Owner-scoped query precedent to copy the IDOR-safety idiom from** — NOT from `recipe.repository.ts` (which has no owner-scoped reads today) but from `import-job.repository.ts`'s `getImportJob` (lines 34-44):
```typescript
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
This is the codebase's established pattern for "scope by both `_id` and owner in the SAME Mongo filter, never fetch-then-compare" — apply the same idiom to `getRecipeById` (lines 422-428) if a caller needs to fetch a single private-imported recipe by id (e.g. Phase 3's review screen): add an optional `userId` param and fold it into the `findById`/`find` filter, not a post-fetch `if (recipe.createdBy... !== userId) throw`.

**Fallback option (if Atlas index field addition is out of scope for this phase):** per RESEARCH.md Pitfall 2 / Environment Availability, a non-vector `RecipeModel.findMany({ source: "imported", "createdBy.userId": userId })` "my imports" list query, bypassing `hybridSearch` entirely — simpler, but does not satisfy EXT-04's "enters hybrid I/E/T/N search" literally. Flag as an explicit planner decision, not a silent shortcut.

---

### `src/infra/video/pipeline.ts` (modified — `extracting` stage)

**Analog:** itself — replace the stub in place (read lines 180-224 directly).

**Current stub to replace** (lines 201-203):
```typescript
// 4. Extracting — STUB nesta fase (Fase 2 substitui por extração LLM real).
await updateImportJobStatus(id, { status: "extracting" });
// no-op intencional.
```

**Surrounding status-transition idiom to mirror** (lines 126-127, 158-159, 189-199, 214-215) — every stage sets status BEFORE doing its work, and the next `updateImportJobStatus` call patches in the results of the just-completed stage:
```typescript
await updateImportJobStatus(id, { status: "downloading" });
// ...work...
await updateImportJobStatus(id, {
  ...(transcript !== undefined && { transcript }),
  transcriptSource,
  noSpeechDetected,
  ...
});
```

**New extracting stage should follow this same two-call shape:**
```typescript
// 4. Extracting — Fase 2: extração LLM real (transcript+caption → receita estruturada).
await updateImportJobStatus(id, { status: "extracting" });

const extracted = await extractImportedRecipe({
  transcript: job.transcript,
  caption: job.caption,
  noSpeechDetected: job.noSpeechDetected ?? false,
});
const confidence = computeConfidence(extracted, { noSpeechDetected: job.noSpeechDetected ?? false });

const recipe = await persistExtractedRecipe(/* mapped input */, extracted, {
  source: "imported",
  visibility: "private",
  importJobId: id,
  createdBy: [{ userId: job.userId, username: /* resolve or omit */ }],
});

await updateImportJobStatus(id, {
  status: "ready_for_review",
  recipeId: recipe._id,
  reviewRequired: confidence.requiresReview,
  confidenceScore: confidence.score,
});
```
Note: the existing `updateImportJobStatus(id, { status: "ready_for_review", keyframeUrl })` call at line 215 happens AFTER keyframe extraction (stage 5-6), which runs AFTER the (stubbed) extracting stage today. Since extraction must now produce `recipeId` before that final status write, the planner must decide whether to fold the `recipeId`/`reviewRequired` fields into that same final `updateImportJobStatus` call (merging stage 4's output forward) or write them immediately after stage 4 and let stage 6 just patch `keyframeUrl`. Either is consistent with the established "patch as you go" idiom — pick one and document it in the plan.

**Failure handling idiom to extend** (lines 91-104, `failJob` + the `try { } catch (err) { if (err instanceof SomeError) ... }` pattern seen at lines 180-186 for `TranscriptionError`): if `extractImportedRecipe` throws (e.g. `res.parsed_output` null), wrap the call in the same `try/catch` idiom already used for `TranscriptionError`, mapping to a new `ImportFailureReason` (e.g. `"extraction_failed"`) via `failJob(job, "extraction_failed", String(err))`.

---

### `src/modules/import/import-job.types.ts` / `import-job.repository.ts` (modified)

**Analog:** itself — extend in place (both read in full, 61 + 59 lines).

**Fields to add to `ImportJob` interface** (extend the block at lines 27-56 in `import-job.types.ts`), following the existing optional-field + inline comment style (e.g. `noSpeechDetected?: boolean; // D-06 — ...` at line 39):
```typescript
recipeId?: string; // setado após persistExtractedRecipe suceder (Fase 2)
reviewRequired?: boolean; // de computeConfidence — Fase 3 consome para UI
confidenceScore?: number; // 0..1, de computeConfidence — Fase 3 consome
```

**`ImportFailureReason` extension** (lines 16-25): add `| "extraction_failed"` following the exact one-per-line + trailing comment style used for `"transcription_failed"` (line 23).

**Repository — no new methods needed.** `updateImportJobStatus(jobId, patch: Partial<ImportJob>)` (lines 51-59 of `import-job.repository.ts`) already accepts an arbitrary partial patch — the new `recipeId`/`reviewRequired`/`confidenceScore` fields flow through it unchanged once added to the `ImportJob` type. Do not add a dedicated `setRecipeId()`-style method; that would break from the established single-generic-patch-function convention this repository already uses for every stage transition.

---

## Shared Patterns

### Structured LLM Extraction (Claude + zod)
**Source:** `src/modules/recipes/recipe.extraction.ts` (whole file, 134 lines)
**Apply to:** `import.extraction.ts`
```typescript
const res = await anthropic.messages.parse({
  model: EXTRACTION_MODEL,
  max_tokens: 4000,
  output_config: { format: zodOutputFormat(SomeSchema), ...effortOption("low") },
  system: SOME_SYSTEM_PROMPT,
  messages: [{ role: "user" as const, content: someBuilder(input) }],
});
if (!res.parsed_output) throw new Error(`Extração falhou (stop_reason=${res.stop_reason})...`);
return res.parsed_output;
```

### Model Selection / Effort Handling
**Source:** `src/infra/llm/anthropic.client.ts` (whole file, 19 lines)
```typescript
export const EXTRACTION_MODEL = env.anthropic.model; // resolves to claude-haiku-4-5-20251001 by default — NOT opus (Pitfall 1, corrects CONTEXT.md's [ASSUMED] claim)

export function effortOption(level: Effort): { effort: Effort } | Record<string, never> {
  return /haiku|sonnet-4-5/.test(EXTRACTION_MODEL) ? {} : { effort: level };
}
```
**Apply to:** any new extraction model constant. Per D-15 (locked: Claude Sonnet for import extraction), if a dedicated env var is introduced (e.g. `IMPORT_EXTRACTION_MODEL`), define it the same way (`env.anthropic.importModel ?? env.anthropic.model` fallback) and reuse `effortOption()` unchanged — it already regexes on whatever model string is passed via `EXTRACTION_MODEL`'s module scope, so a parametrized version (`effortOption(level, model)`) may be needed if the import model differs from the catalog's `EXTRACTION_MODEL`. Flag this as a small required refactor: `effortOption` currently closes over the module-level `EXTRACTION_MODEL` constant, not a parameter — check `src/config/env.ts` for the existing `anthropic.model` config shape before adding a sibling env var.

### Persistence Pipeline (canonicalize → embed → insert)
**Source:** `src/modules/recipes/recipe.ingestion.ts`, `persistExtractedRecipe` (lines 82-145)
**Apply to:** the import pipeline stage in `pipeline.ts` — call this function unchanged (extended only via `IngestOptions`), never duplicate the canonicalization or embedding loops.

### Owner-Scoped Query (IDOR-safe single-filter pattern)
**Source:** `src/modules/import/import-job.repository.ts`, `getImportJob` (lines 34-44)
**Apply to:** any new/modified `recipe.repository.ts` function that must scope private-imported recipes to their owner (`hybridSearch` filter, and `getRecipeById` if extended) — always fold `userId`/`ownerId` into the SAME Mongo query filter, never fetch-then-compare in application code.

### Status-Transition Patch Idiom (pipeline stages)
**Source:** `src/infra/video/pipeline.ts` (whole file, 225 lines) — every stage: `await updateImportJobStatus(id, { status: "..." })` before work, then a follow-up patch call with results.
**Apply to:** the new `extracting` stage — same two-call shape, same `updateImportJobStatus(jobId, patch: Partial<ImportJob>)` generic-patch repository function, no new dedicated setter methods.

### Optional-Field Conditional Spread (Recipe/ImportJob mutation calls)
**Source:** seen throughout `recipe.ingestion.ts` (lines 100-101, 132-136) and `pipeline.ts` (lines 190-198) — `...(value !== undefined && { field: value })`
**Apply to:** every new optional field added to `Recipe`/`ImportJob` inserts/updates (`visibility`, `importJobId`, `recipeId`, `reviewRequired`, `confidenceScore`, `grounding`) — never write `field: value ?? undefined` (mongoat/BSON schema rejects explicit `undefined` differently than an absent key in some paths — see Mongoat gotchas project note); always use the conditional-spread idiom.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/modules/import/import.confidence.ts` | utility (pure) | transform | No existing pure confidence/scoring function in the codebase — RESEARCH.md's Pattern 3 draft is the closest thing to an analog (already codebase-styled); use it directly as the implementation starting point rather than searching further |
| `src/modules/import/__fixtures__/*` | test fixtures | batch/data | No fixtures directory exists anywhere in the repo today (confirmed no `__fixtures__` dirs found under `src/modules/`); structure freely, following Vitest conventions already used in `*.test.ts` files elsewhere (not analyzed in this pass — planner/executor should check an existing `*.test.ts` for assertion style when writing `import.confidence.test.ts`) |

## Metadata

**Analog search scope:** `src/modules/recipes/`, `src/modules/ingredients/`, `src/modules/import/`, `src/infra/embeddings/`, `src/infra/llm/`, `src/infra/video/`
**Files scanned:** 11 (all read in full or via targeted offset/limit reads; no file exceeded 500 lines, so no file required Grep-first triage)
**Pattern extraction date:** 2026-07-01
