/**
 * Validação e tipagem das variáveis de ambiente.
 * Falha rápido (no boot) se algo essencial estiver faltando.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
  }
  return value;
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

export const env = {
  node: optional("NODE_ENV", "development"),
  isProd: process.env.NODE_ENV === "production",

  http: {
    port: Number(optional("PORT", "3000")),
    host: optional("HOST", "0.0.0.0"),
    // origens permitidas no CORS (lista separada por vírgula)
    corsOrigin: optional("FRONTEND_ORIGIN", "http://localhost:3001")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  },

  mongo: {
    // O mongoat lê MONGODB_URI/USERNAME/PASSWORD/DB_NAME do process.env diretamente,
    // mas validamos aqui para falhar cedo com mensagem clara.
    uri: required("MONGODB_URI"),
    username: required("MONGODB_USERNAME"),
    password: required("MONGODB_PASSWORD"),
    dbName: required("MONGODB_DB_NAME"),
  },

  voyage: {
    apiKey: required("VOYAGE_API_KEY"),
    model: optional("VOYAGE_MODEL", "voyage-3"),
    dimensions: Number(optional("VOYAGE_DIMENSIONS", "1024")),
  },

  anthropic: {
    apiKey: required("ANTHROPIC_API_KEY"),
    // Extração e adaptação. Default Haiku 4.5 (5-10x mais barato que Opus e
    // suficiente p/ essas tarefas). Troque p/ opus/sonnet se quiser mais qualidade.
    model: optional("ANTHROPIC_MODEL", "claude-haiku-4-5-20251001"),
    // teto diário de adaptações (LLM) por usuário — segura o custo variável
    adaptDailyLimit: Number(optional("ADAPT_DAILY_LIMIT", "10")),
  },

  // Auth via Clerk. Sem CLERK_SECRET_KEY, `enabled=false` e as rotas protegidas
  // respondem 401 (app sobe normalmente em dev sem auth configurada).
  clerk: {
    enabled: Boolean(process.env.CLERK_SECRET_KEY),
    secretKey: optional("CLERK_SECRET_KEY", ""),
    publishableKey: optional("CLERK_PUBLISHABLE_KEY", ""),
  },

  aws: {
    region: optional("AWS_REGION", "us-east-1"),
  },

  sqs: {
    queueUrl: optional("SQS_INGEST_QUEUE_URL", ""),
    enabled: Boolean(process.env.SQS_INGEST_QUEUE_URL),
  },

  // Thumbnails (Bedrock + S3 + CloudFront). Tudo opcional: sem bucket/região,
  // `images.enabled` fica false e o app usa o placeholder.
  images: {
    enabled: Boolean(process.env.AWS_REGION && process.env.IMAGES_S3_BUCKET),
    region: optional("AWS_REGION", ""),
    bucket: optional("IMAGES_S3_BUCKET", ""),
    cdnDomain: optional("IMAGES_CDN_DOMAIN", ""), // ex: dxxxx.cloudfront.net
    bedrockModel: optional(
      "BEDROCK_IMAGE_MODEL",
      "amazon.titan-image-generator-v2:0",
    ),
    // Região do Bedrock pode diferir da do S3: os geradores text-to-image da
    // Stability (Stable Image Core/Ultra) vivem em us-west-2, enquanto o bucket
    // pode estar em outra região. Default: cai na região do S3.
    bedrockRegion: optional("BEDROCK_REGION", "") || optional("AWS_REGION", ""),
    // Dev local: aponta o S3 para um endpoint emulado (LocalStack/MinIO).
    // Vazio em produção → usa o S3 real da AWS.
    s3Endpoint: optional("IMAGES_S3_ENDPOINT", ""), // ex: http://localhost:4566
    // Dev local: Bedrock não emula bem, então usa um gerador de PNG fake.
    fakeGenerator: process.env.IMAGES_FAKE_GENERATOR === "true",
  },
} as const;
