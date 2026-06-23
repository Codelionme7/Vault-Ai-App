# EchoVault AI

**Audio-first meeting & knowledge capture.** Capture audio reliably, store it
securely, organize it intelligently, retrieve it instantly — and transcribe it
only when you ask.

> **Core philosophy:** _Audio is the source of truth._ If transcription fails,
> the audio is still preserved. If the internet drops, recording continues
> locally. If the tab crashes, the recording is recovered. Recording quality and
> reliability come before everything else.

---

## Why this exists

Most "meeting recorders" are transcription products that happen to keep audio.
EchoVault inverts that: the recording is the product. Every other feature
(transcripts, summaries, search) is an optional layer on top of an
**append-only, crash-resilient capture pipeline**.

---

## What's in the box

A TypeScript monorepo with four cooperating pieces:

| Package | What it is | Status |
| --- | --- | --- |
| [`packages/audio-engine`](packages/audio-engine) | Framework-agnostic, crash-resilient capture engine (chunking, dual-channel, IndexedDB recovery, WAV export, level metering) | ✅ Implemented + tested |
| [`packages/shared`](packages/shared) | Domain types shared across every package | ✅ |
| [`apps/backend`](apps/backend) | NestJS API: auth, chunked upload, storage (local/S3), search, transcription queue, AES-256 at rest | ✅ Implemented + tested |
| [`apps/web`](apps/web) | React recorder: live dashboard, resilient upload, library/search, recovery | ✅ Implemented |
| [`apps/extension`](apps/extension) | Manifest V3 extension: tab capture + Google Meet detection (reuses the engine) | ✅ Implemented |

The **audio engine is the heart of the product** and is shared by both the web
app and the extension, so they share identical chunking and recovery behavior.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for diagrams,
[`docs/ERD.md`](docs/ERD.md) for the data model, and
[`docs/API.md`](docs/API.md) for the HTTP API.

---

## The durability model (read this first)

```
capture → encode → CHUNK (every 5 min) → persist to IndexedDB → upload → commit
                                          └── durable here ──┘   └─ cloud here ─┘
```

1. **Chunked recording.** Each channel is recorded as a sequence of
   self-contained 5-minute files. A fresh encoder per chunk means every stored
   chunk is independently playable — there is no shared header to reconstruct.
2. **Local-first persistence.** A chunk is written to durable local storage
   (IndexedDB in the browser) the instant it is captured, **before any upload**.
3. **Crash recovery.** A recovery manifest is written at start and only marked
   "closed" on a clean stop. On next launch, any un-closed session is detected,
   its surviving chunks reassembled per channel, and offered for download —
   even if some chunks are missing (partial salvage beats nothing).
4. **Resilient upload.** Uploads retry with exponential backoff; the local copy
   is dropped only after the cloud confirms the commit. An offline laptop simply
   drains its queue when it reconnects.

The result: **a crash, a closed tab, or a dropped connection can cost at most
one chunk.** This is verified by unit tests, including a simulated 8-hour
session and simulated crashes with gaps and duplicate chunks.

---

## Quickstart

```bash
# 1. Install + prepare env/secrets + start Postgres & Redis (Docker)
npm run setup           # or: bash scripts/setup.sh

# 2. Create the database schema and seed a demo account
npm run prisma:migrate:dev --workspace @echovault/backend   # or prisma db push
npm run prisma:seed       --workspace @echovault/backend

# 3. Run it
npm run dev:backend       # http://localhost:3000  (Swagger UI at /docs)
npm run dev:web           # http://localhost:5173

# 4. Browser extension
npm run build --workspace @echovault/extension
#   then load apps/extension/dist as an unpacked extension in chrome://extensions
```

**Demo login:** `demo@echovault.ai` / `echovault-demo`

### Everything via Docker

```bash
cp .env.example .env      # set ENCRYPTION_KEY + JWT secrets for production
docker compose up -d      # postgres + redis + backend (schema auto-applied)
```

---

## Using the recorder

1. **Web app** → _Record_ tab → pick a source (Browser tab audio and/or
   Microphone) → **Start recording**. Grant the tab-share prompt and tick
   "Share tab audio".
2. Watch the live dashboard: timer, chunk count, bytes stored, pending sync, and
   per-channel level meters.
3. **Stop** finalizes the session and completes the upload. Find it in the
   _Library_, search it, and optionally request a transcript.
4. **Extension** → click the toolbar icon on any tab (auto-detects Google Meet)
   → **Start recording**. Saved recordings can be downloaded from the popup.
5. **Export** (Library → _Export ▾_): a full **ZIP bundle** (audio + transcript +
   notes + summary PDF + metadata), the **original lossless audio**, **WAV**
   generated in-browser, or transcript/summary files. WAV/MP3/FLAC server-side
   transcodes are available when `FFMPEG_PATH` is set.

---

## Tech stack

- **Engine/Web/Extension:** TypeScript, Web Audio API, MediaRecorder, IndexedDB,
  React + Vite, esbuild (MV3).
- **Backend:** NestJS, Prisma, PostgreSQL (full-text `tsvector`/GIN search),
  BullMQ + Redis, AWS SDK (S3/R2/B2), Anthropic SDK (`claude-opus-4-8` summaries),
  JWT auth, Swagger/OpenAPI.
- **Tooling:** npm workspaces, Vitest, Docker, GitHub Actions.

---

## Testing

```bash
npm test            # all workspaces
```

| Suite | Covers |
| --- | --- |
| audio-engine | chunk rotation incl. **8-hour session**, **crash recovery** (gaps/duplicates/multi-channel), level math, WAV headers |
| backend | AES-256-GCM crypto, storage key safety + local driver I/O, search query builder, summarizer |
| web | duration/byte formatting |

The crash-recovery and long-session tests directly exercise the spec's
"Long Session" and "Crash Recovery" test categories without needing a browser.

---

## Security

- **At rest:** every chunk is sealed with **AES-256-GCM** before it touches disk
  or object storage (authenticated encryption — tampering is detected).
- **In transit:** TLS in front of the API; S3 uploads use presigned URLs with
  enforced server-side encryption.
- **Auth:** JWT access + refresh with rotation; passwords hashed with bcrypt;
  only refresh-token _hashes_ are stored.
- **Integrity:** each chunk carries a SHA-256 checksum verified on commit.

See [`SECURITY.md`](SECURITY.md).

---

## Scope & honesty

This repository is a coherent, runnable, **vertically-complete** implementation
of the core product: reliable capture → durable storage → instant retrieval →
optional transcription. Items intentionally left as **roadmap** (clearly marked
throughout the code and in [`docs/ROADMAP.md`](docs/ROADMAP.md)) include a Tauri
desktop shell, Postgres full-text (GIN) search, speaker diarization, and direct
extension→cloud sync. The architecture is built to absorb these without rework.

## License

MIT — see [`LICENSE`](LICENSE).
