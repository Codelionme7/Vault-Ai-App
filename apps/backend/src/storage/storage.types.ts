/** A pre-authorized place for a client to upload bytes. */
export interface UploadTarget {
  uploadUrl: string;
  method: 'PUT' | 'POST';
  storageKey: string;
  headers?: Record<string, string>;
  expiresAt: string;
}

/**
 * Storage driver contract. Drivers store OPAQUE bytes — encryption is applied
 * one layer up in StorageService, so every driver gets at-rest encryption for
 * free and stays simple.
 */
export interface StorageDriver {
  readonly name: string;
  put(key: string, data: Buffer, contentType?: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  /**
   * Pre-authorized upload location. For S3 this is a presigned PUT URL (direct
   * to bucket); for local it points back at the API's upload endpoint.
   */
  createUploadTarget(key: string, contentType: string): Promise<UploadTarget>;
  /** A time-limited download URL where supported (S3). */
  getSignedDownloadUrl?(key: string, ttlSeconds: number): Promise<string>;
}
