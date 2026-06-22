---
tags: [backend, infra, images]
updated: 2026-06-22
---

# Image Service

Geração lazy de thumbnails para receitas via AWS Bedrock (Stability AI) + armazenamento em S3/CloudFront.

## Arquivos

| Arquivo | Responsabilidade |
|---|---|
| `image.service.ts` | `ensureThumbnail`, `buildPrompt`, `toThumbnail` — orquestração |
| `bedrock.image-generator.ts` | Chama AWS Bedrock (Stability Stable Image Core v1) |
| `fake.image-generator.ts` | Retorna PNG fake para desenvolvimento local (sem Bedrock) |
| `s3.image-store.ts` | Upload para S3 + presigned URL para uploads de usuário |

## Fluxo de Geração

```
ensureThumbnail(recipe)
  → já tem thumbnailUrl?  → retorna a URL existente
  → images desabilitadas? → retorna null (placeholder no frontend)
  → buildPrompt(recipe)   → prompt a partir dos ingredientes core
  → generateImage(prompt, negativePrompt)   ← Bedrock ou Fake
  → toThumbnail(buffer)   → sharp: resize 512x512, JPEG q=82
  → putImage(S3)          → URL CloudFront pública
```

## buildPrompt

> [!WARNING] Não incluir o título da receita no prompt
> Títulos traduzidos literalmente causam hallucinations (ex: "Souris d'Agneau" → imagens de ratos). O prompt usa apenas os ingredientes `core && !isStaple`, limitado a 5.

```
prompt: "appetizing realistic food photography, a plated dish made with {ings}, 
         natural light, top-down view, neutral linen background, editorial food styling"

negativePrompt: "animals, mice, rats, insects, people, faces, cartoon, 
                 illustration, text, watermark, logo, blurry, raw uncooked meat,
                 unrelated ingredients, random garnish"
```

## Modelos Bedrock

| Modelo | Model ID | Região |
|---|---|---|
| Stability Stable Image Core v1 | `stability.stable-image-core-v1:1` | `us-west-2` |
| Amazon Titan (fallback) | `amazon.titan-image-generator-v1` | qualquer região |

> [!INFO] BEDROCK_REGION
> O Stability AI só está disponível em `us-west-2`. A variável `BEDROCK_REGION` deve apontar para essa região em produção.

## Configuração

```env
IMAGES_ENABLED=true           # false → fake generator
IMAGES_FAKE_GENERATOR=false   # true  → força fake mesmo em prod
AWS_REGION_BEDROCK=us-west-2
S3_BUCKET=...
CLOUDFRONT_URL=...
```

## Dev Local

Usar MinIO (S3 local) + fake generator:

```bash
yarn s3:up   # sobe MinIO via docker-compose
```

O `IMAGES_FAKE_GENERATOR=true` retorna um PNG placeholder sem chamar Bedrock.

## Relacionamentos

- Chamado por [[Recipes]] (`recipe.routes.ts` — trigger + polling de URL)
- Frontend: `web/components/RecipeThumbnail.tsx` (lazy polling) e `web/components/LazyThumbnail.tsx`
