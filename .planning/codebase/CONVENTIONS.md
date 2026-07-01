# Coding Conventions

**Analysis Date:** 2026-07-01

## Naming Patterns

**Files:**
- Domain modules: `[domain].[role].ts` (e.g., `recipe.model.ts`, `recipe.routes.ts`, `recipe.repository.ts`, `recipe.service.ts`)
- Infra clients: `[provider].client.ts` (e.g., `voyage.client.ts`, `anthropic.client.ts`, `sqs.client.ts`)
- Infra ports/interfaces: `[domain].port.ts` (e.g., `embeddings.port.ts`)
- Data adapters: `[source].adapter.ts` (e.g., `dataset.adapter.ts`)
- Types: `[domain].types.ts` (e.g., `recipe.types.ts`, `ingredient.types.ts`)
- DTOs/schemas: `[domain].dto.ts` (e.g., `search.dto.ts`)
- Utilities: `[domain].[feature].ts` (e.g., `recipe.translation.ts`, `ingredient.substitutions.ts`, `recipe.generation.ts`)
- Models/databases: `[domain].model.ts` (e.g., `recipe.model.ts`, `ingredient.model.ts`)
- Repositories: `[domain].repository.ts` (e.g., `recipe.repository.ts`)
- Seeds/fixtures: `[domain].seed-data.ts` (e.g., `ingredient.seed-data.ts`)

**Functions:**
- camelCase for all functions and methods
- Async functions use `async function` or arrow functions with `async`
- Helper/utility functions often prefix with verb: `buildSystemPrompt()`, `buildUserPrompt()`, `buildQueryText()`, `createBatchWithRetry()`, `chunkArray()`
- Query/fetch functions: `get[Entity]()`, `find[Entity]()`, `search[Entity]()` (e.g., `getRecipeById()`, `findNearestIngredient()`, `searchRecipes()`)
- Validation/check functions: `is[Condition]()`, `should[Action]()` (e.g., `isRetryable()`, `isCreditExhausted()`)
- Persistence functions: `set[Property]()`, `add[Item]()`, `persist[Entity]()`, `create[Entity]()` (e.g., `setThumbnail()`, `addCreatorToVariant()`, `persistExtractedRecipe()`)

**Variables:**
- camelCase for all variables and parameters
- Constants (module-level, immutable): UPPER_SNAKE_CASE (e.g., `CORE_WEIGHT`, `SEMANTIC_MATCH_THRESHOLD`, `POLL_INTERVAL_MS`)
- Readonly configuration objects: camelCase with `as const` (e.g., `env`)
- Collections use plural or descriptive names: `haveIds`, `baseIds`, `normalized`, `matches`, `termToId`

**Types:**
- PascalCase for all types, interfaces, and enums (TypeScript convention)
- Discriminated unions: explicit literal types (e.g., `RecipeSource = "curated" | "generated_pending" | "variant"`)
- Record types: `Record<Key, Value>` for mappings (e.g., `Record<NutritionGoal, string>`)
- Schema objects: `[Domain]Schema` suffix for TypeBox/Zod schemas (e.g., `SearchRequestSchema`, `SearchResponseSchema`, `SubmitRecipeSchema`)

## Code Style

**Formatting:**
- No linter/formatter configured (no ESLint, Prettier, or Biome)
- Code uses ES2023 target with strict TypeScript
- Line length: no hard limit observed, but generally concise
- Indentation: 2 spaces
- Semicolons: required at statement end
- Trailing commas: used in multiline structures

**Linting:**
- TypeScript strict mode enabled: `strict: true`
- `noUncheckedIndexedAccess: true` — array/object indexing must be checked for undefined
- `exactOptionalPropertyTypes: true` — optional properties cannot be undefined
- `noImplicitOverride: true` — overriding methods must use `override` keyword
- `verbatimModuleSyntax: true` — imports/exports must match runtime semantics (no re-exports of types without `type` keyword)
- No external linter (ESLint, Prettier, Biome)

## Import Organization

**Order:**
1. Node.js built-in modules: `import { readFileSync } from "node:fs"`
2. Third-party packages: `import Fastify from "fastify"`, `import { Type } from "@sinclair/typebox"`
3. Internal absolute imports: `import { env } from "@/config/env.js"`, `import { RecipeModel } from "@/modules/recipes/recipe.model.js"`

