# Testing Patterns

**Analysis Date:** 2026-07-01

## Test Framework

**Status:** No automated testing framework configured

**Current State:**
- No `jest`, `vitest`, or similar test runner in dependencies
- No test configuration files (no `jest.config.js`, `vitest.config.ts`, etc.)
- No test files in source tree (no `.test.ts` or `.spec.ts` files)
- Testing is manual only: `npm run typecheck` validates types, `npm run dev` for manual verification

**Run Commands:**
```bash
npm run typecheck              # TypeScript type checking (no errors allowed)
npm run dev                    # Start dev server for manual testing
npm run build                  # Verify build succeeds (catches compilation errors)
```

## Manual Testing Approach

**Entry Point Verification:**
- `npm run dev` starts the Fastify server on port 3000
- Health check endpoint: `GET /health`
- API routes available at `/api/v1/*` prefixes

**Type Safety:**
- TypeScript strict mode enforced: `npm run typecheck` must pass
- Type-driven development via TypeBox schemas
- Route handlers type-checked against schema validation

**Script Execution:**
- Database setup: `npm run setup:db` validates connection and schema
- Seed scripts: `npm run seed:ingredients`, `npm run seed:recipes` test data layer
- Migration scripts: `npm run migrate:*` verify data transformations
- Batch processing: scripts like `reconcile:ingredients` test complex logic

## Test Data

**Fixtures:**
- `src/infra/database/seed-ingredients.ts` — canonical ingredient seed data with synonyms, categories, substitutions
- `src/modules/ingredients/ingredient.seed-data.ts` — hardcoded ingredient reference data (ketchup, oil, tomato, etc.)
- CSV dataset: `src/infra/dataset/` loads recipes from external CSV sources for ingestion testing

**Location:**
- Seed data co-located with models (`ingredient.seed-data.ts` near `ingredient.model.ts`)
- Database setup scripts in `src/infra/database/`
- Ingestion test data via `csv-parse` and `src/scripts/ingest-dataset.ts`

## Architecture for Testability

**Design Patterns to Enable Future Testing:**

**1. Dependency Injection via Functions**
- Services receive dependencies as parameters (e.g., `embeddings`, `anthropic` client)
- Models injected via `Database` class from mongoat ODM
- No global singletons except configuration (`env`)

**2. Separation of Concerns**
- `*.model.ts` — data persistence (mongoat models, schema definitions)
- `*.repository.ts` — data access layer (queries, aggregations)
- `*.service.ts` — business logic (resolution, search, adaptation)
- `*.routes.ts` — HTTP handlers (validation, response formatting)

**3. Port/Adapter Pattern**
- `src/infra/embeddings/embeddings.port.ts` — interface for embedding service
- `src/infra/embeddings/voyage.client.ts` — implementation (Voyage AI)
- Easy to mock/replace embeddings for testing

**4. Type-Driven Validation**
- TypeBox schemas validate all route inputs
- Zod schemas validate LLM output (structured extraction)
- No manual validation needed; schemas define contract

**Example: Recipe Adaptation Testing Setup**
```typescript
// Can be tested by:
// 1. Mocking embeddings.embedQuery() to return known vectors
// 2. Mocking RecipeModel.findMany() to return test recipes
// 3. Calling searchRecipes(request) and asserting on results

export async function searchRecipes(req: SearchRequest): Promise<SearchOutcome> {
  const queryVector = await embeddings.embedQuery(queryText);
  const results = await hybridSearch({ queryVector, haveIds, ... });
  return { results, unresolvedIngredients: unresolved, haveIds };
}
```

## Error Handling for Testing

**Patterns:**
- Explicit error types: `if (err instanceof Error)` — easy to assert in tests
- Retry logic: `isRetryable()` and `isCreditExhausted()` — can be unit tested separately
- Graceful fallbacks: vector search returns null if index building — can assert on null handling
- Custom error classes: `CreditExhaustedError extends Error` — can catch and verify specific failures

**Example in `src/modules/ingredients/ingredient.service.ts`:**
```typescript
try {
  near = await findNearestIngredient(vec);
} catch {
  near = null; // Fallback if vector index building
}
// Easy to test by mocking findNearestIngredient to throw
```

## Test Coverage Gaps

**Currently Untested Areas:**

| Area | What's Missing | Files | Why Critical |
|------|----------------|-------|--------------|
| Hybrid Search Scoring | No unit tests for dimension weighting (I/E/T/N) | `src/modules/recipes/recipe.repository.ts` (lines 74-380) | Complex scoring algorithm affects relevance; regressions likely if modified |
| Ingredient Resolution | No tests for semantic matching threshold and synonym learning | `src/modules/ingredients/ingredient.service.ts` | Canonicalization is core feature; threshold (0.82) should be validated |
| Recipe Adaptation | No E2E tests for LLM prompt + constraint handling | `src/modules/recipes/recipe.generation.ts` | Regression in quality if prompt changes |
| Batch Ingestion | No tests for checkpoint/resume logic and credit exhaustion handling | `src/modules/recipes/recipe.batch-ingestion.ts` | Complex state machine; easy to introduce race conditions |
| Error Handling | No tests for LLM API error recovery and rate-limiting | `src/modules/recipes/recipe.routes.ts` | Critical for production stability |
| Search + Filters | No integration tests combining vector search + dynamic filters | `src/modules/recipes/recipe.repository.ts`, `src/modules/search/search.service.ts` | Interactions between filter dimensions not validated |
| Embedding Integration | No tests for vector query construction and Voyage API failures | `src/modules/search/search.service.ts`, `src/infra/embeddings/voyage.client.ts` | Embedding is critical path; should verify query text construction |

## Recommended Testing Strategy

**Phase 1: Unit Tests (Low Priority)**
- Test pure functions: `buildQueryText()`, `buildSystemPrompt()`, utility functions
- Mock external APIs easily: embeddings, LLM, database
- Framework: Vitest (lightweight, ESM native)

**Phase 2: Integration Tests (Medium Priority)**
- Recipe adaptation flow: user input → ingredient resolution → search → generation
- Batch ingestion: checkpoint/resume, error recovery
- Search scoring: verify dimension weighting produces expected rank order

**Phase 3: E2E Tests (High Priority)**
- User journeys: search → recipe details → adapt → save
- Authentication: Clerk integration with protected routes
- Payment: Mercado Pago webhook handling

---

*Testing analysis: 2026-07-01*
