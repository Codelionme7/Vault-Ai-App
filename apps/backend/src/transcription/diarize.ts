import type { TranscriptSegment } from '@echovault/shared';

/**
 * Heuristic speaker diarization fallback.
 *
 * Real diarization (speaker embeddings) is done by a diarization-capable
 * transcription sidecar and arrives as `speaker` labels on each segment. When a
 * driver does NOT return speakers (e.g. OpenAI Whisper) but the user asked to
 * diarize, this assigns provisional "Speaker A/B/…" labels by detecting turn
 * changes from the silence gap between consecutive segments.
 *
 * It is intentionally simple and honest — a turn-taking approximation, not
 * acoustic diarization. Pure and unit-tested.
 */
export interface DiarizeOptions {
  /** Gap (ms) between segments that signals a likely speaker change. */
  gapMs?: number;
  /** Maximum number of distinct speakers to cycle through. */
  maxSpeakers?: number;
}

const DEFAULTS: Required<DiarizeOptions> = { gapMs: 1500, maxSpeakers: 4 };

function speakerLabel(index: number): string {
  // 0 -> "Speaker A", 1 -> "Speaker B", ...
  return `Speaker ${String.fromCharCode(65 + index)}`;
}

/** True if any segment already carries a speaker label. */
export function hasSpeakers(segments: TranscriptSegment[]): boolean {
  return segments.some((s) => Boolean(s.speaker));
}

/** Distinct speaker labels present, in first-seen order. */
export function listSpeakers(segments: TranscriptSegment[]): string[] {
  const seen: string[] = [];
  for (const s of segments) {
    if (s.speaker && !seen.includes(s.speaker)) seen.push(s.speaker);
  }
  return seen;
}

/**
 * Assign speaker labels by silence gaps. Returns a new array; never mutates the
 * input. Segments that already have a speaker are left untouched.
 */
export function assignSpeakersByGaps(
  segments: TranscriptSegment[],
  options: DiarizeOptions = {},
): TranscriptSegment[] {
  const { gapMs, maxSpeakers } = { ...DEFAULTS, ...options };
  if (segments.length === 0) return [];

  let speakerIndex = 0;
  let prevEnd: number | undefined;

  return segments.map((seg) => {
    if (seg.speaker) {
      prevEnd = seg.endMs;
      return seg;
    }
    if (prevEnd !== undefined && seg.startMs - prevEnd >= gapMs) {
      speakerIndex = (speakerIndex + 1) % maxSpeakers;
    }
    prevEnd = seg.endMs;
    return { ...seg, speaker: speakerLabel(speakerIndex) };
  });
}
