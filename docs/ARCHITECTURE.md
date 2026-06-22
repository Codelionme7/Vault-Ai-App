# EchoVault AI — Architecture

Audio is the source of truth. Every architectural decision optimizes for **never
losing a recording**, then for everything else.

## System overview

```mermaid
flowchart TB
  subgraph Clients
    Web["Web app (React + Vite)"]
    Ext["Browser extension (MV3)"]
  end

  subgraph Engine["@echovault/audio-engine (shared)"]
    Rec["AudioRecorder"]
    Chunk["ChunkBuffer (rotation)"]
    IDB[("IndexedDB recovery store")]
    Recov["RecoveryManager"]
  end

  subgraph Backend["NestJS API"]
    Auth["Auth (JWT)"]
    Recordings["Recordings"]
    Chunks["Chunks (upload/commit)"]
    Search["Search"]
    Trans["Transcription (queue)"]
    Storage["StorageService (AES-256)"]
  end

  subgraph Infra
    PG[("PostgreSQL")]
    Redis[("Redis / BullMQ")]
    Obj[("Object store: local / S3 / R2 / B2")]
    Whisper["Whisper / faster-whisper"]
  end

  Web -->|uses| Engine
  Ext -->|uses| Engine
  Rec --> Chunk --> IDB
  IDB -. on next launch .-> Recov

  Web -->|HTTPS REST| Backend
  Ext -. optional sync .-> Backend

  Recordings --> PG
  Chunks --> PG
  Chunks --> Storage --> Obj
  Search --> PG
  Trans --> Redis
  Trans --> Whisper
  Auth --> PG
```

## The recording hot path

The hot path is deliberately short and never blocks on the network.

```mermaid
sequenceDiagram
  participant U as User
  participant E as AudioRecorder
  participant CB as ChunkBuffer
  participant DB as IndexedDB
  participant Q as UploadQueue
  participant API as Backend

  U->>E: start({ tab, mic })
  E->>DB: write recovery manifest (open)
  loop every encoder tick
    E->>CB: addPart(encoded, bytes)
  end
  loop every 5 minutes (rotation)
    E->>CB: rotate()
    CB-->>E: self-contained chunk
    E->>DB: persist chunk (status=stored)  %% durable BEFORE upload
    E-->>Q: onChunkReady(chunk, blob)
    Q->>API: upload-target → PUT bytes → commit(checksum)
    API-->>Q: 200 OK
    Q->>DB: delete local chunk (reclaim space)
  end
  U->>E: stop()
  E->>DB: mark manifest closed
  E->>API: POST /recordings/:id/complete
```

Key property: the only synchronous dependency for durability is **IndexedDB**.
Upload, commit, and the server are all downstream and fully retryable.

## Crash recovery

```mermaid
sequenceDiagram
  participant App as App (next launch)
  participant RM as RecoveryManager
  participant DB as IndexedDB

  App->>RM: findRecoverable()
  RM->>DB: list manifests where closedAt is null
  RM->>DB: load chunks per open session
  RM->>RM: planReassembly() (order, detect gaps/dupes)
  RM-->>App: recoverable sessions (+ partial flag)
  App->>RM: reassemble(sessionId)
  RM->>DB: read chunks, sort by sequence
  RM-->>App: one playable Blob per channel
  App->>App: offer download / re-upload, then discard
```

A session is "recoverable" if it has a manifest with no `closedAt` and at least
one stored chunk. Reassembly is tolerant: missing sequences are reported but the
surviving audio is still salvaged (`complete: false`).

## Why these choices

| Decision | Reason |
| --- | --- |
| **Stop/restart encoder per chunk** | Each chunk is an independently decodable file → trivial recovery, no header stitching. |
| **IndexedDB before upload** | Survives tab crash and full browser restart; the browser persists Blobs to disk. |
| **Chunks are the source of truth server-side** | Recording duration/size are _derived_ from committed chunks via `recomputeStats`, so they're always consistent with what actually arrived. |
| **Unique `(recording, channel, sequence)`** | Makes chunk commit idempotent — a retried upload can never duplicate. |
| **Encryption in `StorageService`, not the driver** | Every storage backend (local/S3) gets AES-256 at rest for free; drivers stay dumb byte stores. |
| **Engine shared by web + extension** | One audited capture/recovery implementation, two delivery surfaces. |
| **Transcription on BullMQ** | Fully decoupled from capture; can fail/retry/scale without ever touching audio. |

## Module map (backend)

```
src/
  config/            typed config + fail-fast env validation
  common/crypto/     AES-256-GCM + SHA-256 (pure util + Nest service)
  common/prisma/     PrismaService lifecycle
  auth/              JWT access/refresh, passport strategy, guards
  recordings/        lifecycle + derived stats (chunks = truth)
  chunks/            upload-target, raw ingest, idempotent commit, streaming
  storage/           driver abstraction (local/S3) + key safety + encryption
  search/            pure query builder + owner-scoped search
  transcription/     queue + worker + drivers (openai/local) + summarizer
  health/            liveness + DB readiness
```

## Performance

- The engine holds only the **current** chunk in memory (parts are flushed and
  the buffer empties on every rotation) — memory stays flat across a 12-hour
  session, satisfying the `<500 MB` target.
- Recording uses native `MediaRecorder` (hardware-accelerated Opus), so CPU is
  minimal during capture.
- Transcription (CPU-heavy) runs out-of-process on a queue, never on the hot
  path.
