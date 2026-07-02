---
tags: [backend, infra, video-pipeline, ffmpeg, yt-dlp, groq, openai, cost-telemetry, quota]
updated: 2026-07-02
---

# Video Infra

Namespace de infraestrutura para o pipeline de import de vídeo (Instagram/
TikTok/YouTube). Cada módulo é um limite de sistema externo/binário (ffmpeg,
yt-dlp, Groq, OpenAI) ou uma unidade de lógica pura. `pipeline.ts` é a única
exceção — é a orquestração que compõe todos os outros módulos e depende do
documento [[Import|ImportJob]], consumida por [[Workers|import-worker.ts]].

> [!INFO]
> Este namespace é construído em ondas ao longo da Fase 1. Este README cobre
> o estado após o Plano 01-06 (deploy): `pipeline.ts` orquestra os adapters de
> download/VAD/transcrição/keyframe (Planos 01-02/01-03) num único fluxo por
> job, consumido pelo worker standalone (`src/workers/import-worker.ts`), que
> agora roda deployado como Render Background Worker via
> `Dockerfile.import-worker` (não a imagem da API — o toolchain Python+ffmpeg+
> yt-dlp só existe nessa imagem dedicada).

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
| `pipeline.ts` | Orquestração por-job (PIPE-01..05, PIPE-07): `processImportJob(job)` compõe breaker → download → VAD → transcrever/pular → extracting (extração real, Fase 2) → keyframe → S3 → cleanup, escrevendo status do [[Import\|ImportJob]] a cada fronteira de etapa. `try/finally` remove o diretório `mkdtemp`'d do job incondicionalmente (PIPE-05 camada 1). Fase 4 (Plano 06): grava telemetria de custo por-estágio em `costCents` e devolve a cota reservada em `failJob()` — ver callout abaixo |

> [!WARNING] Fronteira de command injection: ffmpeg via `execFile` + args array
> `ffmpeg.exec.ts` é o único lugar que invoca o binário ffmpeg, sempre via
> `child_process.execFile(FFMPEG_BIN, [...args])` — nunca `exec()` com string
> interpolada. Isso é a fronteira que impede que um valor vindo do usuário
> (URL, nome de arquivo derivado do `jobId`) seja interpretado como shell.
> `fluent-ffmpeg` foi deliberadamente descartado (arquivado desde mai/2025,
> não funciona mais de forma confiável com ffmpeg atual — ver
> `01-RESEARCH.md` Pitfall 0) — os wrappers genéricos desse tipo são
> exatamente a abstração que a própria comunidade Node acabou de depreciar;
> este namespace usa funções pequenas e fixas por operação (`extractAudio`,
> `silencedetect`, extração de keyframe) em vez de um builder genérico.

> [!INFO] Cleanup em duas camadas + retenção "só o keyframe" (PIPE-05, D-09/D-10)
> Vídeo e áudio brutos **nunca** tocam o S3 — o único upload do pipeline é o
> keyframe normalizado (`imports/{jobId}/keyframe.jpg`, via `putImage`
> reusando `image.service.toThumbnail`). A garantia de limpeza local tem duas
> camadas: (1) `try/finally` em `pipeline.ts` remove o diretório `mkdtemp`'d
> do job incondicionalmente, em sucesso ou erro; (2) `sweepStaleTempDirs()`
> em `src/workers/import-worker.ts` varre o `tmpdir()` no boot do worker e
> remove diretórios `import-*` órfãos — o `finally` sozinho não sobrevive a
> um `SIGKILL`/OOM/restart forçado do Render, só a segunda camada cobre esse
> caso. Retém-se apenas keyframe + transcrição (texto derivado) + metadados
> de origem (plataforma, URL, @ do autor) — nunca o vídeo/áudio em si
> (postura legal: não re-hospedar mídia de terceiros).

> [!WARNING] Keyframe → `recipe.thumbnailUrl` via `setThumbnail` (fix jul/2026)
> O keyframe só é extraído DEPOIS de `persistExtractedRecipe` (D-10 — nada
> sobe ao S3 antes de a extração LLM ter sucesso), então no momento do
> `mapExtractedToRecipe` o `job.keyframeUrl` ainda é `undefined` e a receita
> nasce com `thumbnailUrl: ""`. Por isso `pipeline.ts` chama
> `setThumbnail(recipeId, keyframeUrl)` logo após o `putImage` — sem esse
> passo, o frame real do vídeo era pago em S3 e descartado, e o front caía na
> geração por IA (que não conhece o prato — carbonara virava sopa de ovo).
> Backfill de receitas anteriores ao fix:
> `src/scripts/backfill-imported-thumbnails.ts`.

