<!-- refreshed: 2026-07-01 -->
# Architecture

**Analysis Date:** 2026-07-01

## System Overview

```text
┌─────────────────────────────────────────────────────────────┐
│                      Frontend (Next.js)                      │
│            `web/app`, `web/components`, `web/lib`            │
│  UI Routes: /(main), /(auth), /(setup), /(cook)             │
│  API Routes: api/suggest, api/mealplan, api/billing         │
└────────┬──────────────────────────────────────────────────┬──┘
         │ HTTP (Bearer token via Clerk)                    │
         │ POST /api/v1/* (search, recipes, favorites, etc) │
         ▼                                                    ▼
┌─────────────────────────────────────────────────────────────┐
│              API Server (Fastify + Mongoat ODM)              │
│              `src/app.ts`, `src/server.ts`                   │
│  Plugins: authRoutes, searchRoutes, recipeRoutes, etc       │
└────────┬──────────────────────────────────────────────────┬──┘
         │ Domains/Modules                                  │
         ├─ search → embeddings (Voyage AI)                 │
         ├─ recipes → LLM adapt (Claude)                    │
         ├─ billing → webhooks (Mercado Pago)               │
         ├─ ingredients → canonicalization                  │
         ├─ favorites, likes, ratings, pantry, mealplan     │
         └─ usage → quota tracking                          │
         │                                                   │
         ▼                                                    ▼
┌──────────────────────────────┬──────────────────────────────┐
│     MongoDB (Mongoat)         │  AWS Services                │
│  `src/infra/database`         │  • Bedrock (image gen)       │
│  Collections:                 │  • S3 + CloudFront (CDN)     │
│  - recipes                    │  • SQS (ingest queue)        │
│  - ingredients                │  • Voyage AI (embeddings)    │
│  - favorites, ratings, etc    │  • Clerk (auth provider)     │
│  Search indexes:              │  • Mercado Pago (payments)   │
│  - Vector + Hybrid            │                              │
└──────────────────────────────┴──────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| App (Fastify) | HTTP server, routing, middleware (auth, CORS, rate limit) | `src/app.ts` |
| Server Bootstrap | DB connection, module registration, startup/shutdown | `src/server.ts` |
| Config | Environment validation, secrets loading | `src/config/env.ts` |
| Database | MongoDB connection (Mongoat), collections setup | `src/infra/database/connection.ts` |
| Models | ODM schema definitions (Recipe, Ingredient, Favorite, etc) | `src/modules/*/model.ts` |
| Repositories | Query builders, aggregations, search logic | `src/modules/*/repository.ts` |
| Routes | HTTP endpoints, request/response schemas | `src/modules/*/routes.ts` |
| Services | Business logic (search, embeddings, LLM calls) | `src/modules/search/search.service.ts` |
| Embeddings | Voyage API client for semantic search | `src/infra/embeddings/voyage.client.ts` |
| LLM | Claude Anthropic SDK for recipe adaptation | `src/infra/llm/anthropic.client.ts` |
| Image Gen | Bedrock (prod) or fake PNG (dev local) | `src/infra/images/` |
| Image Store | S3 bucket + CloudFront CDN | `src/infra/images/s3.image-store.ts` |
| Queue | SQS ingest jobs (async recipe processing) | `src/infra/queue/ingest-queue.ts` |
| Frontend | Next.js app router, React components, server actions | `web/app`, `web/components` |
| Frontend API Client | Server-only fetch wrapper (auth headers) | `web/lib/api.ts` |

## Pattern Overview

**Overall:** Modular domain-driven design with infrastructure abstraction.

**Key Characteristics:**
- **Domain modules** in `src/modules/` (auth, search, recipes, billing, etc) — each has routes, models, repository, service
- **Infrastructure** in `src/infra/` isolated from business logic (database, embeddings, LLM, images, queue)
- **Layered**: HTTP → Routes → Service → Repository → Model → DB
- **API-first**: All business logic accessed via REST endpoints from frontend or internal callers
- **Configuration by environment**: Gradle-style env validation; features toggle (Clerk, SQS, images) based on env vars

## Layers

**HTTP / Routing:**
- Purpose: Accept and route requests, validate schemas, enforce auth guards
- Location: `src/app.ts`, `src/modules/*/routes.ts`
- Contains: Fastify handlers, TypeBox schema definitions, guard middleware
- Depends on: Service layer, auth guards, models for validation
- Used by: Frontend, Lambda handlers, internal scripts

**Service / Business Logic:**
- Purpose: Implement domain workflows (search recipes, adapt recipes, manage billing)
- Location: `src/modules/*/service.ts`, `src/modules/*/service/`
- Contains: Orchestration of repositories, external API calls (Voyage, Anthropic)
- Depends on: Repository layer, infra clients (embeddings, LLM)
- Used by: Routes, scripts, Lambda handlers

**Repository / Data Access:**
- Purpose: Query and mutate MongoDB collections, build aggregation pipelines
- Location: `src/modules/*/repository.ts`
- Contains: Find/update/insert, filters, scoring logic (hybrid search)
- Depends on: Models, MongoDB client (Mongoat)
- Used by: Services

**Models / Schema:**
- Purpose: Define MongoDB schemas, validators, static methods
- Location: `src/modules/*/model.ts`
- Contains: BSON schema, required/optional fields, nested objects
- Depends on: Mongoat ODM
- Used by: Repositories, routes (validation)

**Infrastructure:**
- Purpose: External service clients and adapters
- Location: `src/infra/`
- Contains:
  - `database/` — MongoDB client, connection, indexes
  - `embeddings/` — Voyage API wrapper
  - `llm/` — Anthropic Claude SDK wrapper
  - `images/` — Bedrock, S3, fake generator (strategy pattern)
  - `queue/` — SQS job queueing
  - `dataset/` — CSV loader, dataset utilities
- Depends on: AWS SDK, Voyage SDK, Anthropic SDK, external APIs
- Used by: Services, repositories

**Frontend:**
- Purpose: User-facing React UI, routing, client-side state
- Location: `web/app/`, `web/components/`, `web/lib/`
- Contains: Next.js App Router pages, components, utilities
- Depends on: Next.js, Clerk, API client
- Used by: Browser

## Data Flow

### Primary Request Path: Search Recipes

1. **User inputs** ingredients/criteria in frontend → `web/app/(main)/buscar/page.tsx`
2. **POST /api/v1/search** via `web/lib/api.ts` → `src/modules/search/search.routes.ts`
3. **Service layer** (`search.service.ts`):
   - Calls `resolveUserIngredients()` → canonicalizes input
   - Calls `embeddings.embedQuery()` → Voyage AI semantic vector
   - Calls `hybridSearch()` → executes MongoDB aggregation
4. **Repository** (`recipe.repository.ts`):
   - Builds aggregation pipeline with text search, vector search, filters
   - Scores by I/E/T/N dimensions (ingredient match, equipment, time, nutrition)
   - Returns top K results
5. **Response** → Results displayed in `web/app/(main)/results/page.tsx`

### Adapt Recipe Flow

1. **User selects recipe + equipment/time** → `web/app/(main)/recipe/[id]/page.tsx`
2. **POST /api/v1/recipes/adapt** → `src/modules/recipes/recipe.routes.ts`
3. **Auth guard** checks daily quota via `consumeDailyAdaptQuota()`
4. **Service** (`recipe.generation.ts`):
   - Calls Claude API with recipe + constraints
   - Returns adapted recipe (ingredients, steps, nutrition)
5. **Save as variant** → `recipe.repository.ts` creates new Recipe doc with `parentRecipeId`
6. **Response** → Variant shown in UI; user can rate/approve

### Ingest Recipe (Async via Lambda)

1. **User submits recipe** → API route calls `enqueueIngestJob()` → SQS message
2. **Lambda function** (`src/lambda/ingest-handler.ts`) polls SQS
3. **Service** (`recipe.ingestion.ts`):
   - Validates ingredients (calls Claude to parse raw ingredient strings)
   - Generates embedding via Voyage
   - Creates thumbnail via Bedrock or fake generator
   - Builds Recipe document
4. **Save** → `RecipeModel.create()` → MongoDB
5. **Index** → Automatically indexed in vector search

### Billing / PRO Subscription

1. **User clicks "Subscribe"** → `web/app/(main)/perfil/page.tsx`
2. **POST /api/v1/billing/subscribe** → creates Mercado Pago checkout session
3. **User completes payment** → MP webhook to backend (`POST /api/v1/billing/webhook`)
4. **Service** creates Entitlement doc with expiration
5. **Access check** via `isProUser()` gates features (adapt quota, mealplan generation)

**State Management:**
- **User auth**: Clerk stores session, frontend reads token, passes to API
- **Pantry**: `localStorage` on frontend; synced to `PantryModel` in MongoDB (user's ingredient inventory)
- **Meal plan**: Stored in `MealplanModel`; frontend caches in `planStorage`
- **Pro status**: Checked per-request via `EntitlementModel.findOne(userId)`

## Key Abstractions

**Recipe (Multi-Source):**
- Purpose: Unified recipe document with source tracking
- Examples: `src/modules/recipes/recipe.model.ts`, `recipe.types.ts`
- Pattern: Single collection, `source` field distinguishes curated, generated, variant, user, etc
- Variants linked via `parentRecipeId`

**Hybrid Search:**
- Purpose: Combine semantic (embedding) + filtering (I/E/T/N) in one aggregation
- Examples: `src/modules/recipes/recipe.repository.ts` (hybridSearch, DimensionWeights)
- Pattern: MongoDB aggregation with `$search` (vector), `$match` (filters), scoring pipeline

**Embeddings Port:**
- Purpose: Abstract embedding service (Voyage currently, pluggable)
- Examples: `src/infra/embeddings/embeddings.port.ts`, `voyage.client.ts`
- Pattern: Interface + implementation, service calls `.embedQuery()` without knowing provider

**Image Generation Strategy:**
- Purpose: Swap generators (Bedrock prod, fake dev local, future improvements)
- Examples: `src/infra/images/bedrock.image-generator.ts`, `fake.image-generator.ts`
- Pattern: `ImageGenerator` interface; `imageService` picks strategy based on config

**Ingredient Canonicalization:**
- Purpose: Map user-typed ingredient strings to canonical IDs
- Examples: `src/modules/ingredients/ingredient.service.ts`, `ingredient.substitutions.ts`
- Pattern: Embedding + fuzzy match against ingredient db; expand with substitutes

## Entry Points

**HTTP Server:**
- Location: `src/server.ts`
- Triggers: `npm run dev` (dev) or `npm start` (prod)
- Responsibilities:
  1. Connect to MongoDB
  2. Register Mongoat models (via `src/modules/index.ts`)
  3. Build Fastify app (routing, middleware)
  4. Listen on port 3000

**Lambda Handler (Ingest Jobs):**
- Location: `src/lambda/ingest-handler.ts`
- Triggers: AWS SQS event (recipe submission)
- Responsibilities: Poll SQS, deserialize message, call ingestion service

**Batch Scripts:**
- Location: `src/scripts/`
- Examples:
  - `ingest-dataset.ts` — bulk-load recipes from CSV
  - `reconcile-ingredients.ts` — dedupe ingredient db
  - `migrate-*.ts` — one-time data migrations
  - `seed-recipes.ts` — sample data for dev

**Frontend:**
- Location: `web/app/layout.tsx`
- Triggers: `npm run dev` (dev) or `npm start` (prod)
- Responsibilities:
  1. ClerkProvider setup (optional if env var set)
  2. Layout wrapper, theme initialization
  3. App Router (dynamic routing)

## Architectural Constraints

- **Threading:** Node.js single-threaded event loop; Long operations (LLM calls, image gen) can block server. Handled via SQS async jobs for ingest.
- **Global state:** Single `Database` instance (Mongoat singleton); models stateless.
- **Circular imports:** Mongoat models must import via `@/modules/index.ts` to ensure Database initialized first; server.ts enforces order.
- **Embedding consistency:** All recipe ingestion uses same Voyage model (embedding reproducibility). Change requires re-embedding.
- **Frontend auth:** Token passed as `Authorization: Bearer` header; backend validates via Clerk SDK. Anonymous requests allowed (returns 401 on protected endpoints).
- **Rate limiting:** 120 req/min global; each search costs Voyage call, each adapt costs Claude call. Quota gates prevent abuse.

## Anti-Patterns

### Querying RecipeModel Directly in Routes

**What happens:** Routes sometimes call `RecipeModel.findOne()` instead of repository methods.

**Why it's wrong:** Bypasses repository layer, duplicates query logic, harder to refactor search strategy.

**Do this instead:** Add method to `recipe.repository.ts` (e.g., `getRecipeById()`) and call from route. See `src/modules/recipes/recipe.routes.ts` line 17-24 — already does this correctly.

### Missing Type Safety in Search Parameters

**What happens:** `HybridSearchParams` interface has optional fields; aggregation pipeline doesn't validate all combinations.

**Why it's wrong:** Invalid combinations silently return empty results instead of failing fast.

**Do this instead:** Add validation in `hybridSearch()` before pipeline — e.g., check if baseIds provided without core ingredient flag, warn/error.

### Image URLs Hardcoded in Responses

**What happens:** Some routes hardcode placeholder URL instead of calling `ensureThumbnail()`.

**Why it's wrong:** Variant recipes missing thumbnails; inconsistent UX.

**Do this instead:** Always call `ensureThumbnail()` before returning recipe. See `src/modules/recipes/recipe.routes.ts` lines 80-90.

## Error Handling

**Strategy:** Fastify's `@fastify/sensible` provides error utilities. Routes catch errors and return HTTP codes.

**Patterns:**
- `throw app.httpErrors.notFound()` → 404
- `throw app.httpErrors.unauthorized()` → 401 (missing/invalid auth)
- `throw app.httpErrors.paymentRequired()` → 402 (quota exceeded, PRO gated feature)
- `throw new Error(msg)` → 500 (uncaught, Fastify logs)

For async jobs (Lambda), errors written to CloudWatch logs; no user-facing response (fire-and-forget).

## Cross-Cutting Concerns

**Logging:** Fastify's built-in logger via `app.log.info()`, `app.log.error()`. Logs to stdout (CloudWatch in prod).

**Validation:** TypeBox schemas on all routes. Invalid request → 400 with validation errors. Models also validate BSON schema on save.

**Authentication:** Clerk integration optional (`env.clerk.enabled`). If disabled, `getUserId()` returns null, routes treat as anonymous. Protected routes check and return 401.

---

*Architecture analysis: 2026-07-01*
