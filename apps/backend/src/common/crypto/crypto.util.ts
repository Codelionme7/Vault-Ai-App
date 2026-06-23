import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * AES-256-GCM at-rest encryption primitives. Pure functions (no NestJS) so they
 * are trivially unit-testable. Audio chunk payloads and any sensitive blobs are
 * sealed with these before they touch disk or object storage.
 *
 * Envelope layout (single Buffer): [12-byte IV][16-byte auth tag][ciphertext].
 */
const IV_LENGTH = 12; // 96-bit nonce, recommended for GCM
const TAG_LENGTH = 16;
const ALGO = 'aes-256-gcm';

function keyFromHex(hexKey: string): Buffer {
  const key = Buffer.from(hexKey, 'hex');
  if (key.length !== 32) {
    throw new Error('Encryption key must be 32 bytes (64 hex chars) for AES-256.');
  }
  return key;
}

/** Encrypt a buffer, returning a self-describing envelope buffer. */
export function encrypt(plaintext: Buffer, hexKey: string): Buffer {
  const key = keyFromHex(hexKey);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]);
}

/** Decrypt an envelope produced by {@link encrypt}. Throws if tampered. */
export function decrypt(envelope: Buffer, hexKey: string): Buffer {
  const key = keyFromHex(hexKey);
  if (envelope.length < IV_LENGTH + TAG_LENGTH) {
    throw new Error('Ciphertext envelope is too short / corrupt.');
  }
  const iv = envelope.subarray(0, IV_LENGTH);
  const tag = envelope.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = envelope.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/** Convenience helpers for string payloads. */
export function encryptString(plaintext: string, hexKey: string): string {
  return encrypt(Buffer.from(plaintext, 'utf8'), hexKey).toString('base64');
}

export function decryptString(envelopeB64: string, hexKey: string): string {
  return decrypt(Buffer.from(envelopeB64, 'base64'), hexKey).toString('utf8');
}

/** SHA-256 hex digest — used for chunk integrity and refresh-token hashing. */
export function sha256(data: Buffer | string): string {
  return createHash('sha256')
    .update(typeof data === 'string' ? Buffer.from(data) : data)
    .digest('hex');
}
