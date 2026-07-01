# Codebase Concerns

**Analysis Date:** 2026-07-01

## Tech Debt

### Complex MongoDB Aggregation Pipelines

**Area:** Recipe search and ranking

**Issue:** The hybrid search function in `src/modules/recipes/recipe.repository.ts` (496 lines) uses deeply nested MongoDB aggregation pipelines with multiple score dimensions (semantic, ingredients, equipment, time, nutrition, rating, occasions). The pipeline calculation is correct but extremely difficult to debug, test, or modify without deep MongoDB knowledge.

**Files:** 
- `src/modules/recipes/recipe.repository.ts` (lines 74-400+)

**Impact:** 
- Bugs in scoring logic are hard to detect (dimensions interdependent, numerous conditional branches)
- Performance tuning requires understanding the entire 300+ line pipeline
- Maintenance burden when adding new ranking dimensions

**Fix approach:** 
- Extract pipeline stages into smaller, named helper functions
- Add detailed comments to each stage explaining the calculation
- Consider breaking into a dedicated scoring module with unit tests
- Add integration tests with real search scenarios and assertion on result order

---

### Missing Test Suite

**Area:** Entire codebase

**Issue:** No test files exist. The project has no `.test.ts`, `.spec.ts`, or test runner configuration (no Jest, Vitest, etc.). Quality control relies entirely on manual testing.

**Files:** 
- Project-wide (no test files in `src/`, `web/`)

**Impact:** 
- Regression bugs go undetected until production
- Refactoring is risky (no safety net)
- Critical paths like recipe adaptation, ingredient canonicalization, and billing logic are untested
- No confidence for large rewrites or dependency updates
- High-complexity areas like the hybrid search algorithm have zero automated validation

**Fix approach:** 
1. Add test framework (Vitest recommended for Node.js/TS; Jest for web if needed)
2. Start with unit tests for critical modules:
   - Ingredient canonicalization (`src/modules/ingredients/ingredient.service.ts`)
   - Billing entitlement logic (`src/modules/billing/entitlement.repository.ts`)
   - Recipe generation/adaptation (`src/modules/recipes/recipe.generation.ts`)
3. Add integration tests for API routes (use Fastify test helpers)
4. Add E2E tests for user flows (search → favorite → adapt → plan)
5. Set minimum coverage threshold (>80% for critical paths)

---

### In-Memory Cache Without Eviction Strategy

**Area:** Billing entitlement

**Issue:** The cache in `src/modules/billing/entitlement.repository.ts` (lines 13-14) is a simple `Map<string, {...}>` with TTL-based expiry. In a multi-instance deployment (scaling), cache entries from different servers won't sync; upgrading a user's plan on Server A takes up to 60 seconds to reflect on Server B.

**Files:** 
- `src/modules/billing/entitlement.repository.ts` (line 14)

**Impact:** 
- Multi-instance servers have stale billing state for up to 60 seconds
- Users might consume PRO features after subscription expires but before cache TTL
- No distributed invalidation mechanism
- Memory leak risk if userId cardinality is high (cache never shrinks)

**Fix approach:** 
- Replace in-memory cache with Redis/Memcached if deploying multi-instance
- Alternatively: use SQS/SNS to publish invalidation events across instances
- Add cache size limit with LRU eviction
- Reduce TTL for critical operations like billing checks (to 10-15 seconds)
- Add monitoring/alerting for cache hit rate

---

## Known Bugs

### Bedrock Image Generation Fails in Regions Without Stability

**Issue:** Image generation via Bedrock is hardcoded to look for Stability models in `us-west-2`, but the S3 bucket might be in a different region. If Bedrock is not available in the bucket's region, thumbnail generation fails.

**Files:** 
- `src/config/env.ts` (line 114: `bedrockRegion` defaults to S3 region)
- `src/infra/images/bedrock.image-generator.ts`

**Trigger:** 
- Deploy to a region like `eu-west-1` or `ap-southeast-1`
- S3 bucket is in that region
- `BEDROCK_REGION` not explicitly set
- Bedrock falls back to S3 region, which doesn't have Stability models

**Workaround:** 
- Explicitly set `BEDROCK_REGION=us-west-2` even if S3 is elsewhere

**Fix approach:** 
- Add validation in `env.ts` to ensure `BEDROCK_REGION` is set to a region with Stability models if images are enabled
- Fail at startup with clear error message if misconfigured
- Document the region constraint in README

