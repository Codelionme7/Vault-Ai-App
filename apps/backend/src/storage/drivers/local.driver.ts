import { createReadStream, existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { ReadStream } from 'node:fs';
import { sanitizeKey } from '../key-util';
import type { StorageDriver, UploadTarget } from '../storage.types';

/**
 * Local filesystem driver — the local-first default. Recordings land here
 * immediately; cloud sync (if configured) happens later. Keys are sanitized and
 * confined under the root to prevent path traversal.
 */
export class LocalStorageDriver implements StorageDriver {
  readonly name = 'local';
  private readonly root: string;

  constructor(
    rootPath: string,
    private readonly apiBaseUrl: string,
  ) {
    this.root = resolve(rootPath);
  }

  private pathFor(key: string): string {
    const safe = sanitizeKey(key);
    const full = resolve(join(this.root, safe));
    // Defense in depth: ensure the resolved path stays inside the root.
    if (full !== this.root && !full.startsWith(this.root + '/')) {
      throw new Error('Resolved storage path escapes root');
    }
    return full;
  }

  async put(key: string, data: Buffer): Promise<void> {
    const path = this.pathFor(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data);
  }

  async get(key: string): Promise<Buffer> {
    return readFile(this.pathFor(key));
  }

  createReadStream(key: string): ReadStream {
    return createReadStream(this.pathFor(key));
  }

  async delete(key: string): Promise<void> {
    await rm(this.pathFor(key), { force: true });
  }

  async exists(key: string): Promise<boolean> {
    return existsSync(this.pathFor(key));
  }

  async createUploadTarget(key: string, _contentType: string): Promise<UploadTarget> {
    // Local uploads go through the API, which writes to disk and encrypts.
    return {
      uploadUrl: `${this.apiBaseUrl}/chunks/upload?key=${encodeURIComponent(sanitizeKey(key))}`,
      method: 'PUT',
      storageKey: sanitizeKey(key),
      expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    };
  }
}
