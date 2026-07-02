---
tags: [backend, infra, video-pipeline, ffmpeg, yt-dlp, groq, openai]
updated: 2026-07-01
---

# Video Infra

Namespace de infraestrutura para o pipeline de import de vídeo (Instagram/
TikTok/YouTube). Cada módulo é um limite de sistema externo/binário (ffmpeg,
yt-dlp, Groq, OpenAI) ou uma unidade de lógica pura. `pipeline.ts` é a única
exceção — é a orquestração que compõe todos os outros módulos e depende do
documento `[[Import|ImportJob]]`, consumida por `[[Workers|import-worker.ts]]`.

> [!INFO]
> Este namespace é construído em ondas ao longo da Fase 1. Este README cobre
> o que existe após o Plano 01-05: `pipeline.ts` orquestra os adapters de
> download/VAD/transcrição/keyframe (Planos 01-02/01-03) num único fluxo por
> job, consumido pelo worker standalone (`src/workers/import-worker.ts`).

## Arquivos

| Arquivo | Responsabilidade |
|---|---|
| `ffmpeg.exec.ts` | Único lugar que invoca o binário ffmpeg (`execFile` + args array — nunca `exec` string form). `runFfmpeg(args)` genérico + `extractAudio()` (mono 16kHz 64kbps) |
| `vad.ts` | Pré-filtro de voz (PIPE-02, D-06): `detectSilenceRatio()` via `silencedetect` do ffmpeg. `parseSilenceDurations()` é uma função pura testável sem o binário ffmpeg |
| `keyframe.ts` | Extração de keyframe (PIPE-04): `extractKeyframe()` via scene-score select, com fallback de busca no ponto médio. `extractNormalizedKeyframe()` devolve o JPEG normalizado (512², cadeia sharp replicada de `image.service.ts`) |
| `platform-breaker.ts` | Circuit breaker por plataforma (PIPE-07, D-02): `recordOutcome`/`isOpen`/`successRate`. Estado em processo, clock injetável para teste determinístico de cooldown |
| `downloader.port.ts` | Contrato tipado do download (PIPE-01/03): `VideoMetadata`, `DownloadResult` — nomes de campo agnósticos de plataforma (D-07) |
| `ytdlp.downloader.ts` | Adapter yt-dlp via `youtube-dl-exec` — motor único para as 3 plataformas. `fetchMetadata()`/`downloadVideo()`, `classifyYtdlpError()` (stderr → `DownloadFailureReason`), `DownloadError` (sempre preserva o stderr bruto). Rejeita antes do download se a duração exceder `env.import.maxDurationSec` |
| `transcription.port.ts` | Orquestrador de transcrição (PIPE-02, D-04): `transcribe()` tenta Groq, cai para OpenAI em qualquer falha (fallback é try/catch em runtime, não troca por env). Guarda de tamanho (25MB, tier free Groq) roteia direto ao fallback antes de chamar o SDK. `TranscriptionError` tipado se ambos falharem |
| `groq.transcriber.ts` | Adapter Groq (`whisper-large-v3-turbo`, hint de idioma `pt`) — primário |
| `openai.transcriber.ts` | Adapter OpenAI (`whisper-1`, hint de idioma `pt`) — fallback, acionado só quando o Groq falha |
| `pipeline.ts` | Orquestração por-job (PIPE-01..05, PIPE-07): `processImportJob(job)` compõe breaker → download → VAD → transcrever/pular → extracting (stub) → keyframe → S3 → cleanup, escrevendo status do `[[Import\|ImportJob]]` a cada fronteira de etapa. `try/finally` remove o diretório `mkdtemp`'d do job incondicionalmente (PIPE-05 camada 1) |

## Convenção de testes

- `*.test.ts` — suite rápida (`npm run test`), sem dependência de binário/SDK/rede externos. `ytdlp.downloader.test.ts` mocka `youtube-dl-exec`; `transcription.test.ts` injeta funções `Transcriber` mockadas via `TranscribeDeps` (nenhum dos dois toca as SDKs/binário real).
- `*.integration.test.ts` — suite completa (`npm run test:all`), requer binário real (`ffmpeg`/`yt-dlp`) e/ou rede. Excluída da suite rápida via `VITEST_EXCLUDE_INTEGRATION` (ver `vitest.config.ts`). `ytdlp.downloader.integration.test.ts` baixa um vídeo público real do YouTube — os fixtures de stderr do classificador ainda precisam ser confirmados contra saída real (Open Question 1 de `01-RESEARCH.md`) durante esse gate manual.

> [!TIP]
> `keyframe.ts` replica a cadeia sharp de `image.service.toThumbnail` em vez
> de importá-la, para não puxar a validação de env obrigatória (`MONGODB_URI`,
> credenciais AWS) e o client S3/Bedrock para dentro de um módulo de vídeo
> puro. Ver `01-02-SUMMARY.md` para o racional completo. `ytdlp.downloader.ts`
> e `transcription.port.ts` importam `env.ts` de fato (para `maxDurationSec`/
> chaves de API) — seus testes mockam `@/config/env.js` explicitamente pelo
> mesmo motivo (evitar exigir Mongo/AWS configurados na suite rápida).

> [!WARNING]
> `classifyYtdlpError()` trata padrões de string do stderr do yt-dlp como uma
> "função viva" (RESEARCH Assumption A1) — a wording do yt-dlp não é uma API
> estável. Toda `DownloadError` preserva o stderr bruto em `.cause` para que
> uma classificação incorreta seja debugável, não silenciosa.

## Dependências

- Binário `ffmpeg` no PATH (ou `FFMPEG_PATH` env var) — não a lib `fluent-ffmpeg` (arquivada, não usar).
- `sharp` (já no stack via [[Images]]) para normalização do keyframe.
- `youtube-dl-exec` (npm) + binário `yt-dlp` — em dev local, instalar com `YOUTUBE_DL_SKIP_DOWNLOAD=true` se o postinstall não conseguir baixar o binário (timeout de rede); o Dockerfile do worker (Plano 01-06) garante o binário real no container de produção.
- `groq-sdk` (`env.groq.apiKey`/`env.groq.model`) + `openai` (`env.openaiTranscription.apiKey`) — ambos `optional()+enabled`, nunca `required()` (worker é deployable separado da API).

> [!TIP]
> `pipeline.ts` mapeia `DownloadFailureReason` (vocabulário de erro do
> `ytdlp.downloader.ts`) para `ImportFailureReason` (vocabulário de estado do
> `ImportJob`) via `toImportFailureReason()` — os dois unions divergem de
> propósito, não são o mesmo tipo. `anti_bot_blocked`/`rate_limited` falham o
> job explicitamente SEM relançar (o circuit breaker cooldown, não a
> redelivery da SQS, governa a próxima tentativa); razões transientes
> (`network`/`unknown`) relançam para que o `import-worker.ts` deixe a
> mensagem na fila para o redrive da DLQ.

## Consumido por

- `src/workers/import-worker.ts` ([[Workers]], Plano 01-05) — `handleImportMessage` relê o `ImportJob` autoritativo, checa idempotência (status terminal = no-op), e chama `processImportJob(job)` dentro de um limitador `p-queue`.
