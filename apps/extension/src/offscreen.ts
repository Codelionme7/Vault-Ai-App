/**
 * Offscreen document — the only place in an MV3 extension that can run
 * MediaRecorder. It receives a tab capture stream id, builds the MediaStream,
 * and records it with the shared audio engine (chunked + persisted to
 * IndexedDB), so the extension inherits the exact same crash-recovery and
 * chunking guarantees as the web app.
 */
import { AudioRecorder, createRecoveryStore } from '@echovault/audio-engine';
import { DEFAULT_CHUNK_DURATION_MS, type SessionMetadata } from '@echovault/shared';
import type { ExtMessage } from './types';

let recorder: AudioRecorder | null = null;
let playbackContext: AudioContext | null = null;

async function startRecording(
  streamId: string,
  sessionId: string,
  meta: SessionMetadata,
): Promise<void> {
  // Build a MediaStream from the tab capture id (Chromium-specific constraints).
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      // @ts-expect-error chromeMediaSource is a non-standard Chromium constraint
      mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId },
    },
    video: false,
  });

  // Capturing tab audio mutes it for the user; route it back to the speakers so
  // the meeting/video is still audible while we record.
  playbackContext = new AudioContext();
  const source = playbackContext.createMediaStreamSource(stream);
  source.connect(playbackContext.destination);

  recorder = new AudioRecorder(
    {
      sessionId,
      title: meta?.detectedTitle || 'Tab recording',
      channels: ['tab'],
      chunkDurationMs: DEFAULT_CHUNK_DURATION_MS,
      metadata: meta ?? { sourceType: 'manual' },
      tabStream: stream,
    },
    createRecoveryStore(),
  );

  recorder.events.on('progress', ({ durationMs, sizeBytes, chunkCount }) => {
    void chrome.runtime.sendMessage({
      type: 'OFFSCREEN_PROGRESS',
      durationMs,
      sizeBytes,
      chunkCount,
    } satisfies ExtMessage);
  });

  await recorder.start();
}

async function stopRecording(): Promise<void> {
  await recorder?.stop();
  recorder = null;
  if (playbackContext) {
    await playbackContext.close();
    playbackContext = null;
  }
  // Free the offscreen document once idle.
  if (await chrome.offscreen.hasDocument()) await chrome.offscreen.closeDocument();
}

chrome.runtime.onMessage.addListener((message: ExtMessage) => {
  if (message.type === 'OFFSCREEN_START') {
    void startRecording(message.streamId, message.sessionId, message.meta);
  } else if (message.type === 'OFFSCREEN_STOP') {
    void stopRecording();
  }
  return false;
});
