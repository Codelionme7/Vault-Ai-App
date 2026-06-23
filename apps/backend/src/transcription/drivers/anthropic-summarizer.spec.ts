import { describe, expect, it } from 'vitest';
import { buildSummaryUserPrompt, parseSummaryResponse } from './anthropic-summarizer';

describe('buildSummaryUserPrompt', () => {
  it('includes the transcript', () => {
    expect(buildSummaryUserPrompt('hello world')).toContain('hello world');
  });
  it('truncates very long transcripts with a marker', () => {
    const huge = 'a'.repeat(700_000);
    const prompt = buildSummaryUserPrompt(huge);
    expect(prompt).toContain('[transcript truncated for length]');
    expect(prompt.length).toBeLessThan(700_000);
  });
});

describe('parseSummaryResponse', () => {
  it('parses a clean JSON object', () => {
    const raw = JSON.stringify({
      executiveSummary: 'We shipped.',
      meetingNotes: '- point',
      actionItems: ['Write docs'],
      keyDecisions: ['Ship Friday'],
      questionsAsked: ['Pricing?'],
      followUps: ['Revisit pricing'],
    });
    const s = parseSummaryResponse(raw);
    expect(s.executiveSummary).toBe('We shipped.');
    expect(s.actionItems).toEqual(['Write docs']);
    expect(s.followUps).toEqual(['Revisit pricing']);
  });

  it('extracts JSON embedded in prose / markdown fences', () => {
    const raw = 'Here you go:\n```json\n{"executiveSummary":"x","actionItems":["a"]}\n```\nThanks!';
    const s = parseSummaryResponse(raw);
    expect(s.executiveSummary).toBe('x');
    expect(s.actionItems).toEqual(['a']);
  });

  it('defaults missing fields and ignores non-string array items', () => {
    const raw = '{"actionItems":["ok", 5, "", "  trim  "]}';
    const s = parseSummaryResponse(raw);
    expect(s.executiveSummary).toBe('');
    expect(s.meetingNotes).toBe('');
    expect(s.keyDecisions).toEqual([]);
    expect(s.actionItems).toEqual(['ok', 'trim']);
  });

  it('throws when there is no JSON object', () => {
    expect(() => parseSummaryResponse('no json here')).toThrow();
  });
});
