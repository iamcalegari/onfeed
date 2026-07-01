# Phase 1: Video Pipeline Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-01
**Phase:** 1-video-pipeline-foundation
**Areas discussed:** Download & anti-bot (egress), Provider de transcrição, Escopo de plataformas, Retenção de dados

---

## Download & anti-bot (egress)

| Option | Description | Selected |
|--------|-------------|----------|
| Direto + medir, proxy só se precisar | yt-dlp direto dos IPs do worker, bloqueio como falha monitorada; proxy/API paga só se a taxa real for ruim | ✓ |
| Proxy residencial desde já | Rotear por proxy residencial no MVP; mais confiável, custo recorrente por GB | |
| API gerenciada de extração | Terceirizar download (Apify/RapidAPI) para as 3 plataformas; menos manutenção, mais caro | |

**User's choice:** Direto + medir, proxy só se precisar
**Notes:** Decisão de investir em proxy/API é data-driven — vem da telemetria de sucesso por plataforma, não de suposição.

---

## Provider de transcrição

| Option | Description | Selected |
|--------|-------------|----------|
| Groq primário, OpenAI fallback | Groq whisper-large-v3-turbo (cloud, barato/rápido), OpenAI fallback | ✓ |
| Local no worker | whisper.cpp/faster-whisper no worker; sem custo por chamada, pesa CPU/RAM | |
| OpenAI direto | OpenAI audio API como único provider; ~9x custo do Groq | |

**User's choice:** Groq primário, OpenAI fallback
**Notes:** Validar qualidade PT-BR (gíria de cozinha, ruído) com clipes reais antes de travar. Whisper local já foi usado no setup do projeto, mas MVP fica cloud por simplicidade de deploy.

---

## Escopo de plataformas

| Option | Description | Selected |
|--------|-------------|----------|
| Agnóstico; YouTube+TikTok sólidos, IG best-effort | Pipeline para os 3; sucesso exige YouTube+TikTok, IG best-effort com falha tratada | ✓ |
| Os 3 obrigatórios | Instagram também como critério de sucesso obrigatório na Fase 1 | |
| Só YouTube primeiro | Fase 1 valida só YouTube; TikTok/IG depois | |

**User's choice:** Agnóstico; YouTube+TikTok sólidos, IG best-effort
**Notes:** Instagram é o mais hostil ao yt-dlp; não bloqueia o fechamento da fase se estiver instável.

---

## Retenção de dados

| Option | Description | Selected |
|--------|-------------|----------|
| Apaga vídeo+áudio; retém keyframe+transcrição | Vídeo/áudio apagados na hora; guarda keyframe, transcrição e metadados | ✓ |
| Apaga tudo, só keyframe fica | Nem transcrição guardada; força re-download para reprocessar | |
| Retém vídeo 24h p/ debug | Guarda vídeo bruto temporariamente; maior risco legal | |

**User's choice:** Apaga vídeo+áudio; retém keyframe+transcrição
**Notes:** Guardar a transcrição permite reprocessar a extração (Fase 2) sem re-baixar o vídeo. Postura legal: não re-hospedar mídia bruta.

---

## Claude's Discretion

- Detalhes do `ImportJob` state machine (retries, backoff, estados exatos), config/nome da fila SQS (nova dedicada vs reuso do padrão `enqueueIngestJob`), formato/tamanho do keyframe (reuso de `image.service.toThumbnail`), wrapper yt-dlp (`youtube-dl-exec`), lib ffmpeg (`fluent-ffmpeg`), limitador de concorrência (`p-queue`), Dockerfile/base image do worker Render.

## Deferred Ideas

- Proxy residencial / API de extração gerenciada — só se a telemetria de egress pedir.
- Instagram robusto (anti-bot a fundo) — endurecer pós-medição.
- Extração LLM, confidence/grounding, revisão, quota/dedup, promoção — Fases 2-5.
