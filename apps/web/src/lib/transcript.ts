import type { TranscriptSegment } from '@echovault/shared';

/** A run of consecutive segments spoken by the same speaker. */
export interface SpeakerBlock {
  speaker?: string;
  startMs: number;
  endMs: number;
  segments: TranscriptSegment[];
}

/**
 * Group consecutive segments by speaker so the viewer can render one labelled
 * block per speaker turn instead of repeating the label on every line. Pure.
 */
export function groupSegmentsBySpeaker(segments: TranscriptSegment[]): SpeakerBlock[] {
  const blocks: SpeakerBlock[] = [];
  for (const seg of segments) {
    const last = blocks[blocks.length - 1];
    if (last && last.speaker === seg.speaker) {
      last.segments.push(seg);
      last.endMs = Math.max(last.endMs, seg.endMs);
    } else {
      blocks.push({
        speaker: seg.speaker,
        startMs: seg.startMs,
        endMs: seg.endMs,
        segments: [seg],
      });
    }
  }
  return blocks;
}

/** Distinct speaker labels in first-seen order. */
export function distinctSpeakers(segments: TranscriptSegment[]): string[] {
  const seen: string[] = [];
  for (const s of segments) {
    if (s.speaker && !seen.includes(s.speaker)) seen.push(s.speaker);
  }
  return seen;
}

const SPEAKER_PALETTE = [
  '#7c7cff',
  '#00d3a7',
  '#ff9f43',
  '#ff5c6c',
  '#4dabf7',
  '#cc5de8',
  '#94d82d',
  '#ffd43b',
];

/** Map each speaker label to a stable color from a fixed palette (cycling). */
export function buildSpeakerColorMap(speakers: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  speakers.forEach((sp, i) => {
    map[sp] = SPEAKER_PALETTE[i % SPEAKER_PALETTE.length];
  });
  return map;
}
