import type { AudioChunk } from '@echovault/shared';
import type { RecordingChannel } from '@echovault/shared';

/**
 * ChunkBuffer owns the chunk-rotation state machine for a single channel.
 *
 * It is deliberately generic over the encoder's output part type (`TPart`) and
 * holds no DOM dependency, so the rotation logic — the thing that guarantees a
 * crash costs at most one chunk — is unit-testable in plain Node.
 *
 * The recorder feeds it encoded parts as they arrive (`addPart`) and asks it to
 * `rotate()` when the chunk duration elapses or recording stops. Each rotation
 * yields a self-contained chunk (its parts concatenated form one playable file,
 * because the recorder starts a fresh encoder per chunk).
 */
export interface FinalizedChunk<TPart> {
  meta: AudioChunk;
  parts: TPart[];
}

export interface ChunkBufferOptions {
  sessionId: string;
  channel: RecordingChannel;
  chunkDurationMs: number;
  mimeType: string;
  /** Override id generation (tests / determinism). */
  idFactory?: () => string;
  /** Override clock used for createdAt timestamps. */
  now?: () => Date;
}

let counter = 0;
function defaultId(): string {
  counter += 1;
  return `chunk_${Date.now().toString(36)}_${counter.toString(36)}`;
}

export class ChunkBuffer<TPart = unknown> {
  private readonly opts: Required<Pick<ChunkBufferOptions, 'idFactory' | 'now'>> &
    ChunkBufferOptions;

  private sequence = 0;
  private parts: TPart[] = [];
  private bytes = 0;
  /**
   * Offset (ms from recording start) at which the current chunk began. The
   * timeline is kept contiguous: chunk N+1 begins exactly where chunk N ended,
   * so summed chunk durations never drift from wall-clock recording time.
   */
  private chunkStartOffsetMs = 0;

  constructor(options: ChunkBufferOptions) {
    this.opts = {
      idFactory: options.idFactory ?? defaultId,
      now: options.now ?? (() => new Date()),
      ...options,
    };
  }

  /** Number of completed chunks so far (i.e. next sequence number). */
  get nextSequence(): number {
    return this.sequence;
  }

  /** Bytes accumulated in the not-yet-rotated chunk. */
  get pendingBytes(): number {
    return this.bytes;
  }

  get hasPending(): boolean {
    return this.parts.length > 0;
  }

  /**
   * Add an encoded part. `offsetMs` is the elapsed time from recording start
   * when this part was produced; `size` is its byte length.
   */
  addPart(part: TPart, size: number, _offsetMs: number): void {
    this.parts.push(part);
    this.bytes += size;
  }

  /**
   * Whether the current chunk has spanned at least `chunkDurationMs`.
   * `nowMs` is elapsed time from recording start.
   */
  shouldRotate(nowMs: number): boolean {
    if (this.parts.length === 0) return false;
    return nowMs - this.chunkStartOffsetMs >= this.opts.chunkDurationMs;
  }

  /**
   * Finalize the current chunk and reset for the next one. Returns null if
   * there is nothing buffered (so a stop with an empty buffer is a no-op).
   *
   * @param endOffsetMs elapsed time from recording start at finalize time.
   */
  rotate(endOffsetMs: number): FinalizedChunk<TPart> | null {
    if (this.parts.length === 0) return null;

    const durationMs = Math.max(0, Math.round(endOffsetMs - this.chunkStartOffsetMs));
    const meta: AudioChunk = {
      id: this.opts.idFactory(),
      sessionId: this.opts.sessionId,
      channel: this.opts.channel,
      sequence: this.sequence,
      status: 'captured',
      startOffsetMs: Math.round(this.chunkStartOffsetMs),
      durationMs,
      byteLength: this.bytes,
      mimeType: this.opts.mimeType,
      createdAt: this.opts.now().toISOString(),
    };

    const finalized: FinalizedChunk<TPart> = { meta, parts: this.parts };

    // Reset for next chunk; anchor the next chunk's start to this end point so
    // the timeline stays contiguous.
    this.sequence += 1;
    this.parts = [];
    this.bytes = 0;
    this.chunkStartOffsetMs = endOffsetMs;

    return finalized;
  }
}
