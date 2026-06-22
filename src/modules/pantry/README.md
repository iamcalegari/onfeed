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
POST   /api/v1/pantry/receipt                 body: { imageBase64, mimeType } → { items: ReceiptItem[] }
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

## Feature PRO: Escanear Nota Fiscal

```
Usuário clica em "📷 Nota fiscal" (badge PRO)
  → input[type=file capture=environment] → seleção de foto
  → compressImage(): canvas resize 1600px max, JPEG q=88 (reduz ~80% do tamanho)
  → POST /api/v1/pantry/receipt { imageBase64, mimeType }
  → Backend: Claude vision extrai ingredientes com RECEIPT_PROMPT
  → Backend: canonicaliza cada nome contra synonyms[] do catálogo
  → ReceiptReview (bottom sheet):
      - matched: checkboxes (todos marcados por default), mostra displayName + quantity
      - unmatched: lista informativa (adicionar manualmente)
      - botão "Adicionar N ingredientes à despensa"
  → addToPantryAction() para cada item selecionado
```

### ReceiptItem

```ts
{
  rawName: string          // como o Claude extraiu
  quantity: string | null  // "1 kg", "2 un", etc.
  ingredientId: string | null  // null = não encontrou no catálogo
  displayName: string      // displayName canônico ou rawName como fallback
  matched: boolean
}
```

> [!INFO] bodyLimit
> O endpoint `/pantry/receipt` tem `bodyLimit: 8 MB` (padrão Fastify é 1 MB). A compressão no frontend garante que a imagem chegue abaixo de ~1 MB na maioria dos casos.

> [!TIP] Badge PRO
> A feature está disponível para todos os usuários — o badge "PRO" é apenas visual. Quando for necessário restringir, adicionar verificação de `publicMetadata.plan` via Clerk no componente.

## Frontend

`web/components/PantryManager.tsx`:

- Input de texto → debounce → `GET /api/v1/ingredients/search?q=`
- Sugestões em dropdown; Enter ou click adiciona o primeiro resultado
- Tag removível por cada ingrediente salvo
- Botão PRO de câmera → `compressImage()` → `POST /api/v1/pantry/receipt` → `ReceiptReview`
- Usa URL relativa `/api/v1/...` (proxy via `next.config.mjs` → `API_BASE_URL`)

> [!INFO] Proxy de URL
> Em produção, o frontend usa URLs relativas `/api/v1/...` que o Next.js rewrites para o backend via `API_BASE_URL` (server-side). Isso evita expor o endereço interno do backend ao cliente.

## Relacionamentos

- Usa [[Ingredients]] para autocomplete e validação de `ingredientId`
- Usa [[Auth]] (`requireAuth`)
- Frontend: `web/components/PantryManager.tsx`
