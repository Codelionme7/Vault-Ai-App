import { summarizeText, type StructuredSummary } from './summarize';

export type { StructuredSummary };

/** Pluggable summarizer backend. */
export interface Summarizer {
  readonly name: string;
  summarize(text: string): Promise<StructuredSummary>;
}

/**
 * Offline, dependency-free summarizer (wraps the heuristic extractor). Always
 * available — guarantees the summary feature works with zero AI configured, and
 * serves as the fallback when an LLM summarizer errors out.
 */
export class HeuristicSummarizer implements Summarizer {
  readonly name = 'heuristic';
  async summarize(text: string): Promise<StructuredSummary> {
    return summarizeText(text);
  }
}

/** Empty-but-valid summary, used when there's nothing to summarize. */
export function emptySummary(): StructuredSummary {
  return {
    executiveSummary: '',
    meetingNotes: '',
    actionItems: [],
    keyDecisions: [],
    questionsAsked: [],
    followUps: [],
  };
}
