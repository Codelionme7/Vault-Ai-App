/**
 * @echovault/shared
 *
 * Single source of truth for domain types shared across the audio engine,
 * backend, web app, and browser extension. Keeping these here prevents the
 * "audio" contract from drifting between the recorder and the storage layer —
 * which is the contract that matters most in an audio-first product.
 */

export * from './recording';
export * from './chunk';
export * from './source';
export * from './transcription';
export * from './api';
export * from './constants';
