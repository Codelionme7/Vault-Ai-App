# Deploying EchoVault AI to Vercel (serverless)

This guide deploys the **entire app to Vercel as one project**: the React web
recorder as static assets, and the NestJS API as a single serverless function
mounted at `/api/*`.

> **Read this first — what changes on serverless.** Vercel has no long-running
> processes and a ~4.5 MB function body limit, so this topology differs from the
> Docker/standalone deployment in three deliberate ways:
>
> 1. **Object storage is mandatory and direct.** Chunks upload straight from the
>    browser to S3/R2 via presigned URLs (bypassing the function size limit), and
>    play back via presigned download redirects. The local-disk driver cannot be
>    used (the function filesystem is read-only and ephemeral).
> 2. **App-layer AES is off; bucket SSE is on.** Because the API never sees the
>    bytes (they go browser→bucket), at-rest encryption is provided by the bucket
>    (S3 SSE / R2 automatic encryption) instead of the app's AES-256-GCM layer.
> 3. **Transcription & summaries are disabled.** They need the BullMQ/Redis
>    background worker, which can't run on serverless. Capture, durable storage,
>    library, search, playback and export all work. Transcript/summary **reads**
>    still work for anything produced elsewhere; requesting a new one returns a
>    clear 503.
>
> If you want transcription too, run the API from the `Dockerfile` (Fly.io,
> Railway, Render, a VM) with Postgres + Redis, and point the web app's
> `VITE_API_BASE_URL` at it. The serverless path here is the "just start using
> capture + storage" path.

---

## 1. Provision the external resources

You need two things Vercel doesn't provide:

### a) Postgres — [Neon](https://neon.tech) (recommended) or any Postgres
- Create a project; copy the **pooled** connection string (Neon gives you a
  `-pooler` host). Serverless functions open many short-lived connections, so use
  the pooled URL. Example:
  `postgresql://USER:PASS@ep-xxx-pooler.REGION.aws.neon.tech/neondb?sslmode=require`

### b) An S3-compatible bucket — Cloudflare R2, Backblaze B2, or AWS S3
- Create a bucket (e.g. `echovault`) and an access key / secret with read+write.
- Note the **endpoint** and **region**:
  - **R2:** endpoint `https://<accountid>.r2.cloudflarestorage.com`, region `auto`.
  - **B2:** endpoint `https://s3.<region>.backblazeb2.com`, region e.g. `us-west-004`.
  - **AWS S3:** leave endpoint empty, set the real region (e.g. `us-east-1`).
- **Configure CORS on the bucket** so the browser can upload and download
  directly. Allowed origin = your Vercel URL (and `http://localhost:5173` for
  local testing). Example policy:

```json
[
  {
    "AllowedOrigins": ["https://YOUR-APP.vercel.app", "http://localhost:5173"],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

---

## 2. Set environment variables in Vercel

Project → **Settings → Environment Variables** (Production). Generate the secrets
locally first:

```bash
# 32-byte hex AES key (kept for any app-encrypted data; harmless on serverless)
openssl rand -hex 32
# Two strong JWT secrets
openssl rand -base64 48
openssl rand -base64 48
```

| Variable | Value / notes |
| --- | --- |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Neon **pooled** connection string |
| `ENCRYPTION_KEY` | 64-hex-char key from `openssl rand -hex 32` |
| `JWT_ACCESS_SECRET` | strong random string |
| `JWT_REFRESH_SECRET` | a **different** strong random string |
| `STORAGE_DRIVER` | `s3` |
| `STORAGE_APP_ENCRYPTION` | `false` (required for presigned uploads) |
| `CHUNK_VERIFY_ON_COMMIT` | `false` (skip the per-chunk re-download) |
| `S3_BUCKET` | your bucket name |
| `S3_ENDPOINT` | bucket endpoint (omit for AWS S3) |
| `S3_REGION` | `auto` for R2, real region otherwise |
| `S3_ACCESS_KEY_ID` | access key |
| `S3_SECRET_ACCESS_KEY` | secret key |
| `S3_FORCE_PATH_STYLE` | `true` (R2/B2/MinIO); `false` for AWS S3 |
| `S3_SSE` | `AES256` for AWS S3; **empty** for R2 |
| `ECHOVAULT_ENABLE_QUEUE` | `false` (also auto-disabled on Vercel) |

> The web client needs no env var in Vercel — `apps/web/.env.production` already
> sets `VITE_API_BASE_URL=/api`, so it calls the same-origin function.

---

## 3. Create the database schema (one time)

The serverless function does **not** run migrations on boot. Apply the schema
once from your machine, pointing at the Neon database:

```bash
cd apps/backend
DATABASE_URL="postgresql://...neon..." npx prisma db push
# optional: seed a demo account (demo@echovault.ai / echovault-demo)
DATABASE_URL="postgresql://...neon..." npm run prisma:seed
```

(For Postgres full-text search indexes, also run
`DATABASE_URL=... npm run prisma:fts`. Without them, search falls back to `ILIKE`.)

---

## 4. Deploy

The repo root already contains `vercel.json` (build command, output dir, and the
function config) so a normal deploy works:

```bash
npx vercel --prod        # or connect the repo in the Vercel dashboard
```

What Vercel runs:
- **Build:** `npm run vercel-build` → builds `@echovault/shared`, runs
  `prisma generate` (with the rhel Lambda engine targets), builds the backend,
  then the web app.
- **Static output:** `apps/web/dist`.
- **Function:** `api/[...path].ts` boots the cached NestJS app and serves every
  `/api/*` route.

---

## 5. Smoke test

```bash
curl https://YOUR-APP.vercel.app/api/health        # -> {"status":"ok",...}
```

Then open the site, register an account, record a few seconds, stop, and confirm
the recording appears in the Library and plays back. A `200` from `/api/health`
means routing + DB are wired; a `500` usually means `DATABASE_URL` is missing or
unreachable; a `404` means the function/prefix didn't mount.

---

## Troubleshooting

| Symptom | Likely cause / fix |
| --- | --- |
| `/api/health` returns 404 | Function didn't build. Check the deploy logs for the `api/[...path].ts` build and that `apps/backend/dist/serverless.js` was produced. |
| 500s mentioning Prisma engine | The Lambda engine wasn't bundled. Confirm `binaryTargets` includes `rhel-openssl-3.0.x` and `includeFiles` covers `node_modules/.prisma/client/**` (both already set). |
| Uploads fail with a CORS error | Bucket CORS doesn't allow your origin / `PUT` / the `x-amz-server-side-encryption` header. For R2, set `S3_SSE=` (empty). |
| Playback/download fails with CORS | Bucket CORS must allow `GET` from your origin (the API redirects to a presigned GET). |
| "Transcription is unavailable in this deployment" | Expected on serverless. Use the Docker deployment with Redis for transcription. |
| DB connection exhaustion | Use Neon's **pooled** connection string, not the direct one. |
