import { describe, expect, it } from 'vitest';
import { decrypt, decryptString, encrypt, encryptString, sha256 } from './crypto.util';

const KEY = 'a'.repeat(64); // 32 bytes hex
const KEY2 = 'b'.repeat(64);

describe('AES-256-GCM crypto', () => {
  it('round-trips a buffer', () => {
    const plain = Buffer.from('the audio is the source of truth');
    const env = encrypt(plain, KEY);
    expect(decrypt(env, KEY).toString()).toBe(plain.toString());
  });

  it('round-trips a string', () => {
    const secret = 'meeting-notes-🔒-with-unicode';
    expect(decryptString(encryptString(secret, KEY), KEY)).toBe(secret);
  });

  it('produces a different ciphertext each time (random IV)', () => {
    const plain = Buffer.from('same input');
    const a = encrypt(plain, KEY).toString('base64');
    const b = encrypt(plain, KEY).toString('base64');
    expect(a).not.toBe(b);
  });

  it('fails to decrypt with the wrong key', () => {
    const env = encrypt(Buffer.from('secret'), KEY);
    expect(() => decrypt(env, KEY2)).toThrow();
  });

  it('detects tampering via the auth tag', () => {
    const env = encrypt(Buffer.from('integrity matters'), KEY);
    env[env.length - 1] ^= 0xff; // flip a ciphertext byte
    expect(() => decrypt(env, KEY)).toThrow();
  });

  it('rejects a non-32-byte key', () => {
    expect(() => encrypt(Buffer.from('x'), 'abcd')).toThrow(/32 bytes/);
  });

  it('rejects a truncated envelope', () => {
    expect(() => decrypt(Buffer.alloc(4), KEY)).toThrow(/too short|corrupt/);
  });
});

describe('sha256', () => {
  it('is stable and 64 hex chars', () => {
    const h = sha256('hello');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(sha256('hello')).toBe(h);
  });

  it('differs for different inputs', () => {
    expect(sha256('a')).not.toBe(sha256('b'));
  });
});
