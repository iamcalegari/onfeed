---
tags: [backend, module, user-data]
updated: 2026-06-22
---

# Favorites

Receitas salvas pelo usuário. Coleção simples `(userId, recipeId)` com rotas CRUD autenticadas.

## Arquivos

| Arquivo | Responsabilidade |
|---|---|
| `favorite.model.ts` | Schema MongoDB: `userId`, `recipeId`, `insertedAt`, `updatedAt` |
| `favorite.repository.ts` | CRUD + `listFavoriteRecipes` (join com [[Recipes]]) |
| `favorite.routes.ts` | Rotas REST (todas exigem [[Auth]]) |

## Rotas

```
GET    /api/v1/favorites         → { recipes: FavoriteRecipe[] }  (com ingredientNames)
GET    /api/v1/favorites/ids     → { ids: string[] }              (para marcar corações nos cards)
POST   /api/v1/favorites         body: { recipeId }
DELETE /api/v1/favorites/:id
```

## FavoriteRecipe

Projeção leve retornada pelo `listFavoriteRecipes` — só o necessário para renderizar o card + busca por ingrediente na UI:

```ts
FavoriteRecipe {
  _id: string
  title: string
  country: string
  thumbnailUrl: string
  intro: string
  prepTimeMin: number
  ingredientNames: string[]   // nomes dos ingredientes — usado para filtro no FavoritesList
}
```

> [!INFO] Ordem
> As receitas são retornadas em ordem de inserção decrescente (mais recente primeiro). O re-sort acontece em memória após o join com [[Recipes]].

## Frontend

No frontend (`web/`), o módulo de favoritos tem dois pontos de integração:

- **`FavoriteButton`** — ícone de coração nos cards e na página de detalhes. Chama `addFavoriteAction` / `removeFavoriteAction` (server actions).
- **`FavoritesList`** — lista na aba Favoritos com swipe para remover (undo 3s), busca por nome/ingrediente, e navegação via Link nativo.

> [!TIP] Swipe para remover
> O `FavoritesList` usa `maxDxRef` (ref, não estado) para decidir se o click no Link deve navegar ou não. Isso evita o problema de timing entre `pointerup` e `click`.

## Relacionamentos

- Usa [[Recipes]] (join para montar `FavoriteRecipe`)
- Usa [[Auth]] (`requireAuth` em todas as rotas)
- Frontend: `web/components/FavoritesList.tsx`, `web/components/FavoriteButton.tsx`
