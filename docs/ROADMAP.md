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
- Summaries: **Claude (`claude-opus-4-8`) LLM summarizer** with an offline,
  dependency-free heuristic fallback (driver = auto/anthropic/heuristic)
- Speaker diarization end-to-end: passthrough of sidecar speaker labels + a
  heuristic gap-based fallback; speakers stored per segment, surfaced via the API
  and in transcript/VTT/SRT exports
- **Postgres full-text search** (`tsvector` + `websearch_to_tsquery`, `ts_rank`
  ordering, optional GIN indexes) with graceful fallback to `ILIKE`
- Export system: ZIP bundle, transcript (txt/vtt/srt/md), summary (md + generated
  PDF), audio (lossless WebM server-side; WAV client-side; wav/mp3/flac via ffmpeg)
- React web recorder with live dashboard, resilient upload, library, recovery
- MV3 browser extension: tab capture (offscreen) + Google Meet detection
- Docker Compose, GitHub Actions CI, OpenAPI/Swagger, ERD + architecture docs
- Unit tests across engine, backend, and web

## Planned 🚧

| Area | Plan |
| --- | --- |
| **Desktop app** | Tauri shell wrapping the web UI for OS-level capture, system-audio loopback, and tray controls. The engine already runs unchanged in a webview. |
| **FTS via migrations** | Persist the GIN indexes through a real Prisma migration with generated `tsvector` columns (today they're an idempotent `prisma:fts` script that `db push` can drop). |
| **Acoustic diarization** | Replace the gap-based heuristic with speaker-embedding diarization (e.g. pyannote) in the whisper sidecar; the segment `speaker` field and exports already carry it through. |
| **Web transcript viewer** | A speaker-labelled, timestamped transcript pane in the web app (data already exposed via `GET /recordings/:id/transcript`). |
| **Extension → cloud sync** | Authenticated direct upload from the extension reusing the web `UploadQueue` (currently records locally + download). |
| **Lossy transcode by default** | Bundle a managed ffmpeg (e.g. `ffmpeg-static`) so WAV/MP3/FLAC server-side export works out of the box without operators setting `FFMPEG_PATH`. |
| **Captions capture** | Optional Google Meet caption scraping stored alongside (never relied upon) audio. |
| **Partial-chunk durability** | Periodic `requestData()` flush so even an in-progress chunk survives a hard crash (today: at most one chunk lost). |
| **E2E tests** | Playwright for the capture→upload→library flow; backend e2e against a throwaway Postgres. |

## Non-goals

- Making transcription mandatory or on the hot path.
- Trusting client-reported durations/sizes (always derived from committed chunks).
