---
tags: [frontend, nextjs, overview]
updated: 2026-07-02
---

# Web (Frontend)

Frontend Next.js 15 App Router do onFeed. PWA mobile-first.

## Stack

- **Next.js 15** (App Router, React Server Components)
- **Tailwind CSS** com design tokens customizados (`carvao`, `forest`, `terracota`, `areia`, `creme`, `salvia`, `surface`)
- **Clerk** — autenticação
- **TypeScript**

## Estrutura de Rotas

```
app/
├── layout.tsx                   # root layout (Clerk provider, fonte display)
├── manifest.ts                  # PWA manifest
├── actions.ts                   # Server Actions (favorites, pantry, thumbnail, adapt)
│
├── (main)/                      # layout com Header + BottomNav
│   ├── page.tsx                 # tela inicial: SearchForm
│   ├── results/page.tsx         # ResultsView — lista/deck de receitas
│   ├── recipe/[id]/page.tsx     # detalhe da receita (OG meta tags, ingredientes, passos)
│   ├── favorites/page.tsx       # FavoritesList (swipe, busca)
│   ├── pantry/page.tsx          # PantryManager
│   ├── settings/page.tsx        # preferências (idioma, sistema de medida)
│   └── import/                  # onFeed Import (Fase 3 — captura + revisão obrigatória)
│       ├── page.tsx             # PasteLinkButton — cola o link do vídeo
│       ├── [jobId]/page.tsx     # ImportProgress — polling do status de extração
│       ├── [jobId]/review/      # ImportReviewForm — revisão obrigatória (REV-01..04)
│       └── mine/page.tsx        # ImportsList — "Minhas importações" (D-09)
│
├── (cook)/                      # layout fullscreen sem nav
│   └── recipe/[id]/cook/        # CookMode — passo a passo
│
└── (auth)/                      # login/signup via Clerk
```

> [!TIP] Reconhecimento de link de vídeo — fonte única em `lib/video-url.ts`
> `isLikelyVideoUrl()` é o único regex client-side de "parece link de vídeo"
> (Instagram/TikTok — incl. `vm.`/`vt.`/`m.tiktok.com` — /YouTube), usado por
> `PasteLinkButton`, `ImportShortcut` e `import/page.tsx`. É só UX (feedback
> instantâneo/prefill), nunca o gate: quem valida de verdade é o
> `detectPlatform()` do backend ([[Import]]). Antes o regex vivia copiado nos
> 3 lugares e o suporte a `vt.tiktok.com` faltou nas três cópias ao mesmo
> tempo — manter em sincronia com `PLATFORM_PATTERNS` do backend.

## Configuração de Ambiente

```env
# Obrigatório (server-side only)
API_BASE_URL=http://backend:3000   # usado pelo proxy rewrite

# Obrigatório (client-side)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=...

# Clerk (server-side)
CLERK_SECRET_KEY=...
```

> [!INFO] API Proxy
> O `next.config.mjs` tem um rewrite: `/api/v1/*` → `API_BASE_URL/api/v1/*`. Isso permite que o frontend faça chamadas relativas (`/api/v1/search`) sem expor o endereço do backend ao browser. Nunca usar `NEXT_PUBLIC_API_BASE_URL` para chamadas de dados.

## Fluxo Principal

```
1. SearchForm         → POST /api/v1/search
2. ResultsView        → lista ou SwipeDeck de RecipeSearchHit
3. ResultCard         → link /recipe/:id?have=...&base=...
4. RecipePage         → GET /api/v1/recipes/:id  (SSR)
                     → OG meta tags para WhatsApp/social
5. CookMode           → passo a passo com StepTimer
```

## Design Tokens (Tailwind)

| Token | Uso |
|---|---|
| `carvao` | texto principal |
| `forest` | cor primária (verde escuro) |
| `terracota` | CTAs e destaques |
| `areia` | bordas e divisores |
| `creme` | fundo claro |
| `salvia` | badges e chips neutros |
| `surface` | fundo dos cards |

## Ingredientes Base (Fluxo URL)

Ingredientes marcados como "base" pelo usuário são passados via `?base=nome1,nome2` no URL. A função `recipeHref` em `web/lib/format.ts` os encoda; a `RecipePage` faz o parse e aplica estilo âmbar (★, `text-amber-700`).

## OG Meta Tags

A `RecipePage` tem `generateMetadata` que seta `openGraph` e `twitter` com a thumbnail da receita — garante preview de imagem ao compartilhar no WhatsApp.

## Relacionamentos

- Consome [[Search]], [[Recipes]], [[Favorites]], [[Pantry]], [[Likes]] via `/api/v1/`
- Componentes documentados em [[Componentes Web]]
- Auth via Clerk (tokens JWT validados pelo backend em [[Auth]])
