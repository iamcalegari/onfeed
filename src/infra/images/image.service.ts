import sharp from "sharp";

import { env } from "@/config/env.js";
import type { Recipe } from "@/modules/recipes/recipe.types.js";
import { generateImage as generateViaBedrock } from "./bedrock.image-generator.js";
import { generateImage as generateFake } from "./fake.image-generator.js";
import { presignUpload, putImage } from "./s3.image-store.js";

// Dev local usa o gerador fake (Bedrock não emula); produção usa o Bedrock.
const generateImage = env.images.fakeGenerator
  ? generateFake
  : generateViaBedrock;

const THUMB_SIZE = 512;

/**
 * Normaliza a imagem gerada para thumbnail: o Stable Image Core devolve PNG
 * 1024x1024 (~4MB), exagero para um card. Reduz para 512x512 e converte para
 * JPEG (foto de comida comprime bem) — fica na casa de dezenas de KB.
 */
async function toThumbnail(input: Buffer): Promise<Buffer> {
  return sharp(input)
    .resize(THUMB_SIZE, THUMB_SIZE, { fit: "cover" })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
}

/** true se Bedrock+S3 estão configurados; senão tudo vira no-op (placeholder). */
export const imagesEnabled = env.images.enabled;

/** Prompt de foto a partir do título + principais ingredientes. */
function buildPrompt(recipe: Pick<Recipe, "title" | "ingredients">): string {
  const main = recipe.ingredients
    .filter((i) => !i.isStaple)
    .slice(0, 4)
    .map((i) => i.name)
    .join(", ");
  return `appetizing realistic food photography of "${recipe.title}"${
    main ? `, with ${main}` : ""
  }, plated dish, natural light, top-down view, neutral background`;
}

/**
 * Garante a thumbnail de uma receita (geração lazy):
 *  - se já tem URL, devolve ela
 *  - se imagens estão desabilitadas, devolve null (front usa o placeholder)
 *  - senão gera via Bedrock, sobe pro S3 e devolve a URL pública (CloudFront)
 *
 * NÃO persiste — quem chama grava (setThumbnail), pra manter o serviço sem
 * dependência do model.
 */
export async function ensureThumbnail(
  recipe: Pick<Recipe, "_id" | "title" | "ingredients" | "thumbnailUrl">,
): Promise<string | null> {
  if (recipe.thumbnailUrl) return recipe.thumbnailUrl;
  if (!imagesEnabled || !recipe._id) return null;

  const raw = await generateImage(buildPrompt(recipe));
  const thumb = await toThumbnail(raw);
  return putImage(`recipes/${recipe._id}.jpg`, thumb, "image/jpeg");
}

/** URL pré-assinada para upload do usuário (user-generated). null se desabilitado. */
export async function createUploadUrl(
  recipeId: string,
  contentType: string,
): Promise<{ uploadUrl: string; publicUrl: string } | null> {
  if (!imagesEnabled) return null;
  const ext = contentType === "image/png" ? "png" : "jpg";
  return presignUpload(`recipes/${recipeId}-user.${ext}`, contentType);
}
