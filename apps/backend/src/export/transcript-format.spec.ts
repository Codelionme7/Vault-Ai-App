import { describe, expect, it } from 'vitest';
import type { TranscriptSegment } from '@echovault/shared';
import { msToTimestamp, toPlainText, toSrt, toVtt } from './transcript-format';

const segments: TranscriptSegment[] = [
  { startMs: 0, endMs: 2500, text: 'Hello everyone.' },
  { startMs: 2500, endMs: 6000, text: 'Welcome to the call.', speaker: 'Speaker A' },
];

describe('msToTimestamp', () => {
  it('formats with millisecond precision', () => {
    expect(msToTimestamp(0)).toBe('00:00:00.000');
    expect(msToTimestamp(2500)).toBe('00:00:02.500');
    expect(msToTimestamp(3_661_001)).toBe('01:01:01.001');
  });
  it('uses a comma separator for SRT', () => {
    expect(msToTimestamp(2500, ',')).toBe('00:00:02,500');
  });
  it('clamps negatives', () => {
    expect(msToTimestamp(-100)).toBe('00:00:00.000');
  });
});

describe('toPlainText', () => {
  it('joins one line per segment with speaker prefixes', () => {
    expect(toPlainText(segments)).toBe('Hello everyone.\nSpeaker A: Welcome to the call.');
  });
  it('handles empty input', () => {
    expect(toPlainText([])).toBe('');
  });
});

describe('toVtt', () => {
  it('starts with the WEBVTT header', () => {
    expect(toVtt(segments).startsWith('WEBVTT\n')).toBe(true);
  });
  it('renders cue ranges and text', () => {
    const vtt = toVtt(segments);
    expect(vtt).toContain('00:00:00.000 --> 00:00:02.500');
    expect(vtt).toContain('Speaker A: Welcome to the call.');
  });
});

describe('toSrt', () => {
  it('numbers cues from 1 with comma timestamps', () => {
    const srt = toSrt(segments);
    expect(srt.startsWith('1\n')).toBe(true);
    expect(srt).toContain('00:00:02,500 --> 00:00:06,000');
    expect(srt).toContain('2\n');
  });
});
