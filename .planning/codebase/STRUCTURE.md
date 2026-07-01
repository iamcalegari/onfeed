# Codebase Structure

**Analysis Date:** 2026-07-01

## Directory Layout

```
claude/ (project root)
├── .claude/                    # Claude Code configuration
├── .github/                    # GitHub workflows/actions
├── .planning/                  # GSD milestone/phase tracking (created by tools)
├── data/                       # Development data, fixtures
├── dist/                       # Build output (TypeScript compiled to JS)
├── docs/                       # Documentation
├── infra/                      # Infrastructure scripts (deploy, SSM setup)
├── node_modules/               # Dependencies
├── src/                        # Backend source code (Node.js + Fastify)
│   ├── app.ts                  # Fastify app factory, plugin registration
│   ├── server.ts               # Entry point, DB connection, startup
│   ├── config/
│   │   └── env.ts              # Environment validation
│   ├── infra/                  # Infrastructure layer (abstract away external services)
│   │   ├── database/
│   │   │   ├── connection.ts    # Mongoat singleton, connect/disconnect
│   │   │   ├── setup.ts         # Collections, indexes setup
│   │   │   ├── search-indexes.ts # Vector/text index definitions
│   │   │   └── seed-ingredients.ts # Bootstrap canonical ingredients
│   │   ├── embeddings/
│   │   │   ├── embeddings.port.ts # Interface/contract
│   │   │   └── voyage.client.ts   # Voyage API implementation
│   │   ├── llm/
│   │   │   └── anthropic.client.ts # Claude SDK wrapper
│   │   ├── images/
│   │   │   ├── image.service.ts    # Facade (pick generator/store strategy)
│   │   │   ├── bedrock.image-generator.ts # Prod: Bedrock Stability text-to-image
│   │   │   ├── fake.image-generator.ts    # Dev local: return placeholder PNG
│   │   │   └── s3.image-store.ts   # Upload to S3, return CloudFront URL
│   │   ├── queue/
│   │   │   ├── ingest-queue.ts     # SQS send message
│   │   │   ├── ingest-job.types.ts # Job message shape
│   │   │   └── sqs.client.ts       # AWS SQS SDK wrapper
│   │   ├── dataset/
│   │   │   ├── csv-loader.ts       # Parse CSV recipes
│   │   │   ├── dataset.adapter.ts  # Adapt dataset format to internal
│   │   │   └── interactions-ranker.ts # Rank recipes by popularity
│   ├── modules/                # Business domains (DDD)
│   │   ├── index.ts            # Model registration (import side effects)
│   │   ├── auth/
│   │   │   ├── auth.routes.ts   # GET /me, logout routes
│   │   │   └── auth.guard.ts    # requireAuth(), getUserId() middleware
│   │   ├── search/
│   │   │   ├── search.routes.ts # POST /search endpoint
│   │   │   ├── search.service.ts # Core search logic (embedding + hybrid)
│   │   │   └── search.dto.ts    # Request/response schemas (TypeBox)
│   │   ├── recipes/
│   │   │   ├── recipe.model.ts   # MongoDB schema + validators
│   │   │   ├── recipe.types.ts   # TypeScript interfaces
│   │   │   ├── recipe.routes.ts  # GET/POST/PUT routes
│   │   │   ├── recipe.repository.ts # Queries: getById, search, hybrid
│   │   │   ├── recipe.generation.ts # Claude API: adapt, generation prompts
│   │   │   ├── recipe.ingestion.ts # Parse raw → Recipe doc
│   │   │   ├── recipe.extraction.ts # Extract metadata (Claude)
│   │   │   ├── recipe.batch-ingestion.ts # Bulk ingest from dataset
│   │   │   ├── recipe.translation.ts # Translate to English
│   │   │   └── README.md # Recipe module walkthrough
│   │   ├── ingredients/
│   │   │   ├── ingredient.model.ts # Canonical ingredient schema
│   │   │   ├── ingredient.types.ts # Ingredient, CanonicalIngredient types
│   │   │   ├── ingredient.routes.ts # GET /ingredients, POST canonicalize
│   │   │   ├── ingredient.repository.ts # Find, update, vector search
│   │   │   ├── ingredient.service.ts # resolveUserIngredients(), expansions
│   │   │   └── ingredient.substitutions.ts # Find substitutes by embedding
│   │   ├── favorites/
│   │   │   ├── favorite.model.ts
│   │   │   ├── favorite.routes.ts # POST/DELETE /favorites
│   │   │   └── favorite.repository.ts
│   │   ├── likes/
│   │   │   ├── like.model.ts
│   │   │   ├── like.routes.ts # POST /recipes/{id}/like
│   │   │   └── like.repository.ts
│   │   ├── ratings/
│   │   │   ├── rating.model.ts
│   │   │   ├── rating.routes.ts # POST /recipes/{id}/rate
│   │   │   └── rating.repository.ts
│   │   ├── pantry/
│   │   │   ├── pantry.model.ts # User's ingredient inventory
│   │   │   ├── pantry.routes.ts # GET/PUT /pantry
│   │   │   └── pantry.repository.ts
│   │   ├── mealplan/
│   │   │   ├── mealplan.model.ts # Weekly plan w/ recipes
│   │   │   ├── mealplan.types.ts
│   │   │   ├── mealplan.routes.ts # POST /mealplan/generate
│   │   │   ├── mealplan.repository.ts
│   │   │   └── mealplan.generation.ts # Claude: plan by nutritional goals
│   │   ├── billing/
│   │   │   ├── entitlement.model.ts # PRO subscription
│   │   │   ├── entitlement.repository.ts # Check isProUser()
│   │   │   ├── billing.routes.ts # POST /billing/subscribe, webhook
│   │   │   └── mercadopago.ts # MP Preapproval API wrapper
│   │   └── usage/
│   │       ├── usage.model.ts # Track daily adapt quota
│   │       └── usage.repository.ts # consumeDailyAdaptQuota()
│   ├── lambda/
│   │   └── ingest-handler.ts # AWS Lambda entry, SQS polling
│   └── scripts/                # One-off CLI tools
│       ├── db-status.ts        # Health check, count docs
│       ├── db-prepare.ts       # setup.ts bootstrap wrapper
│       ├── seed-recipes.ts     # Insert sample recipes
│       ├── ingest-dataset.ts   # Bulk CSV ingestion
│       ├── reconcile-ingredients.ts # Dedupe, merge ingredients
│       ├── reconcile-pendings-llm.ts # Validate generated recipes
│       ├── migrate-ingredient-quantities.ts # Schema updates
│       ├── migrate-drinks-occasion.ts # Add drinks to occasions
│       ├── migrate-thumbnail-urls.ts # Update image URLs
│       ├── infer-dietary-tags.ts # Classify recipes (vegan, gluten-free, etc)
│       └── grant-pro.ts        # Manual grant PRO status
├── web/                        # Frontend source code (Next.js)
│   ├── app/                    # App Router (file-based routing)
│   │   ├── manifest.ts         # PWA manifest
│   │   ├── layout.tsx          # Root layout, Clerk provider, theme
│   │   ├── actions.ts          # Server actions (form handlers)
│   │   ├── globals.css         # Tailwind, global styles
│   │   ├── api/                # API routes (RSCs calling backend)
│   │   │   ├── suggest/route.ts # GET /api/suggest (ingredient autocomplete)
│   │   │   ├── pantry/route.ts # GET /api/pantry
│   │   │   ├── me/route.ts     # GET /api/me (session info)
│   │   │   ├── mealplan/route.ts # GET /api/mealplan
│   │   │   └── billing/subscribe/route.ts # POST /api/billing/subscribe
│   │   ├── (auth)/             # Clerk pages: sign-in, sign-up
│   │   │   ├── sign-in/[[...sign-in]]/page.tsx
│   │   │   └── sign-up/[[...sign-up]]/page.tsx
│   │   ├── (main)/             # App shell (logged-in users)
│   │   │   ├── layout.tsx       # TopBar, BottomNav wrapper
│   │   │   ├── page.tsx         # Redirect to /hoje
│   │   │   ├── hoje/page.tsx    # Daily recommendations (home feed)
│   │   │   ├── buscar/page.tsx  # Search form + filters
│   │   │   ├── results/page.tsx # Search results infinite list
│   │   │   ├── recipe/[id]/page.tsx # Recipe detail, rating/favorite
│   │   │   ├── recipe/[id]/variants/page.tsx # Variant history
│   │   │   ├── favorites/page.tsx # Saved recipes
│   │   │   ├── pantry/page.tsx  # Ingredient inventory manager
│   │   │   ├── plano/page.tsx   # Meal plan view/edit
│   │   │   ├── compras/page.tsx # Shopping list (pantry gaps)
│   │   │   ├── perfil/page.tsx  # Settings, PRO subscribe, logout
│   │   │   ├── progresso/page.tsx # Nutrition stats, progress tracker
│   │   │   ├── settings/page.tsx # Theme, preferences
│   │   ├── (setup)/             # Onboarding (new users)
│   │   │   └── onboarding/page.tsx
│   │   └── (cook)/              # Cooking (in-progress state)
│   │       └── cook/[id]/page.tsx # Recipe execution (timer, steps)
│   ├── components/             # Reusable React components
│   │   ├── Header.tsx          # App header with nav
│   │   ├── TopBar.tsx          # Header bar
│   │   ├── BottomNav.tsx       # Mobile bottom nav
│   │   ├── SearchForm.tsx      # Ingredient search input
│   │   ├── ResultCard.tsx      # Recipe card (search result)
│   │   ├── ResultsView.tsx     # Infinite list of results
│   │   ├── RecipeThumbnail.tsx # Image lazy load
│   │   ├── LazyThumbnail.tsx   # Lazy img wrapper
│   │   ├── ScoreBars.tsx       # I/E/T/N visualization
│   │   ├── MatchScore.tsx      # Score badge
│   │   ├── MacroRing.tsx       # Nutrition donut chart
│   │   ├── MacroLine.tsx       # Nutrition bar
│   │   ├── MacroPill.tsx       # Protein/carbs/fat pill badges
│   │   ├── NutritionBadge.tsx  # Dietary tag badge
│   │   ├── LikeButton.tsx      # Like/unlike interaction
│   │   ├── FavoriteButton.tsx  # Save recipe
│   │   ├── FavoritesList.tsx   # Saved recipes view
│   │   ├── RatingForm.tsx      # Rate recipe (stars)
│   │   ├── CookRating.tsx      # In-cook rating feedback
│   │   ├── CookMode.tsx        # Timer + steps display
│   │   ├── StepTimer.tsx       # Cooking timer
│   │   ├── IngredientsSection.tsx # Ingredient list with scaler
│   │   ├── PantryManager.tsx   # Pantry UI (add/remove)
│   │   ├── SwipeDeck.tsx       # Swipe through recipes
│   │   ├── InfiniteList.tsx    # Virtualized infinite scroll
│   │   ├── AdaptButton.tsx     # "Adapt for me" button
│   │   ├── AddToPlanButton.tsx # Add to meal plan
│   │   ├── ShareButton.tsx     # Share recipe link
│   │   ├── SessionRefresher.tsx # Refresh Clerk token
│   │   ├── Toaster.tsx         # Toast notifications
│   │   ├── BackButton.tsx      # Navigation back
│   │   ├── Logo.tsx            # Brand logo
│   │   ├── LogoLoader.tsx      # Splash screen
│   │   └── LogMealButton.tsx   # Log consumed meal
│   ├── lib/                    # Utilities (not React-specific)
│   │   ├── api.ts              # Fetch wrapper, auth headers
│   │   ├── types.ts            # Shared TypeScript types
│   │   ├── format.ts           # String formatting (numbers, time)
│   │   ├── settings.ts         # Theme, localStorage keys
│   │   ├── searchHistory.ts    # Cache recent searches
│   │   ├── proStorage.ts       # PRO status cache
│   │   ├── planStorage.ts      # Meal plan localStorage
│   │   ├── weightStorage.ts    # Serving weight cache
│   │   ├── nutritionPlan.ts    # Meal plan generation (client-side helper)
│   │   ├── toast.ts            # Toast notification system
│   │   ├── useLazyThumbnail.ts # Hook: lazy load images
│   │   ├── usePro.ts           # Hook: check PRO status
│   │   └── middleware.ts       # Next.js middleware (auth checks)
├── brainstorm/                 # Ideas, non-code docs
├── docker-compose.yml          # LocalStack/MinIO for dev S3
├── Dockerfile                  # Production image
├── .env.example                # Template (no secrets)
├── .env                        # Local dev (secrets — .gitignored)
├── tsconfig.json               # TypeScript (root config)
├── tsconfig.build.json         # Build-only config (excludes dev)
├── package.json                # Root dependencies + scripts
├── package-lock.json           # Lock file
├── README.md                   # Project overview
├── DEPLOY.md                   # Deployment guide
└── render.yaml                 # Render.com deployment config
```

