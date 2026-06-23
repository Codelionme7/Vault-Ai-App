import { describe, expect, it } from 'vitest';
import { buildChunkKey, safeSegment, sanitizeKey } from './key-util';

describe('safeSegment', () => {
  it('strips path separators and traversal', () => {
    const s = safeSegment('../etc/passwd');
    expect(s).not.toContain('/');
    expect(s).not.toContain('..');
    expect(safeSegment('a/b\\c')).toBe('a_b_c');
  });
  it('keeps safe chars', () => {
    expect(safeSegment('rec_123.webm')).toBe('rec_123.webm');
  });
  it('never returns empty', () => {
    expect(safeSegment('')).toBe('_');
    expect(safeSegment('///')).toBe('_');
  });
});

describe('sanitizeKey', () => {
  it('removes traversal segments', () => {
    expect(sanitizeKey('a/../../b')).toBe('a/b');
    expect(sanitizeKey('/leading/slash')).toBe('leading/slash');
  });
  it('throws on an empty result', () => {
    expect(() => sanitizeKey('../..')).toThrow();
  });
});

describe('buildChunkKey', () => {
  it('namespaces by owner and recording with zero-padded sequence', () => {
    const key = buildChunkKey({
      ownerId: 'user1',
      recordingId: 'rec1',
      channel: 'tab',
      sequence: 5,
    });
    expect(key).toBe('recordings/user1/rec1/tab/000005.webm');
  });
  it('sorts lexically by sequence (padding)', () => {
    const a = buildChunkKey({ ownerId: 'u', recordingId: 'r', channel: 'm', sequence: 2 });
    const b = buildChunkKey({ ownerId: 'u', recordingId: 'r', channel: 'm', sequence: 10 });
    expect(a < b).toBe(true);
  });
  it('sanitizes hostile ids', () => {
    const key = buildChunkKey({
      ownerId: '../x',
      recordingId: 'r',
      channel: 'tab',
      sequence: 0,
    });
    expect(key).not.toContain('..');
  });
});
