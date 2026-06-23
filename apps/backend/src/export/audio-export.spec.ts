import { describe, expect, it } from 'vitest';
import {
  contentTypeFor,
  extensionFor,
  ffmpegOutputArgs,
  pickPreferredChannel,
  requiresFfmpeg,
} from './audio-export';

describe('pickPreferredChannel', () => {
  it('honors a valid requested channel', () => {
    expect(pickPreferredChannel(['tab', 'mic', 'mixed'], 'mic')).toBe('mic');
  });
  it('falls back to preference order (mixed > tab > mic)', () => {
    expect(pickPreferredChannel(['tab', 'mic', 'mixed'])).toBe('mixed');
    expect(pickPreferredChannel(['tab', 'mic'])).toBe('tab');
    expect(pickPreferredChannel(['mic'])).toBe('mic');
  });
  it('ignores an invalid requested channel', () => {
    expect(pickPreferredChannel(['tab'], 'nonexistent')).toBe('tab');
  });
  it('returns undefined when there are no channels', () => {
    expect(pickPreferredChannel([])).toBeUndefined();
  });
});

describe('requiresFfmpeg', () => {
  it('is false only for webm', () => {
    expect(requiresFfmpeg('webm')).toBe(false);
    expect(requiresFfmpeg('wav')).toBe(true);
    expect(requiresFfmpeg('mp3')).toBe(true);
    expect(requiresFfmpeg('flac')).toBe(true);
  });
});

describe('ffmpegOutputArgs', () => {
  it('selects the right codec per format', () => {
    expect(ffmpegOutputArgs('wav')).toContain('pcm_s16le');
    expect(ffmpegOutputArgs('mp3')).toContain('libmp3lame');
    expect(ffmpegOutputArgs('flac')).toContain('flac');
    expect(ffmpegOutputArgs('webm')).toContain('copy');
  });
  it('always specifies an output format', () => {
    for (const f of ['wav', 'mp3', 'flac', 'webm'] as const) {
      expect(ffmpegOutputArgs(f)).toContain('-f');
    }
  });
});

describe('content type + extension', () => {
  it('maps formats to MIME types', () => {
    expect(contentTypeFor('wav')).toBe('audio/wav');
    expect(contentTypeFor('mp3')).toBe('audio/mpeg');
    expect(contentTypeFor('flac')).toBe('audio/flac');
    expect(contentTypeFor('webm')).toBe('audio/webm');
  });
  it('maps formats to file extensions', () => {
    expect(extensionFor('mp3')).toBe('mp3');
  });
});
