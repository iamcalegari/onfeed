---
tags: [backend, module, auth]
updated: 2026-06-22
---

# Auth

Autenticação via **Clerk**. O backend valida os JWT tokens do Clerk emitidos pelo frontend.

## Arquivos

| Arquivo | Responsabilidade |
|---|---|
| `auth.guard.ts` | `requireAuth` (preHandler Fastify) + `getUserId` (extrai userId do JWT) |
| `auth.routes.ts` | Rotas públicas de health/status (se houver) |

## Como Funciona

```
Frontend (Clerk SDK)
  → login → JWT token
  → requests com header: Authorization: Bearer <token>

Backend (Fastify)
  → requireAuth verifica JWT com CLERK_SECRET_KEY
  → getUserId(request) → string userId
```

## Uso

```ts
app.get("/minha-rota", { preHandler: requireAuth }, async (request) => {
  const userId = getUserId(request)!; // garantido após requireAuth
});
```

> [!INFO] userId
> O `userId` é o ID do Clerk (formato `user_xxx`). É usado como chave em [[Favorites]], [[Pantry]] e [[Likes]].

## Relacionamentos

- Requerido por [[Favorites]], [[Pantry]], [[Likes]]
- Frontend usa Clerk SDK para login/signup (`web/app/(auth)/`)
