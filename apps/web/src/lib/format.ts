/** Display helpers. Pure + unit-tested. */

/** Milliseconds -> "H:MM:SS" (or "M:SS" under an hour). */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const mm = m.toString().padStart(2, '0');
  const ss = s.toString().padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

/** Bytes -> human-readable (KB/MB/GB, base 1024). */
export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(value >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

/** Relative-ish date for the library list. */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const SOURCE_LABELS: Record<string, string> = {
  google_meet: 'Google Meet',
  zoom_web: 'Zoom',
  teams_web: 'Teams',
  youtube: 'YouTube',
  podcast: 'Podcast',
  webinar: 'Webinar',
  course: 'Course',
  interview: 'Interview',
  manual: 'Manual',
};

export function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source;
}
