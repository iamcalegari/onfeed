/**
 * Adapter yt-dlp (via youtube-dl-exec) — motor único de download para as três
 * plataformas (D-07/PIPE-01), rodando direto dos IPs do worker (D-01, sem
 * proxy/API gerenciada nesta fase). Toda falha é classificada num
 * DownloadFailureReason tipado (PIPE-07 depende deste sinal para o circuit
 * breaker), nunca um erro genérico — o stderr bruto é sempre preservado
 * junto da classificação para debugabilidade (RESEARCH Assumption A1: os
 * padrões de string do yt-dlp não são uma API estável e podem mudar).
 *
 * T-03-01 (command injection): youtube-dl-exec recebe um objeto de opções
 * tipado, mapeado internamente para um array de argv — a URL NUNCA é
 * interpretada por um shell. Allowlisting de domínio acontece a montante,
 * na validação (Plan 04), antes da URL chegar aqui.
 */
import { z } from "zod";
// youtube-dl-exec é um pacote CJS (module.exports = fn); sob NodeNext o
// default import não resolve como chamável de forma confiável — usar o
// named export `youtubeDl`, que o próprio .d.ts do pacote expõe como
// alternativa explicitamente tipada e chamável.
import { youtubeDl as youtubedl } from "youtube-dl-exec";

import { env } from "@/config/env.js";
import type { DownloadResult, VideoMetadata } from "./downloader.port.js";

export type DownloadFailureReason =
  | "anti_bot_blocked" // "Sign in to confirm you're not a bot", 403 (fingerprinting Cloudflare)
  | "rate_limited" // HTTP 429
  | "unavailable" // vídeo removido/privado/geo-bloqueado
  | "network" // timeout, DNS, connection reset
  | "duration_exceeded" // PIPE-02/T-03-02 — teto de duração antes do download caro
  | "unknown";

/**
 * Tetos duros (SIGKILL via spawn timeout) para os subprocessos yt-dlp. Sem
 * eles, um yt-dlp pendurado (anti-bot que segura a conexão aberta, stall de
 * rede) nunca retorna — e como o worker processa uma mensagem por vez, um
 * único hang congelava o consumo da fila inteira (incidente de 2026-07-02).
 * O --socket-timeout (flag nativa) cobre stalls de rede de forma graciosa;
 * o spawn timeout é o backstop para qualquer outro modo de travamento.
 */
const METADATA_TIMEOUT_MS = 90_000;
const DOWNLOAD_TIMEOUT_MS = 5 * 60_000;
const SOCKET_TIMEOUT_SEC = 30;

/** Erro de subprocesso morto pelo spawn timeout — vira "network" (transiente,
 * elegível a redrive), nunca "unknown". */
function timeoutAwareError(err: unknown, timeoutMs: number): DownloadError {
  const e = err as { stderr?: string; killed?: boolean; signalCode?: string };
  if (e.killed === true || e.signalCode === "SIGKILL") {
    return new DownloadError("network", `yt-dlp morto após timeout de ${timeoutMs}ms`);
  }
  const stderr = e.stderr ?? String(err);
  return new DownloadError(classifyYtdlpError(stderr), stderr);
}

export class DownloadError extends Error {
  constructor(
    public reason: DownloadFailureReason,
    stderr: string,
  ) {
    super(`yt-dlp download failed: ${reason}`);
    this.name = "DownloadError";
    this.cause = stderr;
  }
}

/**
 * Mapeia stderr do yt-dlp num DownloadFailureReason fechado. Case-insensitive.
 * Padrões documentados em RESEARCH.md Pattern 1 / Pitfall 1 — tratar como
 * função "viva": se yt-dlp mudar a wording dos erros, falhas caem em
 * "unknown" (não silenciosamente perdidas — o stderr bruto continua
 * logado via DownloadError.cause). Ver Open Question 1: os fixtures abaixo
 * ainda precisam ser confirmados contra saída real do yt-dlp durante o
 * gate manual (integration test / E2E de 01-06).
 */
