import { describe, expect, it } from 'vitest';
import { buildFtsQuery } from './fts-query';

describe('buildFtsQuery', () => {
  it('puts the query text in $1 and owner in $2', () => {
    const built = buildFtsQuery('user1', { q: 'roadmap' });
    expect(built.params[0]).toBe('roadmap');
    expect(built.params[1]).toBe('user1');
    expect(built.sql).toContain("websearch_to_tsquery('english', $1)");
    expect(built.sql).toContain('r."ownerId" = $2');
  });

  it('trims the query text', () => {
    expect(buildFtsQuery('u', { q: '  hello  ' }).params[0]).toBe('hello');
  });

  it('does not join transcripts unless requested', () => {
    const built = buildFtsQuery('u', { q: 'x' });
    expect(built.sql).not.toContain('LEFT JOIN transcripts');
    expect(built.sql).not.toContain('coalesce(t.text');
  });

  it('joins and ranks transcripts when includeTranscript is set', () => {
    const built = buildFtsQuery('u', { q: 'x', includeTranscript: true });
    expect(built.sql).toContain('LEFT JOIN transcripts t ON t."recordingId" = r.id');
    expect(built.sql).toContain('coalesce(t.text');
    expect(built.sql).toContain('COALESCE(ts_rank');
  });

  it('orders by rank then recency', () => {
    expect(buildFtsQuery('u', { q: 'x' }).sql).toContain(
      'ORDER BY rank DESC, r."startedAt" DESC',
    );
  });

  it('adds a source-type filter as a positional param', () => {
    const built = buildFtsQuery('u', { q: 'x', sourceType: 'google_meet' });
    expect(built.params).toContain('google_meet');
    expect(built.sql).toMatch(/r\."sourceType"::text = \$\d+/);
  });

  it('builds a tag-overlap filter with one param per tag', () => {
    const built = buildFtsQuery('u', { q: 'x', tags: ['a', 'b'] });
    expect(built.sql).toMatch(/r\.tags && ARRAY\[\$\d+, \$\d+\]::text\[\]/);
    expect(built.params).toContain('a');
    expect(built.params).toContain('b');
  });

  it('builds a date range on startedAt', () => {
    const built = buildFtsQuery('u', { q: 'x', from: '2026-01-01', to: '2026-02-01' });
    expect(built.sql).toMatch(/r\."startedAt" >= \$\d+/);
    expect(built.sql).toMatch(/r\."startedAt" <= \$\d+/);
    expect(built.params.filter((p) => p instanceof Date)).toHaveLength(2);
  });

  it('clamps pagination and inlines limit/offset', () => {
    const built = buildFtsQuery('u', { q: 'x', page: 3, pageSize: 5000 });
    expect(built.pageSize).toBe(100);
    expect(built.page).toBe(3);
    expect(built.sql).toContain('LIMIT 100 OFFSET 200');
  });

  it('keeps count and main queries sharing the same WHERE/params', () => {
    const built = buildFtsQuery('u', { q: 'x', sourceType: 'podcast' });
    expect(built.countSql).toContain('SELECT COUNT(*)::int AS count');
    expect(built.countSql).toContain('r."sourceType"::text');
    // count query has no LIMIT/OFFSET
    expect(built.countSql).not.toContain('LIMIT');
  });
});
