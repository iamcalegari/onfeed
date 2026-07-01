/**
 * Orquestrador de transcrição — Groq primário, OpenAI fallback (D-04,
 * PIPE-02). O fallback é um try/catch em runtime, NÃO uma troca por env
 * (ver 01-PATTERNS.md: o idiom env-driven de image.service.ts é só para
 * mock local opcional, não para este fallback primário).
 *
 * Guarda de tamanho ANTES da chamada Groq: o tier free da Groq tem um teto
 * de 25MB (RESEARCH Pitfall 2) — deixar a chamada SDK falhar de forma
 * ambígua em arquivos grandes é evitado validando o tamanho primeiro e
 * roteando direto ao fallback OpenAI (que tem um teto de arquivo bem maior).
 */
import { stat } from "node:fs/promises";

import { transcribeWithGroq } from "./groq.transcriber.js";
import { transcribeWithOpenAI } from "./openai.transcriber.js";

export type TranscriptionSource = "groq" | "openai";

export interface TranscriptionResult {
  text: string;
  source: TranscriptionSource;
}

export class TranscriptionError extends Error {
  constructor(
    public groqError: unknown,
    public openaiError: unknown,
  ) {
    super("Transcription failed: both Groq and OpenAI fallback exhausted");
    this.name = "TranscriptionError";
  }
}

/** Teto de tamanho de arquivo do tier free da Groq (25MB) — acima disso, pula direto para o fallback OpenAI em vez de deixar a chamada Groq falhar de forma ambígua. */
export const GROQ_FILE_SIZE_LIMIT_BYTES = 25 * 1024 * 1024;

/** Interface de transcritor injetável — usada pelos testes para mockar Groq/OpenAI sem tocar as SDKs reais. */
export interface Transcriber {
  (audioPath: string): Promise<string>;
}

export interface TranscribeDeps {
  groq?: Transcriber;
  openai?: Transcriber;
  statFn?: typeof stat;
}

/**
 * Tenta Groq primeiro; em qualquer falha (outage, erro, key desabilitada,
 * ou arquivo grande demais) cai para OpenAI. Se ambos falharem, lança
 * TranscriptionError tipado — o worker mapeia isso para
 * failureReason "transcription_failed" (PIPE-02), nunca trava.
 */
export async function transcribe(
  audioPath: string,
  deps: TranscribeDeps = {},
): Promise<TranscriptionResult> {
  const groq = deps.groq ?? transcribeWithGroq;
  const openai = deps.openai ?? transcribeWithOpenAI;
  const statFn = deps.statFn ?? stat;

  let oversized = false;
  try {
    const { size } = await statFn(audioPath);
    oversized = size > GROQ_FILE_SIZE_LIMIT_BYTES;
  } catch {
    // Se o stat falhar (arquivo ausente etc.), deixa a própria chamada de
    // transcrição reportar o erro real em vez de mascará-lo aqui.
  }

  let groqError: unknown;
  if (!oversized) {
    try {
      const text = await groq(audioPath);
      return { text, source: "groq" };
    } catch (err) {
      groqError = err;
    }
  } else {
    groqError = new Error(
      `audio file exceeds Groq's ${GROQ_FILE_SIZE_LIMIT_BYTES} byte limit; routed directly to OpenAI fallback`,
    );
  }

  try {
    const text = await openai(audioPath);
    return { text, source: "openai" };
  } catch (openaiError) {
    throw new TranscriptionError(groqError, openaiError);
  }
}
