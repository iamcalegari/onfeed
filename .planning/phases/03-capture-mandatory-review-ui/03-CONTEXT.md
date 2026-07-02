# Phase 3: Capture & Mandatory Review UI - Context

**Gathered:** 2026-07-02
**Status:** Ready for planning

<domain>
## Phase Boundary

As telas do onFeed Import no frontend (Next.js `web/`): o usuário cola um link de vídeo (ou usa o botão "Colar" inteligente), acompanha o progresso real da importação (baixando → transcrevendo → extraindo) e passa por uma **tela de revisão obrigatória** onde vê a receita extraída com os campos `inferred`/`ambiguous` destacados, edita inline, e confirma. Só após confirmar a receita é tratada como salva. Cobre CAP-01, REV-01..04.

**Fora de escopo:** o motor de extração (Fase 2, pronto); a detecção de clipboard "banner automático ao abrir" pleno (limitação do browser — v2/nativo); carrossel de imagens + geração via CheffIA (v2); promoção pública/likes (Fase 5).

</domain>

<decisions>
## Implementation Decisions

### Captura / entrada (CAP-01)
- **D-01:** Rota dedicada **`/import`** (App Router, dentro de `web/app/(main)/import/`), acessível pelo header/menu. Não é FAB global.
- **D-02:** Botão destacado **"Colar link"** que lê o clipboard sob permissão (`navigator.clipboard.readText()`), auto-detecta a plataforma (reusa o `detectPlatform`/validação já exposta pela API) e pré-preenche o campo. Também reconhece a URL no evento **`paste`** manual. É a versão web viável da ideia "clipboard estilo PIX".
- **D-03:** Nuance registrada: o browser NÃO permite ler o clipboard silenciosamente no load (privacidade; iOS Safari mais restrito) — por isso a leitura acontece sob um **gesto do usuário** (clicar em "Colar"). O "banner automático ao abrir o app" pleno depende de app nativo/PWA instalado → v2 (ver [[produto-ideias]] clipboard).

### Progresso da importação (CAP-01 SC1)
- **D-04:** Após submeter, o `POST /import` retorna imediatamente (job enfileirado) e a UI vai para uma **tela de progresso com etapas reais** — não um spinner genérico. Mostra o estágio atual (queued → downloading → transcribing → extracting) fazendo **polling do `GET /import/:jobId`**.
- **D-05:** Ao chegar em `ready_for_review`, a tela leva o usuário à **revisão**. Em `failed`, mostra o `failureReason` de forma legível (ex.: bloqueio de plataforma, extração falhou) com opção de tentar outra URL.

### Tela de revisão (REV-01..04)
- **D-06:** Campos **editáveis inline**: título, ingredientes (nome + quantidade + unidade), passos, dicas/intro. Nada de redirect silencioso para "pronto" (REV-01).
- **D-07:** Campos marcados `inferred` ou `ambiguous` no `grounding` ganham **destaque visual** (cor/badge "confira isto") para o usuário saber o que revisar (REV-02). `grounded` fica neutro. O `grounding` vem por índice paralelo aos arrays (`quantityGrounding[i]`, `stepGrounding[i]`, `titleGrounding`).
- **D-08:** A receita só é **persistida como confirmada** após o usuário clicar em confirmar (REV-04). Enquanto não confirma, ela permanece `ready_for_review`/privada. (O endpoint de confirmação/edição pode ser novo — o researcher/planner define; hoje a receita já existe `private` desde a Fase 2, então "confirmar" é uma transição de estado + persistir as edições.)

### Destino + listagem (destino)
- **D-09:** Nova seção/rota **"Minhas importações"** que lista as receitas importadas do usuário via **`listMyImportedRecipes(userId)`** (owner-scoped, Fase 2). Mostra status (em revisão / confirmada) e leva ao detalhe/revisão.
- **D-10:** Ao confirmar a revisão, abre o **detalhe da receita** — que já é cidadã de primeira classe (busca I/E/T/N, adaptar macros, lista de compras, cook mode). Reusa a tela de detalhe existente (`web/app/(main)/recipe/[id]`).

### Branding
- **D-11:** O assistente de IA permanece **CheffIA** (decisão do usuário — mantém o trocadilho "ô chefia"/garçom + Chef + IA). Sem mudança de nome. Não é feature desta fase (o CheffIA gerador de imagem é v2); registrado só para não reabrir.

