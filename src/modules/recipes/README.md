---
tags: [backend, module, core]
updated: 2026-06-22
---

# Recipes

Módulo central do sistema. Gerencia o catálogo de receitas, o pipeline de ingestão, e expõe as rotas REST para consulta e adaptação.

## Arquivos

| Arquivo | Responsabilidade |
|---|---|
| `recipe.types.ts` | Interfaces TypeScript: `Recipe`, `RecipeIngredient`, `RecipeStep`, `RecipeSearchHit`, `DimensionScores` |
| `recipe.model.ts` | Schema MongoDB + validadores BSON + índices (vector search, ingredient lookup) |
| `recipe.repository.ts` | `hybridSearch` — pipeline de busca vetorial + re-rank I/E/T/N |
| `recipe.ingestion.ts` | Pipeline de ingestão única: extração LLM → canonicalização → embedding → persist |
| `recipe.extraction.ts` | Chama [[LLM (Anthropic)]] para extrair estrutura de um texto/receita crua |
| `recipe.generation.ts` | Gera receita nova via LLM a partir de ingredientes (feature "adaptar") |
| `recipe.routes.ts` | Rotas REST: GET `/recipes/:id`, POST `/recipes/adapt`, POST `/recipes/:id/thumbnail/trigger` |
| `recipe.batch-ingestion.ts` | Versão batch usando Anthropic Batches API (mais barato para volume alto) |
| `recipe.sample-data.ts` | Fixtures para desenvolvimento local |

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
  source: RecipeSource   // curated | generated_pending | generated_validated | user
  embedding: number[]    // vetor Voyage (usado no hybridSearch)
  embeddingText: string  // texto que gerou o embedding (para reindexar)
}
```

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
