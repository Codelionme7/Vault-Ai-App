# EchoVault AI — Entity Relationship Diagram

The data model is generated from [`apps/backend/prisma/schema.prisma`](../apps/backend/prisma/schema.prisma).
`Recording` + `Chunk` are the durable record of captured audio; `Transcript` and
`Summary` are optional, secondary artifacts.

```mermaid
erDiagram
  User ||--o{ Recording : owns
  User ||--o{ RefreshToken : has
  Recording ||--o{ Chunk : "has many"
  Recording ||--o| Transcript : "has optional"
  Recording ||--o| Summary : "has optional"

  User {
    string id PK
    string email UK
    string passwordHash
    string displayName
    datetime createdAt
    datetime updatedAt
  }

  RefreshToken {
    string id PK
    string userId FK
    string tokenHash "SHA-256; raw token never stored"
    datetime expiresAt
    datetime revokedAt
    datetime createdAt
  }

  Recording {
    string id PK
    string ownerId FK
    string title
    enum status "recording|paused|completed|interrupted|recovered"
    enum sourceType "google_meet|zoom_web|teams_web|youtube|podcast|webinar|course|interview|manual"
    json metadata "best-effort session metadata"
    string[] channels "tab|mic|mixed"
    datetime startedAt
    datetime endedAt
    int durationMs "derived from chunks"
    bigint sizeBytes "derived from chunks"
    string[] tags
    string notes
    enum transcriptStatus "not_requested|queued|processing|completed|failed"
    bool hasPendingUploads
    datetime createdAt
    datetime updatedAt
  }

  Chunk {
    string id PK
    string recordingId FK
    string channel
    int sequence
    enum status "recording|captured|stored|uploading|uploaded|failed"
    int startOffsetMs
    int durationMs
    int byteLength
    string mimeType
    string checksum "SHA-256 of plaintext bytes"
    string storageKey
    datetime createdAt
    datetime uploadedAt
  }

  Transcript {
    string id PK
    string recordingId FK,UK
    enum status
    string language
    string model
    string text "flattened, for search"
    json segments "[{startMs,endMs,text,speaker?}]"
    datetime createdAt
    datetime completedAt
  }

  Summary {
    string id PK
    string recordingId FK,UK
    string executiveSummary
    string meetingNotes
    string[] actionItems
    string[] keyDecisions
    string[] questionsAsked
    string[] followUps
    datetime createdAt
  }
```

## Notable constraints & indexes

- `Chunk` has a **unique** `(recordingId, channel, sequence)` — the linchpin of
  idempotent uploads and duplicate-proof recovery.
- `Recording` is indexed on `(ownerId, startedAt)`, `(ownerId, sourceType)`, and
  `(ownerId, status)` for fast, owner-scoped library and search queries.
- `Transcript` and `Summary` have a **unique** `recordingId` (1:0..1).
- All children cascade-delete with their `Recording`/`User`.
- `durationMs` / `sizeBytes` on `Recording` are **derived** values recomputed
  from committed chunks (`RecordingsService.recomputeStats`), never trusted from
  the client.
