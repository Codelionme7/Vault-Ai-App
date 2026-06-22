import { CaptureNotSupportedError, NoAudioTrackError, PermissionDeniedError } from '../errors.js';

/**
 * Capture browser tab / system audio via getDisplayMedia. We request video as
 * well because Chromium only exposes tab AUDIO when a surface (tab) is shared;
 * the video track is immediately stopped and discarded — we keep only audio.
 */
export async function captureTabAudio(): Promise<MediaStream> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getDisplayMedia) {
    throw new CaptureNotSupportedError('getDisplayMedia is unavailable in this runtime');
  }

  let display: MediaStream;
  try {
    display = await navigator.mediaDevices.getDisplayMedia({
      // Audio constraints tuned for fidelity, not for speech cleanup — we want
      // the raw source, processing is a downstream concern.
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 2,
        sampleRate: 48_000,
      },
      video: {
        // Lowest acceptable video; we discard it right away.
        width: { ideal: 1 },
        height: { ideal: 1 },
        frameRate: { ideal: 1 },
      },
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'NotAllowedError') {
      throw new PermissionDeniedError(err);
    }
    throw err;
  }

  const audioTracks = display.getAudioTracks();
  if (audioTracks.length === 0) {
    display.getTracks().forEach((t) => t.stop());
    throw new NoAudioTrackError(
      'the shared surface has no audio — make sure "Share tab audio" is enabled',
    );
  }

  // Drop video; keep an audio-only stream.
  display.getVideoTracks().forEach((t) => {
    t.stop();
    display.removeTrack(t);
  });

  return new MediaStream(audioTracks);
}
