import type { AudioChunk, RecordingChannel, SessionMetadata } from '@echovault/shared';
import type { AudioLevel } from './level-meter.js';

export type RecorderState =
  | 'idle'
  | 'starting'
  | 'recording'
  | 'paused'
  | 'stopping'
  | 'stopped'
  | 'error';

export interface RecorderConfig {
  /** Client-generated session id (local-first: persists before any server call). */
  sessionId: string;
  title: string;
  /** Which channels to capture. tab => display audio, mic => microphone. */
  channels: RecordingChannel[];
  chunkDurationMs: number;
  metadata: SessionMetadata;
  /** Pre-acquired streams (the app handles the permission UX). */
  tabStream?: MediaStream;
  micStream?: MediaStream;
  /**
   * Called right after a chunk is durably persisted to the recovery store.
   * The app uses this to kick off (resilient) upload. Capture never blocks on it.
   */
  onChunkReady?: (chunk: AudioChunk, data: Blob) => void;
  /** How often to emit level updates (ms). */
  levelIntervalMs?: number;
}

// A `type` (not `interface`) so it carries an implicit index signature and
// satisfies the Emitter's `Record<string, unknown>` constraint.
export type RecorderEvents = {
  started: { sessionId: string };
  state: { state: RecorderState };
  chunk: { chunk: AudioChunk };
  level: { levels: Partial<Record<RecordingChannel, AudioLevel>> };
  progress: { durationMs: number; sizeBytes: number; chunkCount: number };
  error: { error: Error };
  stopped: { sessionId: string; durationMs: number; chunkCount: number };
};
