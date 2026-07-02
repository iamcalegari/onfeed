# Plan 01-06 Summary — Deploy artifacts + E2E gate

**Plan:** 01-06 (Video Pipeline Foundation — deploy)
**Status:** Tasks 1-3 DONE (artifacts committed). Task 4 (E2E deploy gate) OUTSTANDING — a human `checkpoint:human-verify` requiring AWS/Render credentials.
**Requirements touched:** PIPE-06, PIPE-07 (deploy/runtime hardening of the worker built in 01-05).

## What was built (committed)

- **Task 1 — `Dockerfile.import-worker`** (`0ab4964`): dedicated multi-stage image for the Render Background Worker. Node 22 + `python3` + `ffmpeg` (apt) + **`yt-dlp` via `pip` (pinned `2026.06.09`)**. Critically, it does NOT rely on the `youtube-dl-exec` postinstall (which fails on network timeout — confirmed this phase); instead `ENV YOUTUBE_DL_DIR=/usr/local/bin` points the Node wrapper at the pip-installed binary — the exact mechanism validated locally via `npm run import:test`. Non-root `USER node`, `CMD node dist/workers/import-worker.js`.
- **Task 2 — SQS provisioning + render.yaml worker block** (`27a96eb`): `infra/scripts/setup-import-queue.sh` creates the DLQ (`onfeed-import-dlq`) first, then the main queue (`onfeed-import`) with a `RedrivePolicy` (`maxReceiveCount: 3`) — idempotent, and closes the no-DLQ gap the ingest queue has (CONCERNS.md). `npm run setup:import-queue` wired. `render.yaml` gains a `type: worker` service (`onfeed-import-worker`, no `healthCheckPath`) referencing `Dockerfile.import-worker`, with env keys (SQS URLs, GROQ/OPENAI, S3, Mongo, IMPORT_WORKER_CONCURRENCY) as `sync: false` references (no secrets baked in — T-06-01).
- **Task 3 — `src/infra/video/README.md`** (`469be44`): Obsidian-style docs for the video infra namespace.

## Task 4 — OUTSTANDING (human deploy + E2E gate)

`checkpoint:human-verify gate="blocking"`. Requires credentials the executor does not have. Steps the user must run:
1. `npm run setup:import-queue` (with AWS creds) → provisions `onfeed-import` + `onfeed-import-dlq`; note the queue URLs.
2. Set env/secrets on Render for the new worker: `SQS_IMPORT_QUEUE_URL`, `SQS_IMPORT_DLQ_URL`, `GROQ_API_KEY`, `OPENAI_API_KEY`, `IMAGES_S3_BUCKET`, `AWS_REGION`, `BEDROCK_REGION`, `MONGODB_*`.
3. Deploy the worker service (Render picks up `Dockerfile.import-worker`).
4. E2E: submit one real URL per platform via `POST /api/v1/import` → poll `GET /import/:jobId` → confirm `ready_for_review` with transcript + keyframe. **YouTube + TikTok must pass (D-08); Instagram best-effort.**
5. PT-BR transcription spot-check (D-05) — **already validated locally** with a YouTube Short (risoto): Groq `whisper-large-v3-turbo` produced accurate PT-BR cooking transcription. The deploy E2E re-confirms it in the deployed environment.

## Verification

- `npm run typecheck` clean; `npm run test` (fast suite) green — no runtime regressions from the deploy artifacts.
- Real deploy + E2E intentionally NOT performed here (no fabricated pass) — it is the outstanding human gate above.

## Notes / next-phase readiness

- yt-dlp anti-bot stderr fixtures (RESEARCH Open Question 1) still to be captured against real output during the deploy E2E.
- Render worker billing is continuous (not per-job); Starter ($7, 0.5 CPU) may be undersized for concurrent ffmpeg/yt-dlp — Standard ($25) is the realistic tier (RESEARCH).
- Local persistence path (Mongo + MinIO, no SQS) available via `npm run import:test -- --persist "<url>"` for validating the full worker flow before deploy.

*Plan 01-06: deploy artifacts complete; deploy/E2E is the outstanding human gate.*
