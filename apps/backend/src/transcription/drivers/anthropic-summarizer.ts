import Anthropic from '@anthropic-ai/sdk';
import { emptySummary, type StructuredSummary, type Summarizer } from '../summarizer';

/**
 * Claude-powered summarizer (Anthropic SDK). Produces a richer, structured
 * meeting summary than the heuristic extractor.
 *
 * Model: claude-opus-4-8 (overridable via ANTHROPIC_MODEL). We ask the model
 * for a strict JSON object and parse it defensively; the caller falls back to
 * the heuristic summarizer if anything here throws, so a bad key, a refusal, or
 * malformed output never blocks transcription.
 *
 * Note: when the installed SDK/model gains structured outputs
 * (`output_config.format`) and adaptive thinking, those can replace the
 * prompt-enforced JSON below — see the claude-api guidance.
 */
const MAX_INPUT_CHARS = 600_000; // ~150k tokens; Opus 4.8 has a 1M context window

export const SUMMARY_SYSTEM_PROMPT = [
  'You are an expert meeting-notes assistant.',
  'Summarize the transcript faithfully — never invent facts, names, numbers, or decisions that are not supported by the text.',
  'Respond with ONLY a single JSON object (no markdown fences, no prose) matching exactly this shape:',
  '{',
  '  "executiveSummary": string,        // 2-4 sentence overview',
  '  "meetingNotes": string,            // concise markdown bullet notes',
  '  "actionItems": string[],           // concrete tasks, each with owner if stated',
  '  "keyDecisions": string[],          // decisions actually made',
  '  "questionsAsked": string[],        // open/answered questions raised',
  '  "followUps": string[]              // explicit follow-ups / next steps',
  '}',
  'Use empty strings/arrays where a section has no content. Keep each list item to one line.',
].join('\n');

export function buildSummaryUserPrompt(text: string): string {
  const clipped =
    text.length > MAX_INPUT_CHARS
      ? `${text.slice(0, MAX_INPUT_CHARS)}\n\n[transcript truncated for length]`
      : text;
  return `Transcript:\n\n${clipped}`;
}

function toStringArray(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item === 'string') {
      const trimmed = item.trim();
      if (trimmed) out.push(trimmed);
    }
    if (out.length >= limit) break;
  }
  return out;
}

function toStr(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Parse the model's response into a StructuredSummary. Tolerates leading/
 * trailing prose or markdown fences by extracting the outermost JSON object.
 * Throws if no JSON object is present (so the caller can fall back).
 */
export function parseSummaryResponse(raw: string): StructuredSummary {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('Summarizer response contained no JSON object');
  }
  const parsed = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
  return {
    executiveSummary: toStr(parsed.executiveSummary),
    meetingNotes: toStr(parsed.meetingNotes),
    actionItems: toStringArray(parsed.actionItems, 30),
    keyDecisions: toStringArray(parsed.keyDecisions, 20),
    questionsAsked: toStringArray(parsed.questionsAsked, 30),
    followUps: toStringArray(parsed.followUps, 20),
  };
}

export class AnthropicSummarizer implements Summarizer {
  readonly name = 'anthropic';
  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    private readonly model = 'claude-opus-4-8',
  ) {
    this.client = new Anthropic({ apiKey });
  }

  async summarize(text: string): Promise<StructuredSummary> {
    if (!text.trim()) return emptySummary();

    // Stream to stay clear of HTTP timeouts on long transcripts; collect the
    // final message and parse the JSON it returns.
    const stream = this.client.messages.stream({
      model: this.model,
      max_tokens: 4096,
      system: SUMMARY_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildSummaryUserPrompt(text) }],
    });
    const message = await stream.finalMessage();

    if (message.stop_reason === 'refusal') {
      throw new Error('Summarizer request was refused');
    }
    const textOut = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n');
    return parseSummaryResponse(textOut);
  }
}