---

### Diet Tag Filtering May Exclude Valid Recipes

**Issue:** In `src/modules/recipes/recipe.repository.ts` (line 231-233), when dietary tags are provided, the filter uses `{ $all: dietaryTags }`, requiring a recipe to have ALL specified tags. If a recipe lacks any tag, it's excluded entirely.

**Files:** 
- `src/modules/recipes/recipe.repository.ts` (line 231: `dietaryTags: { $all: dietaryTags }`)

**Trigger:** 
- User searches with `dietaryTags: ["gluten_free", "dairy_free"]`
- Recipe has only `["gluten_free"]`
- Recipe is excluded even though it partially matches

**Workaround:** 
- Adjust filtering to `$in` instead (any match), but then the semantics change to "at least one"

**Fix approach:** 
- Clarify the intended behavior: do users want "all tags" or "at least one tag"?
- If "at least one": change to `{ $in: dietaryTags }`
- If "all": document the behavior and consider showing "partial match" recipes with lower score
- Add tests to verify tag filtering behavior

---

### Webhook Signature Validation Not Idempotent

**Issue:** The Mercado Pago webhook in `src/modules/billing/billing.routes.ts` (line 104+) does not check for duplicate notifications. If MP retries the webhook and the endpoint processes it twice, the user's plan could be set twice or a race condition could occur.

**Files:** 
- `src/modules/billing/billing.routes.ts` (line 104+: webhook handler)

**Trigger:** 
- MP sends webhook notification
- Endpoint processes it, sets PRO
- MP retries (timeout, network issue, internal retry)
- Same notification processes again

**Workaround:** 
- None; idempotency key not checked

**Fix approach:** 
- Store processed webhook request IDs in MongoDB
- Check if `x-request-id` header was already processed before `setPlan`
- Use upsert logic in `setPlan` to ensure it's safe to call multiple times with same params

---

## Security Considerations

### Anthropic API Key Exposed in Batch Processing Logs

**Area:** Batch ingestion

**Issue:** `src/modules/recipes/recipe.batch-ingestion.ts` and `src/modules/recipes/recipe.ingestion.ts` may log API responses or batch submission details to console. If an error occurs, the Anthropic API key or sensitive batch metadata could be logged and persisted in cloud logs.

**Files:** 
- `src/modules/recipes/recipe.batch-ingestion.ts`
- `src/modules/recipes/recipe.ingestion.ts` (line 189, 224: `console.log`)

**Current mitigation:** 
- Logs are sent to stdout, which should be restricted in production
- No explicit scrubbing of sensitive data

**Recommendations:** 
- Use a structured logger (e.g., Pino, Winston) with log redaction rules
- Never log full error objects; sanitize and log only necessary fields
- Add logging filters to redact API keys, bearer tokens, and PII
- Use environment-based log levels (DEBUG in dev, INFO/WARN in prod)

---

### Mercado Pago Webhook Secret Stored as Plain Text

**Area:** Billing

**Issue:** `env.mp.webhookSecret` is loaded from `MP_WEBHOOK_SECRET` environment variable and used directly in HMAC comparison. If the env var is logged or exposed, the webhook signature can be forged.

**Files:** 
- `src/config/env.ts` (line 63: `webhookSecret: optional("MP_WEBHOOK_SECRET", "")`)
- `src/modules/billing/mercadopago.ts` (line 92: HMAC calculation)

**Current mitigation:** 
- Timing-safe comparison using `crypto.timingSafeEqual`

**Recommendations:** 
- Ensure `MP_WEBHOOK_SECRET` is never logged (add to env var redaction rules)
- Store secret in AWS Secrets Manager and retrieve at runtime (not in git, not in docker env)
- Rotate webhook secret periodically
- Monitor webhook validation failures; alert if repeated failures occur

---

### Clerk Token Validation Assumes Valid Token

**Area:** Authentication

**Issue:** `src/modules/auth/auth.guard.ts` relies on Clerk's token validation via bearer header. If Clerk is misconfigured or the token verification fails silently, an attacker could potentially bypass authentication.

**Files:** 
- `src/modules/auth/auth.guard.ts`

**Current mitigation:** 
- Clerk plugin handles token parsing and validation
- Endpoints use `requireAuth` preHandler

