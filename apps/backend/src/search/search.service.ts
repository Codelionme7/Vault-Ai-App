import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { Recording, SearchQuery, SearchResult } from '@echovault/shared';
import { PrismaService } from '../common/prisma/prisma.service';
import { toRecordingDto } from '../recordings/recording.mapper';
import { buildRecordingSearch } from './search-query';

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(ownerId: string, query: SearchQuery): Promise<SearchResult> {
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
