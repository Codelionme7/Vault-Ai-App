/** Audio capture defaults. Quality-first: 48kHz / 16-bit / stereo. */
export const AUDIO_DEFAULTS = {
  sampleRate: 48_000,
  bitDepth: 16,
  channels: 2,
} as const;

/**
 * Chunk length in milliseconds. Recordings are sliced into self-contained
 * chunks so a crash, tab kill, or network outage can never cost more than one
 * chunk. 5 minutes is the default; the engine accepts 5 or 10.
 */
export const CHUNK_DURATION_MS = {
  fiveMinutes: 5 * 60 * 1000,
  tenMinutes: 10 * 60 * 1000,
} as const;

export const DEFAULT_CHUNK_DURATION_MS = CHUNK_DURATION_MS.fiveMinutes;

/** Recording channel identifiers for dual-channel capture. */
export const CHANNELS = {
  /** Tab / system audio. */
  tab: 'tab',
  /** Microphone. */
  mic: 'mic',
  /** Mixed down (tab + mic). */
  mixed: 'mixed',
} as const;

export type RecordingChannel = (typeof CHANNELS)[keyof typeof CHANNELS];

/** Supported container/codecs for capture and export. */
export const AUDIO_FORMATS = ['webm', 'wav', 'flac', 'mp3'] as const;
export type AudioFormat = (typeof AUDIO_FORMATS)[number];

/** Max single-chunk upload size guard (bytes). Defensive, not a hard product limit. */
export const MAX_CHUNK_BYTES = 64 * 1024 * 1024; // 64 MB
