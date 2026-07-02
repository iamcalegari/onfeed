---
phase: 04-cost-quota-gating-dedup
plan: 03
subsystem: config
tags: [env-config, cost-tracking, quota, import-pipeline]

# Dependency graph
requires:
  - phase: 04-cost-quota-gating-dedup (Plan 01/02)
    provides: import_usage model, quota functions, costCents shape, dedup_lookup index
provides:
  - env.import.dailyLimitFree/Pro (import quota gate limits)
  - env.import price table (egress, ASR groq/openai, LLM in/out, embedding) for cost recording
affects: [04-05 (POST /import quota gate), 04-06 (pipeline cost recording)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Config-only cost/quota values: price-per-unit and quota limits live exclusively in env.ts via optional(), never as inline constants in pipeline code (D-08)"

key-files:
  created: []
  modified:
    - src/config/env.ts

key-decisions:
  - "dailyLimitFree/Pro mirror the adaptDailyLimitFree/Pro idiom exactly (Number(optional(...)) with IMPORT_ prefix, not reusing ADAPT_ keys)"
  - "Price table values are documented as low-confidence estimates (source-dated 2026-07-02, RESEARCH A1-A4), all env-overridable so corrections never require a deploy"
  - "Egress price is flagged as a rough proxy since video download never transits S3 (yt-dlp writes to worker disk) — raw bytes are the durable ground truth, cents are best-effort"

patterns-established:
  - "New cost-sensitive config additions extend the existing env block in place (never duplicate the block) and preserve prior entries untouched"

requirements-completed: [COST-02, COST-03]

coverage:
  - id: D1
    description: "env.import carries dailyLimitFree (default 3) and dailyLimitPro (default 50) for the import quota gate, without touching the existing maxDurationSec entry"
    requirement: COST-03
    verification:
      - kind: other
        ref: "grep -c dailyLimitFree/dailyLimitPro/maxDurationSec/IMPORT_DAILY_LIMIT_FREE src/config/env.ts (all >=1, single import block)"
        status: pass
    human_judgment: false
  - id: D2
    description: "env.import carries a documented per-unit price table (egress, ASR groq/openai, LLM in/out, embedding) sourced from env with defaults, for pipeline cost recording"
    requirement: COST-02
    verification:
      - kind: other
        ref: "grep -c priceCentsPerMtokLlmInput/priceCentsPerAsrMinuteGroq src/config/env.ts (>=1 each); npm run typecheck"
        status: pass
    human_judgment: false

# Metrics
duration: 6min
completed: 2026-07-02
status: complete
---

# Phase 4 Plan 3: Config de quota diária de import + tabela de preço Summary

**env.import ganha dailyLimitFree/Pro (3/50, espelhando adaptDailyLimitFree/Pro) e uma tabela de preço por unidade (egress, ASR, LLM, embedding) documentada como estimativa de baixa confiança, tudo via `optional()` com defaults, preservando o maxDurationSec da Fase 1.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-07-02T13:38:00Z
- **Completed:** 2026-07-02T13:44:00Z
- **Tasks:** 1 completed
- **Files modified:** 1

## Accomplishments
- `env.import.dailyLimitFree`/`dailyLimitPro` adicionados ao bloco existente, mesmo idioma de `env.anthropic.adaptDailyLimitFree/Pro`, preparando o gate de quota diária de import (COST-03, consumido pelo Plan 05)
- Tabela de preço por unidade (`priceCentsPerGbEgress`, `priceCentsPerAsrMinuteGroq/Openai`, `priceCentsPerMtokLlmInput/Output`, `priceCentsPerMtokEmbedding`) adicionada, cada valor via env var dedicada com default documentado (COST-02/D-08, consumido pelo Plan 06)
- `maxDurationSec` (Fase 1) preservado intacto no mesmo bloco — nenhum segundo bloco `import:` criado

## Task Commits

Each task was committed atomically:

1. **Task 1: Add import daily limits + price table to env.import (preserve maxDurationSec)** - `1fb136a` (feat)

**Plan metadata:** (pendente — commit final de docs/STATE feito pelo orquestrador)

## Files Created/Modified
- `src/config/env.ts` - Bloco `env.import` expandido com `dailyLimitFree`/`dailyLimitPro` e a tabela de preço por unidade (6 chaves), mantendo `maxDurationSec`

## Decisions Made
- Preço por unidade documentado com data-fonte (2026-07-02) e aviso de baixa confiança/necessidade de checagem humana no valor de input do LLM (RESEARCH A2, ambiguidade preço introdutório vs. padrão)
- Egress tratado explicitamente como proxy grosseiro — comentário explica que o vídeo não passa pelo S3 (baixa direto no disco do worker via yt-dlp), então bytes brutos são a métrica confiável e centavos é best-effort (RESEARCH A4)
- Nenhum valor de preço vive fora de config — cumprindo D-08 antes mesmo do pipeline (Plan 06) consumi-los

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required. Todos os novos valores têm defaults sensatos; overrides via env var são opcionais.

## Next Phase Readiness
- `env.import.dailyLimitFree/Pro` pronto para o gate de `POST /import` (Plan 05)
- `env.import` price table pronta para o registro de custo por estágio do pipeline (Plan 06)
- Nenhum bloqueio identificado

---
*Phase: 04-cost-quota-gating-dedup*
*Completed: 2026-07-02*

## Self-Check: PASSED
