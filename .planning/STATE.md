---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
current_phase: 5
current_phase_name: Publish, Promotion & Full Citizenship
status: executing
stopped_at: Phase 4 plans verified (6 plans, 0 blockers)
last_updated: "2026-07-02T16:40:21.471Z"
last_activity: 2026-07-02
last_activity_desc: Phase 04 complete, transitioned to Phase 5
progress:
  total_phases: 5
  completed_phases: 4
  total_plans: 22
  completed_plans: 22
  percent: 80
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-01)

**Core value:** Transformar um vídeo de receita do feed do usuário em uma receita real, correta e acionável (ingredientes com quantidade, passo a passo e dicas fiéis) dentro do onFeed. Se a extração for imprecisa, nada mais importa.
**Current focus:** Phase 04 — cost-quota-gating-dedup

## Current Position

Phase: 5 — Publish, Promotion & Full Citizenship
Plan: Not started
Status: Executing Phase 04
Last activity: 2026-07-02 — Phase 04 complete, transitioned to Phase 5

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**

- Total plans completed: 11
- Average duration: - min
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 03 | 5 | - | - |
| 04 | 6 | - | - |

**Recent Trend:**

- Last 5 plans: -
- Trend: -

*Updated after each plan completion*
| Phase 01-video-pipeline-foundation P01 | 35min | 3 tasks | 10 files |
| Phase 01 P03 | 45min | 3 tasks | 12 files |
| Phase 01-video-pipeline-foundation P04 | 40min | 3 tasks | 6 files |
| Phase 01 P05 | 50min | 2 tasks | 8 files |
| Phase 02-structured-extraction-recipe-persistence P01 | 35min | 3 tasks | 9 files |
| Phase 02 P02 | 45min | 2 tasks | 3 files |
| Phase 02-structured-extraction-recipe-persistence P03 | 6min | 3 tasks | 6 files |
| Phase 02-structured-extraction-recipe-persistence P04 | 15min | 2 tasks | 2 files |
| Phase 02-structured-extraction-recipe-persistence P05 | 45min | 3 tasks | 6 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Roadmap: Import worker deploys as a Render Background Worker (`src/workers/import-worker.ts`), not Lambda — Python/native-binary toolchain (yt-dlp/ffmpeg/Whisper) and variable-duration jobs exceed Lambda's 15-min ceiling.
- Roadmap: Phase order is risk-ordered (infra risk → extraction quality risk → UX → cost safety → promotion), not feature-ordered — de-risks the least-familiar piece (video pipeline/worker topology) first.
- Roadmap: Public promotion (Phase 5) gates on confidence AND likes together, not likes alone — prevents low-confidence imports from reaching the public catalog via popularity alone.
- [Phase 1]: Groq/OpenAI transcription keys use optional()+enabled (not required()) so a missing key fails one job, not the whole worker boot
- [Phase 1]: ImportJobMessage carries only { jobId } — the Mongo ImportJob doc is the sole source of truth for progress/idempotency (PIPE-06)
- [Phase 1]: Repository unit test mocks ImportJobModel instead of requiring a live Mongo connection — no test container introduced this phase
- [Phase 1]: ImportJobModel allowedMethods includes METHODS.UPDATE for atomic in-place status transitions, unlike FavoriteModel
- [Phase ?]: youtube-dl-exec named export (youtubeDl) used instead of default export — CJS/NodeNext callable-type mismatch
- [Phase ?]: youtube-dl-exec install requires YOUTUBE_DL_SKIP_DOWNLOAD=true locally (postinstall binary fetch timeout); real binary guaranteed by worker Dockerfile (Plan 06)
- [Phase ?]: Groq->OpenAI transcription fallback is a runtime try/catch in transcribe(), never an env-time swap; size guard (25MB) routes oversized audio straight to OpenAI
- [Phase 01-04]: getImportJob(jobId, userId?) uses an optional second param for ownership-scoped queries, blocking IDOR on GET /import/:jobId while preserving existing single-arg callers
- [Phase 01-04]: detectPlatform stays a strict SSRF allowlist (platform | null); a route-layer classifyRejectionReason helper distinguishes invalid_url vs unsupported_platform for CAP-02's specific-error requirement
- [Phase ?]: DownloadFailureReason (yt-dlp error vocabulary) explicitly mapped to ImportFailureReason (ImportJob state vocabulary) via toImportFailureReason() in pipeline.ts — the two unions diverge in purpose and are never assumed to be the same type
- [Phase ?]: handleMessage acks (returns) the SQS message on both real success and idempotent no-op; only a thrown error triggers processing_error and leaves the message for DLQ redrive
- [Phase ?]: visibility kept OUT of BSON required array; app-layer default 'public' in persistExtractedRecipe
- [Phase ?]: IMPORT_EXTRACTION_MODEL defaults to claude-sonnet-4-5 via env override (D-15); catalog EXTRACTION_MODEL stays haiku
- [Phase ?]: RecipeGrounding modeled as single nested object (titleGrounding/quantityGrounding/stepGrounding/nutrition/sourceDivergence) mirroring creatorSchema/nutritionSchema BSON pattern
- [Phase 02-02]: Grounding é inline por campo no schema de extração (quantityGrounding/grounding) — diferente do shape de persistência RecipeGrounding (mapas paralelos); mapeamento fica para plano de confidence gate/pipeline
- [Phase 02-02]: extractImportedRecipe usa max_tokens=6000 e effort='medium' (vs 4000/low do catálogo) — reconciliação+grounding é tarefa mais difícil e input maior
- [Phase 02-03]: DEFAULTS.sources in recipe.repository.ts left unchanged; 'imported' only added via owner-scoped listMyImportedRecipes (D-14)
- [Phase 02-03]: getRecipeById(id, userId?) folds ownership into one combined Mongo filter (getImportJob idiom), never fetch-then-compare
- [Phase 02-03]: Atlas index filter-field declaration is code-only; pre-existing environments need a manual index update since ensureSearchIndex only creates when absent
- [Phase ?]: Nutrition excluded entirely from computeConfidence's weighted field list (not scored as fixed 'inferred') since ImportedRecipeSchema never asks the model for nutrition grounding — avoids deterministic score depression without added signal
- [Phase ?]: Critical-field review override strictly follows D-03: only core ingredients (not garnish/optional) trigger reviewRequired when quantity is inferred
- [Phase 02-structured-extraction-recipe-persistence]: mapExtractedToRecipe returns { input, extracted, options } matching persistExtractedRecipe's real (input, extracted, opts) signature — the plan's literal '{ recipe, options }' wording didn't match the actual three-argument function signature
- [Phase 02-structured-extraction-recipe-persistence]: IngestOptions extended with reviewRequired/confidenceScore, threaded into persistExtractedRecipe's RecipeModel.insert — BSON schema already had both properties from Plan 01 but nothing wrote them onto the Recipe document
- [Phase 02-structured-extraction-recipe-persistence]: pipeline.ts extracting stage uses freshly-computed local transcript/caption/noSpeechDetected vars, not the stale job parameter — job is never locally mutated after the transcribing stage's DB write, so job.transcript would be undefined on the normal single-pass path

### Pending Todos

None yet.

### Blockers/Concerns

- Phase 1 needs phase-research at planning time: yt-dlp anti-bot/egress strategy for IG/TikTok from Render/AWS IPs, and exact Render Background Worker packaging — fast-moving, LOW-MEDIUM confidence per research/STACK.md.
- Phase 2 needs phase-research at planning time: PT-BR Whisper transcription accuracy (cooking slang, informal register) not yet empirically validated — must test against real onFeed sample clips before locking a transcription provider default.

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| *(none)* | | | |

## Session Continuity

Last session: 2026-07-02T13:30:49.132Z
Stopped at: Phase 4 plans verified (6 plans, 0 blockers)
Resume file: .planning/phases/04-cost-quota-gating-dedup/04-01-PLAN.md
