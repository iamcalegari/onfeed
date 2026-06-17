import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";

import { env } from "@/config/env.js";

let client: BedrockRuntimeClient | null = null;
function getClient(): BedrockRuntimeClient {
  if (!client) client = new BedrockRuntimeClient({ region: env.images.region });
  return client;
}

/**
 * Gera uma imagem (PNG) via Amazon Bedrock (Titan Image / Nova Canvas).
 * Retorna os bytes; o armazenamento é responsabilidade do store.
 */
export async function generateImage(prompt: string): Promise<Buffer> {
  const body = JSON.stringify({
    taskType: "TEXT_IMAGE",
    textToImageParams: { text: prompt.slice(0, 500) },
    imageGenerationConfig: {
      numberOfImages: 1,
      width: 512,
      height: 512,
      cfgScale: 8,
      quality: "standard",
    },
  });

  const res = await getClient().send(
    new InvokeModelCommand({
      modelId: env.images.bedrockModel,
      contentType: "application/json",
      accept: "application/json",
      body,
    }),
  );

  const json = JSON.parse(new TextDecoder().decode(res.body)) as {
    images?: string[];
    error?: string;
  };
  const b64 = json.images?.[0];
  if (!b64) {
    throw new Error(`Bedrock não retornou imagem: ${json.error ?? "?"}`);
  }
  return Buffer.from(b64, "base64");
}
