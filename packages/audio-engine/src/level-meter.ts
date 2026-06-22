/**
 * Audio level math. Kept pure (operates on sample arrays) so the dashboard
 * meter can be tested deterministically and reused in any runtime.
 */

export interface AudioLevel {
  /** Root-mean-square amplitude, 0..1. */
  rms: number;
  /** Peak absolute amplitude in the window, 0..1. */
  peak: number;
  /** RMS expressed in dBFS (<= 0). -Infinity for digital silence. */
  rmsDb: number;
  /** Peak expressed in dBFS (<= 0). */
  peakDb: number;
  /** True if peak reached full scale (clipping risk). */
  clipping: boolean;
}

const CLIP_THRESHOLD = 0.999;

/** Linear amplitude (0..1) to dBFS. */
export function amplitudeToDb(amp: number): number {
  if (amp <= 0) return -Infinity;
  return 20 * Math.log10(amp);
}

/**
 * Compute level metrics from PCM samples normalized to [-1, 1].
 */
export function computeLevel(samples: Float32Array | number[]): AudioLevel {
  const n = samples.length;
  if (n === 0) {
    return { rms: 0, peak: 0, rmsDb: -Infinity, peakDb: -Infinity, clipping: false };
  }
  let sumSquares = 0;
  let peak = 0;
  for (let i = 0; i < n; i++) {
    const s = samples[i];
    sumSquares += s * s;
    const abs = Math.abs(s);
    if (abs > peak) peak = abs;
  }
  const rms = Math.sqrt(sumSquares / n);
  return {
    rms,
    peak,
    rmsDb: amplitudeToDb(rms),
    peakDb: amplitudeToDb(peak),
    clipping: peak >= CLIP_THRESHOLD,
  };
}

/**
 * Map a dBFS value to a 0..1 meter position over a visible floor (default
 * -60 dB). Useful for rendering a level bar without it pinning at the bottom.
 */
export function dbToMeterPosition(db: number, floorDb = -60): number {
  if (!isFinite(db)) return 0;
  if (db >= 0) return 1;
  if (db <= floorDb) return 0;
  return 1 - db / floorDb;
}

/**
 * Convert raw byte time-domain data from an AnalyserNode (Uint8, centered at
 * 128) into normalized [-1,1] samples, then compute the level.
 */
export function levelFromAnalyserBytes(bytes: Uint8Array): AudioLevel {
  const samples = new Float32Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    samples[i] = (bytes[i] - 128) / 128;
  }
  return computeLevel(samples);
}
