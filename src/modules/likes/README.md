---
tags: [backend, module, user-data, promotion]
updated: 2026-07-02
---

> [!INFO] Promoção widened para receitas `imported` (Fase 5, Plano 02, D-05..D-08)
> `maybePromote` (chamada por `toggleLike` após um insert) tem dois branches
> paralelos por `Recipe.source`:
>
> - **`generated_pending` → `variant`** — inalterado desde antes da Fase 5:
>   `LikeModel.total({ recipeId }) >= env.variants.promoteThreshold` chama
>   `promoteToVariant` ([[Recipes]]).
> - **`imported` → `public`** (novo) — gate de **três partes**, todas
>   obrigatórias: likes de terceiros `>= env.variants.promoteThreshold`
>   (D-07, reusa o mesmo bar) **E** `confidenceScore >= env.import.promoteConfidence`
>   (D-06, bar dedicado — não é o mesmo threshold de `reviewRequired`) **E**
>   `confirmedAt != null` (revisão humana concluída). Se qualquer parte
>   falhar, `promoteImportToPublic` ([[Recipes]]) NUNCA é chamado — likes por
>   popularidade sozinhos não promovem um import de baixa confiança.
>
> **Exclusão do like do dono (D-08):** o `userId` do dono/importador vem de
> `recipe.createdBy[0].userId` (populado no persist de imports —
> `import.recipe-mapping.ts:76`). O count usado no gate exclui esse userId via
> `LikeModel.total({ recipeId, userId: { $ne: ownerId } })` — confirmado que
> `LikeModel.total()` repassa o filtro direto para `collection.countDocuments()`
> (mongoat), então o operador `$ne` funciona nativamente, sem precisar de um
> fetch-then-count client-side. Sem essa exclusão o dono poderia se
> autopromover curtindo a própria importação.
>
> **Por que `visibility` e não `source`:** `promoteImportToPublic` flipa
> `visibility: private → public` e mantém `source: "imported"` de propósito
> (D-05) — o grounding por campo e os créditos (`sourceMeta`/`createdBy[]`)
> continuam renderizando após a promoção (SOC-05 cai de graça, D-09). O
> filtro do `update` (`source: "imported", visibility: "private"`) é o guard
> de idempotência: um segundo trigger sobre um import já público é um no-op.

# Likes

Curtidas em receitas. Usado para sinalizar qualidade e promover receitas
`generated_pending` para `variant`, ou receitas `imported` confirmadas e
confiáveis para `public`, quando atingirem o threshold de likes de terceiros.

## Arquivos

| Arquivo | Responsabilidade |
|---|---|
| `like.model.ts` | Schema: `userId`, `recipeId`, `insertedAt` |
| `like.repository.ts` | `toggleLike`, `getRecipeLikes` (count + se o user curtiu). `maybePromote` (privada, disparada no insert): branch `generated_pending → variant` (inalterado) + branch `imported → public` (Fase 5, gate de confiança + confirmedAt + likes de terceiros, ver callout acima) |
| `like.repository.test.ts` | Fase 5: prova o gate de 3 partes (confiança, `confirmedAt`, likes de terceiros), a exclusão do like do dono (D-08), e a regressão do branch `generated_pending` (inalterado) |
| `like.routes.ts` | Rotas REST autenticadas |

## Rotas

```
GET  /api/v1/recipes/:id/likes   → { count: number, liked: boolean }
POST /api/v1/recipes/:id/likes   → toggle (cria ou remove)
```

## Relacionamentos

- Usado por `web/components/LikeButton.tsx`
- Integra com [[Recipes]]: `promoteToVariant` (`generated_pending → variant`) e
  `promoteImportToPublic` (`imported`, `private → public`, Fase 5)
- Gate de confiança consome `env.import.promoteConfidence` ([[Import]], Fase 5 Plano 01)
