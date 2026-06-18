/**
 * Migra thumbnailUrl de URLs diretas do S3 para URLs do CloudFront.
 *
 * Uso:
 *   S3_BUCKET=on-feed-recipes-dev \
 *   IMAGES_CDN_DOMAIN=d1shgj73zhbcjz.cloudfront.net \
 *   npx tsx src/scripts/migrate-thumbnail-urls.ts
 */
import { connectDatabase, database } from "@/infra/database/connection.js";
import "../modules/index.js";

const S3_BUCKET = process.env.S3_BUCKET ?? process.env.IMAGES_S3_BUCKET ?? "";
const CDN_DOMAIN = process.env.IMAGES_CDN_DOMAIN ?? "";
const REGION = process.env.AWS_REGION ?? "us-east-1";

if (!S3_BUCKET || !CDN_DOMAIN) {
  console.error("Defina S3_BUCKET e IMAGES_CDN_DOMAIN no ambiente.");
  process.exit(1);
}

const S3_PREFIX = `https://${S3_BUCKET}.s3.${REGION}.amazonaws.com/`;
const CDN_PREFIX = `https://${CDN_DOMAIN}/`;

async function run() {
  await connectDatabase();
  const col = database.getCollection("recipes");

  // Contar quantas receitas têm URL S3 direta
  const total = await col.countDocuments({
    thumbnailUrl: { $regex: `^${S3_PREFIX.replace(/\./g, "\\.").replace(/\//g, "\\/")}` },
  });

  if (total === 0) {
    console.log("Nenhuma receita com URL S3 direta encontrada. Nada a migrar.");
    process.exit(0);
  }

  console.log(`Migrando ${total} receitas de S3 → CloudFront...`);

  // Usar aggregation pipeline update: substitui o prefixo S3 pelo CDN
  const result = await col.updateMany(
    { thumbnailUrl: { $regex: `^${S3_PREFIX.replace(/\./g, "\\.").replace(/\//g, "\\/")}` } },
    [
      {
        $set: {
          thumbnailUrl: {
            $concat: [
              CDN_PREFIX,
              { $substr: ["$thumbnailUrl", S3_PREFIX.length, -1] },
            ],
          },
        },
      },
    ],
  );

  console.log(`✓ Atualizadas: ${result.modifiedCount} receitas`);
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
