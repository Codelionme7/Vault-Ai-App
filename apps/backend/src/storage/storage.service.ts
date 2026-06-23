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

  constructor(
    private readonly config: ConfigService<AppConfig, true>,
    private readonly crypto: CryptoService,
  ) {}

  onModuleInit(): void {
    const storage = this.config.get('storage', { infer: true });
    if (storage.driver === 's3') {
      this.driver = new S3StorageDriver(storage.s3);
    } else {
      this.driver = new LocalStorageDriver(
        storage.localPath,
        this.config.get('apiBaseUrl', { infer: true }),
      );
    }
    this.logger.log(`Storage driver: ${this.driver.name}`);
  }

  get activeDriver(): StorageDriver {
    return this.driver;
  }

  /** Store bytes, encrypted at rest. */
  async putEncrypted(key: string, data: Buffer, contentType?: string): Promise<void> {
    const sealed = this.crypto.encrypt(data);
    await this.driver.put(key, sealed, contentType);
  }

  /** Read and decrypt bytes previously stored with {@link putEncrypted}. */
  async getDecrypted(key: string): Promise<Buffer> {
    const sealed = await this.driver.get(key);
    return this.crypto.decrypt(sealed);
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
