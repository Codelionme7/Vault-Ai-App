import { describe, expect, it } from 'vitest';
import { encodeWav } from './wav.js';

function readString(view: DataView, offset: number, length: number): string {
  let s = '';
  for (let i = 0; i < length; i++) s += String.fromCharCode(view.getUint8(offset + i));
  return s;
}

describe('encodeWav', () => {
  it('throws when given no channels', () => {
    expect(() => encodeWav({ sampleRate: 48_000, channelData: [] })).toThrow();
  });

  it('writes a valid mono RIFF/WAVE header', () => {
    const frames = 480;
    const data = new Float32Array(frames);
    const buffer = encodeWav({ sampleRate: 48_000, channelData: [data] });
    const view = new DataView(buffer);

    expect(readString(view, 0, 4)).toBe('RIFF');
    expect(readString(view, 8, 4)).toBe('WAVE');
    expect(readString(view, 12, 4)).toBe('fmt ');
    expect(view.getUint16(20, true)).toBe(1); // PCM
    expect(view.getUint16(22, true)).toBe(1); // mono
    expect(view.getUint32(24, true)).toBe(48_000); // sample rate
    expect(view.getUint16(34, true)).toBe(16); // bits per sample
    expect(readString(view, 36, 4)).toBe('data');
    expect(view.getUint32(40, true)).toBe(frames * 2); // mono 16-bit data size
    expect(buffer.byteLength).toBe(44 + frames * 2);
  });

  it('writes correct sizing for stereo', () => {
    const frames = 100;
    const left = new Float32Array(frames).fill(0.5);
    const right = new Float32Array(frames).fill(-0.5);
    const buffer = encodeWav({ sampleRate: 44_100, channelData: [left, right] });
    const view = new DataView(buffer);
    expect(view.getUint16(22, true)).toBe(2); // stereo
    expect(view.getUint16(32, true)).toBe(4); // block align = 2ch * 2 bytes
    expect(view.getUint32(28, true)).toBe(44_100 * 4); // byte rate
    expect(view.getUint32(40, true)).toBe(frames * 4); // stereo data size
  });

  it('quantizes a full-scale sample to int16 max', () => {
    const buffer = encodeWav({ sampleRate: 8000, channelData: [new Float32Array([1])] });
    const view = new DataView(buffer);
    expect(view.getInt16(44, true)).toBe(0x7fff);
  });

  it('clamps out-of-range samples', () => {
    const buffer = encodeWav({ sampleRate: 8000, channelData: [new Float32Array([2, -2])] });
    const view = new DataView(buffer);
    expect(view.getInt16(44, true)).toBe(0x7fff);
    expect(view.getInt16(46, true)).toBe(-0x8000);
  });
});
