import { describe, expect, it } from 'vitest';
import type { TranscriptSegment } from '@echovault/shared';
import { buildSpeakerColorMap, distinctSpeakers, groupSegmentsBySpeaker } from './transcript';

function seg(startMs: number, endMs: number, text: string, speaker?: string): TranscriptSegment {
  return { startMs, endMs, text, speaker };
}

describe('groupSegmentsBySpeaker', () => {
  it('returns empty for no segments', () => {
    expect(groupSegmentsBySpeaker([])).toEqual([]);
  });

  it('merges consecutive same-speaker segments into one block', () => {
    const segs = [
      seg(0, 1000, 'hi', 'Speaker A'),
      seg(1000, 2000, 'there', 'Speaker A'),
      seg(2000, 3000, 'hello', 'Speaker B'),
    ];
    const blocks = groupSegmentsBySpeaker(segs);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].speaker).toBe('Speaker A');
    expect(blocks[0].segments).toHaveLength(2);
    expect(blocks[0].endMs).toBe(2000);
    expect(blocks[1].speaker).toBe('Speaker B');
  });

  it('starts a new block when the speaker alternates back', () => {
    const segs = [
      seg(0, 1, 'a', 'A'),
      seg(1, 2, 'b', 'B'),
      seg(2, 3, 'c', 'A'),
    ];
    expect(groupSegmentsBySpeaker(segs).map((b) => b.speaker)).toEqual(['A', 'B', 'A']);
  });

  it('handles undefined speakers as a single group', () => {
    const segs = [seg(0, 1, 'a'), seg(1, 2, 'b')];
    const blocks = groupSegmentsBySpeaker(segs);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].speaker).toBeUndefined();
  });
});

describe('distinctSpeakers', () => {
  it('lists distinct speakers in first-seen order, ignoring undefined', () => {
    const segs = [seg(0, 1, 'a', 'B'), seg(1, 2, 'b'), seg(2, 3, 'c', 'A'), seg(3, 4, 'd', 'B')];
    expect(distinctSpeakers(segs)).toEqual(['B', 'A']);
  });
});

describe('buildSpeakerColorMap', () => {
  it('assigns a color per speaker and cycles the palette', () => {
    const speakers = Array.from({ length: 10 }, (_, i) => `S${i}`);
    const map = buildSpeakerColorMap(speakers);
    expect(Object.keys(map)).toHaveLength(10);
    expect(map.S0).toMatch(/^#[0-9a-f]{6}$/i);
    // palette has 8 entries -> S8 wraps to S0's color
    expect(map.S8).toBe(map.S0);
  });
});
