---
tags: [project, overview]
updated: 2026-06-22
---

# onFeed 🍽️

> Cozinhe com o que você tem.

**onFeed** é um app de **receitas sob-demanda**. Você diz os **ingredientes**, **equipamentos**, **tempo** e **objetivo nutricional** que tem (as 4 dimensões **I/E/T/N**) e o app encontra as receitas que melhor combinam, mostra **o que falta**, e ainda **adapta** uma receita pro que existe na sua cozinha.

A busca é **híbrida**: relevância semântica (vector search) + um re-rank determinístico que decompõe o match nas 4 dimensões.

---

## As 4 dimensões — I/E/T/N

Cada receita recebe um **Match Score** e quatro sub-scores (as barrinhas da UI):

| | Dimensão | Como pontua |
|---|---|---|
| **I** | Ingredientes | cobertura ponderada do que você tem (itens principais pesam mais; básicos de despensa são ignorados) |
| **E** | Equipamentos | fração dos equipamentos exigidos que você tem (fogão, forno, microondas…) |
| **T** | Tempo | aderência ao tempo disponível |
| **N** | Nutrição | aderência ao objetivo: *matar a fome* (saciedade) vs *respeitar macros* (proteína) |

---

## O que dá pra fazer

- **Buscar** por I/E/T/N + ocasião, em **lista** ordenada por match ou em **deck de swipe** (NO/YES, packs de 25).
- Ver **o que falta** em cada receita (✓/○ por ingrediente).
- Abrir o **detalhe** com passo a passo e **timer por passo**.
- **Adaptar pro que eu tenho** — gera uma variação ancorada na receita real (via LLM), que entra em quarentena e pode virar candidata futura no catálogo (o ciclo virtuoso).
- **Thumbnails** gerados sob-demanda (lazy) e cacheados.

---

## Stack

**Backend** (`/`)
- TypeScript + Node 22, **Fastify 5** (domínios em `src/modules/*`)
- **MongoDB Atlas Vector Search** via ODM [`@iamcalegari/mongoat`](https://www.npmjs.com/package/@iamcalegari/mongoat)
- Embeddings **Voyage** (`voyage-3`, `input_type` document/query)
- **Claude** (`claude-opus-4-8`) — extração na ingestão + geração de variações (structured outputs)
- Ingestão em lote via **Anthropic Batches API**
- Thumbnails: **Amazon Bedrock** (Titan/Nova Canvas) + **S3/CloudFront**

**Frontend** (`/web`)
- **Next.js 15** (App Router, SSR) + **Tailwind v4**

---

## Estrutura

```
src/
├── config/                 # env (fail-fast)
├── infra/
│   ├── database/           # conexão mongoat + setup + vector indexes
│   ├── embeddings/         # porta + cliente Voyage
│   ├── images/             # porta + Bedrock + S3 (thumbnails)
│   ├── llm/                # cliente Anthropic
│   └── dataset/            # loader CSV + adapters (recipe-nlg, food-com)
├── modules/
│   ├── ingredients/        # catálogo canônico + canonicalização
│   ├── recipes/            # model, busca híbrida, ingestão, geração
│   └── search/             # DTOs, service, rotas
└── scripts/                # ingest:dataset, db:status
web/                        # app Next.js (Input → Result List/Cards → Details)
```

---

## Começando

### Pré-requisitos
- Node 22+, e um cluster **MongoDB Atlas com Vector Search** habilitado.
- Chaves: **Voyage** (embeddings) e **Anthropic** (extração/geração).
- *Opcional:* AWS (S3 + Bedrock) para thumbnails reais — sem isso, usa placeholder.

### Configuração

```bash
cp .env.example .env   # preencha MONGODB_*, VOYAGE_API_KEY, ANTHROPIC_API_KEY
```

> ⚠️ Segredos reais vão **só** no `.env` (gitignored). Nunca no `.env.example`.

### Subir o banco e popular (nesta ordem)

```bash
yarn install
yarn setup:db          # collections, validators e vector indexes (recipes + ingredients)
yarn seed:ingredients  # catálogo canônico de ingredientes (embeddado)
yarn ingest:dataset --file ./data/recipes.csv --adapter food-com --limit 50
yarn db:status         # confere contagens e se os índices estão queryable
```

> O **vector index do Atlas** leva alguns minutos pra ficar `queryable` após o `setup:db` — o `db:status` mostra o status. A **ingestão usa a Batches API (assíncrona)**: o script fica em polling até concluir.

### Rodar

```bash
# backend (porta 3000)
yarn dev

# frontend (porta 3001)
cd web && yarn install && yarn dev
```

Abra **http://localhost:3001**.

---

## Thumbnails

- **Produção:** defina `AWS_REGION` + `IMAGES_S3_BUCKET` (+ `IMAGES_CDN_DOMAIN`); IAM com `bedrock:InvokeModel` e `s3:PutObject`. As imagens são geradas no primeiro acesso à receita e cacheadas no S3/CloudFront.
- **Dev local:** MinIO/LocalStack via `yarn s3:up` + `IMAGES_S3_ENDPOINT` e `IMAGES_FAKE_GENERATOR=true` (gerador de PNG fake, já que o Bedrock não emula).
- **Sem nada disso:** `images.enabled=false` → placeholder, nada quebra.

---

## Roadmap

- [ ] Validação/promoção de receitas geradas (`generated_pending` → `generated_validated`)
- [ ] Fila de revisão dos ingredientes `pending`
- [ ] Rating/feedback do usuário
- [ ] Criação de receita pelo usuário (upload de imagem via URL pré-assinada — endpoint já existe)

---

## Documentação dos Módulos

| Módulo | README |
|---|---|
| Recipes (core) | [[src/modules/recipes/README]] |
| Ingredients (canonicalização) | [[src/modules/ingredients/README]] |
| Search (busca híbrida) | [[src/modules/search/README]] |
| Favorites | [[src/modules/favorites/README]] |
| Pantry (despensa) | [[src/modules/pantry/README]] |
| Likes | [[src/modules/likes/README]] |
| Auth (Clerk) | [[src/modules/auth/README]] |
| Image Service (Bedrock) | [[src/infra/images/README]] |
| Database (mongoat) | [[src/infra/database/README]] |
| Frontend (Next.js) | [[web/README]] |
| Componentes React | [[web/components/README]] |
