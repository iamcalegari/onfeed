import { env } from "@/config/env.js";
import type { EmbeddingsPort } from "./embeddings.port.js";

const VOYAGE_ENDPOINT = "https://api.voyageai.com/v1/embeddings";

interface VoyageResponse {
  data: { embedding: number[]; index: number }[];
  model: string;
  usage: { total_tokens: number };
}

const MAX_RETRIES = 5;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function callVoyage(
  input: string[],
  inputType: "document" | "query",
  attempt = 0,
): Promise<number[][]> {
  const res = await fetch(VOYAGE_ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.voyage.apiKey}`,
    },
    body: JSON.stringify({
      model: env.voyage.model,
      input,
      input_type: inputType,
      output_dimension: env.voyage.dimensions,
    }),
  });

  // 429 (rate limit) e 5xx são transitórios — espera e tenta de novo.
  // No free tier da Voyage o limite é 3 RPM, então o backoff cresce até ~30s.
  if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
    const retryAfter = Number(res.headers.get("retry-after"));
    const waitMs =
      Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : Math.min(30_000, 4_000 * 2 ** attempt);
    console.warn(
      `[voyage] ${res.status}, retry ${attempt + 1}/${MAX_RETRIES} em ${Math.round(waitMs / 1000)}s`,
    );
    await sleep(waitMs);
    return callVoyage(input, inputType, attempt + 1);
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Voyage API ${res.status}: ${body}`);
  }

  const json = (await res.json()) as VoyageResponse;
  // Garante a ordem original (a API retorna `index` por item).
  return json.data
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding);
}

export class VoyageEmbeddings implements EmbeddingsPort {
  async embedDocuments(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    return callVoyage(texts, "document");
  }

  async embedQuery(text: string): Promise<number[]> {
    const [vector] = await callVoyage([text], "query");
    if (!vector) throw new Error("Voyage não retornou embedding para a query");
    return vector;
  }
}

export const embeddings: EmbeddingsPort = new VoyageEmbeddings();
