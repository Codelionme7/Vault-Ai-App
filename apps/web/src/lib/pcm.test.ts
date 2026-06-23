import { describe, expect, it } from 'vitest';
import { concatFloat32 } from './pcm';

describe('concatFloat32', () => {
  it('concatenates parts in order', () => {
    const out = concatFloat32([new Float32Array([1, 2]), new Float32Array([3, 4, 5])]);
    expect(Array.from(out)).toEqual([1, 2, 3, 4, 5]);
  });

  it('returns an empty buffer for no parts', () => {
    expect(concatFloat32([]).length).toBe(0);
  });

  it('preserves total length across many chunks', () => {
    const parts = Array.from({ length: 96 }, () => new Float32Array(48_000)); // 96 chunks
    expect(concatFloat32(parts).length).toBe(96 * 48_000);
  });

  it('handles empty parts interspersed', () => {
    const out = concatFloat32([new Float32Array([1]), new Float32Array(0), new Float32Array([2])]);
    expect(Array.from(out)).toEqual([1, 2]);
  });
});
