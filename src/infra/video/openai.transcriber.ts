/**
 * Adapter OpenAI — fallback de transcrição (D-04), acionado só quando o Groq
 * falha (outage, erro, key desabilitada). Modelo whisper-1 (padrão estável
 * para transcription-only; gpt-4o-transcribe é uma alternativa mais nova,
 * mas whisper-1 é o baseline mais amplamente documentado para este caso).
 */
import fs from "node:fs";

import OpenAI from "openai";

import { env } from "@/config/env.js";

let client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({ apiKey: env.openaiTranscription.apiKey });
  }
  return client;
}

export async function transcribeWithOpenAI(audioPath: string): Promise<string> {
  if (!env.openaiTranscription.enabled) {
    throw new Error("OpenAI transcription desabilitada (OPENAI_API_KEY ausente)");
  }
  const transcription = await getClient().audio.transcriptions.create({
    file: fs.createReadStream(audioPath),
    model: "whisper-1",
    language: "pt", // PT-BR hint (D-05)
    response_format: "json",
  });
  return transcription.text;
}