**Recommendations:** 
- Add explicit token validation error handling and logging
- Monitor failed auth attempts and alert on patterns (brute force, invalid tokens)
- Ensure Clerk secret key is rotated periodically
- Test token expiry and refresh flows

---

### Image Upload URL Pre-Signing Not Restricted by User

**Area:** Image storage

**Issue:** `src/infra/images/image.service.ts` (line 105: `presignUpload`) generates pre-signed S3 URLs for upload. The presigned URL doesn't check if the caller owns the recipe, so a user could potentially generate upload URLs for recipes they don't own.

**Files:** 
- `src/infra/images/image.service.ts` (line 105)
- `src/modules/recipes/recipe.routes.ts` (line 123+: thumbnail endpoint)

**Current mitigation:** 
- Endpoint requires auth (Bearer token)
- URL path includes recipeId, preventing cross-recipe injection

**Recommendations:** 
- Add recipe ownership check before generating presigned URL
- Log all presigned URL generations with user ID and recipe ID
- Set short expiry time on presigned URLs (5-10 minutes max)
- Monitor for unusual presigned URL access patterns

---

## Performance Bottlenecks

### Vector Search Candidates Pool Sized Heuristically

**Area:** Recipe search

**Issue:** In `src/modules/recipes/recipe.repository.ts` (line 80-86), the `numCandidates` for `$vectorSearch` is set to `poolSize * 5` with `poolSize = Math.max(limit * 3, 50)`. This heuristic may not scale well if result limit increases or if the vector database grows.

**Files:** 
- `src/modules/recipes/recipe.repository.ts` (line 80-86)

**Impact:** 
- Searching for large result sets (e.g., `limit: 100`) pulls 1500 candidates from ANN, re-ranks all 1500
- High latency for large searches
- Wastes CPU on re-ranking irrelevant results

**Improvement path:** 
- Monitor search latency and candidate pool size in production
- Implement adaptive pooling based on result limit and dataset size
- Consider tiered search: fast (100 candidates), standard (200), deep (500)
- Add caching for common search queries (most-searched ingredients, dietary tags)
- Profile the re-ranking cost and optimize hotspots

---

### Ingredient Canonicalization Lookup in Batch

**Area:** Recipe ingestion

**Issue:** In `src/modules/recipes/recipe.ingestion.ts`, each recipe ingestion calls `resolveCanonicalForIngestion()` which queries the ingredient database for every ingredient in the recipe. In batch ingestion (100 recipes × 20 ingredients = 2000 lookups), this serializes many DB calls.

**Files:** 
- `src/modules/recipes/recipe.ingestion.ts` (line 73)
- `src/modules/ingredients/ingredient.service.ts` (line 30+)

**Impact:** 
- Batch ingestion is I/O-bound, not CPU-bound
- 100-recipe batch takes longer than necessary due to sequential ingredient lookups

**Improvement path:** 
- Batch ingredient lookups (collect all canonical IDs, do one multi-doc query)
- Cache ingredient canonical IDs in-process during batch
- Use Batches API for recipe extraction (already in place) and optimize persistence similarly

---

### Meal Plan Generation Queries Database Multiple Times

**Area:** Meal planning

**Issue:** In `src/modules/mealplan/mealplan.generation.ts` (line 136-145), building the shopping list queries ingredients by canonical ID. Earlier, the shortlist is fetched. If multiple queries hit the same ingredient collection, there's redundant I/O.

**Files:** 
- `src/modules/mealplan/mealplan.generation.ts` (line 136-145)

**Impact:** 
- Meal plan generation makes 2+ queries to ingredient collection
- Could be combined into single query

**Improvement path:** 
- Collect all canonical IDs first, then do single multi-doc lookup
- Cache ingredient displayName and category during plan generation
- Reuse results from recipe shortlist if ingredients are already populated

---

## Fragile Areas

### Recipe Extraction Depends on LLM Output Format

**Area:** Recipe ingestion

**Issue:** Recipe extraction in `src/modules/recipes/recipe.extraction.ts` uses structured output (Zod schema) and relies on LLM compliance with the schema. If the LLM fails to parse, the entire recipe ingestion fails with no fallback.

**Files:** 
- `src/modules/recipes/recipe.extraction.ts` (line 10-65)
- `src/modules/recipes/recipe.batch-ingestion.ts` (line 200+: polling)

