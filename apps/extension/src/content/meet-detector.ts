/**
 * Google Meet detector (content script). Best-effort extraction of meeting
 * context — title, code, participant count, start time — reported to the
 * service worker. This is metadata only; it never gates or blocks audio capture
 * (audio is the priority, captions/metadata are nice-to-haves).
 */
import { detectSourceFromUrl, type SessionMetadata } from '@echovault/shared';
import type { ExtMessage } from '../types';

const startedAt = new Date().toISOString();

function meetingCode(): string | undefined {
  // Meet URLs look like https://meet.google.com/abc-defg-hij
  const m = location.pathname.match(/([a-z]{3}-[a-z]{4}-[a-z]{3})/i);
  return m?.[1];
}

function detectedTitle(): string {
  const code = meetingCode();
  // document.title is often "<name> - Google Meet" once in a call.
  const title = document.title.replace(/\s*-\s*Google Meet\s*$/i, '').trim();
  if (title && title.toLowerCase() !== 'meet') return title;
  return code ? `Meet ${code}` : 'Google Meet';
}

function participantCount(): number | undefined {
  // Meet renders a people count near the toolbar; selectors are unstable, so we
  // probe a few aria-labels and digit-only nodes and take the best guess.
  const candidates = Array.from(
    document.querySelectorAll('[aria-label*="participant" i], [aria-label*="people" i]'),
  );
  for (const el of candidates) {
    const label = el.getAttribute('aria-label') ?? '';
    const num = label.match(/\d+/);
    if (num) return Number(num[0]);
  }
  return undefined;
}

function collect(): SessionMetadata {
  return {
    sourceType: detectSourceFromUrl(location.href),
    sourceUrl: location.href,
    detectedTitle: detectedTitle(),
    participantCount: participantCount(),
    meetingStartedAt: startedAt,
    extra: { meetingCode: meetingCode() },
  };
}

let lastSent = '';
function report(): void {
  const meta = collect();
  const serialized = JSON.stringify(meta);
  if (serialized === lastSent) return;
  lastSent = serialized;
  chrome.runtime.sendMessage({ type: 'MEET_INFO', meta } satisfies ExtMessage).catch(() => {
    // Service worker may be asleep; it will re-query on demand.
  });
}

// Report now, on DOM changes (throttled), and periodically as a safety net.
report();
let throttle: number | undefined;
const observer = new MutationObserver(() => {
  if (throttle) return;
  throttle = window.setTimeout(() => {
    throttle = undefined;
    report();
  }, 2000);
});
observer.observe(document.body, { childList: true, subtree: true });
setInterval(report, 15_000);
