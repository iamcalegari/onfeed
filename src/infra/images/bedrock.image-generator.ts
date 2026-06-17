import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";

import { env } from "@/config/env.js";

let client: BedrockRuntimeClient | null = null;
function getClient(): BedrockRuntimeClient {
  // Região do Bedrock pode diferir da do S3 (geradores Stability ficam em
  // us-west-2; o bucket pode estar em us-east-1).
  if (!client) client = new BedrockRuntimeClient({ region: env.images.bedrockRegion });
  return client;
}

// Famílias de modelo de imagem têm schemas de request/response diferentes.
// Selecionamos pelo prefixo do modelId (env.images.bedrockModel).
function isStability(modelId: string): boolean {
  return modelId.startsWith("stability.");
}

/** Monta o corpo do InvokeModel conforme a família do modelo. */
function buildBody(modelId: string, prompt: string): string {
  if (isStability(modelId)) {
    // Stable Image Core/Ultra/SD3: text-to-image via prompt + aspect_ratio
    // (não aceita width/height arbitrários como o Titan).
    return JSON.stringify({
      prompt: prompt.slice(0, 9000),
      mode: "text-to-image",
      aspect_ratio: "1:1",
      output_format: "png",
    });
  }
  // Amazon Titan Image / Nova Canvas
  return JSON.stringify({
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
}

/** Extrai os bytes do PNG da resposta (base64 em `images[0]` nas duas famílias). */
function parseImage(modelId: string, raw: Uint8Array): Buffer {
  const json = JSON.parse(new TextDecoder().decode(raw)) as {
    images?: string[];
    error?: string;
    finish_reasons?: (string | null)[];
  };

  // Stability sinaliza filtragem (NSFW etc) em finish_reasons em vez de erro.
  if (isStability(modelId)) {
    const reason = json.finish_reasons?.[0];
    if (reason) throw new Error(`Stability não gerou imagem: ${reason}`);
  }

  const b64 = json.images?.[0];
  if (!b64) {
    throw new Error(`Bedrock não retornou imagem: ${json.error ?? "?"}`);
  }
  return Buffer.from(b64, "base64");
}

/**
 * Gera uma imagem (PNG) via Amazon Bedrock. Suporta os modelos de imagem da
 * Amazon (Titan/Nova Canvas) e da Stability AI (Stable Image), conforme o
 * BEDROCK_IMAGE_MODEL. Retorna os bytes; o armazenamento é do store.
 */
export async function generateImage(prompt: string): Promise<Buffer> {
  const modelId = env.images.bedrockModel;
  const res = await getClient().send(
    new InvokeModelCommand({
      modelId,
      contentType: "application/json",
      accept: "application/json",
      body: buildBody(modelId, prompt),
    }),
  );
  return parseImage(modelId, res.body);
}
