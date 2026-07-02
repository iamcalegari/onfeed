/**
 * Adapter Groq — transcrição primária (D-04: whisper-large-v3-turbo, cloud
 * barato/rápido). Lê a key de env.groq; se ausente, lança para que o
 * orquestrador (transcription.port.ts) faça fallback ao OpenAI em vez de
 * tentar uma chamada SDK fadada a falhar de forma ambígua.
 */
import fs from "node:fs";

import Groq from "groq-sdk";

import { env } from "@/config/env.js";

let client: Groq | null = null;
function getClient(): Groq {
  if (!client) {
    client = new Groq({ apiKey: env.groq.apiKey });
  }
  return client;
}

export async function transcribeWithGroq(audioPath: string): Promise<string> {
  if (!env.groq.enabled) {
    throw new Error("Groq transcription desabilitada (GROQ_API_KEY ausente)");
  }
  const transcription = await getClient().audio.transcriptions.create({
    file: fs.createReadStream(audioPath),
    model: env.groq.model,
    language: "pt", // PT-BR hint (D-05) — melhora acurácia/latência
    response_format: "json",
  });
  return transcription.text;
}