> [!TIP] Fallback Groq→OpenAI e o skip de "sem fala" (D-04, D-06)
> `transcription.port.ts` tenta Groq (`whisper-large-v3-turbo`, primário)
> primeiro; qualquer falha (erro de rede, tamanho de arquivo, resposta
> inválida) cai para OpenAI (`whisper-1`) via try/catch em runtime — não é
> uma troca por env var, é sempre "tenta o primário, cai pro fallback nesta
> chamada". Antes de gastar dinheiro com qualquer um dos dois, `vad.ts` roda
> `ffmpeg silencedetect` como pré-filtro independente: um clipe majoritariamente
> silêncio/música é marcado `noSpeechDetected: true` e a transcrição é
> **pulada inteiramente** — não se confia no `no_speech_prob` do próprio
> Whisper, que é documentadamente pouco confiável em segmentos alucinados
> (ver `01-RESEARCH.md` Common Pitfalls §3).

## Timeouts por etapa (incidente 2026-07-02)

> [!warning] Nenhuma chamada externa do pipeline pode ficar sem teto
> Um subprocesso/chamada pendurado congela o job — e, via `handleMessage`
> sequencial do worker ([[Workers]]), a fila inteira. Foi o modo de falha de
> 2026-07-02 (job preso em `extracting`, worker sem consumir o dia todo).

- `ytdlp.downloader.ts` — `--socket-timeout 30` (stall de rede, classificado
  `network` pelo yt-dlp) + spawn timeout com `SIGKILL` como backstop
  (metadata 90s, download 5min; kill vira `DownloadError("network")` →
  transiente/redrive, nunca `unknown`).
- `ffmpeg.exec.ts` — `runFfmpeg` roda com teto de 3min + `SIGKILL` (clipes
  têm ≤ `maxDurationSec`; operação legítima termina em segundos).
- Extração LLM (`import.extraction.ts`, [[Import]]) — timeout por-request de
  3min no `messages.parse` (o default do SDK é 10min + retries).
- Embeddings (`voyage.client.ts`) — `AbortSignal.timeout(60s)` por tentativa;
  timeout entra no mesmo retry/backoff de 429/5xx.
- Backstop de última instância: `handleMessageTimeout` de 15min no consumer
  ([[Workers]]).

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

> [!INFO] Telemetria de custo por-estágio (COST-02, Fase 4 Plano 06)
> `pipeline.ts` registra, em cada fronteira de estágio, unidades brutas +
> centavos estimados em `ImportJob.costCents`: `download` (bytes medidos via
> `stat()` no arquivo baixado), `transcription` (minutos de áudio, `0` quando
> `noSpeechDetected`), `extraction` (tokens de input/output do LLM, expostos
> por `extractImportedRecipe` como `{ recipe, usage }` — a mesma chamada,
> sem metering extra). `totalCents` soma os estágios conhecidos; `embedding`
> fica omitido nesta versão (`persistExtractedRecipe` ainda não expõe tokens
> de embedding de volta ao pipeline). Todo centavo é derivado da tabela de
> preço em `env.import` (ver [[Config]]) — **nunca** uma constante hardcoded
> aqui (D-08): trocar um preço errado é trocar uma env var, não um deploy.
>
> Uma única linha `[pipeline] cost` é logada por job bem-sucedido, com
> **só números agregados** (bytes, minutos, tokens, centavos) — nunca o
> transcript/legenda/payload do LLM (mesma disciplina de `logOutcome`,
> CONCERNS.md).
>
> [!WARNING] Preços são estimativas de baixa confiança, não billing-grade
> Os valores em `env.import.priceCents*` foram levantados manualmente
> (RESEARCH A1–A4) e servem para acompanhamento operacional interno — **não**
> são a fonte de verdade para cobrança real. As unidades brutas (bytes,
> minutos, tokens) são o dado durável; os centavos derivados podem ficar
> desatualizados se o preço do provedor mudar sem a env var ser corrigida.

> [!INFO] Refund de cota único em `failJob()` (COST-01/D-07)
> `failJob()` é o **único** caminho de código que escreve `status: "failed"`
> no `ImportJob` — por isso é o único lugar seguro para devolver a vaga de
> cota diária reservada na submissão (`consumeDailyImportQuota`, ver
> [[Usage]]). Logo após o write de falha, `failJob` chama
> `refundDailyImportQuota(job.userId, day)`, com `day` = o dia **RESERVADO**
> (`job.insertedAt`), nunca `new Date()` — um job que falha depois da virada
> UTC relativa à submissão devolveria a vaga no contador do dia errado se
> usasse "hoje" às cegas.
>
> O refund é exatamente-uma-vez mesmo sob redelivery *at-least-once* da SQS:
> o guard `TERMINAL_STATUSES` no-op em `src/workers/import-worker.ts` impede
> que `processImportJob`/`failJob` rodem de novo para um job já em `failed`
> — o doc Mongo, não o payload SQS, é a fonte da verdade de idempotência
> (PIPE-06). O refund **nunca** vive fora de `failJob` (nunca no topo de
> `processImportJob` nem em lógica por-tentativa) — isso duplicaria a
> devolução sob redelivery.

## Consumido por

- `src/workers/import-worker.ts` ([[Workers]], Plano 01-05) — `handleImportMessage` relê o `ImportJob` autoritativo, checa idempotência (status terminal = no-op), e chama `processImportJob(job)` dentro de um limitador `p-queue`.
