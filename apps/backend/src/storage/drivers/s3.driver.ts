import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { sanitizeKey } from '../key-util';
import type { StorageDriver, UploadTarget } from '../storage.types';

export interface S3DriverConfig {
  endpoint?: string;
  region: string;
  bucket: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  forcePathStyle: boolean;
  signedUrlTtl: number;
}

/**
 * S3-compatible driver — works with AWS S3, Cloudflare R2, and Backblaze B2.
 * Supports direct-to-bucket presigned uploads (offloading bytes from the API)
 * with server-side encryption enforced.
 */
export class S3StorageDriver implements StorageDriver {
  readonly name = 's3';
  private readonly client: S3Client;

  constructor(private readonly config: S3DriverConfig) {
    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: config.forcePathStyle,
      credentials:
        config.accessKeyId && config.secretAccessKey
          ? { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey }
          : undefined,
    });
  }

  async put(key: string, data: Buffer, contentType = 'application/octet-stream'): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: sanitizeKey(key),
        Body: data,
        ContentType: contentType,
        ServerSideEncryption: 'AES256',
      }),
    );
  }

  async get(key: string): Promise<Buffer> {
    const res = await this.client.send(
      new GetObjectCommand({ Bucket: this.config.bucket, Key: sanitizeKey(key) }),
    );
    const bytes = await res.Body?.transformToByteArray();
    if (!bytes) throw new Error(`S3 object ${key} had no body`);
    return Buffer.from(bytes);
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.config.bucket, Key: sanitizeKey(key) }),
    );
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.config.bucket, Key: sanitizeKey(key) }),
      );
      return true;
    } catch {
      return false;
    }
  }

  async createUploadTarget(key: string, contentType: string): Promise<UploadTarget> {
    const safeKey = sanitizeKey(key);
    const command = new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: safeKey,
      ContentType: contentType,
      ServerSideEncryption: 'AES256',
    });
    const uploadUrl = await getSignedUrl(this.client, command, {
      expiresIn: this.config.signedUrlTtl,
    });
    return {
      uploadUrl,
      method: 'PUT',
      storageKey: safeKey,
      headers: {
        'Content-Type': contentType,
        'x-amz-server-side-encryption': 'AES256',
      },
      expiresAt: new Date(Date.now() + this.config.signedUrlTtl * 1000).toISOString(),
    };
  }

  async getSignedDownloadUrl(key: string, ttlSeconds: number): Promise<string> {
    const command = new GetObjectCommand({ Bucket: this.config.bucket, Key: sanitizeKey(key) });
    return getSignedUrl(this.client, command, { expiresIn: ttlSeconds });
  }
}
