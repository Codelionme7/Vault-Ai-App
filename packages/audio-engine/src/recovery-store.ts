import type { AudioChunk } from '@echovault/shared';

/**
 * Durable, local-first storage for in-flight recordings. Every chunk is written
 * here the instant it is captured, BEFORE any upload is attempted — so a crash,
 * tab kill, or power loss can be recovered on next launch.
 *
 * Two implementations:
 *   - IndexedDBRecoveryStore: the real browser store (stores Blobs).
 *   - MemoryRecoveryStore: for tests and non-browser runtimes.
 */

/** Persisted session header, written at start and updated as it progresses. */
export interface RecoveryManifest {
  sessionId: string;
  title: string;
  startedAt: string;
  updatedAt: string;
  /** Set when the session ended cleanly; absence => candidate for recovery. */
  closedAt?: string;
  channels: string[];
  mimeType: string;
  chunkDurationMs: number;
}

export interface StoredChunk {
  meta: AudioChunk;
  /** Encoded bytes. In the browser this is a Blob; elsewhere a Uint8Array. */
  data: Blob | Uint8Array;
}

export interface RecoveryStore {
  putManifest(manifest: RecoveryManifest): Promise<void>;
  getManifest(sessionId: string): Promise<RecoveryManifest | undefined>;
  listManifests(): Promise<RecoveryManifest[]>;
  /** Sessions that were never closed cleanly — the recovery candidates. */
  listOpenSessions(): Promise<RecoveryManifest[]>;
  markClosed(sessionId: string, closedAt?: string): Promise<void>;

  putChunk(chunk: StoredChunk): Promise<void>;
  getChunks(sessionId: string): Promise<StoredChunk[]>;
  deleteChunk(chunkId: string): Promise<void>;

  deleteSession(sessionId: string): Promise<void>;
}

/** Composite key helper so chunks sort/scan by session then sequence. */
function chunkKey(meta: AudioChunk): string {
  return `${meta.sessionId}::${meta.channel}::${meta.sequence.toString().padStart(6, '0')}`;
}

/**
 * In-memory store. Used by tests and as a fallback when IndexedDB is
 * unavailable (e.g. private-mode quirks) — note the fallback is NOT durable.
 */
export class MemoryRecoveryStore implements RecoveryStore {
  private manifests = new Map<string, RecoveryManifest>();
  private chunks = new Map<string, StoredChunk>();

  async putManifest(manifest: RecoveryManifest): Promise<void> {
    this.manifests.set(manifest.sessionId, { ...manifest });
  }

  async getManifest(sessionId: string): Promise<RecoveryManifest | undefined> {
    const m = this.manifests.get(sessionId);
    return m ? { ...m } : undefined;
  }

  async listManifests(): Promise<RecoveryManifest[]> {
    return [...this.manifests.values()].map((m) => ({ ...m }));
  }

  async listOpenSessions(): Promise<RecoveryManifest[]> {
    return [...this.manifests.values()].filter((m) => !m.closedAt).map((m) => ({ ...m }));
  }

  async markClosed(sessionId: string, closedAt = new Date().toISOString()): Promise<void> {
    const m = this.manifests.get(sessionId);
    if (m) {
      m.closedAt = closedAt;
      m.updatedAt = closedAt;
    }
  }

  async putChunk(chunk: StoredChunk): Promise<void> {
    this.chunks.set(chunkKey(chunk.meta), chunk);
  }

  async getChunks(sessionId: string): Promise<StoredChunk[]> {
    return [...this.chunks.entries()]
      .filter(([key]) => key.startsWith(`${sessionId}::`))
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([, v]) => v);
  }

  async deleteChunk(chunkId: string): Promise<void> {
    for (const [key, value] of this.chunks) {
      if (value.meta.id === chunkId) {
        this.chunks.delete(key);
        return;
      }
    }
  }

  async deleteSession(sessionId: string): Promise<void> {
    this.manifests.delete(sessionId);
    for (const key of [...this.chunks.keys()]) {
      if (key.startsWith(`${sessionId}::`)) this.chunks.delete(key);
    }
  }
}

const DB_NAME = 'echovault-recovery';
const DB_VERSION = 1;
const STORE_MANIFESTS = 'manifests';
const STORE_CHUNKS = 'chunks';

/**
 * IndexedDB-backed durable store for the browser. Blobs are stored directly,
 * which the browser keeps on disk — surviving a tab crash or full restart.
 */
