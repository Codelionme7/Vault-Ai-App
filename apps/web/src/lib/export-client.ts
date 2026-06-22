import { encodeWav } from '@echovault/audio-engine';
import { api } from './api';
import { concatFloat32 } from './pcm';

/** Preference order matching the backend. */
const CHANNEL_PREFERENCE = ['mixed', 'tab', 'mic'];

function pickChannel(channels: string[]): string | undefined {
  return CHANNEL_PREFERENCE.find((c) => channels.includes(c)) ?? channels[0];
}

/** Trigger a browser download for a Blob. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export type ServerExportKind = 'zip' | 'audio' | 'transcript' | 'summary';

/** Download a server-generated artifact (ZIP, audio, transcript, summary). */
export async function downloadServerExport(
  recordingId: string,
  kind: ServerExportKind,
  query: Record<string, string> = {},
): Promise<void> {
  const qs = new URLSearchParams(query).toString();
  const path = `/recordings/${recordingId}/export/${kind}${qs ? `?${qs}` : ''}`;
  const { blob, filename } = await api.getFile(path);
  saveBlob(blob, filename);
}

/**
 * Produce a 48kHz/16-bit WAV entirely in the browser: fetch the recording's
 * chunks, decode each (WebM/Opus) via the Web Audio API, concatenate per
 * channel, and encode with the shared engine's WAV encoder. No server transcode
 * or ffmpeg required — the lossless WAV is built client-side.
 */
export async function exportWavClient(recordingId: string): Promise<void> {
  const chunks = await api.listChunks(recordingId);
  if (chunks.length === 0) throw new Error('No audio to export');

  const channels = [...new Set(chunks.map((c) => c.channel))];
  const channel = pickChannel(channels);
  const selected = chunks
    .filter((c) => c.channel === channel)
    .sort((a, b) => a.sequence - b.sequence);

  const AudioCtx: typeof AudioContext =
    window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtx();
  try {
    const decoded: AudioBuffer[] = [];
    for (const c of selected) {
      const blob = await api.getChunkBlob(c.id);
      decoded.push(await ctx.decodeAudioData(await blob.arrayBuffer()));
    }
    if (decoded.length === 0) throw new Error('Nothing decoded');

    const sampleRate = decoded[0].sampleRate;
    const numChannels = Math.max(...decoded.map((b) => b.numberOfChannels));
    const channelData: Float32Array[] = [];
    for (let ch = 0; ch < numChannels; ch++) {
      const parts = decoded.map((buf) =>
        ch < buf.numberOfChannels ? buf.getChannelData(ch) : new Float32Array(buf.length),
      );
      channelData.push(concatFloat32(parts));
    }

    const wav = encodeWav({ sampleRate, channelData });
    saveBlob(new Blob([wav], { type: 'audio/wav' }), `recording-${channel}.wav`);
  } finally {
    await ctx.close();
  }
}
