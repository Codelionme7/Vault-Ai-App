import { describe, expect, it } from 'vitest';
import { splitSentences, summarizeText } from './summarize';

describe('splitSentences', () => {
  it('splits on sentence boundaries and trims', () => {
    expect(splitSentences('Hello world. How are you? Fine!')).toEqual([
      'Hello world.',
      'How are you?',
      'Fine!',
    ]);
  });
  it('collapses whitespace and ignores empties', () => {
    expect(splitSentences('  a.   b.  ')).toEqual(['a.', 'b.']);
  });
});

describe('summarizeText', () => {
  const transcript = [
    'Welcome everyone to the product sync.',
    'We decided to ship the recorder beta next week.',
    'What should we do about the storage costs?',
    "I'll prepare the migration plan by Friday.",
    "Let's follow up on the pricing in the next meeting.",
    'The team agreed to prioritize crash recovery.',
  ].join(' ');

  it('builds a short executive summary from the opening sentences', () => {
    const s = summarizeText(transcript);
    expect(s.executiveSummary).toContain('Welcome everyone');
    expect(s.executiveSummary.length).toBeGreaterThan(0);
  });

  it('extracts questions', () => {
    const s = summarizeText(transcript);
    expect(s.questionsAsked).toContain('What should we do about the storage costs?');
  });

  it('extracts action items', () => {
    const s = summarizeText(transcript);
    expect(s.actionItems.some((a) => a.includes('migration plan'))).toBe(true);
  });

  it('extracts decisions', () => {
    const s = summarizeText(transcript);
    expect(s.keyDecisions.some((d) => d.includes('ship the recorder beta'))).toBe(true);
    expect(s.keyDecisions.some((d) => d.includes('agreed to prioritize'))).toBe(true);
  });

  it('extracts follow-ups', () => {
    const s = summarizeText(transcript);
    expect(s.followUps.some((f) => f.includes('follow up on the pricing'))).toBe(true);
  });

  it('renders meeting notes as bullet points', () => {
    const s = summarizeText(transcript);
    expect(s.meetingNotes.startsWith('- ')).toBe(true);
  });

  it('handles empty transcripts gracefully', () => {
    const s = summarizeText('');
    expect(s.executiveSummary).toBe('');
    expect(s.actionItems).toEqual([]);
    expect(s.questionsAsked).toEqual([]);
  });
});
