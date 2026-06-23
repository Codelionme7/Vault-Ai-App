import type {
  TranscriptionDriver,
  TranscriptionOptions,
  TranscriptionResult,
} from '../transcription.types';

/**
 * Local faster-whisper driver. Talks to a self-hosted HTTP sidecar (e.g. a
 * small Python service wrapping faster-whisper) so transcription can run fully
 * offline / on-prem. Contract: POST multipart {file} -> { text, language,
 * segments: [{start,end,text,speaker?}] }.
 */
export class LocalWhisperDriver implements TranscriptionDriver {
  readonly name = 'local-whisper';

  constructor(private readonly serviceUrl: string) {}

  async transcribe(audio: Buffer, opts: TranscriptionOptions): Promise<TranscriptionResult> {
    const form = new FormData();
    form.append('file', new Blob([audio], { type: opts.mimeType }), 'audio.webm');
    if (opts.language) form.append('language', opts.language);
    if (opts.diarize) form.append('diarize', 'true');

    const res = await fetch(`${this.serviceUrl.replace(/\/$/, '')}/transcribe`, {
      method: 'POST',
      body: form,
    });
    if (!res.ok) {
      throw new Error(`Local whisper failed: ${res.status} ${await res.text()}`);
    }
    const json = (await res.json()) as {
      text: string;
      language?: string;
      segments?: Array<{ start: number; end: number; text: string; speaker?: string }>;
    };
    return {
      text: json.text,
      language: json.language,
      model: 'faster-whisper',
      segments: (json.segments ?? []).map((s) => ({
        startMs: Math.round(s.start * 1000),
        endMs: Math.round(s.end * 1000),
        text: s.text.trim(),
        speaker: s.speaker,
      })),
    };
  }
}
