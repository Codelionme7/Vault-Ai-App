import type { AudioChunk, RecordingChannel } from '@echovault/shared';
import { ChunkBuffer } from './chunk-buffer.js';

/**
 * Records a single channel's MediaStream into self-contained chunks.
 *
 * Each chunk is produced by a fresh MediaRecorder session: when a chunk
 * boundary is reached we stop the current recorder (which flushes a complete,
 * independently-playable container) and immediately start a new one. This is
 * what makes crash recovery trivial — every stored chunk decodes on its own,
 * with no shared header to reconstruct.
 */
export interface ChannelRecorderOptions {
  sessionId: string;
  channel: RecordingChannel;
  stream: MediaStream;
  mimeType: string;
  chunkDurationMs: number;
  /** Elapsed recording time in ms (excludes paused time). */
  getOffsetMs: () => number;
  /** Invoked when a chunk is finalized, before persistence. */
  onChunk: (chunk: AudioChunk, blob: Blob) => void;
}

export class ChannelRecorder {
  private recorder?: MediaRecorder;
  private readonly buffer: ChunkBuffer<Blob>;
  private active = false;
  private finalizing = false;

  constructor(private readonly opts: ChannelRecorderOptions) {
    this.buffer = new ChunkBuffer<Blob>({
      sessionId: opts.sessionId,
      channel: opts.channel,
      chunkDurationMs: opts.chunkDurationMs,
      mimeType: opts.mimeType,
    });
  }

  get chunkCount(): number {
    return this.buffer.nextSequence;
  }

  start(): void {
    this.active = true;
    this.spawnRecorder();
  }

  private spawnRecorder(): void {
    const recorder = new MediaRecorder(this.opts.stream, { mimeType: this.opts.mimeType });
    recorder.ondataavailable = (e: BlobEvent) => {
      if (e.data && e.data.size > 0) {
        this.buffer.addPart(e.data, e.data.size, this.opts.getOffsetMs());
      }
    };
    recorder.onstop = () => this.handleStop();
    // Flush partial data every second so a long chunk still tracks bytes and a
    // forced stop has minimal unflushed data.
    recorder.start(1000);
    this.recorder = recorder;
  }

  private handleStop(): void {
    const finalized = this.buffer.rotate(this.opts.getOffsetMs());
    if (finalized) {
      const blob = new Blob(finalized.parts, { type: this.opts.mimeType });
      this.opts.onChunk(finalized.meta, blob);
    }
    this.finalizing = false;
    // If we are still recording, immediately begin the next chunk.
    if (this.active) this.spawnRecorder();
  }

  /** Close the current chunk and start a new one (called on the rotation timer). */
  rotate(): void {
    if (!this.active || this.finalizing) return;
    if (this.recorder && this.recorder.state !== 'inactive') {
      this.finalizing = true;
      this.recorder.stop(); // triggers handleStop -> finalize -> respawn
    }
  }

  pause(): void {
    if (this.recorder && this.recorder.state === 'recording') this.recorder.pause();
  }

  resume(): void {
    if (this.recorder && this.recorder.state === 'paused') this.recorder.resume();
  }

  /** Stop for good: finalize the last chunk and release the stream. */
  stop(): void {
    this.active = false;
    if (this.recorder && this.recorder.state !== 'inactive') {
      this.recorder.stop(); // handleStop will finalize but not respawn
    }
    this.opts.stream.getTracks().forEach((t) => t.stop());
  }
}
