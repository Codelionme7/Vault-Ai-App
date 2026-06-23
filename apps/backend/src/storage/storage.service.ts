import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/configuration';
import { CryptoService } from '../common/crypto/crypto.service';
import { LocalStorageDriver } from './drivers/local.driver';
import { S3StorageDriver } from './drivers/s3.driver';
import type { StorageDriver, UploadTarget } from './storage.types';

/**
 * StorageService is the single entry point for persisting recording bytes.
 *
 * It owns at-rest encryption (AES-256-GCM): every payload is sealed before it
 * reaches a driver and opened on read, so both local disk and cloud buckets
 * hold only ciphertext. The active driver (local or S3) is chosen from config.
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private driver!: StorageDriver;
  private appEncryption = true;
  private signedUrlTtl = 900;

  constructor(
    private readonly config: ConfigService<AppConfig, true>,
    private readonly crypto: CryptoService,
  ) {}

  onModuleInit(): void {
    const storage = this.config.get('storage', { infer: true });
    this.appEncryption = storage.appEncryption;
    this.signedUrlTtl = storage.s3.signedUrlTtl;
    if (storage.driver === 's3') {
      this.driver = new S3StorageDriver(storage.s3);
    } else {
      this.driver = new LocalStorageDriver(
        storage.localPath,
        this.config.get('apiBaseUrl', { infer: true }),
      );
    }
    this.logger.log(
      `Storage driver: ${this.driver.name} (app-encryption: ${this.appEncryption ? 'on' : 'off'})`,
    );
  }

  get activeDriver(): StorageDriver {
    return this.driver;
  }

  /** Whether bytes are sealed by the app layer (vs. relying on driver/bucket SSE). */
  get encryptsAtRest(): boolean {
    return this.appEncryption;
  }

  /** Store bytes, encrypted at rest when app-encryption is enabled. */
  async putEncrypted(key: string, data: Buffer, contentType?: string): Promise<void> {
    const payload = this.appEncryption ? this.crypto.encrypt(data) : data;
    await this.driver.put(key, payload, contentType);
  }

  /** Read bytes previously stored with {@link putEncrypted}, decrypting if sealed. */
  async getDecrypted(key: string): Promise<Buffer> {
    const raw = await this.driver.get(key);
    return this.appEncryption ? this.crypto.decrypt(raw) : raw;
  }

  /**
   * A time-limited direct download URL, or null when not applicable. Only
   * offered when the driver supports it AND bytes are stored unencrypted — an
   * app-encrypted object would hand the client undecryptable ciphertext.
   */
  async getSignedDownloadUrl(key: string): Promise<string | null> {
    if (this.appEncryption || !this.driver.getSignedDownloadUrl) return null;
    return this.driver.getSignedDownloadUrl(key, this.signedUrlTtl);
  }

  async delete(key: string): Promise<void> {
    await this.driver.delete(key);
  }

  async exists(key: string): Promise<boolean> {
    return this.driver.exists(key);
  }

  createUploadTarget(key: string, contentType: string): Promise<UploadTarget> {
    return this.driver.createUploadTarget(key, contentType);
  }
}
