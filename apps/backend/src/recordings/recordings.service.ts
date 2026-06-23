import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { detectSourceFromUrl, type Recording } from '@echovault/shared';
import { PrismaService } from '../common/prisma/prisma.service';
import { toRecordingDto } from './recording.mapper';
import type { CreateRecordingDto, UpdateRecordingDto } from './dto/recording.dto';

@Injectable()
export class RecordingsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(ownerId: string, dto: CreateRecordingDto): Promise<Recording> {
    const metadata = (dto.metadata ?? {}) as Record<string, unknown>;
    const sourceType =
      dto.sourceType ??
      detectSourceFromUrl(typeof metadata.sourceUrl === 'string' ? metadata.sourceUrl : undefined);

    const row = await this.prisma.recording.create({
      data: {
        id: dto.id,
        ownerId,
        title: dto.title ?? 'Untitled recording',
        sourceType,
        channels: dto.channels ?? [],
        tags: dto.tags ?? [],
        metadata: { sourceType, ...metadata } as Prisma.InputJsonValue,
        startedAt: dto.startedAt ? new Date(dto.startedAt) : new Date(),
        status: 'recording',
      },
    });
    return toRecordingDto(row);
  }

  async findAllForOwner(ownerId: string): Promise<Recording[]> {
    const rows = await this.prisma.recording.findMany({
      where: { ownerId },
      orderBy: { startedAt: 'desc' },
    });
    return rows.map(toRecordingDto);
  }

  /** Fetch a recording, asserting ownership. */
  async findOneOwned(ownerId: string, id: string): Promise<Recording> {
    const row = await this.getOwnedRow(ownerId, id);
    return toRecordingDto(row);
  }

  async update(ownerId: string, id: string, dto: UpdateRecordingDto): Promise<Recording> {
    await this.getOwnedRow(ownerId, id);
    const row = await this.prisma.recording.update({
      where: { id },
      data: { title: dto.title, tags: dto.tags, notes: dto.notes },
    });
    return toRecordingDto(row);
  }

  /** Mark a recording complete and recompute its authoritative stats. */
  async complete(ownerId: string, id: string): Promise<Recording> {
    await this.getOwnedRow(ownerId, id);
    await this.recomputeStats(id);
    const row = await this.prisma.recording.update({
      where: { id },
      data: { status: 'completed', endedAt: new Date() },
    });
    return toRecordingDto(row);
  }

  async remove(ownerId: string, id: string): Promise<void> {
    await this.getOwnedRow(ownerId, id);
    await this.prisma.recording.delete({ where: { id } });
  }

  /**
   * Recompute duration / size / pending-upload flags from committed chunks.
   * Chunks are the source of truth; the Recording row is a derived summary.
   */
  async recomputeStats(id: string): Promise<void> {
    const chunks = await this.prisma.chunk.findMany({ where: { recordingId: id } });
    // Duration is the longest channel timeline, not the sum across channels.
    const perChannel = new Map<string, number>();
    let sizeBytes = 0n;
    let pending = false;
    for (const c of chunks) {
      perChannel.set(c.channel, (perChannel.get(c.channel) ?? 0) + c.durationMs);
      sizeBytes += BigInt(c.byteLength);
      if (c.status !== 'uploaded') pending = true;
    }
    const durationMs = Math.max(0, ...perChannel.values(), 0);
    await this.prisma.recording.update({
      where: { id },
      data: { durationMs, sizeBytes, hasPendingUploads: pending },
    });
  }

  private async getOwnedRow(ownerId: string, id: string) {
    const row = await this.prisma.recording.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Recording not found');
    if (row.ownerId !== ownerId) throw new ForbiddenException('Not your recording');
    return row;
  }
}
