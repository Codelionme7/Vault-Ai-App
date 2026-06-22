import type { AudioChunk, RecordingChannel } from '@echovault/shared';
import { CHANNELS } from '@echovault/shared';
import { ChannelRecorder } from './channel-recorder.js';
import { Emitter } from './emitter.js';
import { RecorderStateError } from './errors.js';
import { AudioMixer } from './mixer.js';
import { levelFromAnalyserBytes } from './level-meter.js';
import type { RecoveryStore, RecoveryManifest } from './recovery-store.js';
import { createRecoveryStore } from './recovery-store.js';
import type { RecorderConfig, RecorderEvents, RecorderState } from './types.js';

/** Preferred capture container/codec, best first. */
const MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/mp4',
];

export function pickMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return MIME_CANDIDATES[0];
  for (const type of MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return '';
}

/**
 * AudioRecorder — the public entry point of the engine.
 *
 * Responsibilities:
 *  - Coordinate per-channel recorders (tab / mic) and the mixed-down channel.
 *  - Persist every finalized chunk to the recovery store BEFORE upload.
 *  - Drive a single rotation timer so all channels stay chunk-aligned.
 *  - Emit level, progress, and lifecycle events for the dashboard.
 *  - Track elapsed time correctly across pause/resume.
 *
 * It never throws during capture; failures surface as `error` events while
 * already-captured audio stays safe in the recovery store.
 */
export class AudioRecorder {
  readonly events = new Emitter<RecorderEvents>();
  private state: RecorderState = 'idle';

  private readonly store: RecoveryStore;
  private readonly mimeType: string;
  private channels: ChannelRecorder[] = [];
  private mixer?: AudioMixer;

  private rotationTimer?: ReturnType<typeof setInterval>;
  private levelTimer?: ReturnType<typeof setInterval>;

  private startTimestamp = 0;
  private pausedAccumMs = 0;
  private pausedAt = 0;

  private chunkCount = 0;
  private sizeBytes = 0;

  /** Per-channel analyser taps for metering (label -> getter of bytes). */
  private taps: Array<{ channel: RecordingChannel; analyser: AnalyserNode }> = [];

  constructor(
    private readonly config: RecorderConfig,
    store?: RecoveryStore,
  ) {
    this.store = store ?? createRecoveryStore();
    this.mimeType = pickMimeType();
  }

  getState(): RecorderState {
    return this.state;
  }

  /** Elapsed recording time excluding paused spans. */
  getOffsetMs(): number {
    if (this.startTimestamp === 0) return 0;
    const base = (typeof performance !== 'undefined' ? performance.now() : Date.now()) -
      this.startTimestamp -
      this.pausedAccumMs;
    return Math.max(0, base);
  }

  private setState(state: RecorderState): void {
    this.state = state;
    this.events.emit('state', { state });
  }

  async start(): Promise<void> {
    if (this.state !== 'idle') {
      throw new RecorderStateError(`cannot start from state "${this.state}"`);
    }
    this.setState('starting');

    try {
      const { tabStream, micStream, channels } = this.config;

      // Write the recovery manifest first so even an immediate crash leaves a
      // recoverable session header on disk.
      const manifest: RecoveryManifest = {
        sessionId: this.config.sessionId,
        title: this.config.title,
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        channels,
        mimeType: this.mimeType,
        chunkDurationMs: this.config.chunkDurationMs,
      };
      await this.store.putManifest(manifest);

      this.startTimestamp = typeof performance !== 'undefined' ? performance.now() : Date.now();

      // Build the mixed channel when both inputs exist and "mixed" is requested.
      const wantMixed = channels.includes(CHANNELS.mixed);
      if (wantMixed && (tabStream || micStream)) {
        this.mixer = new AudioMixer();
        if (tabStream) {
          const a = this.mixer.addInput('tab', tabStream);
          this.taps.push({ channel: CHANNELS.tab, analyser: a });
        }
        if (micStream) {
          const a = this.mixer.addInput('mic', micStream);
          this.taps.push({ channel: CHANNELS.mic, analyser: a });
        }
      }

      // Spin up a ChannelRecorder per requested channel.
      if (channels.includes(CHANNELS.tab) && tabStream) {
        this.channels.push(this.makeChannel(CHANNELS.tab, tabStream));
      }
      if (channels.includes(CHANNELS.mic) && micStream) {
        this.channels.push(this.makeChannel(CHANNELS.mic, micStream));
      }
      if (wantMixed && this.mixer) {
        this.channels.push(this.makeChannel(CHANNELS.mixed, this.mixer.mixedStream));
      }

      if (this.channels.length === 0) {
        throw new RecorderStateError('no capture channels available (no streams provided)');
      }

      this.channels.forEach((c) => c.start());
      this.startTimers();
      this.setState('recording');
      this.events.emit('started', { sessionId: this.config.sessionId });
    } catch (err) {
      this.setState('error');
      this.events.emit('error', { error: err as Error });
      throw err;
    }
  }

