import { describe, expect, it } from 'vitest';
import { buildRecordingSearch } from './search-query';

describe('buildRecordingSearch', () => {
  it('always scopes to the owner', () => {
    const built = buildRecordingSearch('user1', {});
    expect(built.where.ownerId).toBe('user1');
  });

  it('applies sane pagination defaults', () => {
    const built = buildRecordingSearch('u', {});
    expect(built.page).toBe(1);
    expect(built.pageSize).toBe(20);
    expect(built.skip).toBe(0);
    expect(built.take).toBe(20);
  });

  it('computes skip from page and pageSize', () => {
    const built = buildRecordingSearch('u', { page: 3, pageSize: 10 });
    expect(built.skip).toBe(20);
    expect(built.take).toBe(10);
  });

  it('clamps oversized page sizes', () => {
    expect(buildRecordingSearch('u', { pageSize: 5000 }).take).toBe(100);
    expect(buildRecordingSearch('u', { pageSize: 0 }).take).toBe(1);
    expect(buildRecordingSearch('u', { page: -2 }).page).toBe(1);
  });

  it('filters by source type', () => {
    const built = buildRecordingSearch('u', { sourceType: 'google_meet' });
    expect(built.where.sourceType).toBe('google_meet');
  });

  it('filters by tags using hasSome', () => {
    const built = buildRecordingSearch('u', { tags: ['standup', 'q3'] });
    expect(built.where.tags).toEqual({ hasSome: ['standup', 'q3'] });
  });

  it('builds a date range on startedAt', () => {
    const built = buildRecordingSearch('u', { from: '2026-01-01', to: '2026-02-01' });
    const range = built.where.startedAt as { gte: Date; lte: Date };
    expect(range.gte).toBeInstanceOf(Date);
    expect(range.lte).toBeInstanceOf(Date);
  });

  it('searches title and notes by default (not transcript)', () => {
    const built = buildRecordingSearch('u', { q: 'roadmap' });
    const or = built.where.OR as Array<Record<string, unknown>>;
    expect(or).toHaveLength(2);
    expect(JSON.stringify(or)).toContain('title');
    expect(JSON.stringify(or)).not.toContain('transcript');
  });

  it('includes transcript text when requested', () => {
    const built = buildRecordingSearch('u', { q: 'roadmap', includeTranscript: true });
    const or = built.where.OR as Array<Record<string, unknown>>;
    expect(or).toHaveLength(3);
    expect(JSON.stringify(or)).toContain('transcript');
  });

  it('ignores blank queries', () => {
    const built = buildRecordingSearch('u', { q: '   ' });
    expect(built.where.OR).toBeUndefined();
  });
});
