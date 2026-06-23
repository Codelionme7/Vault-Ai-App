import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma, Recording as PrismaRecording } from '@prisma/client';
import type { Recording, SearchQuery, SearchResult } from '@echovault/shared';
import type { AppConfig } from '../config/configuration';
import { PrismaService } from '../common/prisma/prisma.service';
import { toRecordingDto } from '../recordings/recording.mapper';
import { buildRecordingSearch } from './search-query';
import { buildFtsQuery } from './fts-query';

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  async search(ownerId: string, query: SearchQuery): Promise<SearchResult> {
    const q = query.q?.trim();
    const ftsEnabled = this.config.get('search', { infer: true }).fts;

    // Full-text path for free-text queries; degrade to structured filtering on
    // any error (e.g. Postgres FTS unavailable) so search never hard-fails.
    if (q && ftsEnabled) {
      try {
        return await this.fullTextSearch(ownerId, query);
      } catch (err) {
        this.logger.warn(`FTS query failed, falling back to LIKE: ${(err as Error).message}`);
      }
    }
    return this.structuredSearch(ownerId, query);
  }

  /** Postgres tsvector / GIN ranked search. */
  private async fullTextSearch(ownerId: string, query: SearchQuery): Promise<SearchResult> {
    const built = buildFtsQuery(ownerId, query);
    const [rows, countRows] = await this.prisma.$transaction([
      this.prisma.$queryRawUnsafe<PrismaRecording[]>(built.sql, ...built.params),
      this.prisma.$queryRawUnsafe<Array<{ count: number | bigint }>>(
        built.countSql,
        ...built.params,
      ),
    ]);
    const items: Recording[] = rows.map(toRecordingDto);
    const total = Number(countRows[0]?.count ?? 0);
    return { items, total, page: built.page, pageSize: built.pageSize, query };
  }

  /** Owner-scoped structured filtering (also the no-`q` browse path). */
  private async structuredSearch(ownerId: string, query: SearchQuery): Promise<SearchResult> {
    const built = buildRecordingSearch(ownerId, query);
    const where = built.where as Prisma.RecordingWhereInput;

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.recording.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        skip: built.skip,
        take: built.take,
      }),
      this.prisma.recording.count({ where }),
    ]);

    const items: Recording[] = rows.map(toRecordingDto);
    return { items, total, page: built.page, pageSize: built.pageSize, query };
  }
}
