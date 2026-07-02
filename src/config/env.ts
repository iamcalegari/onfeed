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
    model: optional("ANTHROPIC_MODEL", "claude-haiku-4-5-20251001"),
    // Modelo dedicado à extração de receitas importadas (onFeed Import, Fase 2,
    // D-15): Sonnet é o Core Value (grounding + conciliação transcript/caption
    // exigem mais que o Haiku do catálogo) — configurável via env, nunca opus.
    importModel: optional("IMPORT_EXTRACTION_MODEL", "claude-sonnet-4-5"),
    // Gate de custo de IA por plano (ver módulo billing). Free bate cedo porque
    // cada adaptação custa uma chamada de LLM; PRO tem teto alto anti-abuso.
    adaptDailyLimitFree: Number(optional("ADAPT_DAILY_LIMIT_FREE", "3")),
    adaptDailyLimitPro: Number(optional("ADAPT_DAILY_LIMIT_PRO", "100")),
    // Teto mensal de geração de plano (PRO). Anti-abuso da feature mais cara.
    planMonthlyLimitPro: Number(optional("PLAN_MONTHLY_LIMIT_PRO", "30")),
  },

  // Mercado Pago — assinatura PRO. Sem MP_ACCESS_TOKEN, billing fica desabilitado
  // (o endpoint /billing/subscribe responde 503).
  mp: {
    enabled: Boolean(process.env.MP_ACCESS_TOKEN),
    accessToken: optional("MP_ACCESS_TOKEN", ""),
    webhookSecret: optional("MP_WEBHOOK_SECRET", ""),
    proPrice: Number(optional("MP_PRO_PRICE", "19.90")),
    // Email de comprador de teste (MP sandbox exige payer real ou test — ambos do mesmo tipo).
    testPayerEmail: optional("MP_TEST_PAYER_EMAIL", ""),
  },

  // URL pública do front (back_url do checkout do MP).
  app: {
    url: optional("APP_URL", "http://localhost:3001"),
  },

  variants: {
    promoteThreshold: Number(optional("VARIANT_PROMOTE_THRESHOLD", "5")),
    // Clerk userIds autorizados a moderar variantes (separados por vírgula)
    adminUserIds: optional("ADMIN_USER_IDS", "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
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
    // Fila dedicada de import (onFeed Import) — separada da fila de ingest
    // de dataset, com DLQ próprio (ver PIPE-06).
    importQueueUrl: optional("SQS_IMPORT_QUEUE_URL", ""),
    importDlqUrl: optional("SQS_IMPORT_DLQ_URL", ""),
    importEnabled: Boolean(process.env.SQS_IMPORT_QUEUE_URL),
  },

  // Transcrição primária (Groq whisper-large-v3-turbo). Opcional+enabled
  // (não required()): o worker é um deployable separado da API, e uma key
  // ausente deve falhar UM job (transcription_failed) em vez de derrubar
  // o processo inteiro no boot — mesma postura do mp.enabled.
  groq: {
    apiKey: optional("GROQ_API_KEY", ""),
    model: optional("GROQ_WHISPER_MODEL", "whisper-large-v3-turbo"),
    enabled: Boolean(process.env.GROQ_API_KEY),
  },

  // Transcrição fallback (OpenAI Whisper), acionada só se Groq falhar.
  openaiTranscription: {
    apiKey: optional("OPENAI_API_KEY", ""),
    enabled: Boolean(process.env.OPENAI_API_KEY),
  },

  // Limites do pipeline de import.
  import: {
    // Teto de duração de vídeo aceito (segundos) — mitigação de DoS por
    // download/transcrição de vídeos desproporcionalmente longos (~10min).
    maxDurationSec: Number(optional("IMPORT_MAX_DURATION_SEC", "600")),

    // Gate de quota diária de import por plano (COST-03). Mesma lógica do
    // adaptDailyLimitFree/Pro acima: Free bate cedo (cada import percorre
    // download + ASR + LLM), PRO tem teto alto anti-abuso, não um limite
    // "normal" de uso.
    dailyLimitFree: Number(optional("IMPORT_DAILY_LIMIT_FREE", "3")),
    dailyLimitPro: Number(optional("IMPORT_DAILY_LIMIT_PRO", "50")),

    // Tabela de preço por unidade (centavos de USD), usada só para registrar
    // custo operacional do pipeline de import (COST-02) — NÃO é billing-crítico,
    // é estimativa para acompanhamento interno. Todos os valores são estimativas
    // de BAIXA confiança levantadas em 2026-07-02 (RESEARCH A1–A4) e por isso
    // vivem em env com default, nunca hardcoded no pipeline (D-08): corrigir um
    // preço errado deve ser trocar uma env var, não um deploy de código.
    //
    // - priceCentsPerGbEgress: proxy grosseiro. O vídeo baixa para o disco do
    //   worker (yt-dlp) e NÃO transita pelo S3, então não há egress real do
    //   nosso storage — os bytes brutos (baixados) são a métrica confiável;
    //   o valor em centavos aqui é best-effort (RESEARCH A4 / Open Question 1).
    // - priceCentsPerAsrMinuteGroq / priceCentsPerAsrMinuteOpenai: preço por
    //   minuto de áudio transcrito, primário (Groq) e fallback (OpenAI).
    // - priceCentsPerMtokLlmInput / priceCentsPerMtokLlmOutput: preço por
    //   milhão de tokens do modelo de extração (Sonnet 4.5). O valor de input
    //   é a figura mais incerta do lote — RESEARCH A2 encontrou ambiguidade
    //   entre preço introdutório e preço padrão da Anthropic; um humano deve
    //   conferir esse número antes do lançamento.
    // - priceCentsPerMtokEmbedding: preço por milhão de tokens de embedding
    //   (Voyage), usado na canonicalização de ingredientes durante o import.
    priceCentsPerGbEgress: Number(
      optional("IMPORT_PRICE_CENTS_PER_GB_EGRESS", "9"),
    ),
    priceCentsPerAsrMinuteGroq: Number(
      optional("IMPORT_PRICE_CENTS_PER_ASR_MIN_GROQ", "0.0667"),
    ),
    priceCentsPerAsrMinuteOpenai: Number(
      optional("IMPORT_PRICE_CENTS_PER_ASR_MIN_OPENAI", "0.6"),
    ),
    priceCentsPerMtokLlmInput: Number(
      optional("IMPORT_PRICE_CENTS_PER_MTOK_LLM_IN", "300"),
    ),
    priceCentsPerMtokLlmOutput: Number(
      optional("IMPORT_PRICE_CENTS_PER_MTOK_LLM_OUT", "1500"),
    ),
    priceCentsPerMtokEmbedding: Number(
      optional("IMPORT_PRICE_CENTS_PER_MTOK_EMBED", "6"),
    ),
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
