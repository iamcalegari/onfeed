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

/** Prompt de foto a partir dos ingredientes core da receita (sem usar o título). */
function buildPrompt(recipe: Pick<Recipe, "title" | "ingredients" | "occasions">): { prompt: string; negativePrompt: string } {
  // Prefere ingredientes marcados como core (os essenciais da receita).
  // Fallback: qualquer não-staple, caso não haja cores.
  const candidates = recipe.ingredients.filter((i) => i.core && !i.isStaple);
  const ings = (candidates.length > 0
    ? candidates
    : recipe.ingredients.filter((i) => !i.isStaple)
  ).slice(0, 5).map((i) => i.name);

  // Não inclui recipe.title no prompt: títulos traduzidos literalmente
  // (ex: "souris d'agneau" → "mice") causam hallucinations no modelo.
  const ingList = ings.join(", ");
  const isDrink = recipe.occasions?.includes("drinks");

  let subject: string;
  let prompt: string;

  if (isDrink) {
    // Detecta bebidas quentes pelo título para escolher o enquadramento certo.
    const hotKeywords = /\b(chá|cha\b|tea\b|café|cafe\b|coffee|latte|cappuccino|expresso|espresso|quentinho|quente|warm|hot\b|caldo|soup)\b/i;
    const isHot = hotKeywords.test(recipe.title);
    if (isHot) {
      subject = ingList
        ? `a hot drink in a mug or cup, made with ${ingList}`
        : "a cozy hot beverage in a ceramic mug";
      prompt = `appetizing realistic beverage photography, ${subject}, steam rising, natural light, 3/4 angle view, warm neutral background, editorial food styling`;
    } else {
      subject = ingList
        ? `a refreshing cold drink in a glass, made with ${ingList}`
        : "a refreshing homemade cold drink in a glass";
      prompt = `appetizing realistic beverage photography, ${subject}, condensation on glass, natural light, 3/4 angle view, neutral marble or linen background, editorial food styling`;
    }
  } else {
    subject = ingList
      ? `a plated dish made with ${ingList}`
      : "a plated homemade dish";
    prompt = `appetizing realistic food photography, ${subject}, natural light, top-down view, neutral linen background, editorial food styling`;
  }

  const negativePrompt =
    "animals, mice, rats, insects, people, faces, cartoon, illustration, text, watermark, logo, blurry, raw uncooked meat, unrelated ingredients, random garnish";

  return { prompt, negativePrompt };
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
  recipe: Pick<Recipe, "_id" | "title" | "ingredients" | "thumbnailUrl" | "occasions">,
): Promise<string | null> {
  if (recipe.thumbnailUrl) return recipe.thumbnailUrl;
  if (!imagesEnabled || !recipe._id) return null;

  const { prompt, negativePrompt } = buildPrompt(recipe);
  const raw = await generateImage(prompt, negativePrompt);
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
