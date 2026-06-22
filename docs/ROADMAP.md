# Roadmap

This file is the honest ledger of what is **implemented** vs. **planned**, so
nothing in the codebase pretends to be more finished than it is.

## Implemented ✅

- Crash-resilient chunked audio engine (dual-channel tab + mic + mixed)
- IndexedDB local-first persistence + crash recovery / reassembly
- Long-session safety (memory-flat across many hours) — unit-tested to 8h
- Level metering, WAV export encoder
- NestJS backend: JWT auth, recordings, idempotent chunked upload, search
- Storage abstraction: local FS + S3/R2/B2, **AES-256-GCM at rest**
- Transcription queue (BullMQ) with OpenAI + local-whisper drivers
- Offline, dependency-free heuristic summarizer
- React web recorder with live dashboard, resilient upload, library, recovery
- MV3 browser extension: tab capture (offscreen) + Google Meet detection
- Docker Compose, GitHub Actions CI, OpenAPI/Swagger, ERD + architecture docs
- Unit tests across engine, backend, and web

## Planned 🚧

| Area | Plan |
| --- | --- |
| **Desktop app** | Tauri shell wrapping the web UI for OS-level capture, system-audio loopback, and tray controls. The engine already runs unchanged in a webview. |
| **Full-text search** | Postgres `tsvector` + GIN index on transcript text (currently `ILIKE`/`contains`). |
| **Speaker diarization** | Wire the `diarize` flag through to a diarization-capable whisper sidecar; persist `speaker` per segment (schema already supports it). |
| **Extension → cloud sync** | Authenticated direct upload from the extension reusing the web `UploadQueue` (currently records locally + download). |
| **Export bundles** | ZIP packaging (WAV/FLAC/MP3 + transcript + PDF/Markdown summary). FLAC/MP3 transcode via ffmpeg worker. |
| **Captions capture** | Optional Google Meet caption scraping stored alongside (never relied upon) audio. |
| **Partial-chunk durability** | Periodic `requestData()` flush so even an in-progress chunk survives a hard crash (today: at most one chunk lost). |
| **E2E tests** | Playwright for the capture→upload→library flow; backend e2e against a throwaway Postgres. |

## Non-goals

- Making transcription mandatory or on the hot path.
- Trusting client-reported durations/sizes (always derived from committed chunks).
