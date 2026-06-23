import type { SearchQuery } from '@echovault/shared';

/**
 * Pure translation of a SearchQuery into a Prisma `where` object. Kept free of
 * any @prisma/client import so the filter logic — easy to get subtly wrong — is
 * unit-testable without a database or generated client.
 */
export interface BuiltSearch {
  where: Record<string, unknown>;
  skip: number;
  take: number;
  page: number;
  pageSize: number;
}

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 20;

export function buildRecordingSearch(ownerId: string, query: SearchQuery): BuiltSearch {
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, query.pageSize ?? DEFAULT_PAGE_SIZE));

  const where: Record<string, unknown> = { ownerId };

  if (query.sourceType) where.sourceType = query.sourceType;

  if (query.tags && query.tags.length > 0) {
    where.tags = { hasSome: query.tags };
  }

  if (query.from || query.to) {
    const startedAt: Record<string, Date> = {};
    if (query.from) startedAt.gte = new Date(query.from);
    if (query.to) startedAt.lte = new Date(query.to);
    where.startedAt = startedAt;
  }

  const q = query.q?.trim();
  if (q) {
    const or: Array<Record<string, unknown>> = [
      { title: { contains: q, mode: 'insensitive' } },
      { notes: { contains: q, mode: 'insensitive' } },
    ];
    if (query.includeTranscript) {
      or.push({ transcript: { is: { text: { contains: q, mode: 'insensitive' } } } });
    }
    where.OR = or;
  }

  return {
    where,
    skip: (page - 1) * pageSize,
    take: pageSize,
    page,
    pageSize,
  };
}
