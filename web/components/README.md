---
tags: [frontend, components]
updated: 2026-06-22
---

# Componentes Web

Componentes React reutilizáveis do frontend Next.js 15 (App Router). Todos em `web/components/`.

## Mapa de Componentes

### Navegação e Layout
| Componente | Descrição |
|---|---|
| `BottomNav` | Barra de navegação inferior (Busca / Despensa / Favoritos / Config) |
| `Header` | Cabeçalho com logo e link para favoritos |
| `BackButton` | Botão "← voltar" com `router.back()` |
| `Logo` | SVG da logo onFeed |
| `LogoLoader` | Loader animado com a logo |

### Busca e Resultados
| Componente | Descrição |
|---|---|
| `SearchForm` | Formulário da tela inicial: ingredientes, equipamentos, tempo, objetivo, ocasião |
| `ResultsView` | Lista de resultados + alternância lista/deck; passa `baseIngredients` para os filhos |
| `ResultCard` | Card de receita na lista (link com `?have=...&base=...` no href) |
| `SwipeDeck` | Deck de swipe estilo Tinder; swipe lateral = rejeitar/aceitar, swipe up = preview |
| `MatchScore` | Círculo com o % de match (0–100) |
| `ScoreBars` | Barras I/E/T/N com label e valor |
| `InfiniteList` | Paginação infinita na lista de resultados |

### Receita e Cozinha
| Componente | Descrição |
|---|---|
| `RecipeThumbnail` | Imagem da receita com polling lazy (dispara geração se `thumbnailUrl` vazio) |
| `LazyThumbnail` | Versão simplificada de thumbnail sem polling |
| `StepTimer` | Timer por passo no modo cozinha |
| `AdaptButton` | Botão "Adaptar para o que tenho" (chama `adaptRecipeAction`) |
| `CookMode` | Tela de passo a passo em modo cozinha |

### Usuário e Social
| Componente | Descrição |
|---|---|
| `FavoriteButton` | Coração de favoritar (server action, otimista) |
| `FavoritesList` | Lista de favoritos com swipe-to-delete + undo snackbar + busca |
| `LikeButton` | Botão de like com contador |
| `PantryManager` | Gerenciamento da despensa: autocomplete + tags removíveis |
| `ShareButton` | Botão de compartilhar (Web Share API) |

## Padrões

### Server Actions vs Client Components
- Componentes que mutam dados usam **server actions** (`web/app/actions.ts`): `addFavoriteAction`, `removeFavoriteAction`, `addToPantryAction`, etc.
- Componentes com estado local ou gestos são `"use client"`.

### API Calls no Client
Usar URLs relativas `/api/v1/...`. O `next.config.mjs` tem um rewrite que faz proxy para `API_BASE_URL` (server-side). Nunca usar `NEXT_PUBLIC_API_BASE_URL` para evitar expor o endereço interno.

### Swipe (SwipeDeck + FavoritesList)
Ambos usam a mesma lógica de pointer events:
- `onPointerDown` → registra `startX`, `startY`
- `onPointerMove` → detecta direção dominante (horizontal vs vertical); lock após 8px
- `onPointerUp` → avalia threshold; commit ou snap-back
- **Não usar `setPointerCapture`**: redireciona o evento `click` para o elemento capturador, quebrando navegação via `Link`.

> [!TIP] Link vs router.push nos cards swipáveis
> Usar `<Link href>` com `onClick={(e) => { if (wasDragging) e.preventDefault() }}` é mais confiável que `router.push` em pointer handlers, pois o click no `Link` funciona mesmo após eventos de pointer capture de elementos pai.

### Base Ingredients
Ingredientes "base" do usuário fluem pelo URL: `?base=tomate,frango`. O `recipeHref` em `web/lib/format.ts` os encoda; a página de detalhes faz o parse e aplica estilo âmbar (★, `text-amber-700`, `bg-amber-50/70`).

## Relacionamentos

- `SwipeDeck` → usa `RecipePreview` e `PeekOverlay` (sub-componentes internos)
- `ResultsView` → usa `SwipeDeck` e `ResultCard`
- `FavoritesList` → usa `removeFavoriteAction` de `web/app/actions.ts`
- Todas as pages em `web/app/(main)/` compõem esses componentes
