import type { TranscriptSegment } from '@echovault/shared';

/**
 * Pure transcript serializers (plain text / WebVTT / SubRip). No I/O, so the
 * timestamp math and formatting are fully unit-testable.
 */

/** Milliseconds -> "HH:MM:SS<sep>mmm". VTT uses '.', SRT uses ','. */
export function msToTimestamp(ms: number, sep: '.' | ',' = '.'): string {
  const clamped = Math.max(0, Math.floor(ms));
  const h = Math.floor(clamped / 3_600_000);
  const m = Math.floor((clamped % 3_600_000) / 60_000);
  const s = Math.floor((clamped % 60_000) / 1000);
  const millis = clamped % 1000;
  const pad = (n: number, w = 2) => n.toString().padStart(w, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}${sep}${pad(millis, 3)}`;
}

function speakerPrefix(seg: TranscriptSegment): string {
  return seg.speaker ? `${seg.speaker}: ` : '';
}

/** Flat, human-readable text — one line per segment, speaker-prefixed. */
export function toPlainText(segments: TranscriptSegment[]): string {
  return segments.map((s) => `${speakerPrefix(s)}${s.text}`.trim()).join('\n');
}

/** WebVTT (browser-native caption format). */
export function toVtt(segments: TranscriptSegment[]): string {
  const cues = segments.map((s) => {
    const range = `${msToTimestamp(s.startMs)} --> ${msToTimestamp(s.endMs)}`;
    return `${range}\n${speakerPrefix(s)}${s.text}`.trim();
  });
  return ['WEBVTT', '', ...joinWithBlank(cues)].join('\n');
}

/** SubRip (.srt) — numbered cues, comma millisecond separator. */
export function toSrt(segments: TranscriptSegment[]): string {
  const blocks = segments.map((s, i) => {
    const range = `${msToTimestamp(s.startMs, ',')} --> ${msToTimestamp(s.endMs, ',')}`;
    return `${i + 1}\n${range}\n${speakerPrefix(s)}${s.text}`.trim();
  });
  return joinWithBlank(blocks).join('\n');
}

/** Insert a blank line between blocks. */
function joinWithBlank(blocks: string[]): string[] {
  const out: string[] = [];
  blocks.forEach((b, i) => {
    out.push(b);
    if (i < blocks.length - 1) out.push('');
  });
  return out;
}
