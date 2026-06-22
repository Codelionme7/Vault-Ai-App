import { CaptureNotSupportedError, NoAudioTrackError, PermissionDeniedError } from '../errors.js';

export interface MicDevice {
  deviceId: string;
  label: string;
}

/**
 * Enumerate selectable input devices (USB / Bluetooth / internal mics).
 * Labels are only populated after permission has been granted at least once.
 */
export async function listMicrophones(): Promise<MicDevice[]> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
    throw new CaptureNotSupportedError('enumerateDevices is unavailable');
  }
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((d) => d.kind === 'audioinput')
    .map((d) => ({ deviceId: d.deviceId, label: d.label || 'Microphone' }));
}

/**
 * Capture a specific microphone. Like tab capture, we keep processing off by
 * default to preserve fidelity; callers can opt into cleanup for voice memos.
 */
export async function captureMicrophone(options?: {
  deviceId?: string;
  echoCancellation?: boolean;
  noiseSuppression?: boolean;
  autoGainControl?: boolean;
}): Promise<MediaStream> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    throw new CaptureNotSupportedError('getUserMedia is unavailable');
  }

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: options?.deviceId ? { exact: options.deviceId } : undefined,
        echoCancellation: options?.echoCancellation ?? false,
        noiseSuppression: options?.noiseSuppression ?? false,
        autoGainControl: options?.autoGainControl ?? false,
        channelCount: 2,
        sampleRate: 48_000,
      },
      video: false,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'NotAllowedError') {
      throw new PermissionDeniedError(err);
    }
    throw err;
  }

  if (stream.getAudioTracks().length === 0) {
    stream.getTracks().forEach((t) => t.stop());
    throw new NoAudioTrackError('microphone produced no audio track');
  }
  return stream;
}
