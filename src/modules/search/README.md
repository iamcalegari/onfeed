---
tags: [backend, module, core]
updated: 2026-06-22
---

# Search

Orquestrador da busca híbrida I/E/T/N. Recebe os parâmetros do usuário, canonicaliza ingredientes, embeda a query e delega o re-rank ao [[Recipes]] repository.

## Arquivos

| Arquivo | Responsabilidade |
|---|---|
| `search.dto.ts` | `SearchRequest` — schema de entrada validado pelo TypeBox |
| `search.service.ts` | `searchRecipes()` — monta query text, resolve ingredientes, embeda, chama hybridSearch |
| `search.routes.ts` | `POST /api/v1/search` |

## SearchRequest

```ts
SearchRequest {
  ingredients: string[]       // termos livres ("tomate", "frango")
  baseIngredients?: string[]  // ingredientes "base" do usuário (peso extra no score I)
  occasions?: string[]        // "almoco", "jantar", "drinks", ...
  equipment?: Equipment[]     // stovetop | oven | microwave | blender | none
  maxPrepTimeMin?: number     // dimensão T
  goal?: "satiety" | "macros" // dimensão N
  note?: string               // texto livre adicional
  limit?: number              // padrão: 25
}
```

## Pipeline

```
POST /search
  → buildQueryText()          // monta frase para embeddar
  → resolveUserIngredients()  // termos → canonicalIds    ← [[Ingredients]]
  → embeddings.embedQuery()   // Voyage AI (input_type=query)
  → hybridSearch()            // Atlas Vector + re-rank   ← [[Recipes]]
  → { results, unresolvedIngredients, haveIds }
```

## buildQueryText

O texto de query espelha o `embeddingText` da receita para que os vetores vivam no mesmo espaço semântico:

```
"Ingredientes disponíveis: tomate, frango. Ocasião: jantar. Equipamentos: fogão. Até 30 minutos."
```

> [!WARNING] Ocasião "drinks"
> Bebidas têm tratamento especial no `buildQueryText`: injeta vocabulário extra ("drink, coquetel, suco, smoothie...") para melhorar o recall semântico, já que os títulos de receitas de bebida são muito variados.

## SearchOutcome

```ts
SearchOutcome {
  results: RecipeSearchHit[]        // ordenados por matchScore desc
  unresolvedIngredients: string[]   // termos que não acharam canônico (feedback UI)
  haveIds: string[]                 // canonicalIds resolvidos (vai pro URL ?have=)
}
```

`unresolvedIngredients` é exibido na UI para avisar o usuário que um ingrediente não foi reconhecido.

## Relacionamentos

- Depende de [[Ingredients]] para `resolveUserIngredients`
- Depende de [[Recipes]] para `hybridSearch`
- Chamado por `web/app/(main)/results/page.tsx` via `POST /api/v1/search`
