/**
 * Storage-key helpers. Keys are namespaced by owner and recording so a bucket
 * (or local dir) listing is self-describing and per-tenant deletion is a prefix
 * operation. Pure + tested.
 */

const UNSAFE_RUN = /[^a-zA-Z0-9._-]+/g;
const DOT_RUN = /\.{2,}/g;

/**
 * Make a single path segment safe: collapse runs of disallowed characters to a
 * single underscore (separators become `_`), and neutralize `..` traversal
 * while still allowing a single dot for file extensions (e.g. `000001.webm`).
 */
export function safeSegment(input: string): string {
  return input.replace(UNSAFE_RUN, '_').replace(DOT_RUN, '_').slice(0, 128) || '_';
}

/**
 * Reject/clean a full storage key, preventing path traversal. Returns a
 * normalized key using forward slashes with no leading slash or `..`.
 */
export function sanitizeKey(key: string): string {
  const cleaned = key
    .split('/')
    .filter((seg) => seg !== '' && seg !== '.' && seg !== '..')
    .map((seg) => safeSegment(seg))
    .join('/');
  if (!cleaned) throw new Error('Invalid storage key');
  return cleaned;
}

export function buildChunkKey(params: {
  ownerId: string;
  recordingId: string;
  channel: string;
  sequence: number;
  ext?: string;
}): string {
  const { ownerId, recordingId, channel, sequence, ext = 'webm' } = params;
  const seq = sequence.toString().padStart(6, '0');
  return [
    'recordings',
    safeSegment(ownerId),
    safeSegment(recordingId),
    safeSegment(channel),
    `${seq}.${safeSegment(ext)}`,
  ].join('/');
}

export function buildExportKey(ownerId: string, recordingId: string, filename: string): string {
  return ['exports', safeSegment(ownerId), safeSegment(recordingId), safeSegment(filename)].join(
    '/',
  );
}
