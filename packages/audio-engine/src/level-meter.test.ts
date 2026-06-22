import { describe, expect, it } from 'vitest';
import {
  amplitudeToDb,
  computeLevel,
  dbToMeterPosition,
  levelFromAnalyserBytes,
} from './level-meter.js';

describe('computeLevel', () => {
  it('reports silence for an empty buffer', () => {
    const level = computeLevel(new Float32Array(0));
    expect(level.rms).toBe(0);
    expect(level.peak).toBe(0);
    expect(level.rmsDb).toBe(-Infinity);
    expect(level.clipping).toBe(false);
  });

  it('reports silence for all-zero samples', () => {
    const level = computeLevel(new Float32Array(1024));
    expect(level.rms).toBe(0);
    expect(level.peak).toBe(0);
  });

  it('computes RMS of a full-scale square wave as ~1', () => {
    const samples = new Float32Array(1000).fill(1);
    const level = computeLevel(samples);
    expect(level.rms).toBeCloseTo(1, 5);
    expect(level.peak).toBe(1);
    expect(level.rmsDb).toBeCloseTo(0, 5);
  });

  it('computes RMS of a sine wave as ~0.707 (-3dB)', () => {
    const n = 48_000;
    const samples = new Float32Array(n);
    for (let i = 0; i < n; i++) samples[i] = Math.sin((2 * Math.PI * 440 * i) / n);
    const level = computeLevel(samples);
    expect(level.rms).toBeCloseTo(Math.SQRT1_2, 2);
    expect(level.rmsDb).toBeCloseTo(-3.01, 1);
    expect(level.peak).toBeCloseTo(1, 2);
  });

  it('flags clipping at full scale', () => {
    const samples = new Float32Array([0.1, -0.2, 1.0, 0.3]);
    expect(computeLevel(samples).clipping).toBe(true);
  });

  it('does not flag clipping below full scale', () => {
    const samples = new Float32Array([0.5, -0.5, 0.9, -0.9]);
    expect(computeLevel(samples).clipping).toBe(false);
  });
});

describe('amplitudeToDb', () => {
  it('maps 1 to 0 dBFS', () => {
    expect(amplitudeToDb(1)).toBeCloseTo(0, 6);
  });
  it('maps 0.5 to ~-6 dBFS', () => {
    expect(amplitudeToDb(0.5)).toBeCloseTo(-6.02, 1);
  });
  it('maps 0 to -Infinity', () => {
    expect(amplitudeToDb(0)).toBe(-Infinity);
  });
});

describe('dbToMeterPosition', () => {
  it('returns 1 at 0 dB and above', () => {
    expect(dbToMeterPosition(0)).toBe(1);
    expect(dbToMeterPosition(3)).toBe(1);
  });
  it('returns 0 at or below the floor', () => {
    expect(dbToMeterPosition(-60)).toBe(0);
    expect(dbToMeterPosition(-90)).toBe(0);
    expect(dbToMeterPosition(-Infinity)).toBe(0);
  });
  it('is monotonic between floor and ceiling', () => {
    expect(dbToMeterPosition(-30)).toBeCloseTo(0.5, 5);
    expect(dbToMeterPosition(-15)).toBeGreaterThan(dbToMeterPosition(-45));
  });
});

describe('levelFromAnalyserBytes', () => {
  it('treats centered (128) bytes as silence', () => {
    const bytes = new Uint8Array(2048).fill(128);
    const level = levelFromAnalyserBytes(bytes);
    expect(level.rms).toBeCloseTo(0, 5);
  });

  it('detects amplitude from offset bytes', () => {
    const bytes = new Uint8Array(2048).fill(255); // max positive deflection
    const level = levelFromAnalyserBytes(bytes);
    expect(level.peak).toBeGreaterThan(0.9);
  });
});
