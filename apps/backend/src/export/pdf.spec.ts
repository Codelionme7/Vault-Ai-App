import { describe, expect, it } from 'vitest';
import { renderSummaryPdf } from './pdf';

describe('renderSummaryPdf', () => {
  it('produces a well-formed PDF', () => {
    const pdf = renderSummaryPdf('Product sync', ['Executive summary', 'We shipped the beta.']);
    const text = pdf.toString('latin1');
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(text).toContain('/Type /Catalog');
    expect(text).toContain('Helvetica');
    expect(text).toContain('startxref');
  });

  it('embeds the title and body text', () => {
    const pdf = renderSummaryPdf('My Meeting', ['Action items']).toString('latin1');
    expect(pdf).toContain('My Meeting');
    expect(pdf).toContain('Action items');
  });

  it('escapes parentheses so the content stream stays valid', () => {
    const pdf = renderSummaryPdf('Title', ['call me (maybe)']).toString('latin1');
    expect(pdf).toContain('call me \\(maybe\\)');
  });

  it('paginates long content into multiple page objects', () => {
    const manyLines = Array.from({ length: 200 }, (_, i) => `Line number ${i}`);
    const pdf = renderSummaryPdf('Long', manyLines).toString('latin1');
    const pageCount = (pdf.match(/\/Type \/Page[^s]/g) ?? []).length;
    expect(pageCount).toBeGreaterThan(1);
  });

  it('handles empty body without throwing', () => {
    expect(() => renderSummaryPdf('Empty', [])).not.toThrow();
  });
});
