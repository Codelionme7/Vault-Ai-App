import type {
  TranscriptionDriver,
  TranscriptionOptions,
  TranscriptionResult,
} from '../transcription.types';

/**
 * OpenAI Whisper driver. Uses the global fetch/FormData/Blob available in
 * Node 20+, so no SDK dependency is required. Returns verbose JSON so we keep
 * segment timestamps.
 */
export class OpenAiTranscriptionDriver implements TranscriptionDriver {
  readonly name = 'openai';
  private readonly model = 'whisper-1';

  constructor(private readonly apiKey: string) {}

  async transcribe(audio: Buffer, opts: TranscriptionOptions): Promise<TranscriptionResult> {
    const form = new FormData();
    const ext = opts.mimeType.includes('mp4') ? 'mp4' : 'webm';
    form.append('file', new Blob([audio], { type: opts.mimeType }), `audio.${ext}`);
    form.append('model', this.model);
    form.append('response_format', 'verbose_json');
    if (opts.language) form.append('language', opts.language);

    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: form,
    });
    if (!res.ok) {
      throw new Error(`OpenAI transcription failed: ${res.status} ${await res.text()}`);
    }
    const json = (await res.json()) as {
      text: string;
      language?: string;
      segments?: Array<{ start: number; end: number; text: string }>;
    };
    return {
      text: json.text,
      language: json.language,
      model: this.model,
      segments: (json.segments ?? []).map((s) => ({
        startMs: Math.round(s.start * 1000),
        endMs: Math.round(s.end * 1000),
        text: s.text.trim(),
      })),
    };
  }
}
