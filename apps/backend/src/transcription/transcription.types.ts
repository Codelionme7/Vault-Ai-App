import type { TranscriptSegment } from '@echovault/shared';

export interface TranscriptionResult {
  text: string;
  language?: string;
  segments: TranscriptSegment[];
  model?: string;
}

export interface TranscriptionOptions {
  mimeType: string;
  language?: string;
  diarize?: boolean;
}

/** Pluggable transcription backend (OpenAI Whisper / local faster-whisper). */
export interface TranscriptionDriver {
  readonly name: string;
  transcribe(audio: Buffer, opts: TranscriptionOptions): Promise<TranscriptionResult>;
}

export const TRANSCRIPTION_QUEUE = 'transcription';

export interface TranscriptionJob {
  recordingId: string;
  language?: string;
  diarize?: boolean;
  summarize?: boolean;
}
