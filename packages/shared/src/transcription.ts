/** Transcription is a SECONDARY, on-demand feature. Default is `not_requested`. */
export type TranscriptStatus =
  | 'not_requested'
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed';

export interface TranscriptSegment {
  startMs: number;
  endMs: number;
  text: string;
  /** Diarization label when speaker ID is enabled. */
  speaker?: string;
  confidence?: number;
}

export interface Transcript {
  id: string;
  recordingId: string;
  status: TranscriptStatus;
  language?: string;
  segments: TranscriptSegment[];
  /** Flattened plain text, for full-text search. */
  text: string;
  model?: string;
  createdAt: string;
  completedAt?: string;
}

export interface Summary {
  id: string;
  recordingId: string;
  executiveSummary: string;
  meetingNotes: string;
  actionItems: string[];
  keyDecisions: string[];
  questionsAsked: string[];
  followUps: string[];
  createdAt: string;
}

export interface RequestTranscriptionInput {
  recordingId: string;
  language?: string;
  diarize?: boolean;
  /** Also generate a summary once the transcript is ready. */
  summarize?: boolean;
}
