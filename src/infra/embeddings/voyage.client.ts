import { env } from "@/config/env.js";
import type { EmbeddingsPort } from "./embeddings.port.js";

const VOYAGE_ENDPOINT = "https://api.voyageai.com/v1/embeddings";

interface VoyageResponse {
  data: { embedding: number[]; index: number }[];
  model: string;
  usage: { total_tokens: number };
}

async function callVoyage(
  input: string[],
  inputType: "document" | "query",
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
