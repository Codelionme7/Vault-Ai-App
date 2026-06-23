import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LocalStorageDriver } from './local.driver';

describe('LocalStorageDriver', () => {
  let root: string;
  let driver: LocalStorageDriver;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'echovault-storage-'));
    driver = new LocalStorageDriver(root, 'http://localhost:3000');
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('round-trips bytes through nested keys', async () => {
    const key = 'recordings/u1/r1/tab/000000.webm';
    const data = Buffer.from('chunk-bytes');
    await driver.put(key, data);
    expect(await driver.exists(key)).toBe(true);
    expect((await driver.get(key)).toString()).toBe('chunk-bytes');
  });

  it('reports non-existent keys', async () => {
    expect(await driver.exists('nope/x.webm')).toBe(false);
  });

  it('deletes keys', async () => {
    const key = 'a/b.webm';
    await driver.put(key, Buffer.from('x'));
    await driver.delete(key);
    expect(await driver.exists(key)).toBe(false);
  });

  it('refuses path traversal outside the root', async () => {
    // Sanitizer collapses traversal; bytes stay inside root.
    await driver.put('../../escape.webm', Buffer.from('x'));
    expect(await driver.exists('escape.webm')).toBe(true);
  });

  it('creates an API-routed upload target for local storage', async () => {
    const target = await driver.createUploadTarget('recordings/u/r/tab/000001.webm', 'audio/webm');
    expect(target.method).toBe('PUT');
    expect(target.uploadUrl).toContain('/chunks/upload');
    expect(target.storageKey).toBe('recordings/u/r/tab/000001.webm');
  });
});
