# Phase 1: Video Pipeline Foundation - Context

**Gathered:** 2026-07-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Dado uma URL de vídeo suportada, o sistema baixa o vídeo, transcreve o áudio, captura caption + metadados de origem, extrai 1 keyframe representativo e limpa a mídia bruta — tudo rastreado ponta-a-ponta por um `ImportJob` state machine resiliente rodando num worker recém-deployado. A **extração estruturada é stubbed** nesta fase (é a Fase 2). Cobre PIPE-01..07 e CAP-02.

**Fora de escopo desta fase:** extração LLM da receita, confidence/grounding, tela de revisão, quota/dedup, captura por link na UI, promoção/likes. Essas vêm nas Fases 2-5.

</domain>

<decisions>
## Implementation Decisions

### Download & anti-bot (egress)
- **D-01:** Estratégia de egress = **yt-dlp direto dos IPs do worker** no MVP. Não introduzir proxy residencial nem API de extração gerenciada agora.
- **D-02:** Bloqueio/rate-limit de plataforma é um **estado de falha monitorado**, não um erro genérico. A fase DEVE emitir **telemetria de taxa de sucesso por plataforma** e ter um **circuit breaker** que degrada em vez de martelar uma plataforma quebrada (PIPE-07).
- **D-03:** Proxy residencial ou API paga só entram **depois**, e apenas se a taxa de sucesso real medida for ruim. A decisão de investir vem dos números da telemetria, não de suposição.

### Provider de transcrição
- **D-04:** Transcrição = **Groq `whisper-large-v3-turbo` como primário**, **OpenAI Whisper como fallback**. Cloud, barato/rápido.
- **D-05:** A qualidade em **PT-BR (gíria de cozinha, registro informal, ruído de fundo)** deve ser validada empiricamente com clipes reais do onFeed cedo na fase, antes de travar o provider como padrão. Não confiar só em benchmarks (English-centric).
- **D-06:** Clipe sem fala real (só música/silêncio) é **sinalizado como low/no-speech** (pré-filtro/VAD) em vez de entregar transcrição alucinada ao passo seguinte (PIPE-02).

### Escopo de plataformas
- **D-07:** Pipeline construído **agnóstico de plataforma** (um motor yt-dlp para os 3).
- **D-08:** Critério de sucesso da fase exige **YouTube + TikTok confiáveis**. **Instagram entra como best-effort** com estado de falha tratado (é o mais hostil ao yt-dlp) — não bloqueia o fechamento da fase se o IG estiver instável.

### Retenção de dados
- **D-09:** **Vídeo e áudio brutos são apagados imediatamente** após o processamento do job (postura legal — não re-hospedar mídia de terceiros; PIPE-05).
- **D-10:** **Retém: keyframe** (vira imagem da receita), **transcrição** (texto derivado) e **metadados de origem** (plataforma, URL do vídeo, @ do autor, URL do perfil). Guardar a transcrição permite **reprocessar a extração da Fase 2 sem re-baixar** o vídeo (que pode nem existir mais).

### Claude's Discretion
- Detalhes de implementação do `ImportJob` state machine: nº de retries, backoff, esquema exato de estados (dentro de queued → downloading → transcribing → extracting(stub) → ready_for_review/failed), nome/config da fila SQS (nova fila dedicada vs reuso — planner decide seguindo o padrão `enqueueIngestJob`), formato/tamanho do keyframe (pode reusar `image.service.toThumbnail` — JPEG 512²), wrapper do yt-dlp (`youtube-dl-exec` recomendado), lib de ffmpeg (`fluent-ffmpeg`), limitador de concorrência (`p-queue`).
- Topologia de deploy confirmada como **Render Background Worker** (não Lambda) — o planner detalha o Dockerfile/base image (Python + ffmpeg + yt-dlp).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Projeto e escopo
- `.planning/PROJECT.md` — Core Value (extração correta), constraints de custo de IA, decisões-chave, out-of-scope
- `.planning/ROADMAP.md` §Phase 1 — goal, success criteria, notes for planning (worker Render, infra namespaces)
- `.planning/REQUIREMENTS.md` — IDs PIPE-01..07 e CAP-02 (definições testáveis)

### Pesquisa do domínio (informa esta fase)
- `.planning/research/STACK.md` — yt-dlp/youtube-dl-exec, Groq/OpenAI Whisper, fluent-ffmpeg, p-queue; onde cada passo roda; postura legal/ToS
- `.planning/research/ARCHITECTURE.md` — capture/pipeline separation, `src/infra/video/*` ports, `src/workers/import-worker.ts`, ImportJob, deployment topology
- `.planning/research/PITFALLS.md` — anti-bot como condição estrutural, DLQ/idempotência (ausentes na fila de ingest existente), VAD, retenção de mídia
- `.planning/research/SUMMARY.md` — síntese e ordem de build

### Código existente a reusar/espelhar
- `.planning/codebase/ARCHITECTURE.md` — ingestão assíncrona SQS/Lambda (`src/lambda/ingest-handler.ts`, `enqueueIngestJob`), image strategy (`image.service.ensureThumbnail`/`toThumbnail`), padrão de módulos
- `.planning/codebase/STRUCTURE.md` — convenção de módulos (`types → model → repository → routes → service`)
- `.planning/codebase/CONCERNS.md` — débitos conhecidos (sem DLQ na fila de ingest, etc.) a NÃO herdar

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `enqueueIngestJob()` / `src/infra/queue/*`: padrão de enfileiramento SQS a espelhar para a nova fila de import (mas com DLQ + idempotência, que a fila de ingest não tem).
- `src/lambda/ingest-handler.ts`: template do fluxo de worker assíncrono (baixar/validar/embed/persistir) — a topologia muda (Render worker, não Lambda), mas o formato do fluxo serve de molde.
- `image.service.toThumbnail` (sharp, JPEG 512² q82): reusável para normalizar o keyframe extraído antes de subir ao S3.
- `src/infra/images/s3.image-store.ts` (`putImage`): store S3 para o keyframe.

### Established Patterns
- Módulos em `src/modules/*` seguem `types → model → repository → routes → service`. Novo módulo `src/modules/import/*` segue a mesma convenção.
- Infra isolada em `src/infra/*` (embeddings, llm, images, queue). Novo namespace `src/infra/video/*` (downloader, transcription, keyframes) espelha o padrão de porta+adapter.

### Integration Points
- Nova fila SQS para import jobs (dedicada; DLQ obrigatório).
- Novo deployable `src/workers/import-worker.ts` no Render Background Worker.
- S3 para persistir keyframe; metadados/transcrição no `ImportJob` (Mongo).

</code_context>

<specifics>
## Specific Ideas

- Whisper já foi rodado localmente neste ambiente durante o setup (transcrição dos áudios de ideação) — referência de que o caminho local é viável, mas a decisão do MVP é **cloud (Groq)** por simplicidade de deploy no worker.
- Telemetria de sucesso por plataforma deve ser observável desde o primeiro deploy — é o sinal que decide se/quando investir em proxy.

</specifics>

<deferred>
## Deferred Ideas

- **Proxy residencial / API de extração gerenciada** — só se a telemetria de egress mostrar taxa de sucesso ruim (decisão data-driven, pós-medição).
- **Instagram robusto (resolver anti-bot do IG a fundo)** — best-effort nesta fase; endurecer depois se os números pedirem.
- Extração LLM, confidence/grounding, tela de revisão, quota/dedup, promoção — Fases 2-5 (fora do escopo desta fase por design).

</deferred>

---

*Phase: 1-video-pipeline-foundation*
*Context gathered: 2026-07-01*
