# Phase 3: Capture & Mandatory Review UI - Discussion Log

> **Audit trail only.** Decisões canônicas estão no CONTEXT.md.

**Date:** 2026-07-02
**Phase:** 3-capture-mandatory-review-ui
**Areas discussed:** Entrada da captura + clipboard, Progresso da importação, Tela de revisão (grounding + edição), Destino + listagem, Naming do assistente de IA

---

## Entrada da captura + clipboard

| Opção | Selecionada |
|-------|-------------|
| **Rota /import + botão 'Colar' inteligente** | ✓ |
| FAB global (+) em todas as telas | |
| Item discreto no menu/header | |

**Notas:** clipboard em web precisa de gesto do usuário (browser bloqueia leitura silenciosa no load); banner-ao-abrir nativo é v2.

## Progresso da importação

| Opção | Selecionada |
|-------|-------------|
| **Tela de progresso com etapas reais (polling)** | ✓ |
| Lista de imports com status | |
| Toast + avisa quando pronto | |

## Tela de revisão (grounding + edição)

| Opção | Selecionada |
|-------|-------------|
| **Editável inline + destaque no inferido/ambíguo** | ✓ |
| Formulário editável, sem destaque de grounding | |
| Read-only + editar opt-in por campo | |

## Destino + listagem

| Opção | Selecionada |
|-------|-------------|
| **Seção 'Minhas importações' + abre o detalhe** | ✓ |
| Entra nos favoritos existentes | |
| Só o detalhe, listagem depois | |

## Naming do assistente de IA

| Opção | Selecionada |
|-------|-------------|
| Chefia (grafia limpa — recomendação do orquestrador) | |
| **CheffIA (manter)** | ✓ |
| ChefIA (um f) | |

**Notas:** usuário avaliou a proposta 'Chefia' mas preferiu manter 'CheffIA' (trocadilho ô chefia/garçom + Chef + IA). Sem mudança no código.

## Deferred Ideas

- Banner clipboard automático ao abrir (nativo/PWA) — v2; extensão de browser — v2; carrossel + CheffIA na revisão — v2; promoção/likes — Fase 5.