### Claude's Discretion
- Design visual concreto (componentes, cores, badges de grounding), empty states, tratamento de erro/retry na UI, layout mobile vs desktop — o **UI-SPEC** (gerado no plan-phase) define. Reusar os componentes/estilo existentes do `web/` (Tailwind v4, os Cards e padrões das telas atuais).
- Se "confirmar a revisão" precisa de um endpoint novo (`PATCH /import/:jobId/recipe` ou similar) para salvar as edições + marcar confirmada, ou se reusa um endpoint existente — researcher/planner decide (a API da Fase 1/2 tem `POST /import` e `GET /import/:jobId`; a edição/confirmação é provável novo endpoint).
- Polling: intervalo, backoff, e se usa SWR/react-query ou fetch manual — seguir o padrão do `web/lib/api.ts` e das telas existentes.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Projeto / fase
- `.planning/PROJECT.md` — Core Value, decisões de captura (link + extensão v1; clipboard)
- `.planning/ROADMAP.md` §Phase 3 — goal + success criteria (CAP-01, REV-01..04)
- `.planning/REQUIREMENTS.md` — CAP-01, REV-01..05
- `.planning/phases/02-structured-extraction-recipe-persistence/02-05-SUMMARY.md` — o que a extração produz (ImportJob ready_for_review + recipeId + reviewRequired + confidenceScore; Recipe com grounding)

### Backend a consumir (já pronto)
- `src/modules/import/import.routes.ts` — `POST /import` (valida+enfileira), `GET /import/:jobId` (status, owner-scoped)
- `src/modules/import/import.service.ts` — `detectPlatform`, `normalizeUrl`, `listMyImportedRecipes(userId)` (EXT-04)
- `src/modules/import/import-job.types.ts` — ImportJobStatus (queued→...→ready_for_review/failed), campos recipeId/reviewRequired/confidenceScore
- `src/modules/recipes/recipe.types.ts` — Recipe + `RecipeGrounding` (titleGrounding, quantityGrounding[], stepGrounding[], sourceDivergence) — o shape que a tela de revisão renderiza

### Frontend a reusar
- `web/lib/api.ts` — client server-only com auth (Bearer via Clerk) para chamar a API `/api/v1/*`
- `web/app/(main)/` — padrão de rotas/telas existentes (buscar, results, recipe/[id], favorites, pantry) e componentes
- `web/app/(main)/recipe/[id]/` — tela de detalhe da receita (destino após confirmar)
- `web/app/(main)/favorites/` e `web/app/(main)/pantry/` — padrões de listagem/estado por usuário a espelhar para "Minhas importações"

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `web/lib/api.ts`: wrapper de fetch autenticado — usar para POST /import, GET /import/:jobId, e a listagem.
- Telas existentes (buscar/results/recipe/favorites/pantry): padrões de layout, Cards, loading states, auth guard a espelhar.
- Detalhe da receita (`recipe/[id]`): destino após confirmar; a receita importada já entra lá (cidadania da Fase 2).
- `detectPlatform`/validação da API: reusar para o "Colar" inteligente (validar a URL do clipboard antes de submeter).

### Established Patterns
- Next.js App Router (Tailwind v4), auth Clerk (token via `auth().getToken()` no lib server-only), `<Show when=...>` para guards condicionais.
- Rotas em `web/app/(main)/*`; nova rota `import/` segue a convenção.

### Integration Points
- `POST /api/v1/import` (enfileira), `GET /api/v1/import/:jobId` (polling de status), listagem via `listMyImportedRecipes` (novo endpoint HTTP provável, ou expor via rota).
- Confirmação/edição da revisão: provável novo endpoint (`PATCH`/`POST /import/:jobId/confirm`) — a definir no research/plan.

</code_context>

<specifics>
## Specific Ideas

- O grounding que a tela de revisão destaca é REAL e já validado: no teste do risoto, título = `inferred`, "a gosto" = `ambiguous`, ingredientes ditos = `grounded`. A UI destaca justamente esses para o usuário conferir.
- "Colar link" inteligente é a versão web da ideia estilo PIX do usuário; o banner-ao-abrir nativo fica pra v2.

</specifics>

<deferred>
## Deferred Ideas

- Banner de clipboard automático ao abrir o app (nativo/PWA) — v2 ([[produto-ideias]] clipboard estilo PIX).
- Extensão de browser como adaptador de captura — v2.
- Carrossel de 3 imagens + geração via CheffIA na revisão — v2.
- Promoção pública / likes / compartilhamento — Fase 5.

</deferred>

---

*Phase: 3-capture-mandatory-review-ui*
*Context gathered: 2026-07-02*
