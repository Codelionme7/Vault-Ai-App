import type { Summary, TranscriptSegment } from '@echovault/shared';
import { toPlainText } from './transcript-format';

export interface MarkdownInput {
  recording: {
    title: string;
    sourceType: string;
    startedAt: string;
    durationMs: number;
    tags: string[];
    notes?: string;
  };
  summary?: Pick<
    Summary,
    | 'executiveSummary'
    | 'meetingNotes'
    | 'actionItems'
    | 'keyDecisions'
    | 'questionsAsked'
    | 'followUps'
  >;
  segments?: TranscriptSegment[];
}

function formatDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = (s % 60).toString().padStart(2, '0');
  return h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

function bulletList(title: string, items: string[]): string {
  if (!items || items.length === 0) return '';
  return `## ${title}\n\n${items.map((i) => `- ${i}`).join('\n')}\n`;
}

/**
 * Render a recording (with optional summary + transcript) into Markdown notes.
 * Pure — easy to unit-test and reused by both the .md export and the ZIP bundle.
 */
export function buildMarkdownNotes(input: MarkdownInput): string {
  const { recording, summary, segments } = input;
  const parts: string[] = [];

  parts.push(`# ${recording.title}\n`);
  parts.push(
    [
      `- **Date:** ${new Date(recording.startedAt).toISOString()}`,
      `- **Source:** ${recording.sourceType}`,
      `- **Duration:** ${formatDuration(recording.durationMs)}`,
      recording.tags.length ? `- **Tags:** ${recording.tags.join(', ')}` : '',
    ]
      .filter(Boolean)
      .join('\n') + '\n',
  );

  if (recording.notes) parts.push(`## Notes\n\n${recording.notes}\n`);

  if (summary) {
    if (summary.executiveSummary) {
      parts.push(`## Executive summary\n\n${summary.executiveSummary}\n`);
    }
    parts.push(bulletList('Action items', summary.actionItems));
    parts.push(bulletList('Key decisions', summary.keyDecisions));
    parts.push(bulletList('Questions asked', summary.questionsAsked));
    parts.push(bulletList('Follow-ups', summary.followUps));
  }

  if (segments && segments.length > 0) {
    parts.push(`## Transcript\n\n${toPlainText(segments)}\n`);
  }

  return parts.filter((p) => p.trim().length > 0).join('\n');
}
