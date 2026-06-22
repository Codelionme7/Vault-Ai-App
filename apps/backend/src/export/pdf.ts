/**
 * Minimal, dependency-free PDF writer for summary/notes export. Emits a valid
 * multi-page PDF using the built-in Helvetica font (no font embedding), with
 * correct xref offsets. Pure — returns a Buffer — so it is unit-testable.
 *
 * This avoids pulling a heavy PDF library while still producing files that open
 * in standard viewers.
 */

const PAGE_W = 612; // US Letter, points
const PAGE_H = 792;
const MARGIN = 56;
const FONT_SIZE = 11;
const LEADING = 15.5;
const MAX_CHARS = 95;

function sanitize(line: string): string {
  // WinAnsi-safe: keep printable Latin-1, replace the rest.
  return line.replace(/[^\x20-\x7E\xA0-\xFF]/g, '?');
}

function escapePdf(line: string): string {
  return line.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function wrapLine(line: string, max: number): string[] {
  if (line.length <= max) return [line];
  const words = line.split(' ');
  const out: string[] = [];
  let cur = '';
  for (const w of words) {
    if ((cur + (cur ? ' ' : '') + w).length > max) {
      if (cur) out.push(cur);
      // Hard-break very long words.
      if (w.length > max) {
        for (let i = 0; i < w.length; i += max) out.push(w.slice(i, i + max));
        cur = '';
      } else {
        cur = w;
      }
    } else {
      cur = cur ? `${cur} ${w}` : w;
    }
  }
  if (cur) out.push(cur);
  return out.length ? out : [''];
}

function contentStream(lines: string[]): string {
  const head = `BT\n/F1 ${FONT_SIZE} Tf\n${LEADING} TL\n${MARGIN} ${PAGE_H - MARGIN} Td\n`;
  const body = lines.map((l) => `(${escapePdf(l)}) Tj T*`).join('\n');
  return `${head}${body}\nET`;
}

export function renderSummaryPdf(title: string, bodyLines: string[]): Buffer {
  const maxLinesPerPage = Math.max(1, Math.floor((PAGE_H - 2 * MARGIN) / LEADING));

  const wrapped: string[] = [];
  const header = [title, '='.repeat(Math.min(title.length || 1, MAX_CHARS)), ''];
  for (const l of [...header, ...bodyLines]) wrapped.push(...wrapLine(sanitize(l), MAX_CHARS));

  const pages: string[][] = [];
  for (let i = 0; i < wrapped.length; i += maxLinesPerPage) {
    pages.push(wrapped.slice(i, i + maxLinesPerPage));
  }
  if (pages.length === 0) pages.push(['']);

  const byNum = new Map<number, string>();
  byNum.set(1, '<< /Type /Catalog /Pages 2 0 R >>');
  byNum.set(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');

  const pageObjNums: number[] = [];
  let next = 4;
  for (const pageLines of pages) {
    const contentNum = next++;
    const pageNum = next++;
    pageObjNums.push(pageNum);
    const stream = contentStream(pageLines);
    byNum.set(
      contentNum,
      `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`,
    );
    byNum.set(
      pageNum,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
        `/Resources << /Font << /F1 3 0 R >> >> /Contents ${contentNum} 0 R >>`,
    );
  }
  byNum.set(
    2,
    `<< /Type /Pages /Kids [${pageObjNums.map((n) => `${n} 0 R`).join(' ')}] /Count ${pageObjNums.length} >>`,
  );

  const totalObjs = byNum.size;
  let out = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const offsets: number[] = new Array(totalObjs + 1).fill(0);
  for (let num = 1; num <= totalObjs; num++) {
    offsets[num] = Buffer.byteLength(out, 'latin1');
    out += `${num} 0 obj\n${byNum.get(num)}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${totalObjs + 1}\n0000000000 65535 f \n`;
  for (let num = 1; num <= totalObjs; num++) {
    out += `${offsets[num].toString().padStart(10, '0')} 00000 n \n`;
  }
  out += `trailer\n<< /Size ${totalObjs + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(out, 'latin1');
}
