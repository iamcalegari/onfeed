import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { env } from "@/config/env.js";

let client: S3Client | null = null;
function getClient(): S3Client {
  if (!client) {
    // Dev local (MinIO/LocalStack): endpoint custom exige path-style e
    // credenciais explícitas, lidas do ambiente (devem bater com o emulador).
    client = env.images.s3Endpoint
      ? new S3Client({
          region: env.images.region,
          endpoint: env.images.s3Endpoint,
          forcePathStyle: true,
          credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "localtest",
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "localtest123",
          },
        })
      : new S3Client({ region: env.images.region });
  }
  return client;
}

/** URL pública: CloudFront > endpoint local (path-style) > URL direta do S3. */
function publicUrl(key: string): string {
  if (env.images.cdnDomain) return `https://${env.images.cdnDomain}/${key}`;
  if (env.images.s3Endpoint) {
    return `${env.images.s3Endpoint}/${env.images.bucket}/${key}`;
  }
  return `https://${env.images.bucket}.s3.${env.images.region}.amazonaws.com/${key}`;
}

export async function putImage(
  key: string,
  bytes: Buffer,
  contentType: string,
): Promise<string> {
  await getClient().send(
    new PutObjectCommand({
      Bucket: env.images.bucket,
      Key: key,
      Body: bytes,
      ContentType: contentType,
    }),
  );
  return publicUrl(key);
}

/** URL pré-assinada (PUT) para upload direto do usuário (user-generated). */
export async function presignUpload(
  key: string,
  contentType: string,
): Promise<{ uploadUrl: string; publicUrl: string }> {
  const uploadUrl = await getSignedUrl(
    getClient(),
    new PutObjectCommand({
      Bucket: env.images.bucket,
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn: 300 },
  );
  return { uploadUrl, publicUrl: publicUrl(key) };
}
