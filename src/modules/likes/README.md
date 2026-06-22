---
tags: [backend, module, user-data]
updated: 2026-06-22
---

# Likes

Curtidas em receitas. Usado para sinalizar qualidade e potencialmente promover receitas `generated_pending` para `variant` quando atingirem threshold de likes.

## Arquivos

| Arquivo | Responsabilidade |
|---|---|
| `like.model.ts` | Schema: `userId`, `recipeId`, `insertedAt` |
| `like.repository.ts` | `toggleLike`, `getRecipeLikes` (count + se o user curtiu) |
| `like.routes.ts` | Rotas REST autenticadas |

## Rotas

```
GET  /api/v1/recipes/:id/likes   → { count: number, liked: boolean }
POST /api/v1/recipes/:id/likes   → toggle (cria ou remove)
```

## Relacionamentos

- Usado por `web/components/LikeButton.tsx`
- Potencial futura integração com promoção de [[Recipes]] `generated_pending → variant`
