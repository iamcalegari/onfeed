# Phase 4: Cost/Quota Gating & Dedup - Discussion Log

> **Audit trail only.** Decisões canônicas estão no CONTEXT.md.

**Date:** 2026-07-02
**Phase:** 4-cost-quota-gating-dedup
**Areas discussed:** Escopo + janela do dedup, Política de quota na submissão, Telemetria de custo, UX ao bater a quota

---

## Escopo + janela do dedup (CAP-03)

| Opção | Descrição | Selecionada |
|-------|-----------|-------------|
| **Por-usuário** | Reusa só a importação anterior do próprio usuário; respeita privacidade (D-14). Compartilhar entre usuários = Fase 5. | ✓ |
| Platform-wide (qualquer um) | Qualquer usuário reusa; mais econômico mas serviria extração privada de outro. | |
| Platform-wide só p/ públicas | Dedup entre usuários só quando a receita já é pública (amarra Fase 5). | |

**User's choice:** Por-usuário. **Notes:** falhas não deduplicam; sem TTL v1 (match permanente); "forçar re-importação" deferido.

## Política de quota na submissão (COST-01/03)

| Opção | Descrição | Selecionada |
|-------|-----------|-------------|
| **3/dia** | Espelha adaptDailyLimitFree=3; reserva atômica no submit; dedup-hit não conta; falha refunda; PRO teto alto. | ✓ |
| 1/dia | Mais conservador (import é caro). | |
| 5/dia | Mais generoso. | |

**User's choice:** 3/dia. **Notes:** dedup-hit não consome; refund em falha; `$inc` atômico anti-corrida.

## Telemetria de custo (COST-02)

| Opção | Descrição | Selecionada |
|-------|-----------|-------------|
| **Unidades cruas + centavos** | min ASR, tokens LLM, bytes, dims embedding + custo estimado (tabela de preço) no costCents + logs. Sem UI admin. | ✓ |
| Só unidades cruas | Sem tabela de preço; conversão depois. | |
| Só centavos estimados (total) | Só total por job; perde a quebra por estágio. | |

**User's choice:** Unidades cruas + centavos estimados. **Notes:** tabela de preço em config; sem dashboard v1.

## UX ao exceder a quota (COST-03)

| Opção | Descrição | Selecionada |
|-------|-----------|-------------|
| **Limite diário + upsell PRO** | Bloqueia no submit, "limite grátis N/dia — volte amanhã ou assine PRO", reusa o gate do adapt/search. | ✓ |
| Só upsell PRO | Foca no upgrade. | |
| Só "volte amanhã" | Sem empurrar PRO. | |

**User's choice:** Limite diário + upsell PRO. **Notes:** reusa o messaging PRO existente; nenhuma UI nova.

## Claude's Discretion

- Shape exato do retorno de dedup-hit; status HTTP do bloqueio de quota (espelhar adapt); ponto de decremento/refund da quota; valores de `IMPORT_DAILY_LIMIT_PRO` e da tabela de preço (via config/research).

## Deferred Ideas

- Dedup entre usuários / compartilhar extração → Fase 5. TTL / forçar re-importação → v2. UI/dashboard de custos → v2. OCR PRO → deferido de fases anteriores.
