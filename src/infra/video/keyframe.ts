import { readFile } from "node:fs/promises";

import sharp from "sharp";

import { runFfmpeg } from "./ffmpeg.exec.js";

// Extração de keyframe (PIPE-04): usa o filtro de scene-score do ffmpeg para
// escolher um frame genuinamente representativo (não um timestamp fixo, que
// arrisca cair numa transição borrada). Em clipes muito curtos/estáticos que
// não têm nenhuma mudança de cena qualificada, cai para um frame no ponto
// médio do vídeo (sempre produz um frame). O JPEG bruto extraído é então
// normalizado via a MESMA cadeia sharp de image.service.ts's toThumbnail
// (resize 512² cover + jpeg q82 mozjpeg) — replicada aqui verbatim em vez de
// importada, porque image.service.ts importa env.ts (validação obrigatória
// de MONGODB_URI/AWS na carga do módulo) e o client S3/Bedrock, acoplamento
// desproporcional para um módulo de vídeo puro. RESEARCH.md explicitamente
// permite essa opção ("import and call it, or replicate the identical
// resize/jpeg chain — either is fine").
const THUMB_SIZE = 512;

async function toThumbnail(input: Buffer): Promise<Buffer> {
  return sharp(input)
    .resize(THUMB_SIZE, THUMB_SIZE, { fit: "cover" })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
}

const SCENE_THRESHOLD = "0.4";

// Offset fixo usado quando a duração do vídeo é desconhecida no fallback de
// ponto médio (ver extractKeyframe). Clipes curtos de vídeo social raramente
// passam de poucos minutos; 2s é seguro mesmo para clipes bem curtos.
const FALLBACK_SEEK_SEC = "2";

async function extractViaSceneScore(videoPath: string, outputPath: string): Promise<void> {
  await runFfmpeg([
    "-y",
    "-i", videoPath,
    "-vf", `select='gt(scene\\,${SCENE_THRESHOLD})'`,
    "-frames:v", "1",
    "-vsync", "vfr",
    outputPath,
  ]);
}

/**
 * Fallback de ponto médio: busca (-ss) até a metade da duração do vídeo (ou
 * um offset fixo pequeno se a duração não for conhecida) e extrai um único
 * frame ali. Sempre produz um frame — usado quando o filtro de scene-score
 * não encontra nenhuma cena qualificada (clipe muito curto/estático).
 */
async function extractViaMidpointSeek(
  videoPath: string,
  outputPath: string,
  durationSec?: number,
): Promise<void> {
  const seek = durationSec && durationSec > 0 ? String(durationSec / 2) : FALLBACK_SEEK_SEC;
  await runFfmpeg([
    "-y",
    "-ss", seek,
    "-i", videoPath,
    "-frames:v", "1",
    "-vsync", "vfr",
    outputPath,
  ]);
}

/**
 * Extrai um keyframe JPEG de um vídeo em outputPath. Tenta primeiro o
 * scene-score select; se isso lançar (ex.: zero frames qualificados num
 * clipe estático), cai para uma busca no ponto médio, que sempre produz
 * um frame.
 */
export async function extractKeyframe(
  videoPath: string,
  outputPath: string,
  durationSec?: number,
): Promise<void> {
  try {
    await extractViaSceneScore(videoPath, outputPath);
  } catch {
    await extractViaMidpointSeek(videoPath, outputPath, durationSec);
  }
}

/**
 * Extrai o keyframe e devolve o Buffer já normalizado (JPEG 512², reusando
 * a cadeia sharp de image.service.toThumbnail) — pronto para upload S3, que
 * acontece no worker (Plano 05), não aqui.
 */
export async function extractNormalizedKeyframe(
  videoPath: string,
  tmpOutputPath: string,
  durationSec?: number,
): Promise<Buffer> {
  await extractKeyframe(videoPath, tmpOutputPath, durationSec);
  const raw = await readFile(tmpOutputPath);
  return toThumbnail(raw);
}
