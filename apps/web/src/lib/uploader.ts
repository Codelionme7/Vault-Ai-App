import type { AudioChunk } from '@echovault/shared';
import type { RecoveryStore } from '@echovault/audio-engine';
import { api } from './api';

/** SHA-256 hex of a Blob's bytes, via Web Crypto. */
async function sha256Hex(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

interface UploadTask {
  chunk: AudioChunk;
  blob: Blob;
  attempts: number;
}

export interface UploaderEvents {
  onUploaded?: (chunk: AudioChunk) => void;
  onProgress?: (pending: number) => void;
  onError?: (chunk: AudioChunk, error: Error) => void;
}

const MAX_ATTEMPTS = 8;
const BASE_DELAY_MS = 1000;

/**
 * Resilient chunk uploader. Chunks are already durable locally (recovery store)
 * before they reach here, so this queue can fail and retry indefinitely without
 * risking data: an offline laptop simply drains the queue when it reconnects.
 *
 * Flow per chunk: request target -> PUT bytes -> commit metadata (with checksum)
 * -> drop the local copy to reclaim space.
 */
export class UploadQueue {
  private queue: UploadTask[] = [];
  private running = false;

  constructor(
    private readonly recordingId: string,
    private readonly events: UploaderEvents = {},
    private readonly recoveryStore?: RecoveryStore,
  ) {}

  get pending(): number {
    return this.queue.length;
  }

  enqueue(chunk: AudioChunk, blob: Blob): void {
    this.queue.push({ chunk, blob, attempts: 0 });
    this.events.onProgress?.(this.queue.length);
    void this.drain();
  }

  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    while (this.queue.length > 0) {
      const task = this.queue[0];
      try {
        await this.upload(task);
        this.queue.shift();
        this.events.onProgress?.(this.queue.length);
        this.events.onUploaded?.(task.chunk);
        if (this.recoveryStore) {
          // Cloud now holds it; reclaim local space. (Kept on any failure.)
          await this.recoveryStore.deleteChunk(task.chunk.id).catch(() => undefined);
        }
      } catch (err) {
        task.attempts += 1;
        if (task.attempts >= MAX_ATTEMPTS) {
          this.queue.shift();
          this.events.onError?.(task.chunk, err as Error);
        } else {
          // Exponential backoff, capped, before retrying the same chunk.
          const delay = Math.min(BASE_DELAY_MS * 2 ** (task.attempts - 1), 30_000);
          await sleep(delay);
        }
      }
    }
    this.running = false;
  }

  private async upload(task: UploadTask): Promise<void> {
    const { chunk, blob } = task;
    const ticket = await api.requestUploadTarget({
      recordingId: this.recordingId,
      channel: chunk.channel,
      sequence: chunk.sequence,
      contentType: chunk.mimeType,
    });
    await api.uploadBytes(ticket, blob);
    const checksum = await sha256Hex(blob);
    await api.commitChunk({
      sessionId: this.recordingId,
      channel: chunk.channel,
      sequence: chunk.sequence,
      startOffsetMs: chunk.startOffsetMs,
      durationMs: chunk.durationMs,
      byteLength: chunk.byteLength,
      mimeType: chunk.mimeType,
      checksum,
      storageKey: ticket.storageKey,
    });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
