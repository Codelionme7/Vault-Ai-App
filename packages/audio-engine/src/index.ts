/**
 * @echovault/audio-engine
 *
 * Crash-resilient, framework-agnostic audio capture. The engine treats audio as
 * the source of truth: every chunk is persisted to durable local storage the
 * instant it is captured, before any upload, so nothing is ever lost to a crash,
 * a closed tab, or a dropped network.
 */

// Core orchestration
export { AudioRecorder, pickMimeType } from './recorder.js';
export { ChannelRecorder } from './channel-recorder.js';
export type {
  RecorderConfig,
  RecorderEvents,
  RecorderState,
} from './types.js';

// Pure logic (unit-tested)
export { ChunkBuffer } from './chunk-buffer.js';
export type { FinalizedChunk, ChunkBufferOptions } from './chunk-buffer.js';
export {
  computeLevel,
  amplitudeToDb,
  dbToMeterPosition,
  levelFromAnalyserBytes,
} from './level-meter.js';
export type { AudioLevel } from './level-meter.js';
export { planReassembly } from './reassemble.js';
export type { ReassemblyPlan, ChannelReassembly } from './reassemble.js';
export { encodeWav } from './wav.js';
export type { WavEncodeOptions } from './wav.js';

// Persistence & recovery
export {
  MemoryRecoveryStore,
  IndexedDBRecoveryStore,
  createRecoveryStore,
} from './recovery-store.js';
export type {
  RecoveryStore,
  RecoveryManifest,
  StoredChunk,
} from './recovery-store.js';
export { RecoveryManager } from './recovery-manager.js';
export type { RecoverableSession, RecoveredChannel } from './recovery-manager.js';

// Capture sources
export { captureTabAudio } from './sources/tab-source.js';
export { captureMicrophone, listMicrophones } from './sources/mic-source.js';
export type { MicDevice } from './sources/mic-source.js';
export { AudioMixer } from './mixer.js';

// Errors & utils
export * from './errors.js';
export { Emitter } from './emitter.js';