export function classifyYtdlpError(stderr: string): DownloadFailureReason {
  const s = stderr.toLowerCase();
  if (
    s.includes("sign in to confirm") ||
    s.includes("confirm you're not a bot") ||
    s.includes("confirm youre not a bot")
  ) {
    return "anti_bot_blocked";
  }
  if (s.includes("429") || s.includes("too many requests")) return "rate_limited";
  if (s.includes("403") || s.includes("forbidden")) return "anti_bot_blocked";
  if (
    s.includes("private video") ||
    s.includes("video unavailable") ||
    s.includes("removed") ||
    s.includes("this video is not available")
  ) {
    return "unavailable";
  }
  if (s.includes("timed out") || s.includes("econnreset") || s.includes("enotfound")) {
    return "network";
  }
  return "unknown";
}

/** Subconjunto do payload `--dump-json` que este adapter confia — cada campo opcional tolera ausência por plataforma (RESEARCH field-map table). */
const dumpJsonSchema = z.object({
  webpage_url: z.string(),
  uploader: z.string().optional(),
  uploader_id: z.string().optional(),
  uploader_url: z.string().optional(),
  channel_url: z.string().optional(),
  description: z.string().optional(),
  duration: z.number().optional(),
  thumbnail: z.string().optional(),
});

function mapToVideoMetadata(raw: unknown): VideoMetadata {
  const parsed = dumpJsonSchema.parse(raw);
  const authorHandle = parsed.uploader ?? parsed.uploader_id;
  const authorUrl = parsed.uploader_url ?? parsed.channel_url;
  // exactOptionalPropertyTypes: true (tsconfig) rejeita atribuir `undefined`
  // explicitamente a uma propriedade opcional — omitir a chave em vez de
  // setá-la como undefined quando o campo de origem está ausente.
  return {
    sourceUrl: parsed.webpage_url,
    ...(authorHandle !== undefined && { authorHandle }),
    ...(authorUrl !== undefined && { authorUrl }),
    ...(parsed.description !== undefined && { caption: parsed.description }),
    ...(parsed.duration !== undefined && { durationSec: parsed.duration }),
    ...(parsed.thumbnail !== undefined && { thumbnailUrl: parsed.thumbnail }),
  };
}

/** Extrai metadados via `--dump-json`, validados com zod, sem baixar o vídeo. */
export async function fetchMetadata(url: string): Promise<VideoMetadata> {
  let raw: unknown;
  try {
    raw = await youtubedl(
      url,
      {
        dumpSingleJson: true,
        noCheckCertificates: true,
        noWarnings: true,
        socketTimeout: SOCKET_TIMEOUT_SEC,
      },
      { timeout: METADATA_TIMEOUT_MS, killSignal: "SIGKILL" },
    );
  } catch (err) {
    throw timeoutAwareError(err, METADATA_TIMEOUT_MS);
  }
  return mapToVideoMetadata(raw);
}

/**
 * Baixa o vídeo para `outputPath` e retorna path + metadados. Rejeita antes
 * do download (caro) se a duração exceder env.import.maxDurationSec
 * (defesa em profundidade contra DoS — T-03-02, camada complementar à
 * validação CAP-02 que roda antes do enqueue).
 */
export async function downloadVideo(url: string, outputPath: string): Promise<DownloadResult> {
  const meta = await fetchMetadata(url);

  if (meta.durationSec !== undefined && meta.durationSec > env.import.maxDurationSec) {
    throw new DownloadError(
      "duration_exceeded",
      `duration ${meta.durationSec}s exceeds cap ${env.import.maxDurationSec}s`,
    );
  }

  try {
    await youtubedl(
      url,
      {
        output: outputPath,
        format: "best[ext=mp4]/best", // container previsível para o ffmpeg a jusante
        noCheckCertificates: true,
        noWarnings: true,
        socketTimeout: SOCKET_TIMEOUT_SEC,
      },
      { timeout: DOWNLOAD_TIMEOUT_MS, killSignal: "SIGKILL" },
    );
  } catch (err) {
    throw timeoutAwareError(err, DOWNLOAD_TIMEOUT_MS);
  }

  return { videoPath: outputPath, meta };
}