**Why fragile:** 
- LLM output format occasionally diverges from schema (especially for "nullable" fields like nutrition, minutes)
- No partial ingestion (fail entirely if any field invalid)
- Batch API retries up to MAX_RETRIES, then gives up
- Recipes in `generated_pending` state forever if LLM keeps failing

**Safe modification:** 
- Add lenient parsing with fallbacks (e.g., null nutrition if invalid, default prepTime if missing)
- Log extraction failures with full payload for debugging
- Implement grace period: mark recipes as `generation_failed` after N retries, alert ops
- Test with adversarial inputs (malformed recipes, extreme nutrition values)

**Test coverage:** 
- No tests for extraction edge cases
- No tests for batch retry logic
- No tests for schema validation failures

---

### Ingredient Canonicalization Has No Conflict Resolution

**Area:** Ingredient management

**Issue:** In `src/modules/ingredients/ingredient.service.ts`, resolving a pending ingredient to a canonical ingredient assumes a 1:N mapping. If two different canonical ingredients are suggested (e.g., "sal" → "Salt" vs. "Sal de Fleur"), the system picks the first match without human review.

**Files:** 
- `src/modules/ingredients/ingredient.service.ts` (line 31-45)
- `src/scripts/reconcile-ingredients.ts` (line 76+)

**Why fragile:** 
- Reconciliation script runs once and builds canonical map
- If new pending ingredients arrive later, they use stale map
- No UI for admins to review/correct ambiguous mappings

**Safe modification:** 
- Implement conflict resolution queue (manual review before canonicalizing)
- Add scoring/confidence to ingredient matching (threshold for auto-accept, below = manual)
- Log all resolutions and allow override via admin endpoint
- Regular reconciliation runs (weekly?) to catch new pendings

---

### Meal Plan Generation Assumes All Recipes Have Nutrition

**Area:** Meal planning

**Issue:** In `src/modules/mealplan/mealplan.generation.ts` (line 66-68), recipes without `nutrition.calories > 0` are filtered out. If the recipe catalog has mostly low-nutrition or missing-nutrition recipes, the shortlist could be empty.

**Files:** 
- `src/modules/mealplan/mealplan.generation.ts` (line 66-68)

**Why fragile:** 
- User requests meal plan
- Shortlist is empty or too small
- LLM receives empty/small shortlist and may refuse or hallucinate

**Safe modification:** 
- Return error message to user if shortlist < minimum (e.g., 10 recipes)
- Implement fallback: use recipes with estimated nutrition from LLM
- Add nutrition inference script to fill missing values
- Test with minimal/empty recipe catalogs

---

### Docker Compose for Dev Images Not in Version Control

**Area:** Development setup

**Issue:** Dev local image generation relies on `docker-compose.yml` for MinIO and Fake Bedrock. If a new dev clones the repo and doesn't run `yarn s3:up`, images won't generate and the feature silently fails with null thumbnails.

**Files:** 
- `docker-compose.yml` (not in src/, but referenced in package.json)
- `src/config/env.ts` (line 119: `fakeGenerator` flag)

**Why fragile:** 
- No automated check that S3 is running
- First-time setup requires tribal knowledge ("run `yarn s3:up`")
- Images timeout silently instead of failing fast

**Safe modification:** 
- Add health check in app startup: ensure S3 endpoint responds if enabled
- Improve error message when S3/Bedrock fails
- Document setup in CONTRIBUTING.md (or create SETUP.md in .claude/)

---

## Scaling Limits

### MongoDB Atlas Vector Search Index May Have Cardinality Limits

**Area:** Recipe search

**Issue:** The vector search index in `src/infra/database/search-indexes.ts` is created on the `embedding` field. MongoDB Atlas has limits on the number of documents in a vector search index (typically ~10M for M30 tier). If the recipe catalog grows beyond this, search fails.

**Files:** 
- `src/infra/database/search-indexes.ts` (line 40-60)

**Current capacity:** 
- Unknown (depends on MongoDB tier and embedding dimensions)

**Limit:** 
- Catalog grows to 100K+ recipes with 1024-dim embeddings → potential index saturation

**Scaling path:** 
- Monitor vector index size and document count
- If approaching limit, upgrade MongoDB tier or implement sharding
- Consider alternative search (Pinecone, Weaviate) for higher scale
- Add pre-filtering before vector search to reduce candidate pool (e.g., by source, dietary tags)

---

### In-Memory Billing Cache Unbounded

**Area:** Billing

