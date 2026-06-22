/** Base class for all engine errors so callers can `instanceof AudioEngineError`. */
export class AudioEngineError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'AudioEngineError';
  }
}

export class CaptureNotSupportedError extends AudioEngineError {
  constructor(detail: string) {
    super(`Audio capture not supported: ${detail}`, 'CAPTURE_NOT_SUPPORTED');
    this.name = 'CaptureNotSupportedError';
  }
}

export class PermissionDeniedError extends AudioEngineError {
  constructor(cause?: unknown) {
    super('Permission to capture audio was denied', 'PERMISSION_DENIED', cause);
    this.name = 'PermissionDeniedError';
  }
}

export class NoAudioTrackError extends AudioEngineError {
  constructor(detail = 'selected source contains no audio track') {
    super(`No audio track: ${detail}`, 'NO_AUDIO_TRACK');
    this.name = 'NoAudioTrackError';
  }
}

export class RecorderStateError extends AudioEngineError {
  constructor(message: string) {
    super(message, 'INVALID_STATE');
    this.name = 'RecorderStateError';
  }
}
