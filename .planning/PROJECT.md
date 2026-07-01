# onFeed

## What This Is

onFeed é um app de **receitas sob-demanda**: o usuário diz o que tem (ingredientes, equipamentos, tempo, objetivo nutricional) e o app encontra a receita que melhor combina por busca híbrida (vector search semântico + re-rank determinístico nas 4 dimensões **I/E/T/N**). O próximo salto — e o que dá sentido literal ao nome — é o **onFeed Import**: transformar um vídeo de receita que você vê no seu **feed** (Instagram/TikTok/YouTube) numa receita estruturada, acionável e compartilhável dentro do app.

## Core Value

Transformar um vídeo de receita do feed do usuário em uma receita **real, correta e acionável** (ingredientes com quantidade, passo a passo e dicas fiéis) dentro do onFeed. Se a extração for imprecisa, nada mais importa.

## Business Context

- **Customer**: pessoas que salvam receitas de Reels/TikTok/Shorts mas nunca conseguem executá-las de forma organizada.
- **Revenue model**: assinatura **PRO** via Mercado Pago (PIX/cartão). Importação básica é grátis (isca de aquisição); OCR, geração de imagem via CheffIA e volume alto de importação ficam no PRO.
- **Success metric**: nº de receitas importadas de vídeo que viram variantes públicas (proxy de valor + viralidade via compartilhamento).
- **Strategy notes**: monetização estudada — afiliado de delivery é beco sem saída no BR; receita vem da assinatura PRO/CheffIA. Ver `.planning/` e memórias de produto.

## Requirements

### Validated

<!-- Herdado do app existente (brownfield) — shipado e em uso. -->

- ✓ Busca híbrida I/E/T/N com match score (vector Voyage + re-rank determinístico) — existente
- ✓ Swipe deck (NO/YES) + lista de resultados, com check ✓/○ por ingrediente no detalhe — existente
- ✓ Adaptar receita via LLM (`adaptRecipe` → `generated_pending`) ancorada na receita base — existente
- ✓ Receitas variantes com promoção por likes + `parentRecipeId` + créditos (`createdBy[]`) — existente
- ✓ Favoritos, likes e modo cozinha passo a passo com timer/alarme — existente
- ✓ Canonicalização de ingredientes (match exato → semântico → `pending`) — existente
- ✓ Thumbnails via Bedrock/Stability + S3 (porta com fallback, resize sharp 512²) — existente
- ✓ Auth Clerk (backend `@clerk/fastify`, front `@clerk/nextjs`), rate-limit 120/min, CORS travado — existente
- ✓ Assinatura PRO via Mercado Pago (preapproval + webhook, entitlement gateway-agnóstico) — existente
- ✓ Ingestão de receita assíncrona via SQS/Lambda (`ingest-handler`) + LLM extração estruturada — existente

### Active

<!-- Milestone atual: onFeed Import. Hipóteses até shipar e validar. -->

- [ ] **Pipeline de importação por URL** — dado um link de vídeo, baixar (yt-dlp), transcrever áudio (Whisper) e ler a caption do post
- [ ] **Extração estruturada de alta fidelidade** — Claude extrai título, ingredientes **com quantidade+unidade**, passo a passo e dicas; atenção crítica à correção (reusa canonicalização de ingredientes)
- [ ] **Suporte multi-plataforma** — Instagram, TikTok e YouTube como fontes de vídeo
- [ ] **Captura por link colado** (adaptador universal, funciona em mobile e desktop)
- [ ] **Captura por extensão de browser** (1 clique na aba do IG/TikTok/YouTube; app encaminha para instalar; extensão conecta ao backend)
- [ ] **Carrossel de 3 imagens** — extrair os 3 melhores keyframes do vídeo; usuário gerador pode editar ou gerar imagem via CheffIA (motor Bedrock/Stability)
- [ ] **Atribuição ao creator** — crédito ao @ do autor + link do perfil na plataforma + link do vídeo fonte (quando extraíveis)
- [ ] **Ciclo privado → público** — receita nasce no livro **privado** do usuário, compartilhável por link; ao atingir **+5 likes** é promovida ao catálogo público como **variante**
- [ ] **Enriquecimento PRO** — OCR de frames (texto na tela), geração de imagem via CheffIA e volume alto de importação gated no PRO; importação básica grátis com quota diária
- [ ] **Cidadania plena da receita importada** — adapta macros e entra na lista de compras, como qualquer receita

### Out of Scope