**Issue:** Cache in `src/modules/billing/entitlement.repository.ts` grows unbounded. In a system with millions of users, cache memory usage could exceed available RAM.

**Files:** 
- `src/modules/billing/entitlement.repository.ts` (line 14)

**Current capacity:** 
- Not limited (grows with unique userIds queried)

**Limit:** 
- At ~1000 daily active users, cache could reach 1-2 MB
- At ~100K active users, cache could reach 100+ MB

**Scaling path:** 
- Implement LRU eviction (max 50K entries, evict least-recently-used)
- Or switch to Redis (distributed, unbounded)
- Monitor cache memory usage and set alerts at 50MB, 100MB

---

### Meal Plan Generation LLM Cost Unbounded

**Area:** Meal planning

**Issue:** `src/modules/mealplan/mealplan.generation.ts` calls Claude to generate a meal plan. The `max_tokens` is 4000 by default. If a user requests a 30-day plan, the token cost is ~30 × 4000 = 120K tokens. At scale, this becomes expensive.

**Files:** 
- `src/modules/mealplan/mealplan.generation.ts` (not explicitly setting max_tokens, relies on default in LLM call)

**Current capacity:** 
- PRO users have monthly limit (e.g., 30 plans/month in config)

**Limit:** 
- Limit of 30 plans/month × 4000 tokens = 120K tokens/month per user
- At 1000 PRO users: 120M tokens/month = expensive

**Scaling path:** 
- Reduce max_tokens for meal plans (2000 instead of 4000, trim unnecessary output)
- Cache common meal plans (if user requests same criteria, reuse)
- Implement token usage tracking per user per month
- Consider cheaper model for meal planning (Haiku instead of Sonnet)

---

### SQS Ingest Queue No Dead-Letter Queue

**Area:** Recipe ingestion (async)

**Issue:** `src/infra/queue/ingest-queue.ts` enqueues recipes to SQS but there's no dead-letter queue configured. If a message fails to process repeatedly, it's deleted (default behavior) rather than sent to a DLQ for investigation.

**Files:** 
- `src/infra/queue/ingest-queue.ts`

**Impact:** 
- Failed ingestions disappear without audit trail
- Can't replay failed recipes
- No visibility into ingestion failures

**Scaling path:** 
- Configure DLQ in AWS for ingest queue (redrive policy)
- Implement retry logic with exponential backoff in Lambda
- Log all DLQ messages and alert on thresholds
- Implement replay endpoint to re-ingest from DLQ

---

## Dependencies at Risk

### Mongoat ODM Is Custom/Alpha

**Area:** Database layer

**Issue:** The project uses `@iamcalegari/mongoat` (version 1.0.34-alpha), a custom ODM. It's not a mainstream library, has limited community support, and may have bugs or breaking changes.

