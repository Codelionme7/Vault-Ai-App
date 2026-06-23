import { describe, expect, it } from 'vitest';
import type { TranscriptSegment } from '@echovault/shared';
import { assignSpeakersByGaps, hasSpeakers, listSpeakers } from './diarize';

function seg(startMs: number, endMs: number, text = 'x'): TranscriptSegment {
  return { startMs, endMs, text };
}

describe('hasSpeakers / listSpeakers', () => {
  it('detects presence of speaker labels', () => {
    expect(hasSpeakers([seg(0, 1000)])).toBe(false);
    expect(hasSpeakers([{ ...seg(0, 1000), speaker: 'Speaker A' }])).toBe(true);
  });
  it('lists distinct speakers in first-seen order', () => {
    const segs: TranscriptSegment[] = [
      { ...seg(0, 1), speaker: 'Speaker B' },
      { ...seg(1, 2), speaker: 'Speaker A' },
      { ...seg(2, 3), speaker: 'Speaker B' },
    ];
    expect(listSpeakers(segs)).toEqual(['Speaker B', 'Speaker A']);
  });
});

describe('assignSpeakersByGaps', () => {
  it('returns empty for empty input', () => {
    expect(assignSpeakersByGaps([])).toEqual([]);
  });

  it('keeps everyone as Speaker A when there are no large gaps', () => {
    const segs = [seg(0, 1000), seg(1000, 2000), seg(2000, 3000)];
    const out = assignSpeakersByGaps(segs, { gapMs: 1500 });
    expect(out.map((s) => s.speaker)).toEqual(['Speaker A', 'Speaker A', 'Speaker A']);
  });

  it('switches speaker after a silence gap >= threshold', () => {
    const segs = [seg(0, 1000), seg(3000, 4000), seg(4200, 5000)];
    const out = assignSpeakersByGaps(segs, { gapMs: 1500 });
    // gap before #2 is 2000ms (>=1500) -> switch; gap before #3 is 200ms -> stay
    expect(out.map((s) => s.speaker)).toEqual(['Speaker A', 'Speaker B', 'Speaker B']);
  });

  it('cycles through speakers up to maxSpeakers then wraps', () => {
    const segs = [seg(0, 100), seg(2000, 2100), seg(4000, 4100), seg(6000, 6100)];
    const out = assignSpeakersByGaps(segs, { gapMs: 1000, maxSpeakers: 2 });
    expect(out.map((s) => s.speaker)).toEqual([
      'Speaker A',
      'Speaker B',
      'Speaker A',
      'Speaker B',
    ]);
  });

  it('does not mutate the input and preserves existing speakers', () => {
    const segs: TranscriptSegment[] = [
      { ...seg(0, 1000), speaker: 'Alice' },
      seg(3000, 4000), // 2s gap after Alice -> inferred speaker change
    ];
    const out = assignSpeakersByGaps(segs, { gapMs: 1500 });
    expect(segs[1].speaker).toBeUndefined(); // input untouched
    expect(out[0].speaker).toBe('Alice'); // preserved
    expect(out[1].speaker).toBe('Speaker B'); // gap bumps the speaker index
  });
});
