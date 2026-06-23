import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AudioChunk, UploadTicket } from '@echovault/shared';
import { MAX_CHUNK_BYTES } from '@echovault/shared';
import { CryptoService } from '../common/crypto/crypto.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { RecordingsService } from '../recordings/recordings.service';
import { StorageService } from '../storage/storage.service';
import { buildChunkKey } from '../storage/key-util';
import type { CommitChunkDto, RequestUploadTargetDto } from './dto/chunk.dto';

/**
 * Server side of the durability path. Chunks arrive already safe in the
 * client's local store; here we accept them, encrypt at rest, and commit their
 * metadata idempotently (the unique (recording, channel, sequence) constraint
 * makes a retried upload a no-op rather than a duplicate).
 */
@Injectable()
export class ChunksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly recordings: RecordingsService,
    private readonly crypto: CryptoService,
  ) {}

  async requestUploadTarget(
    ownerId: string,
    dto: RequestUploadTargetDto,
  ): Promise<UploadTicket> {
    await this.assertOwnsRecording(ownerId, dto.recordingId);
    const key = buildChunkKey({
      ownerId,
      recordingId: dto.recordingId,
      channel: dto.channel,
      sequence: dto.sequence,
    });
    const target = await this.storage.createUploadTarget(key, dto.contentType ?? 'audio/webm');
    return target;
  }

  /** Local-driver ingest: encrypt and persist raw bytes at the given key. */
  async storeBytes(ownerId: string, key: string, bytes: Buffer): Promise<void> {
    if (!bytes?.length) throw new BadRequestException('Empty upload body');
    if (bytes.length > MAX_CHUNK_BYTES) throw new BadRequestException('Chunk too large');
    // The key embeds the owner id; ensure a user can only write under their own
    // namespace.
    if (!key.startsWith(`recordings/${ownerIdSegment(ownerId)}/`)) {
      throw new ForbiddenException('Upload key outside your namespace');
    }
    await this.storage.putEncrypted(key, bytes);
  }

  async commit(ownerId: string, dto: CommitChunkDto): Promise<AudioChunk> {
    await this.assertOwnsRecording(ownerId, dto.recordingId);

    // Integrity: verify the stored bytes match the client's checksum.
    if (dto.checksum) {
      const stored = await this.storage.getDecrypted(dto.storageKey).catch(() => null);
      if (!stored) throw new BadRequestException('Uploaded bytes not found for commit');
      const actual = this.crypto.sha256(stored);
      if (actual !== dto.checksum) {
        throw new BadRequestException('Checksum mismatch — refusing to commit a corrupt chunk');
      }
    }

    const row = await this.prisma.chunk.upsert({
      where: {
        recordingId_channel_sequence: {
          recordingId: dto.recordingId,
          channel: dto.channel,
          sequence: dto.sequence,
        },
      },
      create: {
        recordingId: dto.recordingId,
        channel: dto.channel,
        sequence: dto.sequence,
        status: 'uploaded',
        startOffsetMs: dto.startOffsetMs,
        durationMs: dto.durationMs,
        byteLength: dto.byteLength,
        mimeType: dto.mimeType,
        checksum: dto.checksum,
        storageKey: dto.storageKey,
        uploadedAt: new Date(),
      },
      update: {
        status: 'uploaded',
        byteLength: dto.byteLength,
        durationMs: dto.durationMs,
        checksum: dto.checksum,
        storageKey: dto.storageKey,
        uploadedAt: new Date(),
      },
    });

    // Keep the recording's derived stats fresh.
    await this.recordings.recomputeStats(dto.recordingId);

    return this.toChunkDto(row);
  }

  async listForRecording(ownerId: string, recordingId: string): Promise<AudioChunk[]> {
    await this.assertOwnsRecording(ownerId, recordingId);
    const rows = await this.prisma.chunk.findMany({
      where: { recordingId },
      orderBy: [{ channel: 'asc' }, { sequence: 'asc' }],
    });
    return rows.map((r) => this.toChunkDto(r));
  }

  /** Decrypt and return a chunk's bytes for playback/export. */
  async getBytes(ownerId: string, chunkId: string): Promise<{ bytes: Buffer; mimeType: string }> {
    const row = await this.prisma.chunk.findUnique({ where: { id: chunkId } });
    if (!row) throw new NotFoundException('Chunk not found');
    await this.assertOwnsRecording(ownerId, row.recordingId);
    const bytes = await this.storage.getDecrypted(row.storageKey);
    return { bytes, mimeType: row.mimeType };
  }

  private async assertOwnsRecording(ownerId: string, recordingId: string): Promise<void> {
    const rec = await this.prisma.recording.findUnique({
      where: { id: recordingId },
      select: { ownerId: true },
    });
    if (!rec) throw new NotFoundException('Recording not found');
    if (rec.ownerId !== ownerId) throw new ForbiddenException('Not your recording');
  }

  private toChunkDto(row: {
    id: string;
    recordingId: string;
    channel: string;
    sequence: number;
    status: string;
    startOffsetMs: number;
    durationMs: number;
    byteLength: number;
    mimeType: string;
    checksum: string | null;
    storageKey: string;
    createdAt: Date;
    uploadedAt: Date | null;
  }): AudioChunk {
    return {
      id: row.id,
      sessionId: row.recordingId,
      channel: row.channel as AudioChunk['channel'],
      sequence: row.sequence,
      status: row.status as AudioChunk['status'],
      startOffsetMs: row.startOffsetMs,
      durationMs: row.durationMs,
      byteLength: row.byteLength,
      mimeType: row.mimeType,
      checksum: row.checksum ?? undefined,
      storageKey: row.storageKey,
      createdAt: row.createdAt.toISOString(),
      uploadedAt: row.uploadedAt?.toISOString(),
    };
  }
}

/** Mirror of safeSegment for the owner id used in key namespacing. */
function ownerIdSegment(ownerId: string): string {
  return ownerId.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 128) || '_';
}
