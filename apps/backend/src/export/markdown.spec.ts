import { describe, expect, it } from 'vitest';
import { buildMarkdownNotes, type MarkdownInput } from './markdown';

const base: MarkdownInput = {
  recording: {
    title: 'Product sync',
    sourceType: 'google_meet',
    startedAt: '2026-06-22T10:00:00.000Z',
    durationMs: 3_600_000,
    tags: ['standup', 'q3'],
  },
};

describe('buildMarkdownNotes', () => {
  it('renders a title and metadata block', () => {
    const md = buildMarkdownNotes(base);
    expect(md).toContain('# Product sync');
    expect(md).toContain('**Source:** google_meet');
    expect(md).toContain('**Duration:** 1:00:00');
    expect(md).toContain('**Tags:** standup, q3');
  });

  it('omits empty sections', () => {
    const md = buildMarkdownNotes(base);
    expect(md).not.toContain('## Action items');
    expect(md).not.toContain('## Transcript');
  });

  it('includes summary sections when present', () => {
    const md = buildMarkdownNotes({
      ...base,
      summary: {
        executiveSummary: 'We shipped the beta.',
        meetingNotes: '',
        actionItems: ['Write docs'],
        keyDecisions: ['Ship Friday'],
        questionsAsked: ['What about pricing?'],
        followUps: ['Revisit pricing'],
      },
    });
    expect(md).toContain('## Executive summary');
    expect(md).toContain('- Write docs');
    expect(md).toContain('## Key decisions');
    expect(md).toContain('- What about pricing?');
  });

  it('appends the transcript when segments are provided', () => {
    const md = buildMarkdownNotes({
      ...base,
      segments: [{ startMs: 0, endMs: 1000, text: 'Hello.', speaker: 'A' }],
    });
    expect(md).toContain('## Transcript');
    expect(md).toContain('A: Hello.');
  });

  it('includes user notes when present', () => {
    const md = buildMarkdownNotes({ ...base, recording: { ...base.recording, notes: 'Remember to follow up.' } });
    expect(md).toContain('## Notes');
    expect(md).toContain('Remember to follow up.');
  });
});
