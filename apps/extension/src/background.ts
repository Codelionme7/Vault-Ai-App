/**
 * MV3 service worker — orchestrates tab-audio capture.
 *
 * Service workers can't use MediaRecorder, so the actual recording runs in an
 * offscreen document (which CAN). The worker's job is lifecycle: mint a tab
 * capture stream id, spin up the offscreen doc, relay state to the popup, and
 * surface detected meeting metadata from content scripts.
 */
import type { SessionMetadata } from '@echovault/shared';
import { type CaptureState, DEFAULT_STATE, type ExtMessage } from './types';

let state: CaptureState = { ...DEFAULT_STATE };
/** Latest meeting metadata reported by a content script, keyed by tabId. */
const meetInfoByTab = new Map<number, SessionMetadata>();

async function persist(): Promise<void> {
  await chrome.storage.session.set({ captureState: state });
}

async function setBadge(recording: boolean): Promise<void> {
  await chrome.action.setBadgeText({ text: recording ? 'REC' : '' });
  if (recording) await chrome.action.setBadgeBackgroundColor({ color: '#ff5c6c' });
}

async function ensureOffscreen(): Promise<void> {
  const has = await chrome.offscreen.hasDocument();
  if (has) return;
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: [chrome.offscreen.Reason.USER_MEDIA],
    justification: 'Record tab audio with MediaRecorder (not available in a service worker).',
  });
}

async function startCapture(tabId: number, meta: SessionMetadata): Promise<void> {
  if (state.recording) return;

  // Mint a stream id bound to the target tab; consumed in the offscreen doc.
  const streamId = await new Promise<string>((resolve, reject) => {
    chrome.tabCapture.getMediaStreamId({ targetTabId: tabId }, (id) => {
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(err.message));
      else resolve(id);
    });
  });
  await ensureOffscreen();

  const sessionId = crypto.randomUUID();
  const merged: SessionMetadata = { ...(meetInfoByTab.get(tabId) ?? {}), ...meta };

  const msg: ExtMessage = { type: 'OFFSCREEN_START', streamId, sessionId, meta: merged };
  await chrome.runtime.sendMessage(msg);

  state = {
    recording: true,
    sessionId,
    tabId,
    startedAt: Date.now(),
    durationMs: 0,
    sizeBytes: 0,
    chunkCount: 0,
    meta: merged,
  };
  await persist();
  await setBadge(true);
}

async function stopCapture(): Promise<void> {
  if (!state.recording) return;
  await chrome.runtime.sendMessage({ type: 'OFFSCREEN_STOP' } satisfies ExtMessage);
  state = { ...state, recording: false };
  await persist();
  await setBadge(false);
}

chrome.runtime.onMessage.addListener((message: ExtMessage, sender, sendResponse) => {
  (async () => {
    switch (message.type) {
      case 'START_CAPTURE':
        await startCapture(message.tabId, message.meta);
        sendResponse({ type: 'STATE', state });
        break;
      case 'STOP_CAPTURE':
        await stopCapture();
        sendResponse({ type: 'STATE', state });
        break;
      case 'GET_STATE': {
        const stored = await chrome.storage.session.get('captureState');
        if (stored.captureState) state = stored.captureState as CaptureState;
        sendResponse({ type: 'STATE', state });
        break;
      }
      case 'OFFSCREEN_PROGRESS':
        state = {
          ...state,
          durationMs: message.durationMs,
          sizeBytes: message.sizeBytes,
          chunkCount: message.chunkCount,
        };
        await persist();
        break;
      case 'MEET_INFO': {
        const tabId = sender.tab?.id;
        if (tabId != null) meetInfoByTab.set(tabId, message.meta);
        break;
      }
      default:
        break;
    }
  })();
  return true; // keep the message channel open for the async response
});

chrome.tabs.onRemoved.addListener((tabId) => meetInfoByTab.delete(tabId));