  private makeChannel(channel: RecordingChannel, stream: MediaStream): ChannelRecorder {
    return new ChannelRecorder({
      sessionId: this.config.sessionId,
      channel,
      stream,
      mimeType: this.mimeType,
      chunkDurationMs: this.config.chunkDurationMs,
      getOffsetMs: () => this.getOffsetMs(),
      onChunk: (meta, blob) => void this.persistChunk(meta, blob),
    });
  }

  /** Persist a finalized chunk durably, then notify the app to upload it. */
  private async persistChunk(meta: AudioChunk, blob: Blob): Promise<void> {
    try {
      const stored = { ...meta, status: 'stored' as const };
      await this.store.putChunk({ meta: stored, data: blob });
      await this.store.putManifest({
        ...(await this.store.getManifest(this.config.sessionId))!,
        updatedAt: new Date().toISOString(),
      });

      this.chunkCount += 1;
      this.sizeBytes += meta.byteLength;
      this.events.emit('chunk', { chunk: stored });
      this.events.emit('progress', {
        durationMs: this.getOffsetMs(),
        sizeBytes: this.sizeBytes,
        chunkCount: this.chunkCount,
      });
      this.config.onChunkReady?.(stored, blob);
    } catch (err) {
      // Persistence failure is the one failure we surface loudly — it threatens
      // the source of truth — but we still keep recording.
      this.events.emit('error', { error: err as Error });
    }
  }

  private startTimers(): void {
    this.rotationTimer = setInterval(() => {
      this.channels.forEach((c) => {
        // Rotate when the engine clock says the chunk is full.
        c.rotate();
      });
    }, this.config.chunkDurationMs);

    const levelMs = this.config.levelIntervalMs ?? 100;
    this.levelTimer = setInterval(() => this.emitLevels(), levelMs);
  }

  private emitLevels(): void {
    if (this.taps.length === 0 || this.state !== 'recording') return;
    const levels: RecorderEvents['level']['levels'] = {};
    for (const { channel, analyser } of this.taps) {
      const bytes = new Uint8Array(analyser.fftSize);
      analyser.getByteTimeDomainData(bytes);
      levels[channel] = levelFromAnalyserBytes(bytes);
    }
    this.events.emit('level', { levels });
  }

  pause(): void {
    if (this.state !== 'recording') return;
    this.channels.forEach((c) => c.pause());
    this.pausedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    this.setState('paused');
  }

  resume(): void {
    if (this.state !== 'paused') return;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    this.pausedAccumMs += now - this.pausedAt;
    this.channels.forEach((c) => c.resume());
    this.setState('recording');
  }

  async stop(): Promise<void> {
    if (this.state !== 'recording' && this.state !== 'paused') return;
    this.setState('stopping');
    this.clearTimers();

    // Final rotation/stop for each channel flushes the last chunk.
    this.channels.forEach((c) => c.stop());
    // Give the async onstop handlers a tick to persist final chunks.
    await new Promise((r) => setTimeout(r, 50));

    if (this.mixer) await this.mixer.close();
    await this.store.markClosed(this.config.sessionId);

    const durationMs = this.getOffsetMs();
    this.setState('stopped');
    this.events.emit('stopped', {
      sessionId: this.config.sessionId,
      durationMs,
      chunkCount: this.chunkCount,
    });
  }

  private clearTimers(): void {
    if (this.rotationTimer) clearInterval(this.rotationTimer);
    if (this.levelTimer) clearInterval(this.levelTimer);
    this.rotationTimer = undefined;
    this.levelTimer = undefined;
  }

  /** Release everything without finalizing — used on hard teardown. */
  dispose(): void {
    this.clearTimers();
    this.channels.forEach((c) => c.stop());
    this.events.clear();
  }
}
