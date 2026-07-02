# Phase 2: Structured Extraction & Recipe Persistence - Context

**Gathered:** 2026-07-01
**Status:** Ready for planning

<domain>
## Phase Boundary

O transcript + caption produzidos pela Fase 1 viram uma **receita estruturada** (título, ingredientes com quantidade+unidade, passos ordenados, dicas), com **confiança/grounding por campo**, ingredientes **canonicalizados**, **embedding Voyage**, e roteamento para **revisão obrigatória** quando a confiança global é baixa. Reusa o motor de extração LLM existente (`recipe.extraction.ts`, Claude structured outputs + zod). Cobre EXT-01..05.

**Fora de escopo desta fase:** a tela de revisão em si (Fase 3), OCR (v2), promoção pública/likes (Fase 5), quota/dedup (Fase 4). A extração aqui produz a receita `ready_for_review` privada; a UI de revisão é a Fase 3.

</domain>

<decisions>
## Implementation Decisions

### Confiança / grounding (Core Value — EXT-02, EXT-05)
- **D-01:** Grounding **por campo** — cada ingrediente e cada passo carrega um sinal `grounded` (declarado no transcript/caption) | `inferred` (preenchido pelo modelo) | `ambiguous` (dito de forma imprecisa, ex.: "a gosto").
- **D-02:** Além do por-campo, um **score de confiança agregado** derivado (proporção de campos grounded vs inferred/ambiguous, com peso maior para campos críticos).
- **D-03:** **Review obrigatório** é disparado quando: a proporção de campos inferidos/ambíguos passa de um limiar OU um **campo crítico** (quantidade/unidade de ingrediente principal, ou o título) é `inferred`. É **estruturalmente impossível** uma extração de baixa confiança auto-publicar (EXT-05) — ela só pode chegar a `ready_for_review`, nunca direto a público (a promoção pública é gated na Fase 5 por confiança E likes).

### Campos ambíguos / faltantes (EXT-01)
- **D-04:** Quantidades ambíguas são **preservadas literalmente** ("a gosto", "1 pitada", "q.b.") no campo, marcadas `ambiguous` — nunca convertidas para um número fabricado. Conecta com o fix de quantity+unit existente ([[ingredientes-quantidade-display]]).
- **D-05:** Quantidade totalmente ausente → campo `null`, marcado `inferred`; **nunca fabrica número**.
- **D-06:** Título ausente no conteúdo → o LLM **propõe** um título, marcado `inferred`. Porções/rendimento → estima se der, senão `null`.

### Conflito entre fontes (EXT-01)
- **D-07:** Conciliação **adaptativa** transcript (áudio, via Groq) vs caption (texto do post): se a caption contém a **receita escrita** (lista de ingredientes/passos estruturados), ela é a fonte mais confiável (texto > ASR); senão o **transcript é a espinha dorsal** e a caption complementa (título, quantidades, dicas).
- **D-08:** Divergência **explícita** entre as duas fontes num campo → o campo é marcado para revisão (contribui para o gate de D-03). OCR não entra aqui (é v2); nesta fase são só áudio + caption.

### Dimensões I/E/T/N + nutrição (EXT-04)
- **D-09:** O LLM extrai **I** (ingredientes), **E** (equipamentos) e **T** (tempo) do conteúdo. **Ocasião** (semântica) também quando inferível.
- **D-10:** **Nutrição (N) reusa o mecanismo do catálogo** — o mesmo `recipe.extraction.ts` já faz o LLM estimar `nutrition` por porção (calories/protein/carbs/fat, `null` quando não dá para estimar com confiança). A Fase 2 usa esse mesmo mecanismo; a nutrição estimada é marcada como **`inferred`** no grounding — honesta por construção, não "inventada" silenciosamente. Não introduz um cálculo nutricional novo por ingrediente (os ingredientes do catálogo não têm tabela nutricional hoje).

### Reuso do motor de extração (EXT-03)
- **D-11:** Espelha `recipe.extraction.ts` (schema zod + Claude structured outputs), estendido com o grounding por campo (D-01). Input muda de "receita base" para "transcript + caption".
- **D-12:** Ingredientes extraídos passam pela **canonicalização existente** (match exato → semântico → pending), **sem lógica paralela/duplicada** (EXT-03). Reusa `resolveCanonicalForIngestion`/o mesmo caminho do catálogo.
- **D-13:** A receita persistida recebe **embedding Voyage** e entra na **busca híbrida I/E/T/N** para o usuário importador (EXT-04), reusando o pipeline de embedding existente. Persistência via o padrão `persistExtractedRecipe`, com `source: "imported"`, `visibility: private` (campos novos — `visibility`, `source:"imported"`, `grounding` e o back-reference `importJobId`/`recipeId` não existem hoje e são criados aqui).
- **D-14 (SEGURANÇA — obrigatório, achado do research):** a busca (`hybridSearch`) hoje NÃO tem owner-scoping — `DEFAULTS.sources` cobre só curated/generated_validated/variant/user. Uma receita importada é **privada**, então NÃO pode simplesmente entrar em `DEFAULTS.sources`, senão vazaria os imports privados de todos para todos. A receita importada só é buscável **pelo próprio dono** (query owner-scoped por `userId`) enquanto `visibility: private`; ela só entra na busca pública quando **promovida** (Fase 5, por confiança + likes). O planner DEVE implementar o filtro por dono, não apenas adicionar "imported" à allowlist de sources.
- **D-15:** Modelo da extração = **Claude Sonnet** (decisão do usuário — é o Core Value; melhor que o default do catálogo para grounding+conciliação, mais barato que Opus). Correção: o default de extração do catálogo hoje é `claude-haiku-4-5`, NÃO opus — não hardcodar opus. Modelo configurável via env, seguindo o padrão existente.

