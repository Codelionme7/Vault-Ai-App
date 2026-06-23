/**
 * Pure helpers for audio export: channel preference and ffmpeg transcode args.
 * The actual spawning/I/O lives in the service; this stays testable.
 *
 * `webm` is the original captured format (always available, lossless Opus).
 * `wav`/`mp3`/`flac` require ffmpeg (configured via FFMPEG_PATH) since the
 * source is Opus and must be decoded/re-encoded.
 */
export type AudioExportFormat = 'webm' | 'wav' | 'mp3' | 'flac';

export const AUDIO_EXPORT_FORMATS: AudioExportFormat[] = ['webm', 'wav', 'mp3', 'flac'];

/** Formats that need a transcode step (i.e. ffmpeg). */
export function requiresFfmpeg(format: AudioExportFormat): boolean {
  return format !== 'webm';
}

const CHANNEL_PREFERENCE = ['mixed', 'tab', 'mic'];

/** Pick the best channel to export when the caller doesn't specify one. */
export function pickPreferredChannel(channels: string[], requested?: string): string | undefined {
  if (requested && channels.includes(requested)) return requested;
  return CHANNEL_PREFERENCE.find((c) => channels.includes(c)) ?? channels[0];
}

/** ffmpeg output arguments for a target format (input is the concat demuxer). */
export function ffmpegOutputArgs(format: AudioExportFormat): string[] {
  switch (format) {
    case 'wav':
      return ['-vn', '-acodec', 'pcm_s16le', '-ar', '48000', '-ac', '2', '-f', 'wav'];
    case 'mp3':
      return ['-vn', '-acodec', 'libmp3lame', '-b:a', '192k', '-f', 'mp3'];
    case 'flac':
      return ['-vn', '-acodec', 'flac', '-ar', '48000', '-f', 'flac'];
    case 'webm':
      // Stream copy — no re-encode needed.
      return ['-acodec', 'copy', '-f', 'webm'];
    default:
      throw new Error(`Unsupported audio export format: ${format as string}`);
  }
}

export function contentTypeFor(format: AudioExportFormat): string {
  return {
    webm: 'audio/webm',
    wav: 'audio/wav',
    mp3: 'audio/mpeg',
    flac: 'audio/flac',
  }[format];
}

export function extensionFor(format: AudioExportFormat): string {
  return format;
}
