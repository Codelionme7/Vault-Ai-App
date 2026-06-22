import type { RecordingChannel } from './constants';

/**
 * Lifecycle of a single audio chunk. A chunk is the atomic unit of durability:
 * once `stored` locally it cannot be lost; once `uploaded` it is safe in the
 * cloud. Transcription only ever reads `uploaded` chunks.
 */
export type ChunkStatus =
  | 'recording' // actively being written by the encoder
  | 'captured' // finalized in memory, not yet persisted
  | 'stored' // persisted to local durable storage (IndexedDB / disk)
  | 'uploading'
  | 'uploaded'
  | 'failed';

export interface AudioChunk {
  id: string;
  sessionId: string;
  channel: RecordingChannel;
  /** Monotonic index within (session, channel), starting at 0. */
  sequence: number;
  status: ChunkStatus;
  /** Wall-clock offset from recording start, in ms. */
  startOffsetMs: number;
  durationMs: number;
  byteLength: number;
  mimeType: string;
  /** SHA-256 of the chunk bytes, for integrity verification on reassembly. */
  checksum?: string;
  /** Storage key once persisted server-side. */
  storageKey?: string;
  createdAt: string;
  uploadedAt?: string;
}

/** Payload the client sends to register/commit a chunk after upload. */
export interface CommitChunkInput {
  sessionId: string;
  channel: RecordingChannel;
  sequence: number;
  startOffsetMs: number;
  durationMs: number;
  byteLength: number;
  mimeType: string;
  checksum?: string;
  storageKey: string;
}