- **App nativo / share sheet nativo (iOS/Android) no MVP** — captura no MVP é link colado + extensão; share nativo/PWA Web Share Target fica para fase posterior
- **Afiliado de delivery por pedido** — inviável no BR (API iFood é merchant-side; afiliado só paga por loja cadastrada). Deeplink é conveniência, não receita
- **Chatbot de receitas** — CheffIA é gerador estruturado (curadoria sobre catálogo real), não chat conversacional; chat é commodity e custo de IA imprevisível
- **Importação de qualquer URL da web (blogs, sites de receita)** — foco é vídeo curto de feed; texto de blog é problema diferente
- **Re-hospedar o vídeo original** — só extraímos e referenciamos; o vídeo fonte permanece na plataforma de origem (respeito ao creator/direitos)

## Context

**Stack (herdado):** TypeScript, MongoDB Atlas (Vector Search) via ODM próprio `@iamcalegari/mongoat`, Fastify (domínios em `src/modules/*`), embeddings **Voyage** (`voyage-3`), extração com **Claude** (structured outputs + zod). Frontend **Next.js 15** (App Router, Tailwind v4) em `web/`. Infra AWS: S3 (thumbnails), Bedrock (imagem, us-west-2), SQS+Lambda (ingestão assíncrona). Auth Clerk. Pagamento Mercado Pago. Deploy: Render (API) + Vercel (front) + MongoDB Atlas.

**Encaixe do onFeed Import no que existe:**
- O pipeline reusa o padrão de ingestão assíncrona (SQS/Lambda) e a extração estruturada já usada no ingest de dataset.
- A receita importada segue o modelo `Recipe` multi-source (`source`/`type`, `parentRecipeId`, `createdBy[]`) — o ciclo privado→variante espelha `generated_pending → variant`.
- Imagens reusam a porta de geração (`ImageGenerator`) e o store S3; o carrossel estende o thumbnail único para múltiplas imagens.
- Quota/gate PRO reusa o padrão `consumeDailyAdaptQuota`/entitlement (nova quota `import_usage`).
- Whisper local já foi usado para transcrição neste ambiente (dev). yt-dlp cobre download das 3 plataformas num único motor.

**Conhecimento acumulado relevante:** fix de quantity+unit em ingredientes (formatIngredientLabel + prompt LLM) é diretamente aplicável ao requisito de qualidade de extração; canonicalização tem armadilhas conhecidas (pendings duplicados, reconciliação por token).

## Constraints

- **Tech stack**: manter TypeScript + Fastify + Mongoat + Next.js + Voyage + Claude — não introduzir novo framework de app; onFeed Import é um módulo novo (`src/modules/import` provável), não um app à parte
- **Custo de IA**: cada import consome download + Whisper + LLM + embedding (+ OCR/imagem no PRO) — o custo de IA escala mais rápido que usuários; quota e gate PRO são obrigatórios antes de liberar volume
- **Download de vídeo**: depende de `yt-dlp` e da estabilidade dos endpoints de IG/TikTok/YouTube — casos de borda de download são risco de confiabilidade central
- **Direitos/atribuição**: não re-hospedar vídeo; sempre creditar e linkar a fonte; receita (fatos/procedimento) é reescrita de forma estruturada
- **Mobile-first no consumo**: a maior parte do consumo de feed é mobile — captura por link colado precisa ser impecável no celular; extensão cobre desktop

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Desacoplar captura (link/extensão/share) do pipeline por URL | Nenhum método único cobre todos os cenários; adaptadores plugam num motor único | — Pending |
| Link colado + extensão de browser no MVP | Link é universal (mobile+desktop); extensão dá DX de 1 clique no desktop | — Pending |
| Suportar IG + TikTok + YouTube desde o MVP | yt-dlp cobre as três num motor só; amplia o funil de aquisição | — Pending |
| Extração = áudio + caption (base); OCR = PRO | Cobre a maioria com custo moderado; OCR é enriquecimento caro reservado ao PRO | — Pending |
| Receita importada nasce privada + compartilhável; +5 likes → variante pública | Amarra o "compartilhar" com o loop de crescimento; reusa promoção por likes existente | — Pending |
| Crédito ao creator (@ + link perfil + link vídeo) | Ética/atribuição e potencial de descoberta; reduz risco de direitos | — Pending |
| Carrossel de 3 imagens (keyframes) editável + geração via CheffIA | Paridade com a home; qualidade visual sem depender só do frame bruto | — Pending |
| Importação básica grátis com quota; volume/imagem/OCR no PRO | Isca de aquisição no topo do funil + gate de custo de IA | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Business Context check — customer, revenue model, success metric still accurate?
4. Audit Out of Scope — reasons still valid?
5. Update Context with current state

---
*Last updated: 2026-07-01 after initialization*