**Path Aliases:**
- `@/*` maps to `src/*` (configured in `tsconfig.json`)
- Always use `@/` prefix for internal code
- All imports include `.js` extension (ESM compatibility)

**Barrel Files:**
- Used sparingly for model registration (e.g., `src/modules/index.ts` imports all models for side effects)
- Routes not re-exported via barrel files; each route registered individually

## Error Handling

**Patterns:**
- Explicit error type checking: `if (err instanceof Error)` → extract message via `.message`
- Fallback null/empty for graceful degradation: vector search falls back to null if vector index is building
- `throw new Error(...)` for logical failures with descriptive messages in Portuguese and English
- Error messages include context: `Variável de ambiente obrigatória ausente: ${name}`
- Type guards for unknown error objects: `const status = (err as { status?: number })?.status`
- Credit exhaustion detection: custom `isCreditExhausted()` function checks error message content
- Retryable errors (5xx): wrapped in `isRetryable()` with exponential backoff

**Custom Errors:**
- `CreditExhaustedError extends Error` for specific failure modes that require special handling
- Used in `recipe.batch-ingestion.ts` to signal immediate shutdown without retry

## Logging

**Framework:** Native Fastify logger (accessed via `app.log`)

**Patterns:**
- Server startup/shutdown: `app.log.info(...)`
- Script execution: `console.error()` for failures, `.catch()` handlers at entry points
- Batch processing: callback-based logging via `onBatchCreated()` and `onPollUpdate()` hooks
- No custom logging wrapper; direct access to Fastify logger in routes

## Comments

**When to Comment:**
- Architecture decisions: explain why a pattern is used
- Non-obvious algorithms: describe the approach or tradeoff
- Business logic: comment complex rules (e.g., scoring dimensions, threshold rationales)
- Gotchas: mongoat import order, vector index building delays, TypeBox limitations
- Links to related files: cross-reference between modules

**JSDoc/TSDoc:**
- Minimal JSDoc; full type signatures preferred
- Block comments `/** ... */` for function/module documentation
- Inline comments `// ...` for clarifications within implementations
- Portuguese preferred in comments matching the codebase language (e.g., variable names are in Portuguese: `haveIds`, `isStaple`)

**Example patterns:**
```typescript
/** userId do Clerk (ou null se anônimo / Clerk desabilitado). */
export function getUserId(req: FastifyRequest): string | null {
  // ...
}

/**
 * Resolve termos digitados pelo usuário ("azeite", "tomate") para canonicalIds.
 * Caminho rápido: match exato contra `synonyms` (já indexado).
 * Caminho de fallback: embedda o termo e busca o ingrediente canônico mais próximo.
 */
export async function resolveUserIngredients(...) { }
```

## Function Design

**Size:** Functions are typically 20-80 lines; larger utilities (e.g., `hybridSearch`) document sub-sections with comments

**Parameters:**
- Destructure objects when > 2 parameters
- Use type-safe parameter objects for configuration (e.g., `AdaptConstraints` interface)
- Optional parameters: TypeScript optional (`?`) not null defaults

**Return Values:**
- Async functions always return `Promise<T>` explicitly typed
- Nullable returns: `T | null` (not undefined) for "not found" cases
- Interface return types for complex structures (e.g., `SearchOutcome`, `ResolveResult`)

## Module Design

**Exports:**
- Named exports preferred; default exports avoided
- One responsibility per file
- Models, repositories, services, routes all in separate files per domain
- Utilities exported as named functions

**Barrel Files:**
- `src/modules/index.ts` — model registration only (side-effect imports)
- Routes registered individually in `app.ts`, not via barrel exports
- No re-export of internal utilities; consumers import directly from source

## Language Conventions

**Documentation language:** Portuguese (pt-BR)
- Comments, docstrings, and variable names use Portuguese
- Error messages in Portuguese and English (dual-language for user-facing APIs)
- Examples: `haveIds` (user has these ingredient IDs), `isStaple` (basic pantry items), `canonicalId` (normalized ingredient ID)

---

*Convention analysis: 2026-07-01*
