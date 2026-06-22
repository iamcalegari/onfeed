---
tags: [backend, module, core]
updated: 2026-06-22
---

# Ingredients

Catálogo canônico de ingredientes. Resolve termos livres digitados pelo usuário ("azeite", "olive oil", "EVOO") para IDs estáveis que indexam o catálogo de receitas.

## Arquivos

| Arquivo | Responsabilidade |
|---|---|
| `ingredient.types.ts` | Interface `CanonicalIngredient` |
| `ingredient.model.ts` | Schema MongoDB |
| `ingredient.repository.ts` | Queries: match por sinônimo, busca vetorial de fallback, upsert de pendentes |
| `ingredient.service.ts` | `resolveUserIngredients` (busca) + `resolveCanonicalForIngestion` (ingestão) |
| `ingredient.substitutions.ts` | Mapa de substitutos: `olive_oil → oil`, `butter → oil`, etc. |
| `ingredient.seed-data.ts` | ~102 ingredientes canônicos com sinônimos e categoria |
| `ingredient.routes.ts` | `GET /ingredients/search?q=` — autocomplete da [[Pantry]] |

## Modelo de Dados

```ts
CanonicalIngredient {
  _id: string           // slug estável: "olive_oil", "garlic", "cafe"
  displayName: string   // "Azeite de Oliva"
  synonyms: string[]    // ["azeite", "olive oil", "evoo", ...]
  category: string      // "fat", "vegetable", "protein", "beverage", ...
  isStaple: boolean     // sal, água, pimenta — não contam como "faltando"
  pending: boolean      // true = criado por resolução automática, aguarda revisão
  embedding: number[]   // Voyage (displayName + synonyms) — busca semântica de fallback
}
```

## Fluxo de Resolução

### Em tempo de busca (`resolveUserIngredients`)
```
termo digitado
  1. normaliza (lowercase, trim)
  2. match exato contra synonyms[]  → retorna canonicalId
  3. não achou → entra em `unresolved` (feedback na UI)
  4. expande com substitutos        → "manteiga" cobre receitas que pedem "óleo"
```

### Em tempo de ingestão (`resolveCanonicalForIngestion`)
```
termo do dataset
  1. match exato por synonyms (rápido)
  2. fallback: embedda o termo → busca vetorial → se score ≥ 0.82, aprende sinônimo
  3. não achou: cria pending=true (novo ingrediente, aguarda revisão humana)
```

> [!WARNING] pending: false
> O autocomplete da Despensa filtra `pending: false`. Ingredientes criados automaticamente na ingestão (`pending: true`) NÃO aparecem na busca do usuário. Para torná-los visíveis, rodar `yarn reconcile:ingredients` ou adicioná-los ao seed.

## Seed

O `ingredient.seed-data.ts` tem ~102 entradas cobrindo as categorias principais. Para aplicar ao banco:

```bash
yarn seed:ingredients
```

Idempotente (upsert por `_id`). Recalcula embeddings a cada execução.

> [!TIP] Ingrediente novo não aparece na Despensa?
> 1. Adicionar em `ingredient.seed-data.ts` com `synonyms` cobrindo variações comuns
> 2. Rodar `yarn seed:ingredients`

## Substitutos (`ingredient.substitutions.ts`)

Quando o usuário tem ingrediente A, o sistema automaticamente considera que ele também "tem" os substitutos de A. Exemplos:

- `butter` → cobre `oil`, `olive_oil`
- `chicken_breast` → cobre `chicken`
- `greek_yogurt` → cobre `yogurt`

Isso aumenta o score I sem exigir que o usuário liste cada variante.

## Relacionamentos

- Usado por [[Recipes]] na ingestão (canonicalização) e na busca (cobertura I)
- Usado por [[Search]] via `resolveUserIngredients`
- Usado por [[Pantry]] no autocomplete e na persistência
