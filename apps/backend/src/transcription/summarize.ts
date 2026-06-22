/**
 * Dependency-free, offline summarizer. Produces a structured summary from a
 * transcript using lightweight heuristics. This guarantees the "summary"
 * feature works with zero external AI configured; when an LLM key is present a
 * richer summarizer can be swapped in behind the same shape.
 *
 * Pure and unit-tested.
 */
export interface StructuredSummary {
  executiveSummary: string;
  meetingNotes: string;
  actionItems: string[];
  keyDecisions: string[];
  questionsAsked: string[];
  followUps: string[];
}

const ACTION_RE = /\b(will|need to|should|let'?s|todo|to-do|action item|assign(?:ed)?|i'?ll|we'?ll)\b/i;
const DECISION_RE = /\b(decided|decision|agree(?:d)?|conclude(?:d)?|go with|chosen|approved)\b/i;
const FOLLOWUP_RE = /\b(follow[- ]?up|next step|circle back|revisit|check in)\b/i;

export function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function dedupeTop(items: string[], limit: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}

export function summarizeText(text: string): StructuredSummary {
  const sentences = splitSentences(text);

  const questions = sentences.filter((s) => s.endsWith('?'));
  const actions = sentences.filter((s) => ACTION_RE.test(s) && !s.endsWith('?'));
  const decisions = sentences.filter((s) => DECISION_RE.test(s));
  const followUps = sentences.filter((s) => FOLLOWUP_RE.test(s));

  const executiveSummary = sentences.slice(0, 3).join(' ');
  const meetingNotes = sentences
    .slice(0, 12)
    .map((s) => `- ${s}`)
    .join('\n');

  return {
    executiveSummary,
    meetingNotes,
    actionItems: dedupeTop(actions, 15),
    keyDecisions: dedupeTop(decisions, 10),
    questionsAsked: dedupeTop(questions, 15),
    followUps: dedupeTop(followUps, 10),
  };
}
