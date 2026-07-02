---
status: testing
phase: 04-cost-quota-gating-dedup
source: [04-VERIFICATION.md]
started: 2026-07-02T14:15:00Z
updated: 2026-07-02T14:55:00Z
---

## Current Test

number: 3
name: Cost figures sane on real data (COST-02 pricing review)
expected: |
  Importe um Short real; inspecione ImportJob.costCents — unidades cruas
  plausíveis (ASR-min ≈ duração, tokens LLM > 0, bytes > 0), cents = unidades ×
  tabela de preço; log [pipeline] cost só-números.
awaiting: user response

## Tests

### 1. npm run setup:db against live Atlas (04-02 Task 1, blocking gate)
expected: collMod applies the expanded costCents $jsonSchema validator + provisions the dedup_lookup {userId,normalizedUrl,status} index on import_jobs without error; import_usage collection/unique {userId,day} index provisioned. Precede o teste 2 (uma escrita real de costCents / o novo pipeline dependem deste sync).
result: pass
note: "Usuário rodou npm run setup:db (schema das Fases 3+4 sincronizado no Atlas); sem erro reportado."

### 2. Live dedup-hit routing + quota-exceeded PRO upsell (04-05 Task 4 checkpoint)
expected: |
  (1) Free user importa uma URL até sucesso, resubmete a MESMA URL em /import → cai em /recipe/[id] (receita existente), NÃO numa tela de progresso nova; o contador import_usage NÃO muda na reutilização.
  (2) Free user excedendo o limite diário (padrão 3/dia) é bloqueado com a MESMA mensagem de upsell PRO do gate de adapt/search; nenhum job enfileirado.
  (3) Uma URL previamente FALHA NÃO é deduplicada — resubmeter reroda o pipeline (D-05).
result: pass
note: "(1) dedup hit 'deu certinho'. (2) quota confirmada ao vivo — screenshot mostra 429 'Você usou 3 importações grátis de hoje. Assine o onFeed Pro'. (3) D-05 code-verified; um vídeo novo falhou com anti_bot_blocked (HTTP 403, YouTube bloqueando yt-dlp — limite externo/Fase 1, não bug da Fase 4; refund D-07 devolveu o slot). Dois feedbacks registrados em Gaps: quota não visível na tela; créditos/atribuição da fonte ausentes na receita."

### 3. Cost figures sane on real data (COST-02 pricing review)
expected: Importe um Short real; inspecione ImportJob.costCents — unidades cruas plausíveis (ASR-min ≈ duração do vídeo, tokens LLM > 0, bytes > 0), cents = unidades × tabela de preço do env.import; log [pipeline] cost só-números. Spot-check no preço de input do Sonnet 4.5 (RESEARCH A2 flagou ambiguidade introdutório vs padrão).
result: [pending]

## Summary

total: 3
passed: 1
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps

- truth: "A tela /import mostra o limite grátis (3/dia) ANTES de o usuário bater nele"
  status: enhancement
  reason: "UAT feedback: o bloqueio 429 (COST-03) funciona, mas o limite não é visível proativamente — usuário só descobre quando bloqueado. Backend tem o contador (getDailyImportCount, análogo a getDailyAdaptCount)."
  severity: minor
  scope: "COST-03 UX polish (Fase 4-adjacente)"

- truth: "A receita importada credita o vídeo de origem e o @autor/perfil (link ref)"
  status: enhancement
  reason: "UAT feedback: créditos/referência da fonte ausentes na tela. Backend JÁ persiste recipe.sourceMeta.{authorHandle, authorUrl, sourceUrl} (import.recipe-mapping.ts); gap é só de renderização no frontend (recipe/[id] + review não mostram). Decisão de produto anterior: 'creditar o @ do autor e um link ref'."
  severity: minor
  scope: "Atribuição — território da Fase 5 (SOC / full citizenship), mas fix pequeno (dados prontos)"
