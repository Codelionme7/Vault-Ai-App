import { describe, expect, it } from 'vitest';
import { formatBytes, formatDuration, sourceLabel } from './format';

describe('formatDuration', () => {
  it('formats sub-hour as M:SS', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(5000)).toBe('0:05');
    expect(formatDuration(65_000)).toBe('1:05');
    expect(formatDuration(599_000)).toBe('9:59');
  });
  it('formats multi-hour as H:MM:SS', () => {
    expect(formatDuration(3_600_000)).toBe('1:00:00');
    expect(formatDuration(8 * 3_600_000 + 125_000)).toBe('8:02:05');
  });
  it('clamps negatives', () => {
    expect(formatDuration(-500)).toBe('0:00');
  });
});

describe('formatBytes', () => {
  it('handles zero and bytes', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
  });
  it('scales to KB/MB/GB', () => {
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
    expect(formatBytes(25 * 1024 * 1024)).toBe('25.0 MB');
    expect(formatBytes(3 * 1024 * 1024 * 1024)).toBe('3.0 GB');
  });
});

describe('sourceLabel', () => {
  it('maps known sources', () => {
    expect(sourceLabel('google_meet')).toBe('Google Meet');
    expect(sourceLabel('manual')).toBe('Manual');
  });
  it('passes through unknown sources', () => {
    expect(sourceLabel('mystery')).toBe('mystery');
  });
});
