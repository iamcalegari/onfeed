---
phase: 04-cost-quota-gating-dedup
plan: 02
subsystem: database
tags: [mongoat, mongodb, jsonschema, cost-telemetry, dedup, import]

# Dependency graph
requires:
  - phase: 04-cost-quota-gating-dedup
    provides: "Plano 04-01 — consumeDailyImportQuota/refundDailyImportQuota, import_usage model"
provides:
  - "ImportJob.costCents expandido para o shape nested por estágio (download/transcription/extraction/embedding/totalCents), no TS type e no validator BSON"
  - "Índice composto dedup_lookup {userId, normalizedUrl, status} em import_jobs"
  - "Teste de shape provando que costCents nested é type-valid e que ausência (docs pré-Fase-4) não quebra leitura"
affects: [04-cost-quota-gating-dedup-plan-04, 04-cost-quota-gating-dedup-plan-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "mongoat two-source-of-truth: TS type (import-job.types.ts) e BSON $jsonSchema validator (import-job.model.ts) mudam SEMPRE no mesmo commit"
    - "Campos de telemetria/custo permanecem opcionais em todos os níveis; consumidores leem via optional chaining, nunca assumem presença"

key-files:
  created:
    - src/modules/import/import-job.model.test.ts
  modified:
    - src/modules/import/import-job.types.ts
    - src/modules/import/import-job.model.ts
    - src/modules/import/README.md

key-decisions:
  - "costCents nested shape espelhado byte-a-byte entre TS type e validator BSON no mesmo commit, prevenindo a classe de bug DocumentValidationFailure que já falhou UAT nas Fases 2/3"
  - "costCents e todos os seus sub-campos permanecem opcionais (fora do array required) — nenhum backfill de docs antigos, apenas leitura defensiva via optional chaining"
  - "npm run setup:db NÃO foi executado nesta sessão automatizada — é um gate humano [BLOCKING] que requer credenciais live do Atlas em .env, que o ambiente do executor não pode ler"

patterns-established:
  - "Pattern: expansão de schema Mongoat sempre em par (types.ts + model.ts) num único commit atômico, com grep de verificação nos dois arquivos como critério de aceitação"

requirements-completed: [COST-02]

coverage:
  - id: D1
    description: "ImportJob.costCents expandido para shape nested por estágio (download/transcription/extraction/embedding/totalCents) no TS type"
    requirement: "COST-02"
    verification:
      - kind: unit
        ref: "src/modules/import/import-job.model.test.ts#aceita o shape nested completo de costCents"
        status: pass
      - kind: other
        ref: "npm run typecheck"
        status: pass
    human_judgment: false
  - id: D2
    description: "Validator BSON $jsonSchema em import-job.model.ts espelha exatamente o shape nested do TS type"
    requirement: "COST-02"
    verification:
      - kind: other
        ref: "grep -c inputTokens/totalCents em import-job.model.ts (>=1 cada), costCents fora do array required"
        status: pass
    human_judgment: false
  - id: D3
    description: "Índice composto dedup_lookup {userId, normalizedUrl, status} declarado em import-job.model.ts para a consulta findExistingSuccessfulImport do Plano 04"
    verification:
      - kind: other
        ref: "grep -c dedup_lookup em import-job.model.ts (==1)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Leitura de costCents ausente (docs pré-Fase-4) não lança erro — optional chaining comprovado"
    verification:
      - kind: unit
        ref: "src/modules/import/import-job.model.test.ts#lê costCents ausente como undefined via optional chaining, sem lançar erro"
        status: pass
    human_judgment: false
  - id: D5
    description: "npm run setup:db sincroniza o validator + índice dedup_lookup no Atlas live antes de qualquer escrita do novo shape"
    verification: []
    human_judgment: true
    rationale: "Gate humano explícito [BLOCKING] do plano — requer credenciais MONGODB_* do .env que o ambiente do executor automatizado não pode ler, e é uma mutação collMod contra o Atlas de produção/staging real. Não pode ser auto-verificado; precisa confirmação humana rodando o comando e observando o output."

# Metrics
duration: 12min
completed: 2026-07-02
status: complete
---

# Phase 4 Plan 02: Schema costCents nested + índice dedup_lookup Summary

**ImportJob.costCents expandido para o shape nested por estágio (download/transcription/extração/embedding + totalCents) em TS e validator BSON no mesmo commit, com índice dedup_lookup para o Plano 04 — sync no Atlas live via `npm run setup:db` pendente de confirmação humana.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-07-02T13:38:00Z
- **Completed:** 2026-07-02T13:50:00Z
- **Tasks:** 2/2 (código) + 1 gate humano pendente
- **Files modified:** 4 (2 código, 1 teste novo, 1 doc)

## Accomplishments
- `ImportJob.costCents` migrado do placeholder flat (`{download,transcription,total}: number`) para o shape nested por estágio exigido por COST-02: `download{bytes,cents}`, `transcription{minutes,cents}`, `extraction{inputTokens,outputTokens,cents}`, `embedding{tokens,cents}`, `totalCents`
- TS type (`import-job.types.ts`) e validator BSON `$jsonSchema` (`import-job.model.ts`) mudados no MESMO commit, com shape espelhado campo-a-campo — evita a classe de bug (`DocumentValidationFailure`) que derrubou o UAT das Fases 2/3
- Índice composto `dedup_lookup {userId, normalizedUrl, status}` declarado em `import-job.model.ts`, servindo a futura consulta `findExistingSuccessfulImport` do Plano 04
- Teste de shape (`import-job.model.test.ts`) prova (a) o shape nested completo é atribuível e legível, e (b) `costCents` ausente em docs pré-Fase-4 lê como `undefined` via optional chaining sem lançar erro
- README.md do módulo atualizado em estilo Obsidian: novo callout de topo, seção dedicada `### costCents`, tabela de arquivos atualizada

## Task Commits

Each task was committed atomically:

1. **Task 1: Expandir costCents (type + validator BSON) + índice dedup_lookup** - `2f0c3b4` (feat)
2. **Task 2: Teste de shape do modelo** - `854d4d7` (test)
3. **Docs: README do módulo em estilo Obsidian** - `577e503` (docs)

**Plan metadata:** (este commit, feito pelo orquestrador)

## Files Created/Modified
- `src/modules/import/import-job.types.ts` - `costCents` agora é o shape nested por estágio (download/transcription/extraction/embedding/totalCents), todos os campos opcionais
- `src/modules/import/import-job.model.ts` - validator BSON `$jsonSchema` espelhando o shape nested; índice `dedup_lookup {userId, normalizedUrl, status}` adicionado ao array `indexes`
- `src/modules/import/import-job.model.test.ts` - **novo** — teste de shape puro (sem Mongo): shape nested completo é type-válido e legível; leitura de `costCents` ausente não lança
- `src/modules/import/README.md` - callout de topo da Fase 4/Plano 04-02, seção `### costCents` com o gotcha das duas fontes de verdade, tabela de arquivos atualizada

## Decisions Made
- O shape nested cobre exatamente os 4 estágios do pipeline (download/transcrição/extração/embedding) mais um `totalCents` agregado — corresponde 1:1 ao que o Plano 06 vai popular por estágio
- Nenhum sub-campo é obrigatório em nenhum nível (nem `costCents` no `required` do documento, nem os campos dentro de cada sub-objeto) — decisão deliberada para nunca quebrar leitura de docs anteriores à Fase 4
- Verificado que nenhum código consumidor atual (`grep -rn costCents src/` fora de `.types.ts`/`.model.ts`) referencia o shape antigo — a mudança é segura porque ainda não há nenhum leitor/escritor de `costCents` em produção; o Plano 06 será o primeiro consumidor real

## Deviations from Plan

None - plano executado exatamente como especificado, respeitando a `critical_deviation_authorization` explícita do prompt de execução: as mudanças de código + o teste foram feitos e commitados normalmente; `npm run setup:db` foi deliberadamente NÃO executado (ver seção abaixo).

## Issues Encountered
None.

## User Setup Required

**`npm run setup:db` — PENDENTE (gate humano, [BLOCKING])**

Este passo NÃO foi executado nesta sessão automatizada, por decisão explícita do prompt de execução: o ambiente do orquestrador não tem acesso às credenciais live do Atlas (`.env` — `MONGODB_URI`/`MONGODB_USERNAME`/`MONGODB_PASSWORD`/`MONGODB_DB_NAME`) e não deve mutar o validator/índices de produção sem confirmação humana.

**O que fazer:**
```bash
npm run setup:db
```

**O que esse comando faz:** executa `src/infra/database/setup.ts` → `connectDatabase()` + `database.setupCollections()`, que aplica via `collMod` o `$jsonSchema` atualizado (novo shape nested de `costCents`) e provisiona o índice `dedup_lookup` na coleção `import_jobs` do Atlas live.

**Por que é necessário antes de qualquer escrita do novo shape:** o validator do Atlas hoje só conhece o shape ANTIGO e flat de `costCents`. Uma escrita real do shape nested (que o Plano 06 fará) contra um validator não sincronizado falha com `MongoServerError: Document failed validation` — exatamente a classe de falha que já quebrou o UAT das Fases 2/3 quando type e validator (ou validator e Atlas live) divergiram. Sem o índice `dedup_lookup` sincronizado, a consulta `findExistingSuccessfulImport` do Plano 04 também roda sem esse índice até o sync acontecer.

**Verificação após rodar:** confirmar no output do comando que a coleção `import_jobs` teve seu validator/índices atualizados sem erro (o script loga o resultado de `setupCollections`).

## Next Phase Readiness
- Código e testes do schema `costCents`/`dedup_lookup` estão prontos e commitados; typecheck e suíte completa do módulo `import` (65 testes) passam
- **Bloqueio para o Plano 06** (que populará `costCents` no pipeline real): `npm run setup:db` precisa ser confirmado por um humano antes de qualquer escrita do novo shape em produção
- O Plano 04 (dedup lookup) pode ser planejado/implementado em paralelo, mas sua consulta só terá o índice `dedup_lookup` de fato disponível no Atlas após o `setup:db` rodar

---
*Phase: 04-cost-quota-gating-dedup*
*Completed: 2026-07-02*

## Self-Check: PASSED

All created/modified files confirmed on disk; all task commit hashes (`2f0c3b4`, `854d4d7`, `577e503`) confirmed in `git log`.
