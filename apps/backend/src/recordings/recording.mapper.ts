import type { Recording as PrismaRecording } from '@prisma/client';
import type { Recording, SessionMetadata, SourceType } from '@echovault/shared';

/**
 * Map a Prisma row to the API/domain shape. Normalizes Postgres-specific types
 * (BigInt sizeBytes -> number, Json metadata) so the wire contract matches
 * @echovault/shared exactly.
 */
export function toRecordingDto(row: PrismaRecording): Recording {
  return {
    id: row.id,
    ownerId: row.ownerId,
    title: row.title,
    status: row.status,
    sourceType: row.sourceType as SourceType,
    metadata: (row.metadata as unknown as SessionMetadata) ?? { sourceType: 'manual' },
    channels: row.channels as Recording['channels'],
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt?.toISOString(),
    durationMs: row.durationMs,
    sizeBytes: Number(row.sizeBytes),
    tags: row.tags,
    notes: row.notes ?? undefined,
    transcriptStatus: row.transcriptStatus,
    hasPendingUploads: row.hasPendingUploads,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
