import { describe, expect, it, beforeEach } from 'vitest';
import type { AudioChunk } from '@echovault/shared';
import {
  MemoryRecoveryStore,
  type RecoveryManifest,
  type StoredChunk,
} from './recovery-store.js';
import { RecoveryManager } from './recovery-manager.js';

/**
 * These tests simulate the full crash-recovery lifecycle WITHOUT a browser:
 * a recording writes a manifest + chunks, then "crashes" (never marks closed).
 * On next launch the RecoveryManager must find and reassemble it.
 */

function manifest(sessionId: string, overrides: Partial<RecoveryManifest> = {}): RecoveryManifest {
  return {
    sessionId,
    title: 'Crashed meeting',
    startedAt: '2026-06-22T10:00:00.000Z',
    updatedAt: '2026-06-22T10:05:00.000Z',
    channels: ['tab'],
    mimeType: 'audio/webm;codecs=opus',
    chunkDurationMs: 300_000,
    ...overrides,
  };
}

function storedChunk(sessionId: string, seq: number, bytes = 1024): StoredChunk {
  const meta: AudioChunk = {
    id: `c_${seq}`,
    sessionId,
    channel: 'tab',
    sequence: seq,
    status: 'stored',
    startOffsetMs: seq * 300_000,
    durationMs: 300_000,
    byteLength: bytes,
    mimeType: 'audio/webm;codecs=opus',
    createdAt: '2026-06-22T10:00:00.000Z',
  };
  // Use Uint8Array as the data payload (Node-friendly stand-in for a Blob).
  return { meta, data: new Uint8Array(bytes) };
}

describe('MemoryRecoveryStore', () => {
  let store: MemoryRecoveryStore;
  beforeEach(() => {
    store = new MemoryRecoveryStore();
  });

  it('persists and retrieves a manifest', async () => {
    await store.putManifest(manifest('s1'));
    const m = await store.getManifest('s1');
    expect(m?.title).toBe('Crashed meeting');
  });

  it('lists open (un-closed) sessions only', async () => {
    await store.putManifest(manifest('open1'));
    await store.putManifest(manifest('closed1'));
    await store.markClosed('closed1');
    const open = await store.listOpenSessions();
    expect(open.map((m) => m.sessionId)).toEqual(['open1']);
  });

  it('stores chunks and returns them ordered by sequence', async () => {
    await store.putChunk(storedChunk('s1', 2));
    await store.putChunk(storedChunk('s1', 0));
    await store.putChunk(storedChunk('s1', 1));
    const chunks = await store.getChunks('s1');
    expect(chunks.map((c) => c.meta.sequence)).toEqual([0, 1, 2]);
  });

  it('isolates chunks by session', async () => {
    await store.putChunk(storedChunk('s1', 0));
    await store.putChunk(storedChunk('s2', 0));
    expect(await store.getChunks('s1')).toHaveLength(1);
    expect(await store.getChunks('s2')).toHaveLength(1);
  });

  it('deletes a whole session', async () => {
    await store.putManifest(manifest('s1'));
    await store.putChunk(storedChunk('s1', 0));
    await store.deleteSession('s1');
    expect(await store.getManifest('s1')).toBeUndefined();
    expect(await store.getChunks('s1')).toHaveLength(0);
  });
});

describe('RecoveryManager crash recovery', () => {
  let store: MemoryRecoveryStore;
  let manager: RecoveryManager;
  beforeEach(() => {
    store = new MemoryRecoveryStore();
    manager = new RecoveryManager(store);
  });

  it('finds an interrupted session that was never closed', async () => {
    // Simulate a recording that crashed mid-session.
    await store.putManifest(manifest('crashed'));
    await store.putChunk(storedChunk('crashed', 0));
    await store.putChunk(storedChunk('crashed', 1));

    const recoverable = await manager.findRecoverable();
    expect(recoverable).toHaveLength(1);
    expect(recoverable[0].manifest.sessionId).toBe('crashed');
    expect(recoverable[0].hasGaps).toBe(false);
    expect(recoverable[0].plan.totalBytes).toBe(2048);
  });

  it('does not surface cleanly-closed sessions', async () => {
    await store.putManifest(manifest('clean'));
    await store.putChunk(storedChunk('clean', 0));
    await store.markClosed('clean');
    expect(await manager.findRecoverable()).toHaveLength(0);
  });

  it('does not surface an open session that captured nothing', async () => {
    await store.putManifest(manifest('empty'));
    expect(await manager.findRecoverable()).toHaveLength(0);
  });

  it('flags gaps for a session that lost a chunk', async () => {
    await store.putManifest(manifest('gappy'));
    await store.putChunk(storedChunk('gappy', 0));
    await store.putChunk(storedChunk('gappy', 2)); // chunk 1 lost
    const recoverable = await manager.findRecoverable();
    expect(recoverable[0].hasGaps).toBe(true);
    expect(recoverable[0].plan.channels[0].missingSequences).toEqual([1]);
  });

  it('reassembles surviving chunks into one blob per channel', async () => {
    await store.putManifest(manifest('multi', { channels: ['tab', 'mic'] }));
    await store.putChunk(storedChunk('multi', 0, 1000));
    await store.putChunk(storedChunk('multi', 1, 1000));
    // add a mic chunk
    const mic = storedChunk('multi', 0, 500);
    mic.meta.channel = 'mic';
    mic.meta.id = 'mic_0';
    await store.putChunk(mic);

    const recovered = await manager.reassemble('multi');
    const tab = recovered.find((r) => r.channel === 'tab')!;
    const micCh = recovered.find((r) => r.channel === 'mic')!;
    expect(tab.byteLength).toBe(2000);
    expect(tab.complete).toBe(true);
    expect(micCh.byteLength).toBe(500);
    expect(tab.blob.size).toBe(2000);
  });

  it('still salvages a partial recording with gaps (complete=false)', async () => {
    await store.putManifest(manifest('partial'));
    await store.putChunk(storedChunk('partial', 0, 700));
    await store.putChunk(storedChunk('partial', 2, 700)); // gap at 1
    const recovered = await manager.reassemble('partial');
    expect(recovered[0].complete).toBe(false);
    expect(recovered[0].byteLength).toBe(1400); // surviving audio preserved
  });

  it('discards a session and reclaims storage after recovery', async () => {
    await store.putManifest(manifest('done'));
    await store.putChunk(storedChunk('done', 0));
    await manager.discard('done');
    expect(await manager.findRecoverable()).toHaveLength(0);
    expect(await store.getChunks('done')).toHaveLength(0);
  });
});
