# Technology Stack

**Analysis Date:** 2026-07-01

## Languages

**Primary:**
- TypeScript 5.8.3 - Backend API, frontend app, scripts, and Lambda handlers
- JavaScript (JSX/TSX) - React components and Next.js pages

**Secondary:**
- Bash - Deployment and infrastructure scripts (`infra/scripts/`)
- Shell - Docker and development utilities

## Runtime

**Environment:**
- Node.js ≥22 - Backend server, CLI scripts, build tools
- Web Browser (ECMAScript 2023) - Frontend React application

**Package Manager:**
- npm - Primary package manager with lockfile (`package-lock.json`)
- Yarn - Used in web subdirectory (`web/yarn.lock`)

## Frameworks

**Core Backend:**
- Fastify 5.1.0 - REST API server (`src/server.ts`)
- TypeBox 0.34.9 - Runtime schema validation for routes (`src/app.ts`)
- Mongoat 1.0.34-alpha - MongoDB ODM (`@iamcalegari/mongoat`)

**Frontend:**
- Next.js 15.3.0 - Server-side rendering and file-based routing (`web/app/`)
- React 19.0.0 - UI component framework
- Tailwind CSS 4.0.0 - Utility-first CSS styling

**Testing:**
- Playwright 1.61.0 - Browser automation (installed in web, for E2E tests)

**Build/Dev:**
- tsx 4.19.2 - TypeScript execution for CLI scripts and dev server
- TypeScript 5.8.3 - Compilation for both backend and frontend
- esbuild - Lambda handler bundling (`build:lambda` script)
- tsc-alias - Path alias resolution in compiled output
- PostCSS 4.0.0 - CSS processing pipeline (`web/postcss.config.mjs`)

## Key Dependencies

**Critical:**
- `@anthropic-ai/sdk` 0.104.2 - Claude API for recipe adaptation and ingredient reconciliation
- `@aws-sdk/client-bedrock-runtime` 3.1070.0 - AWS Bedrock for image generation (Stability/Titan models)
- `@aws-sdk/client-s3` 3.1070.0 - S3 for thumbnail storage and retrieval
- `@aws-sdk/s3-request-presigner` 3.1070.0 - Pre-signed URLs for direct client uploads
- `mongodb` 6.16.0 - MongoDB driver (used by Mongoat ODM)

**Infrastructure:**
- `@aws-sdk/client-sqs` 3.1071.0 - SQS for async recipe ingestion queue
- `@clerk/fastify` 3.1.37 - Authentication and user identity (backend)
- `@clerk/nextjs` 7.5.3 - Clerk integration for Next.js (frontend)
- `@fastify/helmet` 12.0.1 - Security headers middleware
- `@fastify/cors` 10.0.1 - CORS middleware
- `@fastify/rate-limit` 11.0.0 - Rate limiting (120 req/min per user)
- `@fastify/sensible` 6.0.2 - Utility decorators (logging, errors)
- `@fastify/type-provider-typebox` 5.1.0 - Fastify + TypeBox integration

**Data Processing:**
- `zod` 4.4.3 - Schema validation (supplemental, not primary)
- `sharp` 0.35.1 - Image resizing and processing (unused in current flow, available for future use)
- `csv-parse` 7.0.0 - CSV parsing for dataset ingestion

## Configuration

**Environment:**
- Read via `process.env` with validation in `src/config/env.ts`
- Required vars: `MONGODB_URI`, `MONGODB_USERNAME`, `MONGODB_PASSWORD`, `MONGODB_DB_NAME`, `ANTHROPIC_API_KEY`, `VOYAGE_API_KEY`
- Optional vars: Feature flags for AWS/Bedrock, Clerk, MercadoPago, S3 CDN domain
- Local dev: `.env` file (gitignored, not committed)
- Deployment: Environment variables set in Render dashboard or infrastructure-as-code

**Build:**
- `tsconfig.json` - Shared TypeScript configuration with path alias `@/*` → `src/*`
- `tsconfig.build.json` - Production build configuration
- `web/tsconfig.json` - Next.js TypeScript config
- `web/next.config.mjs` - Next.js API rewrites, image remotePatterns, output: standalone

**Frontend Build:**
- `web/postcss.config.mjs` - Tailwind CSS configuration
- `web/.env.local` - Frontend environment variables (proxies API via `/api/v1/*` rewrite)

## Platform Requirements

**Development:**
- Node.js ≥22
- Docker (for `docker compose` to run MinIO S3 emulator locally)
- Unix/Linux shell (bash or fish) for dev scripts
- Voyage AI API key (for embeddings)
- Anthropic API key (for Claude models)
- Optional: AWS credentials for local testing (mocked by MinIO)

**Production:**
- Render.com - Hosting backend API on starter plan ($7/month)
- Vercel - Frontend deployment (Next.js optimized)
- MongoDB Atlas - Managed database (URI set via env var)
- AWS Services:
  - S3 - Thumbnail storage
  - Bedrock - Image generation (Stability AI models in us-west-2)
  - SQS - Async recipe ingestion queue
  - Lambda - Worker for SQS messages (esbuild-bundled handler)
  - CloudFront - CDN for recipe thumbnails (optional)
- Mercado Pago - Payment processing (PRO subscription via preapproval model)
- Voyage AI - Embedding generation API
- Clerk - Authentication and user management

---

*Stack analysis: 2026-07-01*
