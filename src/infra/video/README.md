---
tags: [backend, infra, video-pipeline, ffmpeg]
updated: 2026-07-01
---

# Video Infra

Namespace de infraestrutura para o pipeline de import de vídeo (Instagram/
TikTok/YouTube). Cada módulo é um limite de sistema externo/binário (ffmpeg)
ou uma unidade de lógica pura — sem dependência do documento `[[Import|ImportJob]]`
nem da fila SQS, para permitir teste unitário isolado.

> [!INFO]
> Este namespace é construído em ondas ao longo da Fase 1. Este README cobre
> o que existe após o Plano 01-02 (unidades de lógica pura + ffmpeg shell-out).
> O Plano 01-03 adiciona os adapters de download (yt-dlp) e transcrição
> (Groq/OpenAI); atualize esta tabela ao adicioná-los.

## Arquivos

| Arquivo | Responsabilidade |
|---|---|
| `ffmpeg.exec.ts` | Único lugar que invoca o binário ffmpeg (`execFile` + args array — nunca `exec` string form). `runFfmpeg(args)` genérico + `extractAudio()` (mono 16kHz 64kbps) |
| `vad.ts` | Pré-filtro de voz (PIPE-02, D-06): `detectSilenceRatio()` via `silencedetect` do ffmpeg. `parseSilenceDurations()` é uma função pura testável sem o binário ffmpeg |
| `keyframe.ts` | Extração de keyframe (PIPE-04): `extractKeyframe()` via scene-score select, com fallback de busca no ponto médio. `extractNormalizedKeyframe()` devolve o JPEG normalizado (512², cadeia sharp replicada de `image.service.ts`) |
| `platform-breaker.ts` | Circuit breaker por plataforma (PIPE-07, D-02): `recordOutcome`/`isOpen`/`successRate`. Estado em processo, clock injetável para teste determinístico de cooldown |

## Convenção de testes

- `*.test.ts` — suite rápida (`npm run test`), sem dependência de binário externo.
- `*.integration.test.ts` — suite completa (`npm run test:all`), requer o binário `ffmpeg` real no PATH. Excluída da suite rápida via `VITEST_EXCLUDE_INTEGRATION` (ver `vitest.config.ts`).

> [!TIP]
> `keyframe.ts` replica a cadeia sharp de `image.service.toThumbnail` em vez
> de importá-la, para não puxar a validação de env obrigatória (`MONGODB_URI`,
> credenciais AWS) e o client S3/Bedrock para dentro de um módulo de vídeo
> puro. Ver `01-02-SUMMARY.md` para o racional completo.

## Dependências

- Binário `ffmpeg` no PATH (ou `FFMPEG_PATH` env var) — não a lib `fluent-ffmpeg` (arquivada, não usar).
- `sharp` (já no stack via [[Images]]) para normalização do keyframe.

## Consumido por

- `src/workers/import-worker.ts` (Plano 01-05) — drives a pipeline completa e persiste os resultados no [[Import|ImportJob]].
