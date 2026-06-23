import type { SearchQuery } from '@echovault/shared';

/**
 * Builds a Postgres full-text search query for recordings using `tsvector` /
 * `websearch_to_tsquery`, with `ts_rank` ordering. Pure — returns SQL + an
 * ordered params array — so the (easy-to-get-wrong) SQL and parameter indexing
 * are unit-testable without a database.
 *
 * The recording vector weights title (A) > tags (B) > notes (C). Transcript
 * text is matched/ranked too when `includeTranscript` is set. The exact vector
 * expressions are mirrored by the optional GIN indexes in
 * prisma/sql/0001_fts_indexes.sql so the planner can use them; correctness does
 * not depend on those indexes existing (they're a performance optimization).
 */
export const RECORDING_TSV =
  "(setweight(to_tsvector('english', coalesce(r.title, '')), 'A') || " +
  "setweight(to_tsvector('english', coalesce(r.notes, '')), 'C') || " +
  "setweight(to_tsvector('english', array_to_string(r.tags, ' ')), 'B'))";

export const TRANSCRIPT_TSV = "to_tsvector('english', coalesce(t.text, ''))";

export interface BuiltFts {
  sql: string;
  countSql: string;
  /** Ordered params for $1..$N, shared by both `sql` and `countSql`. */
  params: unknown[];
  page: number;
  pageSize: number;
}

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 20;

export function buildFtsQuery(ownerId: string, query: SearchQuery): BuiltFts {
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, query.pageSize ?? DEFAULT_PAGE_SIZE));
  const skip = (page - 1) * pageSize;
  const includeTranscript = Boolean(query.includeTranscript);

  // $1 = search text, $2 = owner id, then optional filters.
  const params: unknown[] = [(query.q ?? '').trim(), ownerId];
  const where: string[] = ['r."ownerId" = $2'];

  where.push(
    includeTranscript
      ? `(${RECORDING_TSV} @@ query OR ${TRANSCRIPT_TSV} @@ query)`
      : `${RECORDING_TSV} @@ query`,
  );

  if (query.sourceType) {
    params.push(query.sourceType);
    where.push(`r."sourceType"::text = $${params.length}`);
  }
  if (query.tags && query.tags.length > 0) {
    const placeholders = query.tags.map((tag) => {
      params.push(tag);
      return `$${params.length}`;
    });
    where.push(`r.tags && ARRAY[${placeholders.join(', ')}]::text[]`);
  }
  if (query.from) {
    params.push(new Date(query.from));
    where.push(`r."startedAt" >= $${params.length}`);
  }
  if (query.to) {
    params.push(new Date(query.to));
    where.push(`r."startedAt" <= $${params.length}`);
  }

  const join = includeTranscript ? 'LEFT JOIN transcripts t ON t."recordingId" = r.id' : '';
  const from = `FROM recordings r ${join} , websearch_to_tsquery('english', $1) query`;
  const whereSql = where.join(' AND ');

  const rank = includeTranscript
    ? `ts_rank(${RECORDING_TSV}, query) + COALESCE(ts_rank(${TRANSCRIPT_TSV}, query), 0)`
    : `ts_rank(${RECORDING_TSV}, query)`;

  // pageSize/skip are clamped integers — safe to inline (not user strings).
  const sql =
    `SELECT r.*, ${rank} AS rank ${from} WHERE ${whereSql} ` +
    `ORDER BY rank DESC, r."startedAt" DESC LIMIT ${pageSize} OFFSET ${skip}`;
  const countSql = `SELECT COUNT(*)::int AS count ${from} WHERE ${whereSql}`;

  return { sql, countSql, params, page, pageSize };
}
