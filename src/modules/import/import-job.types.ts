/**
 * Tipos do state machine de import de vídeo (onFeed Import).
 * O documento ImportJob é a fonte da verdade única para progresso e
 * idempotência (PIPE-06) — a mensagem SQS carrega só o jobId, o worker
 * sempre relê o documento autoritativo em vez de confiar no payload.
 */

export type ImportJobStatus =
  | "queued"
  | "downloading"
  | "transcribing"
  | "extracting" // stub nesta fase — sempre passa direto para ready_for_review
  | "ready_for_review"
  | "failed";

export type ImportFailureReason =
  | "unsupported_platform" // CAP-02, rejeitado antes do enqueue — nunca persistido, mantido por simetria
  | "invalid_url"
  | "anti_bot_blocked" // PIPE-07 — relevante ao circuit breaker
  | "rate_limited" // PIPE-07 — relevante ao circuit breaker
  | "video_unavailable"
  | "no_speech_detected" // não é necessariamente falha — ver noSpeechDetected
  | "transcription_failed" // Groq e fallback OpenAI esgotados
  | "download_timeout"
  | "extraction_failed" // Fase 2 — LLM de extração não retornou parsed_output
  | "unknown_error";

export interface ImportJob {
  _id?: string;
  userId: string;
  sourceUrl: string; // como submetido
  normalizedUrl: string; // canonicalizado para idempotência/dedup (CAP-02/CAP-03)
  platform: "instagram" | "tiktok" | "youtube";
  status: ImportJobStatus;
  failedStep?: ImportJobStatus;
  failureReason?: ImportFailureReason;
  errorMessage?: string; // legível ao usuário, seguro de exibir
  transcript?: string;
  transcriptSource?: "groq" | "openai" | null;
  noSpeechDetected?: boolean; // D-06 — true = transcript ausente/não confiável por design, não bug
  caption?: string;
  sourceMeta?: {
    authorHandle?: string;
    authorUrl?: string;
    durationSec?: number;
  };
  keyframeUrl?: string; // URL S3, setado quando PIPE-04 completa
  recipeId?: string; // setado após persistExtractedRecipe suceder (Fase 2)
  reviewRequired?: boolean; // de computeConfidence — Fase 3 consome para UI
  confidenceScore?: number; // 0..1, de computeConfidence — Fase 3 consome
  costCents?: {
    // placeholders — populados na Fase 4, mas o shape já existe agora
    download?: number;
    transcription?: number;
    total?: number;
  };
  retryCount: number;
  insertedAt: Date;
  updatedAt: Date;
}

/** Payload da mensagem SQS — carrega só o _id do doc Mongo (fonte da verdade). */
export interface ImportJobMessage {
  jobId: string;
}
