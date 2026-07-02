---
tags: [backend, module, core, idor, security]
updated: 2026-07-02
---

> [!WARNING] GET /recipes/:id — guard de visibilidade (Fase 3, Plano 02, T-03-05/T-03-06)
> A rota continua **pública** (sem `requireAuth` — receitas do catálogo seguem
> funcionando anônimas), mas agora passa `getUserId(request)` (string ou
> `null`) como 2º argumento explícito de `getRecipeById`, acionando o guard
> de visibilidade: uma receita `private` (import não-revisado, ver [[Import]])
> só resolve para o dono; anônimo ou outro usuário caem no MESMO 404 de
> "não encontrada" — sem vazar a existência do import (no existence leak).
>
> **Por que `createdBy.userId` sozinho não bastava:** imports nascem com
> `visibility:"private"` + `importJobId`, mas **sem** `createdBy[]`
> (`import.recipe-mapping.ts` não popula esse campo — a receita ainda não
> foi "reclamada" no catálogo). O `$or` existente por `createdBy.userId`
> nunca autoriza o dono de um import. `getRecipeById` resolve isso com um
> segundo passo: se o fast-path Mongo não encontrou e a receita é
> `private` + tem `importJobId`, busca o `ImportJob` correspondente e
> compara `job.userId === userId`.
>
> **Assinatura de 3 estados** (mesmo idioma de `getImportJob(jobId, userId?)`):
> - `getRecipeById(id)` — 1 argumento, caller **trusted/interno**
>   (adaptação, likes, confirm flow) — sem filtro de `visibility`,
>   comportamento pré-existente inalterado.
> - `getRecipeById(id, null)` — caller **untrusted** sem sessão (rota
>   pública, anônimo) — aplica o guard; privado nunca resolve.
> - `getRecipeById(id, userId)` — caller **untrusted** com sessão — aplica
>   o guard com ownership check.

# Recipes

Módulo central do sistema. Gerencia o catálogo de receitas, o pipeline de ingestão, e expõe as rotas REST para consulta e adaptação.

## Arquivos

| Arquivo | Responsabilidade |
|---|---|
| `recipe.types.ts` | Interfaces TypeScript: `Recipe`, `RecipeIngredient`, `RecipeStep`, `RecipeSearchHit`, `DimensionScores` |
| `recipe.model.ts` | Schema MongoDB + validadores BSON + índices (vector search, ingredient lookup) |
| `recipe.repository.ts` | `hybridSearch` — pipeline de busca vetorial + re-rank I/E/T/N; owner-scoped via `ownerId` (Fase 2, D-14). `getRecipeById(id)` / `getRecipeById(id, userId \| null)` — IDOR-safe, resolve ownership de import via `importJobId → ImportJob.userId` (Fase 3, T-03-05). |
| `recipe.repository.test.ts` | Fase 2: prova isolamento cross-user do filtro `$or` owner-scoped, preservação do comportamento de catálogo sem `ownerId`, exclusão de `'imported'` de `DEFAULTS.sources`, e IDOR-safety de `getRecipeById`. Fase 3: resolução de ownership de import privado via `importJobId` (dono, não-dono, anônimo). |
| `recipe.routes.visibility.test.ts` | Fase 3 (Plano 02): `GET /recipes/:id` — anônimo vê público, anônimo/outro usuário levam 404 em import privado, dono vê o próprio import privado, overlay `lang=en` preservado |
| `recipe.ingestion.ts` | Pipeline de ingestão única: extração LLM → canonicalização → embedding → persist |
| `recipe.extraction.ts` | Chama [[LLM (Anthropic)]] para extrair estrutura de um texto/receita crua |
| `recipe.generation.ts` | Gera receita nova via LLM a partir de ingredientes (feature "adaptar") |
| `recipe.routes.ts` | Rotas REST: GET `/recipes/:id`, POST `/recipes/adapt`, POST `/recipes/:id/thumbnail/trigger` |
| `recipe.batch-ingestion.ts` | Versão batch usando Anthropic Batches API (mais barato para volume alto) |
| `recipe.sample-data.ts` | Fixtures para desenvolvimento local |
| `recipe.ingestion.test.ts` | Fase 2: cobertura de `persistExtractedRecipe` (canonicalização/embedding reuse, default de `visibility`, threading de grounding) |

## Modelo de Dados

```ts
Recipe {
  _id: ObjectId
  title: string          // PT-BR
  intro: string          // resumo 1-2 linhas
  country: string        // ISO 3166-1 alpha-2 (cozinha de origem)
  thumbnailUrl: string   // URL CloudFront (gerada lazy pelo [[Image Service]])
  prepTimeMin: number    // dimensão T
  servings: number
  occasions: string[]    // "almoco", "jantar", "lanche", "drinks", ...
  equipment: Equipment[] // dimensão E: stovetop | oven | microwave | blender | none
  ingredients: RecipeIngredient[]
  steps: RecipeStep[]    // cada step tem text + minutes (para o StepTimer)
  nutrition?: Nutrition  // calorias, proteína, carb, gordura — dimensão N
  source: RecipeSource   // curated | generated_pending | generated_validated | user | imported
  visibility: RecipeVisibility // private | public — receitas importadas nascem private (Fase 2)
  embedding: number[]    // vetor Voyage (usado no hybridSearch)
  embeddingText: string  // texto que gerou o embedding (para reindexar)
}
```

