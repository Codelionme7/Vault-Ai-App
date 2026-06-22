import { describe, expect, it } from 'vitest';
import type { AudioChunk, RecordingChannel } from '@echovault/shared';
import { planReassembly } from './reassemble.js';

function chunk(
  channel: RecordingChannel,
  sequence: number,
  overrides: Partial<AudioChunk> = {},
): AudioChunk {
  return {
    id: `c_${channel}_${sequence}`,
    sessionId: 'sess',
    channel,
    sequence,
    status: 'stored',
    startOffsetMs: sequence * 300_000,
    durationMs: 300_000,
    byteLength: 1_000_000,
    mimeType: 'audio/webm;codecs=opus',
    createdAt: '2026-06-22T00:00:00.000Z',
    ...overrides,
  };
}

describe('planReassembly', () => {
  it('returns an empty, non-clean plan for no chunks', () => {
    const plan = planReassembly('sess', []);
    expect(plan.channels).toHaveLength(0);
    expect(plan.clean).toBe(false);
    expect(plan.totalBytes).toBe(0);
  });

  it('marks a contiguous single-channel session as clean', () => {
    const chunks = [chunk('tab', 0), chunk('tab', 1), chunk('tab', 2)];
    const plan = planReassembly('sess', chunks);
    expect(plan.clean).toBe(true);
    expect(plan.channels[0].contiguous).toBe(true);
    expect(plan.channels[0].missingSequences).toEqual([]);
    expect(plan.channels[0].totalDurationMs).toBe(900_000);
    expect(plan.totalBytes).toBe(3_000_000);
  });

  it('orders out-of-order chunks by sequence', () => {
    const chunks = [chunk('tab', 2), chunk('tab', 0), chunk('tab', 1)];
    const plan = planReassembly('sess', chunks);
    expect(plan.channels[0].ordered.map((c) => c.sequence)).toEqual([0, 1, 2]);
  });

  it('detects a gap (lost chunk) and reports it as not clean', () => {
    const chunks = [chunk('tab', 0), chunk('tab', 1), chunk('tab', 3)];
    const plan = planReassembly('sess', chunks);
    expect(plan.clean).toBe(false);
    expect(plan.channels[0].missingSequences).toEqual([2]);
    // Surviving audio is still salvaged.
    expect(plan.channels[0].ordered).toHaveLength(3);
  });

  it('treats a missing first chunk as not contiguous', () => {
    const chunks = [chunk('tab', 1), chunk('tab', 2)];
    const plan = planReassembly('sess', chunks);
    expect(plan.channels[0].contiguous).toBe(false);
    expect(plan.channels[0].missingSequences).toEqual([0]);
  });

  it('deduplicates a doubly-persisted sequence, keeping the larger blob', () => {
    const chunks = [
      chunk('tab', 0),
      chunk('tab', 1, { byteLength: 500, id: 'small' }),
      chunk('tab', 1, { byteLength: 999_999, id: 'large' }),
    ];
    const plan = planReassembly('sess', chunks);
    expect(plan.channels[0].ordered).toHaveLength(2);
    expect(plan.channels[0].duplicateSequences).toEqual([1]);
    const kept = plan.channels[0].ordered.find((c) => c.sequence === 1)!;
    expect(kept.id).toBe('large');
  });

  it('plans dual-channel recovery independently', () => {
    const chunks = [
      chunk('tab', 0),
      chunk('tab', 1),
      chunk('mic', 0),
      chunk('mic', 1),
      chunk('mic', 2),
    ];
    const plan = planReassembly('sess', chunks);
    const tab = plan.channels.find((c) => c.channel === 'tab')!;
    const mic = plan.channels.find((c) => c.channel === 'mic')!;
    expect(tab.ordered).toHaveLength(2);
    expect(mic.ordered).toHaveLength(3);
    expect(plan.clean).toBe(true);
    // Longest channel drives the recovered duration.
    expect(plan.totalDurationMs).toBe(900_000);
  });

  it('is not clean when one of several channels has a gap', () => {
    const chunks = [chunk('tab', 0), chunk('mic', 0), chunk('mic', 2)];
    const plan = planReassembly('sess', chunks);
    expect(plan.clean).toBe(false);
  });
});