export class IndexedDBRecoveryStore implements RecoveryStore {
  private dbPromise?: Promise<IDBDatabase>;

  static isSupported(): boolean {
    return typeof indexedDB !== 'undefined';
  }

  private open(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_MANIFESTS)) {
          db.createObjectStore(STORE_MANIFESTS, { keyPath: 'sessionId' });
        }
        if (!db.objectStoreNames.contains(STORE_CHUNKS)) {
          const store = db.createObjectStore(STORE_CHUNKS, { keyPath: 'key' });
          store.createIndex('bySession', 'sessionId', { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return this.dbPromise;
  }

  private async tx<T>(
    store: string,
    mode: IDBTransactionMode,
    fn: (s: IDBObjectStore) => IDBRequest<T> | void,
  ): Promise<T | undefined> {
    const db = await this.open();
    return new Promise<T | undefined>((resolve, reject) => {
      const transaction = db.transaction(store, mode);
      const objectStore = transaction.objectStore(store);
      let result: T | undefined;
      const req = fn(objectStore);
      if (req) req.onsuccess = () => (result = req.result);
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  }

  async putManifest(manifest: RecoveryManifest): Promise<void> {
    await this.tx(STORE_MANIFESTS, 'readwrite', (s) => s.put(manifest));
  }

  async getManifest(sessionId: string): Promise<RecoveryManifest | undefined> {
    return this.tx<RecoveryManifest>(STORE_MANIFESTS, 'readonly', (s) => s.get(sessionId));
  }

  async listManifests(): Promise<RecoveryManifest[]> {
    return (await this.tx<RecoveryManifest[]>(STORE_MANIFESTS, 'readonly', (s) =>
      s.getAll(),
    )) ?? [];
  }

  async listOpenSessions(): Promise<RecoveryManifest[]> {
    const all = await this.listManifests();
    return all.filter((m) => !m.closedAt);
  }

  async markClosed(sessionId: string, closedAt = new Date().toISOString()): Promise<void> {
    const m = await this.getManifest(sessionId);
    if (m) {
      m.closedAt = closedAt;
      m.updatedAt = closedAt;
      await this.putManifest(m);
    }
  }

  async putChunk(chunk: StoredChunk): Promise<void> {
    const record = {
      key: chunkKey(chunk.meta),
      sessionId: chunk.meta.sessionId,
      meta: chunk.meta,
      data: chunk.data,
    };
    await this.tx(STORE_CHUNKS, 'readwrite', (s) => s.put(record));
  }

  async getChunks(sessionId: string): Promise<StoredChunk[]> {
    const db = await this.open();
    return new Promise<StoredChunk[]>((resolve, reject) => {
      const transaction = db.transaction(STORE_CHUNKS, 'readonly');
      const index = transaction.objectStore(STORE_CHUNKS).index('bySession');
      const req = index.getAll(IDBKeyRange.only(sessionId));
      req.onsuccess = () => {
        const rows = (req.result as Array<{ meta: AudioChunk; data: Blob }>) ?? [];
        rows.sort((a, b) => a.meta.sequence - b.meta.sequence);
        resolve(rows.map((r) => ({ meta: r.meta, data: r.data })));
      };
      req.onerror = () => reject(req.error);
    });
  }

  async deleteChunk(chunkId: string): Promise<void> {
    const db = await this.open();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_CHUNKS, 'readwrite');
      const store = transaction.objectStore(STORE_CHUNKS);
      const cursorReq = store.openCursor();
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (!cursor) return;
        if ((cursor.value as { meta: AudioChunk }).meta.id === chunkId) {
          cursor.delete();
          return;
        }
        cursor.continue();
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async deleteSession(sessionId: string): Promise<void> {
    const db = await this.open();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction([STORE_MANIFESTS, STORE_CHUNKS], 'readwrite');
      transaction.objectStore(STORE_MANIFESTS).delete(sessionId);
      const index = transaction.objectStore(STORE_CHUNKS).index('bySession');
      const cursorReq = index.openCursor(IDBKeyRange.only(sessionId));
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }
}

/** Pick the best available store for the current runtime. */
export function createRecoveryStore(): RecoveryStore {
  if (IndexedDBRecoveryStore.isSupported()) return new IndexedDBRecoveryStore();
  return new MemoryRecoveryStore();
}
