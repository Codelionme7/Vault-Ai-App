import type { RecordingChannel } from '@echovault/shared';
import { planReassembly, type ReassemblyPlan } from './reassemble.js';
import type { RecoveryManifest, RecoveryStore, StoredChunk } from './recovery-store.js';
import { createRecoveryStore } from './recovery-store.js';

export interface RecoverableSession {
  manifest: RecoveryManifest;
  plan: ReassemblyPlan;
  /** Convenience: any channel missing chunks. */
  hasGaps: boolean;
}

export interface RecoveredChannel {
  channel: RecordingChannel;
  blob: Blob;
  durationMs: number;
  byteLength: number;
  /** False when chunks were missing — partial salvage. */
  complete: boolean;
}

/**
 * RecoveryManager turns the durable recovery store into actionable recovery on
 * next launch: it lists sessions that never closed cleanly, builds a reassembly
 * plan, and concatenates surviving chunks back into playable audio per channel.
 *
 * It is deliberately tolerant: a session with gaps still yields whatever audio
 * survived rather than nothing.
 */
export class RecoveryManager {
  constructor(private readonly store: RecoveryStore = createRecoveryStore()) {}

  /** Sessions that were recording when the app died — the recovery candidates. */
  async findRecoverable(): Promise<RecoverableSession[]> {
    const open = await this.store.listOpenSessions();
    const result: RecoverableSession[] = [];
    for (const manifest of open) {
      const stored = await this.store.getChunks(manifest.sessionId);
      const plan = planReassembly(
        manifest.sessionId,
        stored.map((s) => s.meta),
      );
      // Only surface sessions that actually captured something.
      if (plan.totalBytes > 0) {
        result.push({ manifest, plan, hasGaps: !plan.clean });
      }
    }
    return result;
  }

  /**
   * Reassemble a session's surviving chunks into one playable blob per channel.
   */
  async reassemble(sessionId: string): Promise<RecoveredChannel[]> {
    const stored = await this.store.getChunks(sessionId);
    const byChannel = new Map<RecordingChannel, StoredChunk[]>();
    for (const s of stored) {
      const list = byChannel.get(s.meta.channel) ?? [];
      list.push(s);
      byChannel.set(s.meta.channel, list);
    }

    const recovered: RecoveredChannel[] = [];
    for (const [channel, chunks] of byChannel) {
      chunks.sort((a, b) => a.meta.sequence - b.meta.sequence);
      const parts = chunks.map((c) => c.data);
      const mimeType = chunks[0]?.meta.mimeType ?? 'audio/webm';
      const blob = new Blob(parts as BlobPart[], { type: mimeType });
      const durationMs = chunks.reduce((sum, c) => sum + c.meta.durationMs, 0);
      const byteLength = chunks.reduce((sum, c) => sum + c.meta.byteLength, 0);
      const maxSeq = chunks[chunks.length - 1]?.meta.sequence ?? -1;
      const complete = chunks.length === maxSeq + 1 && chunks[0]?.meta.sequence === 0;
      recovered.push({ channel, blob, durationMs, byteLength, complete });
    }
    return recovered;
  }

  /** Mark a session recovered/handled and reclaim its local storage. */
  async discard(sessionId: string): Promise<void> {
    await this.store.deleteSession(sessionId);
  }

  /** Mark closed without deleting (kept for re-upload later). */
  async markHandled(sessionId: string): Promise<void> {
    await this.store.markClosed(sessionId);
  }
}