**Files:** 
- All database models (src/modules/*/\*.model.ts)

**Risk:** 
- Limited documentation and community help
- Alpha version tag suggests unstable API
- If author stops maintaining, migration to mainstream ODM required
- Hitches documented in MEMORY.md (findById with string \_id, import order)

**Migration plan:** 
- Consider migration to Mongoose (most popular Node.js ODM)
- If staying with Mongoat, request stable release (v1.0.0 instead of alpha)
- Add integration tests to catch Mongoat API changes early
- Document all Mongoat quirks in CONVENTIONS.md

---

### Clerk Auth Vendor Lock-in

**Area:** Authentication

**Issue:** The app uses Clerk exclusively for auth. Migrating to a different provider would require rewriting auth middleware and all protected endpoints.

**Files:** 
- `src/modules/auth/auth.guard.ts`
- `web/middleware.ts`
- `src/config/env.ts` (Clerk config)

**Risk:** 
- Clerk pricing changes or service degradation impacts the app
- Migrating users to a different provider is complex

**Migration plan:** 
- Abstract auth into an interface (e.g., `AuthProvider`) instead of Clerk-specific code
- Implement Auth0 or Cognito as alternative behind the interface
- Use JWT tokens internally rather than relying on Clerk's token format

---

### Bedrock Image Generation Model May Change

**Area:** Image generation

**Issue:** `src/config/env.ts` (line 107-110) defaults to "amazon.titan-image-generator-v2:0", but the code comments say "Stability models". If AWS deprecates Titan or Stability models, image generation breaks.

**Files:** 
- `src/config/env.ts` (line 107-110)
- `src/infra/images/bedrock.image-generator.ts`

**Risk:** 
- AWS may deprecate models without notice
- Thumbnails could fail unexpectedly in production

**Migration plan:** 
- Monitor AWS Bedrock model availability and set alerts for deprecations
- Implement fallback model chain (try Stable Diffusion XL, then Titan, then none)
- Add periodic test of image generation in monitoring (synthetic test)
- Document the model choice and why in comments

---

## Missing Critical Features

### No Monitoring/Observability

**Issue:** The app lacks structured logging, metrics, and tracing. There's no insight into:
- Request latency (API routes)
- Database query performance
- LLM API call costs and usage
- Search quality (click-through rate, dwell time)
- Billing webhook processing status

**Impact:** 
- Bugs are discovered only when users report them
- Performance degradation goes unnoticed
- Scaling decisions are reactive, not proactive

**Recommendations:** 
- Implement structured logging (Pino or Winston) across all modules
- Add metrics collection (Prometheus or CloudWatch) for:
  - Request latency (p50, p95, p99)
  - Database query count and latency
  - LLM API token usage and cost
  - Cache hit rate (billing, ingredients)
  - Search result quality (no of results, avg score)
- Add tracing (OpenTelemetry) to trace requests across services
- Set up dashboards and alerts in CloudWatch or Datadog

---

### No Audit Logging for Sensitive Operations

**Issue:** Operations like billing changes, variant moderation, and admin grants don't log who did what, when, and why.

**Files:** 
- `src/modules/billing/billing.routes.ts` (grant endpoint)
- `src/modules/recipes/recipe.routes.ts` (variant moderation)

**Impact:** 
- Can't investigate billing disputes or unauthorized changes
- Compliance risk (may be required by payment processors)

**Recommendations:** 
- Add audit log collection for:
  - `billing.grant` (admin ID, target user, plan, days, reason)
  - `variants.reject` (moderator ID, variant ID, reason)
  - `ingredients.reconcile` (script name, changes count, timestamp)
- Store audit logs in MongoDB or CloudWatch
- Implement audit log viewer for admins

---

## Test Coverage Gaps

### Billing Module Untested

**What's not tested:** 
- Mercado Pago webhook signature validation (timing-safe comparison)
- Entitlement cache TTL and invalidation
- Plan grant and expiry logic

**Files:** 
- `src/modules/billing/mercadopago.ts`
- `src/modules/billing/entitlement.repository.ts`
- `src/modules/billing/billing.routes.ts`

**Risk:** 
- Billing bugs affect revenue and user trust
- Security issue (fake webhooks) could go undetected

**Priority:** HIGH

---

### Recipe Generation Untested

**What's not tested:** 
- Adaptation logic with missing ingredients
- Title generation clarity
- Schema compliance after LLM generation

**Files:** 
- `src/modules/recipes/recipe.generation.ts`
- `src/modules/recipes/recipe.extraction.ts`

**Risk:** 
- Adapted recipes could be invalid (missing ingredients, malformed)
- User experience degradation if adaptation fails

**Priority:** HIGH

---

### Search Ranking Untested

**What's not tested:** 
- Score weighting (I, E, T, N dimensions)
- Equipment coverage calculation
- Nutrition goal matching (satiety vs. macros)

**Files:** 
- `src/modules/recipes/recipe.repository.ts` (hybridSearch)

**Risk:** 
- Ranking changes silently degrade search quality
- Bug fixes to scoring could introduce regressions

**Priority:** MEDIUM

---

### Meal Plan Generation Untested

**What's not tested:** 
- Shortlist building with empty pantry
- LLM parsing of meal plan output
- Shopping list deduplication

**Files:** 
- `src/modules/mealplan/mealplan.generation.ts`

**Risk:** 
- Meal plan generation fails silently
- Shopping list has duplicate items

**Priority:** MEDIUM

---

### API Routes Untested

**What's not tested:** 
- Request validation (TypeBox schemas)
- Authentication guards
- Error handling and status codes
- Rate limiting

**Files:** 
- `src/modules/recipes/recipe.routes.ts`
- `src/modules/billing/billing.routes.ts`
- `src/modules/search/search.routes.ts` (if exists)

**Risk:** 
- Invalid requests could crash the server
- Auth bypass vulnerabilities
- Rate limiting ineffective

**Priority:** MEDIUM

---

*Concerns audit: 2026-07-01*
