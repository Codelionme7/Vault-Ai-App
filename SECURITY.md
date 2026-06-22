# Security

EchoVault handles potentially sensitive meeting audio. Security posture:

## Encryption

- **At rest:** every audio chunk is sealed with **AES-256-GCM** in
  `StorageService` before it reaches any storage driver (local disk or S3/R2/B2).
  GCM is authenticated — tampering is detected on read and rejected.
  Envelope layout: `[12-byte IV][16-byte auth tag][ciphertext]`, with a random
  IV per chunk.
- **Key management:** the 32-byte key comes from `ENCRYPTION_KEY` (64 hex chars).
  Generate with `openssl rand -hex 32`. Rotate by re-encrypting; never commit it.
- **In transit:** run the API behind TLS. S3 uploads use presigned URLs that
  enforce `x-amz-server-side-encryption: AES256`.

## Authentication & authorization

- JWT **access** (short-lived) + **refresh** (long-lived, rotated on use).
- Passwords hashed with **bcrypt** (cost 12).
- Only **SHA-256 hashes** of refresh tokens are persisted — a DB leak cannot
  reconstruct a usable token.
- Every recording/chunk endpoint enforces **ownership** before acting.

## Integrity

- Each chunk carries a **SHA-256 checksum** of its plaintext bytes, verified
  server-side at commit; a mismatch refuses the commit rather than storing
  corruption.

## Input safety

- Storage keys are sanitized (`safeSegment` / `sanitizeKey`) and the local
  driver confines all writes under its root — path traversal is blocked at two
  layers.
- Upload keys are namespaced by owner id and validated against the caller.
- DTOs are validated with `class-validator`; unknown fields are stripped.

## Reporting a vulnerability

Please open a private security advisory rather than a public issue. Include
reproduction steps and affected versions.

## Production checklist

- [ ] Strong, unique `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`
- [ ] Real `ENCRYPTION_KEY` (not the all-zero default — boot validation enforces this)
- [ ] TLS terminator in front of the API
- [ ] Managed Postgres + Redis with auth and network isolation
- [ ] Object storage bucket private; server-side encryption enabled
- [ ] Backups of Postgres and the object store
