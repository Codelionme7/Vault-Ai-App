/**
 * Where a recording came from. Smart session detection maps a tab URL /
 * meeting context to one of these so the library can be organized without the
 * user having to tag anything manually.
 */
export type SourceType =
  | 'google_meet'
  | 'zoom_web'
  | 'teams_web'
  | 'youtube'
  | 'podcast'
  | 'webinar'
  | 'course'
  | 'interview'
  | 'manual';

export const SOURCE_TYPES: SourceType[] = [
  'google_meet',
  'zoom_web',
  'teams_web',
  'youtube',
  'podcast',
  'webinar',
  'course',
  'interview',
  'manual',
];

/**
 * Metadata captured opportunistically at recording time. Everything here is
 * best-effort — audio capture must never block on, or fail because of, missing
 * metadata.
 */
export interface SessionMetadata {
  sourceType: SourceType;
  /** Original tab/page URL, if captured from a browser tab. */
  sourceUrl?: string;
  /** Detected meeting/video/page title. */
  detectedTitle?: string;
  /** Participant count when detectable (e.g. Google Meet). */
  participantCount?: number;
  /** When the meeting itself started (may differ from recording start). */
  meetingStartedAt?: string;
  /** Free-form extra data a detector wants to persist. */
  extra?: Record<string, unknown>;
}

/**
 * Heuristic detection of a source type from a URL. Pure and dependency-free so
 * it can run in the extension's content script, the web app, and the backend.
 */
export function detectSourceFromUrl(url: string | undefined): SourceType {
  if (!url) return 'manual';
  let host = '';
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return 'manual';
  }
  if (host.endsWith('meet.google.com') || host === 'meet.google.com') return 'google_meet';
  if (host.includes('zoom.us')) return 'zoom_web';
  if (host.includes('teams.microsoft.com') || host.includes('teams.live.com')) return 'teams_web';
  if (host.includes('youtube.com') || host.includes('youtu.be')) return 'youtube';
  if (host.includes('udemy.com') || host.includes('coursera.org') || host.includes('teachable.com'))
    return 'course';
  if (
    host.includes('spotify.com') ||
    host.includes('podcasts.apple.com') ||
    host.includes('podbean.com')
  )
    return 'podcast';
  return 'manual';
}
