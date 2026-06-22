import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { decrypt, decryptString, encrypt, encryptString, sha256 } from './crypto.util';

/** Injectable wrapper around the pure crypto utilities, bound to the app key. */
@Injectable()
export class CryptoService {
  private readonly keyHex: string;

  constructor(config: ConfigService) {
    this.keyHex = config.get<string>('encryptionKeyHex')!;
  }

  encrypt(plaintext: Buffer): Buffer {
    return encrypt(plaintext, this.keyHex);
  }

  decrypt(envelope: Buffer): Buffer {
    return decrypt(envelope, this.keyHex);
  }

  encryptString(value: string): string {
    return encryptString(value, this.keyHex);
  }

  decryptString(value: string): string {
    return decryptString(value, this.keyHex);
  }

  sha256(data: Buffer | string): string {
    return sha256(data);
  }
}
