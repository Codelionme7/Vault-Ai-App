import type { AudioChunk, RecordingChannel } from '@echovault/shared';

/**
 * Pure crash-recovery analysis. Given the chunk metadata persisted before a
 * crash, work out — per channel — whether we can cleanly reassemble the
 * recording, in what order, and whether anything is missing.
 *
 * This never throws on bad data; recovery must degrade gracefully and salvage
 * whatever audio survived rather than refuse everything.
 */

export interface ChannelReassembly {
  channel: RecordingChannel;
  /** Chunks in playback order (sorted by sequence). */
  ordered: AudioChunk[];
  /** Sequence numbers that are absent from an otherwise contiguous run. */
  missingSequences: number[];
  /** Duplicate sequence numbers detected (kept once in `ordered`). */
  duplicateSequences: number[];
  totalDurationMs: number;
  totalBytes: number;
  /** True when sequences are contiguous from 0 with no gaps. */
  contiguous: boolean;
}

export interface ReassemblyPlan {
  sessionId: string;
  channels: ChannelReassembly[];
  /** True if every channel is contiguous — a clean recovery. */
  clean: boolean;
  totalDurationMs: number;
  totalBytes: number;
}

function reassembleChannel(channel: RecordingChannel, chunks: AudioChunk[]): ChannelReassembly {
  const seen = new Map<number, AudioChunk>();
  const duplicates: number[] = [];

  for (const c of chunks) {
    if (seen.has(c.sequence)) {
      duplicates.push(c.sequence);
      // Prefer the larger/longer chunk when a sequence is duplicated — most
      // likely the fully-flushed one. Defensive against double-persist races.
      const existing = seen.get(c.sequence)!;
      if (c.byteLength >= existing.byteLength) seen.set(c.sequence, c);
    } else {
      seen.set(c.sequence, c);
    }
  }

  const ordered = [...seen.values()].sort((a, b) => a.sequence - b.sequence);

  const missing: number[] = [];
  if (ordered.length > 0) {
    const maxSeq = ordered[ordered.length - 1].sequence;
    for (let i = 0; i <= maxSeq; i++) {
      if (!seen.has(i)) missing.push(i);
    }
  }

  const totalDurationMs = ordered.reduce((sum, c) => sum + c.durationMs, 0);
  const totalBytes = ordered.reduce((sum, c) => sum + c.byteLength, 0);
  const contiguous =
    missing.length === 0 && ordered.length > 0 && ordered[0].sequence === 0;

  return {
    channel,
    ordered,
    missingSequences: missing,
    duplicateSequences: [...new Set(duplicates)],
    totalDurationMs,
    totalBytes,
    contiguous,
  };
}

/**
 * Build a recovery plan for a session from its persisted chunks.
 */
export function planReassembly(sessionId: string, chunks: AudioChunk[]): ReassemblyPlan {
  const byChannel = new Map<RecordingChannel, AudioChunk[]>();
  for (const c of chunks) {
    const list = byChannel.get(c.channel) ?? [];
    list.push(c);
    byChannel.set(c.channel, list);
  }

  const channels = [...byChannel.entries()].map(([channel, list]) =>
    reassembleChannel(channel, list),
  );

  return {
    sessionId,
    channels,
    clean: channels.length > 0 && channels.every((c) => c.contiguous),
    totalDurationMs: channels.reduce((m, c) => Math.max(m, c.totalDurationMs), 0),
    totalBytes: channels.reduce((sum, c) => sum + c.totalBytes, 0),
  };
}
