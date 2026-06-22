# EchoVault AI — HTTP API

Base URL: `http://localhost:3000` (configurable via `API_BASE_URL`).
Interactive docs (Swagger UI): **`/docs`**. The OpenAPI JSON can be emitted to
`openapi.json` by starting the backend with `EMIT_OPENAPI=true`.

All endpoints except `auth/*` and `health` require a bearer token:
`Authorization: Bearer <accessToken>`.

## Auth

| Method | Path | Body | Notes |
| --- | --- | --- | --- |
| POST | `/auth/register` | `{ email, password, displayName? }` | Returns `{ user, accessToken, refreshToken }` |
| POST | `/auth/login` | `{ email, password }` | Same shape as register |
| POST | `/auth/refresh` | `{ refreshToken }` | Rotates the refresh token |
| POST | `/auth/logout` | `{ refreshToken }` | Revokes the refresh token (auth required) |

## Recordings

| Method | Path | Body / Query | Notes |
| --- | --- | --- | --- |
| POST | `/recordings` | `{ id?, title?, sourceType?, channels?, tags?, metadata?, startedAt? }` | `id` may be client-generated (local-first). |
| GET | `/recordings` | — | List owner's recordings, newest first |
| GET | `/recordings/:id` | — | Single recording |
| PATCH | `/recordings/:id` | `{ title?, tags?, notes? }` | |
| POST | `/recordings/:id/complete` | — | Finalize; recomputes stats from chunks |
| DELETE | `/recordings/:id` | — | Cascade-deletes chunks (`204`) |

## Chunks (the durability path)

| Method | Path | Body / Query | Notes |
| --- | --- | --- | --- |
| POST | `/chunks/upload-target` | `{ recordingId, channel, sequence, contentType? }` | Returns an `UploadTicket` (presigned S3 URL, or local API path) |
| PUT | `/chunks/upload?key=...` | raw bytes | Local driver ingest; encrypts at rest |
| POST | `/chunks/commit` | `{ recordingId, channel, sequence, startOffsetMs, durationMs, byteLength, mimeType, checksum?, storageKey }` | **Idempotent**; verifies checksum |
| GET | `/chunks?recordingId=...` | — | List a recording's chunks |
| GET | `/chunks/:id/data` | — | Stream the decrypted chunk for playback/export |

### Upload flow (client)

```
POST /chunks/upload-target            -> { uploadUrl, method, storageKey, headers, expiresAt }
PUT  <uploadUrl>  (raw chunk bytes)   -> 200
POST /chunks/commit  (+ SHA-256)      -> chunk committed; recording stats updated
```

## Search

| Method | Path | Query | Notes |
| --- | --- | --- | --- |
| GET | `/search` | `q, sourceType, tags, from, to, page, pageSize, includeTranscript` | Owner-scoped; paginated. `includeTranscript=true` also matches transcript text. |

## Transcription (optional, async)

| Method | Path | Body | Notes |
| --- | --- | --- | --- |
| POST | `/recordings/:id/transcribe` | `{ language?, diarize?, summarize? }` | Queues a job; `400` if `TRANSCRIPTION_DRIVER=none` |
| GET | `/recordings/:id/transcript` | — | The transcript (when ready) |
| GET | `/recordings/:id/summary` | — | The generated summary (when ready) |

## Export

All export endpoints are owner-scoped and return a file download
(`Content-Disposition: attachment`).

| Method | Path | Query | Notes |
| --- | --- | --- | --- |
| GET | `/recordings/:id/export/zip` | — | ZIP bundle: audio per channel (.webm) + transcript (.txt/.vtt/.srt) + notes.md + summary.pdf + metadata.json |
| GET | `/recordings/:id/export/audio` | `format=webm\|wav\|mp3\|flac`, `channel?` | `webm` is the lossless original (always available); `wav/mp3/flac` require `FFMPEG_PATH` |
| GET | `/recordings/:id/export/transcript` | `format=txt\|vtt\|srt\|md` | `400` until a transcript is completed |
| GET | `/recordings/:id/export/summary` | `format=md\|pdf` | Markdown notes or a generated PDF |

> The web app additionally offers **client-side WAV export** (decodes chunks via
> the Web Audio API and encodes with the shared engine), so lossless WAV needs
> no server transcode or ffmpeg.

## Health

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/health` | `{ status, db: 'up'\|'down', uptime }` |

## Example

```bash
# Login
TOKEN=$(curl -s localhost:3000/auth/login -H 'content-type: application/json' \
  -d '{"email":"demo@echovault.ai","password":"echovault-demo"}' | jq -r .accessToken)

# Open a recording
curl -s localhost:3000/recordings -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d '{"title":"My meeting","sourceType":"google_meet"}'

# Search
curl -s "localhost:3000/search?q=roadmap&includeTranscript=true" \
  -H "authorization: Bearer $TOKEN"
```