## Directory Purposes

**src/**
- Purpose: Backend server code (Node.js + Fastify)
- Contains: Routes, models, services, infrastructure clients
- Key files: `server.ts` (entry), `app.ts` (routing), `modules/*/` (domains)

**src/infra/**
- Purpose: Abstract external services (DB, AI, cloud)
- Contains: Client wrappers, adapters, strategy implementations
- Key files: `database/connection.ts`, `embeddings/`, `images/`, `queue/`

**src/modules/**
- Purpose: Business domains (DDD structure)
- Contains: Routes, models, repositories, services per domain
- Imports flow: routes → service → repository → model

**web/app/**
- Purpose: Next.js App Router pages and layouts
- Contains: Page components (server), API routes, auth pages, setup, main app
- Key files: `layout.tsx` (root), `(main)/layout.tsx` (app shell), page.tsx files

**web/components/**
- Purpose: Reusable React components
- Contains: UI building blocks (buttons, cards, forms, lists)
- Pattern: Functional components with TypeScript props

**web/lib/**
- Purpose: Utilities and client-side logic
- Contains: API client, hooks, storage helpers, formatting
- Key files: `api.ts` (fetch wrapper), `types.ts` (shared types)

## Key File Locations

**Entry Points:**
- Backend: `src/server.ts` (connects DB, starts Fastify)
- Frontend: `web/app/layout.tsx` (root, Clerk provider, theme)
- Lambda: `src/lambda/ingest-handler.ts` (AWS Lambda entry)

**Configuration:**
- Environment: `src/config/env.ts` (validated env vars)
- Database: `src/infra/database/` (connection, setup, indexes)
- Frontend Auth: Clerk env vars (NEXT_PUBLIC_CLERK_*, CLERK_SECRET_KEY)

**Core Logic:**
- Search: `src/modules/search/search.service.ts` (embedding + hybrid)
- Recipe Adapt: `src/modules/recipes/recipe.generation.ts` (Claude API)
- Billing: `src/modules/billing/` (Mercado Pago, entitlements)
- Ingredients: `src/modules/ingredients/ingredient.service.ts` (canonicalization)

**Testing:**
- Unit/integration test patterns: None currently enforced (framework not visible)
- Manual verification: Use `npm run dev` + frontend UI

**Build Output:**
- `dist/` — Compiled JavaScript (TypeScript → CommonJS)
- `web/.next/` — Next.js build (auto-generated)

## Naming Conventions

**Files:**
- `.model.ts` — Mongoat ODM schema definition
- `.types.ts` — TypeScript interfaces/types
- `.routes.ts` — Fastify plugin (HTTP endpoints)
- `.repository.ts` — Data access layer (queries)
- `.service.ts` — Business logic orchestration
- `.dto.ts` — TypeBox schemas (request/response validation)
- `.guard.ts` — Auth/middleware helpers

**Directories:**
- `src/modules/{domain}/` — One domain per directory (search, recipes, billing)
- `src/infra/{service}/` — One external service per directory (database, embeddings, images)
- `web/app/(layout)/{feature}` — One feature per route group

**Functions:**
- `camelCase` — Standard for all functions, variables
- `SCREAMING_SNAKE_CASE` — Constants, enum values
- Prefixes: `get*`, `find*` (queries), `create*`, `update*`, `delete*` (mutations)

**Types:**
- `PascalCase` — Interfaces, types, classes
- `TDescribe` — Domain-specific (`Recipe`, `Ingredient`, `Entitlement`)

## Where to Add New Code

**New Feature (Module):**
1. Create `src/modules/{feature}/` directory
2. Add files in order:
   - `{feature}.types.ts` — Domain types
   - `{feature}.model.ts` — Mongoat schema
   - `{feature}.repository.ts` — Queries
   - `{feature}.routes.ts` — HTTP endpoints
   - `{feature}.service.ts` — (optional) Business logic
3. Import model in `src/modules/index.ts`
4. Register routes in `src/app.ts`

**New API Endpoint:**
1. Add handler to existing `{module}.routes.ts` or create new
2. Define TypeBox schema (request body, response)
3. Call service/repository logic
4. Return typed response
5. Test via curl or frontend

**New Frontend Page:**
1. Create file in `web/app/` following App Router pattern
   - File location = URL route (e.g., `web/app/(main)/feature/page.tsx` → `/feature`)
2. Import components from `web/components/`
3. Import hooks/utilities from `web/lib/`
4. Use `web/lib/api.ts` to call backend endpoints
5. Use `web/lib/types.ts` for response types

**New Component:**
1. Create file in `web/components/{ComponentName}.tsx`
2. Export functional component with TypeScript props
3. Use Tailwind classes for styling
4. Import in pages or other components

**Utility/Helper:**
1. Infrastructure: `src/infra/{service}/` if external API/client
2. Shared logic: `src/modules/{feature}/service.ts` if business-specific
3. Frontend: `web/lib/{utility}.ts` if client-side (format, storage, hooks)

## Special Directories

**src/scripts/**
- Purpose: One-off CLI tools (not part of server)
- Generated: No
- Committed: Yes
- Run via: `npm run {command}` (see package.json)
- Examples: `ingest-dataset.ts`, `migrate-*.ts`, `reconcile-*.ts`

**src/lambda/**
- Purpose: AWS Lambda handler code
- Generated: No
- Committed: Yes
- Built separately: `npm run build:lambda` → `dist/lambda/handler.js`
- Zipped and deployed to AWS Lambda

**web/.next/**
- Purpose: Next.js build output
- Generated: Yes (by `next build`)
- Committed: No (in .gitignore)

**dist/**
- Purpose: TypeScript compiled output
- Generated: Yes (by `tsc`)
- Committed: No (in .gitignore)

**docs/**
- Purpose: Project documentation (architecture, API docs)
- Generated: No
- Committed: Yes
- Maintained by: Team

---

*Structure analysis: 2026-07-01*
