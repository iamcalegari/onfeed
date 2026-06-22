---
tags: [backend, infra, database]
updated: 2026-06-22
---

# Database

Infraestrutura MongoDB Atlas via ODM `mongoat`. Setup de coleções, validators BSON, índices de texto e vector search.

## Arquivos

| Arquivo | Responsabilidade |
|---|---|
| `connection.ts` | `connectDatabase` / `disconnectDatabase` — inicializa o mongoat e o `new Database()` |
| `setup.ts` | Cria coleções, aplica validators JSON Schema, cria índices (incluindo vector search) |
| `search-indexes.ts` | Definições dos Atlas Search Indexes (vector + text) |
| `seed-ingredients.ts` | Script idempotente: upserta os ingredientes canônicos com embeddings |

## Setup Inicial

```bash
yarn setup:db          # cria coleções + índices
yarn seed:ingredients  # popula catálogo de ingredientes
```

## Coleções

| Coleção | Módulo | Índices notáveis |
|---|---|---|
| `recipes` | [[Recipes]] | vector search (`embedding`), `ingredient_lookup` (`ingredients.canonicalId`) |
| `ingredients` | [[Ingredients]] | vector search (`embedding`), regex em `synonyms` |
| `favorites` | [[Favorites]] | composto `(userId, recipeId)` |
| `pantry` | [[Pantry]] | composto `(userId, ingredientId)` |
| `likes` | [[Likes]] | composto `(userId, recipeId)` |
| `usage` | Usage | `userId`, `insertedAt` |

## mongoat — Gotchas

> [!WARNING] Ordem de import
> O `new Database()` (em `connection.ts`) deve ser importado **antes** de qualquer model. Os models se registram no mongoat durante o import. Se o `Database` ainda não existir nesse momento, o mongoat lança "Database not found".
>
> Padrão correto em scripts:
> ```ts
> import { connectDatabase } from "./connection.js"; // 1º
> import "@/modules/index.js";                       // 2º (registra os models)
> ```

> [!WARNING] findById com _id string
> Para ingredientes cujo `_id` é uma string slug (ex: `"olive_oil"`), o `findById()` do mongoat tenta converter para `ObjectId` e falha silenciosamente. Usar `findMany({ _id: slug })` diretamente.

## Vector Search

O Atlas Vector Search usa o campo `embedding` (Voyage AI, 1024 dimensões) com similaridade cosseno. Os índices são criados via `setup.ts` e requerem que o cluster tenha o tier M10+ no Atlas.

## Relacionamentos

- Usado por todos os módulos via models individuais
- `seed-ingredients.ts` depende de [[Ingredients]] e [[Embeddings (Voyage)]]
