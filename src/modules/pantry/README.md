---
tags: [backend, module, user-data]
updated: 2026-06-22
---

# Pantry (Despensa)

Ingredientes que o usuário declarou ter em casa. Persiste a seleção entre sessões e pré-preenche os ingredientes na tela de busca.

## Arquivos

| Arquivo | Responsabilidade |
|---|---|
| `pantry.model.ts` | Schema MongoDB: `userId`, `ingredientId`, `insertedAt` |
| `pantry.repository.ts` | `getPantryItems`, `addToPantry`, `removeFromPantry` |
| `pantry.routes.ts` | Rotas REST autenticadas |

## Rotas

```
GET    /api/v1/pantry                         → { items: PantryItem[] }
POST   /api/v1/pantry/items                   body: { ingredientId }
DELETE /api/v1/pantry/items/:ingredientId
```

### PantryItem

```ts
{ ingredientId: string; displayName: string; category: string }
```

## Autocomplete (`GET /ingredients/search?q=`)

O autocomplete da Despensa não usa este módulo diretamente — chama [[Ingredients]] `ingredient.routes.ts`:

```
GET /api/v1/ingredients/search?q=cafe
→ busca regex contra displayName + synonyms (pending: false)
→ { results: [{ ingredientId, displayName, category }] }
```

> [!WARNING] Ingrediente não aparece no autocomplete
> O filtro `pending: false` exclui ingredientes criados por resolução automática na ingestão. Solução: adicionar ao `ingredient.seed-data.ts` e rodar `yarn seed:ingredients`.

## Frontend

`web/components/PantryManager.tsx`:

- Input de texto → debounce → `GET /api/v1/ingredients/search?q=`
- Sugestões em dropdown; Enter ou click adiciona o primeiro resultado
- Tag removível por cada ingrediente salvo
- Usa URL relativa `/api/v1/...` (proxy via `next.config.mjs` → `API_BASE_URL`)

> [!INFO] Proxy de URL
> Em produção, o frontend usa URLs relativas `/api/v1/...` que o Next.js rewrites para o backend via `API_BASE_URL` (server-side). Isso evita expor o endereço interno do backend ao cliente.

## Relacionamentos

- Usa [[Ingredients]] para autocomplete e validação de `ingredientId`
- Usa [[Auth]] (`requireAuth`)
- Frontend: `web/components/PantryManager.tsx`
