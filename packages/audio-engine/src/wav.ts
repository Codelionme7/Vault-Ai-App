/**
 * Minimal PCM WAV encoder. Used to export recordings as 48kHz/16-bit WAV — the
 * archival, lossless-friendly format. Pure (operates on Float32 channel data),
 * so the RIFF header is unit-testable without an AudioContext.
 */

export interface WavEncodeOptions {
  sampleRate: number;
  /** Interleaved is computed from the channel array length. */
  channelData: Float32Array[];
}

function floatTo16BitPCM(view: DataView, offset: number, input: Float32Array): void {
  for (let i = 0; i < input.length; i++, offset += 2) {
    // Clamp then scale to signed 16-bit range.
    const s = Math.max(-1, Math.min(1, input[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
}

/**
 * Encode PCM channel data to a 16-bit WAV ArrayBuffer.
 */
export function encodeWav({ sampleRate, channelData }: WavEncodeOptions): ArrayBuffer {
  const numChannels = channelData.length;
  if (numChannels === 0) throw new Error('encodeWav: no channel data');
  const numFrames = channelData[0].length;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = numFrames * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // RIFF header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');

  // fmt sub-chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // sub-chunk size
  view.setUint16(20, 1, true); // audio format = PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true); // byte rate
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bytesPerSample * 8, true); // bits per sample

  // data sub-chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // Interleave channels
  let offset = 44;
  if (numChannels === 1) {
    floatTo16BitPCM(view, offset, channelData[0]);
  } else {
    for (let frame = 0; frame < numFrames; frame++) {
      for (let ch = 0; ch < numChannels; ch++) {
        const sample = Math.max(-1, Math.min(1, channelData[ch][frame] ?? 0));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
        offset += 2;
      }
    }
  }

  return buffer;
}
