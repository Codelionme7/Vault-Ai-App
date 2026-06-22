import { describe, expect, it } from 'vitest';
import { ChunkBuffer } from './chunk-buffer.js';

function makeBuffer(chunkDurationMs = 5 * 60 * 1000) {
  let seq = 0;
  return new ChunkBuffer<string>({
    sessionId: 'sess_1',
    channel: 'tab',
    chunkDurationMs,
    mimeType: 'audio/webm;codecs=opus',
    idFactory: () => `chunk_${seq++}`,
    now: () => new Date('2026-06-22T00:00:00.000Z'),
  });
}

describe('ChunkBuffer rotation', () => {
  it('does not rotate an empty buffer', () => {
    const buf = makeBuffer();
    expect(buf.shouldRotate(10_000_000)).toBe(false);
    expect(buf.rotate(10_000_000)).toBeNull();
  });

  it('does not rotate before the chunk duration elapses', () => {
    const buf = makeBuffer(60_000);
    buf.addPart('a', 100, 0);
    expect(buf.shouldRotate(59_999)).toBe(false);
    expect(buf.shouldRotate(60_000)).toBe(true);
  });

  it('finalizes a chunk with correct metadata', () => {
    const buf = makeBuffer(60_000);
    buf.addPart('a', 100, 0);
    buf.addPart('b', 250, 1000);
    const chunk = buf.rotate(60_000);
    expect(chunk).not.toBeNull();
    expect(chunk!.meta.sequence).toBe(0);
    expect(chunk!.meta.byteLength).toBe(350);
    expect(chunk!.meta.startOffsetMs).toBe(0);
    expect(chunk!.meta.durationMs).toBe(60_000);
    expect(chunk!.meta.status).toBe('captured');
    expect(chunk!.parts).toEqual(['a', 'b']);
  });

  it('increments sequence and anchors subsequent chunk start offsets', () => {
    const buf = makeBuffer(60_000);
    buf.addPart('a', 10, 0);
    const first = buf.rotate(60_000)!;
    buf.addPart('b', 20, 61_000);
    const second = buf.rotate(120_000)!;
    expect(first.meta.sequence).toBe(0);
    expect(second.meta.sequence).toBe(1);
    expect(second.meta.startOffsetMs).toBe(60_000); // anchored to previous rotate point
    expect(second.meta.byteLength).toBe(20);
  });

  it('resets pending state after rotation', () => {
    const buf = makeBuffer(60_000);
    buf.addPart('a', 10, 0);
    expect(buf.hasPending).toBe(true);
    expect(buf.pendingBytes).toBe(10);
    buf.rotate(60_000);
    expect(buf.hasPending).toBe(false);
    expect(buf.pendingBytes).toBe(0);
    expect(buf.nextSequence).toBe(1);
  });

  // The headline durability guarantee: an 8-hour session at 5-min chunks must
  // produce a clean, contiguous sequence with no drift or memory growth in the
  // buffer (it only ever holds the current chunk's parts).
  it('handles an 8-hour session at 5-minute chunks without drift', () => {
    const chunkMs = 5 * 60 * 1000;
    const buf = makeBuffer(chunkMs);
    const totalMs = 8 * 60 * 60 * 1000;
    const expectedChunks = totalMs / chunkMs; // 96
    const finalized: number[] = [];

    let offset = 0;
    // Simulate 1s of encoded data arriving every second for 8 hours.
    for (let t = 1000; t <= totalMs; t += 1000) {
      buf.addPart(`p${t}`, 4000, t);
      offset = t;
      if (buf.shouldRotate(offset)) {
        const c = buf.rotate(offset)!;
        finalized.push(c.meta.sequence);
        // Buffer must be empty right after rotation (memory efficiency).
        expect(buf.pendingBytes).toBe(0);
      }
    }
    // Flush the trailing partial chunk.
    if (buf.hasPending) finalized.push(buf.rotate(offset)!.meta.sequence);

    expect(finalized.length).toBe(expectedChunks);
    // Sequences must be contiguous 0..95.
    expect(finalized).toEqual(Array.from({ length: expectedChunks }, (_, i) => i));
  });
});
