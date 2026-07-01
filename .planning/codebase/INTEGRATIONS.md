# External Integrations

**Analysis Date:** 2026-07-01

## APIs & External Services

**Language Models & AI:**
- Anthropic Claude - Recipe adaptation and ingredient reconciliation
  - SDK: `@anthropic-ai/sdk` 0.104.2
  - Auth: `ANTHROPIC_API_KEY` (required)
  - Models: `claude-haiku-4-5-20251001` (default), `claude-opus-4-1`, `claude-sonnet-4-5`
  - Usage: `src/infra/llm/anthropic.client.ts`
  - Daily limits: Free (3), PRO (100) adapt calls per day
  - Monthly limit: PRO (30) meal plan generations

**Vector Embeddings:**
- Voyage AI - Recipe and ingredient semantic search
  - API endpoint: `https://api.voyageai.com/v1/embeddings`
  - Auth: `VOYAGE_API_KEY` (required)
  - Model: `voyage-3` or `voyage-3.5` (configurable)
  - Dimensions: 1024 (configurable via `VOYAGE_DIMENSIONS`)
  - Retry strategy: 5 attempts with exponential backoff (429/5xx errors)
  - Usage: `src/infra/embeddings/voyage.client.ts`

**Image Generation:**
- AWS Bedrock - Text-to-image generation
  - Service: Amazon Bedrock Runtime API
  - Region: `us-west-2` (default for Stability models, configurable via `BEDROCK_REGION`)
  - Model: `stability.stable-image-core-v1:1` (default, supports Stability/Titan/Nova)
  - Auth: AWS IAM credentials (via `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`)
  - SDK: `@aws-sdk/client-bedrock-runtime`
  - Usage: `src/infra/images/bedrock.image-generator.ts`
  - Aspect ratio: 1:1 (square thumbnails)
  - Local dev: Fake generator (`IMAGES_FAKE_GENERATOR=true`)

## Data Storage

**Databases:**
- MongoDB Atlas (production) or local instance
  - Connection: `MONGODB_URI`
  - Credentials: `MONGODB_USERNAME`, `MONGODB_PASSWORD`
  - Database name: `MONGODB_DB_NAME` (default: `recipes_on_demand`)
  - Client: Mongoat ODM (`@iamcalegari/mongoat`)
  - Connection pooling: Managed by MongoDB driver
  - Usage: `src/infra/database/connection.ts`