### Claude's Discretion
- Effort do modelo (o modelo em si é Sonnet, D-15) — 1 chamada por extração.
- Forma exata do schema de grounding (flag inline por item vs mapa paralelo de confiança), nome dos campos, e o cálculo do score agregado + limiares concretos do gate — o planner define, ancorado em D-01..D-03.
- Open questions do research a resolver no plano: EXT-05 usa estado distinto vs sempre `ready_for_review` + flag `requiresReview`/score (provável: sempre ready_for_review + flag, já que a UI é Fase 3); forma do `visibility` (mínimo private|public agora, enum rico na Fase 5); estrutura do `sourceDivergence` (para a UI da Fase 3).
- Como o `noSpeechDetected` (Fase 1) alimenta a extração: se sem fala, a extração recai só na caption (e provavelmente vira baixa confiança → review).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Projeto / fase
- `.planning/PROJECT.md` — Core Value (extração correta), decisões-chave
- `.planning/ROADMAP.md` §Phase 2 — goal + success criteria (EXT-01..05)
- `.planning/REQUIREMENTS.md` — EXT-01..05
- `.planning/phases/01-video-pipeline-foundation/01-SUMMARY.md` e os SUMMARYs 01-01..01-06 — o que a Fase 1 entrega (ImportJob com transcript/caption/sourceMeta/noSpeechDetected; status `extracting` é stub a ser preenchido)

### Código existente a espelhar/reusar (crítico — não duplicar)
- `src/modules/recipes/recipe.extraction.ts` — schema zod + prompt Claude a espelhar (título, ingredientes quantidade+unidade, passos com tempo, nutrition estimada com null)
- `src/modules/recipes/recipe.generation.ts` — `adaptRecipe`/`persistExtractedRecipe` (padrão de persistência da receita extraída, `generated_pending`)
- `src/modules/ingredients/ingredient.service.ts` (+ `ingredient.substitutions.ts`) — canonicalização (match exato → semântico → pending); ver [[canonicalizacao-ingredientes]]
- `src/infra/embeddings/voyage.client.ts` — embedding Voyage
- `src/modules/recipes/recipe.types.ts` / `recipe.model.ts` — schema da Recipe (Nutrition required: calories/protein/carbs/fat; NutritionGoal satiety|macros) e o `source`/`type`/`visibility`
- `src/modules/import/import-job.types.ts` / `import-job.repository.ts` — ImportJob (status `extracting`→`ready_for_review`, campos transcript/caption/sourceMeta) a ligar na extração
- `src/infra/video/pipeline.ts` — onde o estágio `extracting` está stubbed na Fase 1 (o ponto de integração da extração real)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `recipe.extraction.ts`: schema zod + prompt Claude quase pronto — a Fase 2 estende com grounding e troca o input para transcript+caption. Já estima nutrition com `null` permitido (base de D-10).
- Canonicalização de ingredientes: caminho único a reusar (D-12) — não reimplementar.
- Voyage embedding + `persistExtractedRecipe`: persistência + indexação para a busca (D-13).
- ImportJob (Fase 1): já tem transcript, caption, sourceMeta, noSpeechDetected; o estágio `extracting` no `pipeline.ts` é o ponto de plug da extração real (hoje stub → ready_for_review direto).

### Established Patterns
- Structured outputs + zod + Claude (effort medium) é o padrão do projeto para extração. Uma chamada por operação.
- Nutrition sempre estimada/derivada, nunca número solto do usuário — a Fase 2 mantém isso e adiciona honestidade explícita (grounding inferred).

### Integration Points
- `pipeline.ts` estágio `extracting`: chamar a nova extração → mapear para Recipe (source imported, private) → canonicalizar → embed → persistir → setar confidence + status (`ready_for_review`, ou review-required flag).
- Recipe schema pode precisar de campos novos: grounding/confidence por campo + score agregado, e o vínculo com o ImportJob/sourceVideo (parte já na Fase 1).

</code_context>

<specifics>
## Specific Ideas

- Validado na Fase 1: o transcript do Groq de um Short de risoto é rico o bastante (ingredientes do caldo, técnica, arroz carnaroli) para uma extração estruturada de qualidade — a Fase 2 tem insumo real bom para testar.
- A honestidade do grounding é o diferencial: a nutrição estimada e as quantidades inferidas ficam visíveis como `inferred`, alimentando a tela de revisão da Fase 3.

</specifics>

<deferred>
## Deferred Ideas

- OCR de texto na tela como terceira fonte de extração — v2/PRO.
- Cálculo nutricional próprio por ingrediente (tabela nutricional no catálogo de ingredientes) — fora de escopo; hoje N é estimada pelo LLM.
- Tela de revisão/edição (consome o grounding) — Fase 3.
- Promoção pública gated por confiança + likes — Fase 5.

</deferred>

---

*Phase: 2-structured-extraction-recipe-persistence*
*Context gathered: 2026-07-01*
