import type { SessionMetadata } from '@echovault/shared';

/** Messages exchanged between popup, service worker, content script, offscreen. */
export type ExtMessage =
  | { type: 'START_CAPTURE'; tabId: number; meta: SessionMetadata }
  | { type: 'STOP_CAPTURE' }
  | { type: 'GET_STATE' }
  | { type: 'STATE'; state: CaptureState }
  | { type: 'OFFSCREEN_START'; streamId: string; sessionId: string; meta: SessionMetadata }
  | { type: 'OFFSCREEN_STOP' }
  | { type: 'OFFSCREEN_PROGRESS'; durationMs: number; sizeBytes: number; chunkCount: number }
  | { type: 'MEET_INFO'; meta: SessionMetadata };

export interface CaptureState {
  recording: boolean;
  sessionId?: string;
  tabId?: number;
  startedAt?: number;
  durationMs: number;
  sizeBytes: number;
  chunkCount: number;
  meta?: SessionMetadata;
}

export const DEFAULT_STATE: CaptureState = {
  recording: false,
  durationMs: 0,
  sizeBytes: 0,
  chunkCount: 0,
};