**File Storage:**
- AWS S3 (production) or MinIO (local dev)
  - Bucket: `IMAGES_S3_BUCKET` (e.g., `on-feed-recipes-dev`)
  - Region: `AWS_REGION` (default: `us-east-1`)
  - Auth: IAM credentials (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`)
  - SDK: `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`
  - Usage: `src/infra/images/s3.image-store.ts`
  - Features:
    - Server-side PUT (generated thumbnails)
    - Pre-signed URLs for direct client uploads (300s expiry)
    - CloudFront CDN integration via `IMAGES_CDN_DOMAIN`
  - Local dev: MinIO endpoint via `IMAGES_S3_ENDPOINT` (e.g., `http://localhost:4566`)

**Caching:**
- None detected. Relational queries use MongoDB indexes, embeddings cached in vector db.

## Authentication & Identity

**Auth Provider:**
- Clerk - User identity and authentication
  - SDK (backend): `@clerk/fastify` 3.1.37
  - SDK (frontend): `@clerk/nextjs` 7.5.3
  - Auth: `CLERK_SECRET_KEY` (backend), `CLERK_PUBLISHABLE_KEY` (frontend/backend)
  - Implementation: 
    - Backend: `getAuth(request)` from Fastify plugin to extract `userId`
    - Frontend: Clerk middleware + components for sign-in/sign-up
  - Fallback: Disabled if `CLERK_SECRET_KEY` not set (anon mode)
  - Usage: `src/modules/auth/auth.guard.ts`, `src/modules/auth/auth.routes.ts`

**Authorization:**
- Role-based (admin moderation):
  - Variant moderators: Clerk userIds from `ADMIN_USER_IDS` env var
  - Usage: `src/config/env.ts`

## Monitoring & Observability

**Error Tracking:**
- None detected. Fastify logger outputs to stdout.

**Logs:**
- Fastify built-in logger (stdout/stderr)
- Request/response logs via `logger: true` in Fastify init
- Custom log calls: `console.log()`, `request.log.error()`
- Usage: Throughout `src/` (e.g., webhook processing, Lambda handler)

## CI/CD & Deployment

**Hosting:**
- Render.com - REST API backend
  - Service: Web service (Docker container)
  - Plan: Starter ($7/month)
  - Region: US Oregon (us-west-2)
  - Auto-deploy: `autoDeploy: true` on push to `main`
  - Health check: `GET /health` → `{ status: "ok" }`
  - Env vars: Managed in Render dashboard (`sync: false` for secrets)

- Vercel - Next.js frontend
  - Deployment: Auto-deploy from git (typical Vercel setup)
  - URL: `https://onfeed.vercel.app` (CORS origin)
  - Environment: Node.js runtime managed by Vercel

**Worker (Async Ingestion):**
- AWS Lambda
  - Handler: `src/lambda/ingest-handler.ts` (esbuild-bundled to `dist/lambda/handler.js`)
  - Trigger: SQS queue (`SQS_INGEST_QUEUE_URL`)
  - Batch size: 1
  - Timeout: (not specified in code, likely 60s default)
  - Secrets: MongoDB/Anthropic/AWS keys from environment
  - Cold start optimization: Reuses DB connection within same container

**CI Pipeline:**
- None detected (no GitHub Actions, no Jenkins). Manual deployment via Render auto-deploy on push.

## Environment Configuration

**Required env vars:**
- `MONGODB_URI` - MongoDB connection string
- `MONGODB_USERNAME` - MongoDB user
- `MONGODB_PASSWORD` - MongoDB password
- `MONGODB_DB_NAME` - Database name (default in code: `recipes_on_demand`)
- `ANTHROPIC_API_KEY` - Anthropic API key
- `VOYAGE_API_KEY` - Voyage AI API key

**Optional env vars (feature-gated):**
- `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY` - Auth (disabled if missing)
- `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET` - Mercado Pago (billing disabled if missing)
- `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` - AWS services
- `IMAGES_S3_BUCKET`, `IMAGES_CDN_DOMAIN` - Thumbnail storage (disabled if bucket missing)
- `BEDROCK_REGION`, `BEDROCK_IMAGE_MODEL` - Image generation
- `BEDROCK_IMAGE_MODEL` - Override default model (default: `amazon.titan-image-generator-v2:0`)
- `SQS_INGEST_QUEUE_URL` - Async recipe ingestion (disabled if missing)
- `IMAGES_S3_ENDPOINT` - Local MinIO endpoint (dev only)
- `IMAGES_FAKE_GENERATOR` - Use fake image generator (dev only)
- `APP_URL` - Frontend URL for Mercado Pago checkout (default: `http://localhost:3001`)
- `FRONTEND_ORIGIN` - CORS origin (comma-separated, default: `http://localhost:3001`)
- `NODE_ENV` - `development` or `production`
- `PORT` - Server port (default: 3000)
- `HOST` - Server host (default: `0.0.0.0`)
- `VARIANT_PROMOTE_THRESHOLD` - Promote variant after N ratings (default: 5)
- `ADMIN_USER_IDS` - Comma-separated Clerk userIds with moderation permissions
- `ANTHROPIC_MODEL` - Claude model to use (default: `claude-haiku-4-5-20251001`)
- `VOYAGE_MODEL` - Voyage embedding model (default: `voyage-3`)
- `VOYAGE_DIMENSIONS` - Embedding dimension (default: 1024)
- `ADAPT_DAILY_LIMIT_FREE` - Daily adaptation calls for free users (default: 3)
- `ADAPT_DAILY_LIMIT_PRO` - Daily adaptation calls for PRO users (default: 100)
- `PLAN_MONTHLY_LIMIT_PRO` - Monthly meal plan generations for PRO users (default: 30)
- `MP_PRO_PRICE` - PRO subscription price in BRL (default: 19.90)
- `MP_TEST_PAYER_EMAIL` - Test payer email for MP sandbox

**Secrets location:**
- `.env` file (local development, gitignored)
- Render dashboard environment variables (production backend)
- Vercel dashboard environment variables (production frontend)
- AWS Parameter Store / Secrets Manager (if using CloudFormation)

## Webhooks & Callbacks

**Incoming (backend receives):**
- **Mercado Pago Subscription Webhook** - `POST /api/v1/billing/webhook`
  - Event types: `preapproval.created`, `preapproval.updated`
  - Headers: `x-signature` (HMAC-SHA256 validation), `x-request-id`, `x-ts`
  - Signature validation: `src/modules/billing/mercadopago.ts` → `verifyWebhookSignature()`
  - Payload: JSON with subscription status (`pending`, `authorized`, `paused`, `cancelled`)
  - Actions: Update user plan (`free` ↔ `pro`) via `setPlan(userId, plan, { source: "mercadopago" })`
  - Error handling: Logs errors, returns 200 even on failure (MP retries)

**Outgoing (backend sends):**
- **Mercado Pago Preapproval Creation** - `POST https://api.mercadopago.com/preapproval`
  - Auth: Bearer token (`MP_ACCESS_TOKEN`)
  - Payload: Subscription params (frequency, amount, currency, back_url)
  - Response: `init_point` URL (checkout link sent to client)
  - Usage: `src/modules/billing/billing.routes.ts` → `POST /api/v1/billing/subscribe`

## Rate Limiting & Quotas

**Backend:**
- Global rate limit: 120 requests per minute (all users combined)
- Middleware: `@fastify/rate-limit`
- Cost protection: High-cost operations (LLM calls, embeddings) gate against daily/monthly user quotas
- Billing module enforces per-plan limits (free: 3 adapt/day, PRO: 100 adapt/day + 30 plans/month)

**API Consumption:**
- Voyage embeddings: Free tier limit 3 RPM (rate-limited in code with exponential backoff)
- Anthropic: Pay-as-you-go; daily/monthly limits enforced by billing module
- Bedrock: Per-model rate limits (usually 100 concurrent invokes)

---

*Integration audit: 2026-07-01*
