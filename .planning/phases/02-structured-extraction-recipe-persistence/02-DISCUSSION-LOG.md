# Phase 2: Structured Extraction & Recipe Persistence - Discussion Log

> **Audit trail only.** Decisões canônicas estão no CONTEXT.md.

**Date:** 2026-07-01
**Phase:** 2-structured-extraction-recipe-persistence
**Areas discussed:** Confiança/grounding + gate, Campos ambíguos/faltantes, Conflito transcript vs caption, Dimensões I/E/T/N + nutrição

---

## Confiança / grounding + gate de revisão

| Opção | Selecionada |
|-------|-------------|
| Por campo + gate por proporção/criticidade | |
| **Ambos: por campo (grounded/inferred/ambiguous) + score agregado** | ✓ |
| Só score global 0-1 | |

**Notas:** review disparado por proporção de inferidos OU campo crítico (quantidade) inferido; baixa confiança nunca auto-publica (EXT-05).

## Campos ambíguos / faltantes

| Opção | Selecionada |
|-------|-------------|
| **Preserva literal + marca; nunca inventa número** | ✓ |
| Deixa vazio quando não numérico | |
| Sempre normaliza p/ número | |

**Notas:** "a gosto"/"1 pitada" preservados como ambiguous; faltante → null inferred; título ausente → LLM propõe (inferred).

## Conflito transcript vs caption

| Opção | Selecionada |
|-------|-------------|
| **Adaptativo: caption forte se receita escrita; senão áudio; conflito → review** | ✓ |
| Transcript sempre prevalece | |
| Caption sempre prevalece | |

## Dimensões I/E/T/N + nutrição

| Opção | Selecionada |
|-------|-------------|
| **LLM extrai I/E/T; N via mecanismo do catálogo (não inventa macro)** | ✓ |
| Sem N por ora (I/E/T só) | |
| LLM estima tudo incluindo N | |

**Notas:** descoberto que `recipe.extraction.ts` já faz o LLM estimar nutrition (null permitido) — "pipeline do catálogo" = esse mesmo mecanismo; a nutrição estimada é marcada `inferred` no grounding (honesta por construção).

## Deferred Ideas

- OCR (v2/PRO); cálculo nutricional próprio por ingrediente; tela de revisão (Fase 3); promoção pública gated (Fase 5).
