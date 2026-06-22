import type { RecordingChannel } from './constants.js';
import type { SessionMetadata, SourceType } from './source.js';
import type { TranscriptStatus } from './transcription.js';

/**
 * The recording session — the durable record of "something was captured."
 * It exists from the instant recording starts (status `recording`) and is the
 * anchor everything else (chunks, transcripts, summaries) hangs off of.
 */
export type RecordingStatus =
  | 'recording'
  | 'paused'
  | 'completed'
  | 'interrupted' // ended unexpectedly (crash/close); candidate for recovery
  | 'recovered'; // reassembled from chunks after an interruption

export interface Recording {
  id: string;
  ownerId: string;
  title: string;
  status: RecordingStatus;
  sourceType: SourceType;
  metadata: SessionMetadata;

  /** Which channels were captured this session. */
  channels: RecordingChannel[];

  startedAt: string;
  endedAt?: string;
  /** Authoritative duration in ms, derived from committed chunks. */
  durationMs: number;
  /** Total bytes across all stored chunks. */
  sizeBytes: number;

  tags: string[];
  notes?: string;

  transcriptStatus: TranscriptStatus;

  /** True while any chunk remains un-uploaded. */
  hasPendingUploads: boolean;

  createdAt: string;
  updatedAt: string;
}

export interface CreateRecordingInput {
  title?: string;
  sourceType?: SourceType;
  metadata?: Partial<SessionMetadata>;
  channels?: RecordingChannel[];
  tags?: string[];
  /** Client-generated session id so the recorder can persist locally before the
   *  server round-trip completes (local-first). */
  id?: string;
  startedAt?: string;
}

export interface UpdateRecordingInput {
  title?: string;
  tags?: string[];
  notes?: string;
  status?: RecordingStatus;
}
