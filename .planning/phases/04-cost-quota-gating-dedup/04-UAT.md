---
status: testing
phase: 04-cost-quota-gating-dedup
source: [04-VERIFICATION.md]
started: 2026-07-02T14:15:00Z
updated: 2026-07-02T14:15:00Z
---

## Current Test

number: 1
name: npm run setup:db against live Atlas (04-02 blocking gate)
expected: |
  collMod applies the expanded costCents $jsonSchema validator and provisions the
  dedup_lookup {userId,normalizedUrl,status} compound index without error; the
  import_usage collection/unique index exists.
awaiting: user response

## Tests

### 1. npm run setup:db against live Atlas (04-02 Task 1, blocking gate)
expected: collMod applies the expanded costCents $jsonSchema validator + provisions the dedup_lookup {userId,normalizedUrl,status} index on import_jobs without error; import_usage collection/unique {userId,day} index provisioned. Precede o teste 2 (uma escrita real de costCents / o novo pipeline dependem deste sync).
result: [pending]

### 2. Live dedup-hit routing + quota-exceeded PRO upsell (04-05 Task 4 checkpoint)
expected: |
  (1) Free user importa uma URL até sucesso, resubmete a MESMA URL em /import → cai em /recipe/[id] (receita existente), NÃO numa tela de progresso nova; o contador import_usage NÃO muda na reutilização.
  (2) Free user excedendo o limite diário (padrão 3/dia) é bloqueado com a MESMA mensagem de upsell PRO do gate de adapt/search; nenhum job enfileirado.
  (3) Uma URL previamente FALHA NÃO é deduplicada — resubmeter reroda o pipeline (D-05).
result: [pending]

### 3. Cost figures sane on real data (COST-02 pricing review)
expected: Importe um Short real; inspecione ImportJob.costCents — unidades cruas plausíveis (ASR-min ≈ duração do vídeo, tokens LLM > 0, bytes > 0), cents = unidades × tabela de preço do env.import; log [pipeline] cost só-números. Spot-check no preço de input do Sonnet 4.5 (RESEARCH A2 flagou ambiguidade introdutório vs padrão).
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
