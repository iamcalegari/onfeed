import { deflateSync } from "node:zlib";

/**
 * Gerador de imagem para dev local (substitui o Bedrock, que não emula).
 * Produz um PNG sólido 512x512 cuja cor deriva do prompt — assim cada receita
 * tem uma cor estável e distinta, dando pra confirmar visualmente que a
 * imagem certa subiu pro S3. Mesma assinatura de bedrock.image-generator.
 */

const SIZE = 512;

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i]!;
    for (let j = 0; j < 8; j++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

/** Cor RGB estável a partir do prompt. */
function colorFor(prompt: string): [number, number, number] {
  let h = 0;
  for (let i = 0; i < prompt.length; i++) {
    h = (h * 31 + prompt.charCodeAt(i)) >>> 0;
  }
  // mantém tons claros/legíveis (128–255)
  return [128 + (h & 0x7f), 128 + ((h >> 8) & 0x7f), 128 + ((h >> 16) & 0x7f)];
}

export async function generateImage(prompt: string, _negativePrompt?: string): Promise<Buffer> {
  const [r, g, b] = colorFor(prompt);

  // scanlines: cada linha começa com o byte de filtro (0 = none) seguido de RGB.
  const row = Buffer.alloc(1 + SIZE * 3);
  for (let x = 0; x < SIZE; x++) {
    row[1 + x * 3] = r;
    row[1 + x * 3 + 1] = g;
    row[1 + x * 3 + 2] = b;
  }
  const raw = Buffer.concat(Array.from({ length: SIZE }, () => row));

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0); // width
  ihdr.writeUInt32BE(SIZE, 4); // height
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type 2 = truecolor RGB
  // 10..12 = compression/filter/interlace = 0

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