> [!INFO] Fase 2 (onFeed Import) — campos novos, ainda sem plug de extração real
> `visibility`, `grounding?`, `importJobId?`, `sourceMeta?`, `reviewRequired?`,
> `confidenceScore?` foram adicionados ao schema (Plano 02-01) para suportar
> receitas extraídas de vídeo (`source: "imported"`). `visibility` é
> **obrigatório no tipo TS** mas fica FORA do `required` do schema BSON —
> docs de catálogo já existentes não têm o campo; `persistExtractedRecipe`
> aplica o default `'public'` na camada de app para todo caller que não
> passar `opts.visibility` explicitamente. O extrator LLM em si
> (`import.extraction.ts`) e o gate de confiança (`import.confidence.ts`)
> chegam nos planos seguintes — este plano só estende o schema + a
> persistência (`IngestOptions`).

> [!WARNING] D-14 — busca owner-scoped para receitas privadas importadas (Plano 02-03)
> `hybridSearch` ganhou `params.ownerId` opcional: quando presente, o filtro
> `$vectorSearch` exige `visibility != "private"` OU (`visibility: "private"`
> **e** `"createdBy.userId" === ownerId`). `'imported'` **nunca** entra no
> array global `DEFAULTS.sources` — quem quer imports no resultado passa
> `sources: [...DEFAULT_SEARCH_SOURCES, "imported"]` **junto** com `ownerId`
> (ver `listMyImportedRecipes` em [[Import]]). Adicionar `'imported'` a
> `DEFAULTS.sources` sem esse acoplamento vazaria imports privados de todos
> os usuários — é o exato bug que o Pitfall 2 do research desta fase alertou.
> `getRecipeById(id, userId?)` espelha o idioma de `getImportJob` (IDOR-safe
> — dobra a checagem de dono no mesmo filtro Mongo, nunca busca-e-compara).
>
> O índice Atlas (`recipe.model.ts`'s `recipeVectorIndexDefinition` em
> `search-indexes.ts`) precisou declarar `visibility` e `createdBy.userId`
> como `filter` fields — um path de filtro não declarado é silenciosamente
> ignorado pelo `$vectorSearch` no Atlas (T-02-08). Em ambientes onde o
> índice já existe, `ensureSearchIndex` só cria quando ausente — **é preciso
> atualizar manualmente o índice existente** para essas novas colunas de
> filtro passarem a valer (follow-up operacional, não coberto por código).

## Score I/E/T/N

O `hybridSearch` devolve `RecipeSearchHit` com `matchScore` (0–100) e `scores: DimensionScores`:

| Dimensão | Cálculo |
|---|---|
| **I** (ingredientes) | cobertura ponderada: itens `core` pesam mais, `isStaple` são ignorados |
| **E** (equipamento) | fração dos equipamentos exigidos que o usuário tem |
| **T** (tempo) | decaimento linear acima de `maxPrepTimeMin` |
| **N** (nutrição) | match de objetivo: `satiety` → score de calorias; `macros` → score de proteína |

> [!INFO] cookableNow
> `cookableNow = true` quando `missingCoreCount === 0` — todos os ingredientes obrigatórios estão na despensa/busca do usuário.

## Pipeline de Ingestão

```
RawRecipeInput
  → extractRecipe()          ← LLM Anthropic (extrai estrutura, traduz, normaliza)
  → persistExtractedRecipe()
      ├── canonicaliza cada ingrediente   ← [[Ingredients]]
      ├── buildEmbeddingText()            ← mesmo formato do search.service
      ├── embeddings.embedDocuments()     ← Voyage AI
      └── RecipeModel.insert()
```

> [!WARNING] Consistência embedding
> O texto de embedding da receita (`buildEmbeddingText`) e o texto de query (`search.service.buildQueryText`) devem ter a mesma estrutura e usar o mesmo modelo Voyage. Mudança em um exige mudança no outro + reindexação.

## Rotas

```
GET  /api/v1/recipes/:id           → receita completa (detalhes)
POST /api/v1/recipes/adapt         → gera variação da receita pro que o usuário tem
POST /api/v1/recipes/:id/thumbnail/trigger  → dispara geração lazy de imagem
GET  /api/v1/recipes/:id/thumbnail → URL atual (null se ainda gerando)
```

## Relacionamentos

- Usa [[Ingredients]] para canonicalizar ingredientes na ingestão e calcular cobertura
- Usa [[Search]] como orquestrador da busca híbrida
- Usa [[Image Service]] para thumbnails
- Usado por [[Favorites]] e [[Likes]]
