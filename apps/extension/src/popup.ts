/**
 * Popup UI. Shows the active tab's detected source, drives start/stop, polls
 * live capture state, and lists recordings saved locally (IndexedDB) with
 * download — the popup is a real extension page so it can trigger downloads and
 * share the offscreen document's IndexedDB.
 */
import {
  IndexedDBRecoveryStore,
  RecoveryManager,
  type RecoveryManifest,
} from '@echovault/audio-engine';
import { detectSourceFromUrl, type SessionMetadata } from '@echovault/shared';
import type { CaptureState, ExtMessage } from './types';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const SOURCE_LABELS: Record<string, string> = {
  google_meet: 'Google Meet',
  zoom_web: 'Zoom',
  teams_web: 'Microsoft Teams',
  youtube: 'YouTube',
  podcast: 'Podcast',
  course: 'Course',
  manual: 'Browser tab',
};

const store = new IndexedDBRecoveryStore();
const manager = new RecoveryManager(store);
let activeTab: chrome.tabs.Tab | undefined;
let pollTimer: number | undefined;

function fmtDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = (s % 60).toString().padStart(2, '0');
  return h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

function fmtBytes(b: number): string {
  if (b <= 0) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(u.length - 1, Math.floor(Math.log(b) / Math.log(1024)));
  return `${(b / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${u[i]}`;
}

async function getActiveTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function renderSource(tab: chrome.tabs.Tab | undefined): void {
  const url = tab?.url ?? '';
  const source = detectSourceFromUrl(url);
  $('source-type').textContent = SOURCE_LABELS[source] ?? 'Browser tab';
  $('source-title').textContent = tab?.title ?? 'Current tab';
}

function renderState(state: CaptureState): void {
  const badge = $('badge');
  const live = $('live');
  const toggle = $<HTMLButtonElement>('toggle');

  if (state.recording) {
    badge.textContent = 'REC';
    live.hidden = false;
    $('timer').textContent = fmtDuration(state.durationMs);
    $('chunks').textContent = `${state.chunkCount} chunks`;
    $('size').textContent = fmtBytes(state.sizeBytes);
    toggle.textContent = '■ Stop recording';
    toggle.className = 'btn btn--stop';
    if (state.meta?.detectedTitle) $('source-title').textContent = state.meta.detectedTitle;
  } else {
    badge.textContent = '';
    live.hidden = true;
    toggle.textContent = '● Start recording';
    toggle.className = 'btn btn--record';
  }
}

async function refreshState(): Promise<void> {
  const res = (await chrome.runtime.sendMessage({ type: 'GET_STATE' } satisfies ExtMessage)) as
    | { type: 'STATE'; state: CaptureState }
    | undefined;
  if (res?.state) {
    renderState(res.state);
    if (res.state.recording && pollTimer === undefined) {
      pollTimer = window.setInterval(refreshState, 1000);
    } else if (!res.state.recording && pollTimer !== undefined) {
      clearInterval(pollTimer);
      pollTimer = undefined;
      void renderSaved();
    }
  }
}

async function onToggle(): Promise<void> {
  const res = (await chrome.runtime.sendMessage({ type: 'GET_STATE' } satisfies ExtMessage)) as
    | { type: 'STATE'; state: CaptureState }
    | undefined;
  const recording = res?.state.recording ?? false;

  if (recording) {
    await chrome.runtime.sendMessage({ type: 'STOP_CAPTURE' } satisfies ExtMessage);
  } else if (activeTab?.id != null) {
    const meta: SessionMetadata = {
      sourceType: detectSourceFromUrl(activeTab.url),
      sourceUrl: activeTab.url,
      detectedTitle: activeTab.title,
    };
    await chrome.runtime.sendMessage({
      type: 'START_CAPTURE',
      tabId: activeTab.id,
      meta,
    } satisfies ExtMessage);
  }
  await refreshState();
}

async function renderSaved(): Promise<void> {
  const list = $('saved-list');
  let manifests: RecoveryManifest[] = [];
  try {
    manifests = await store.listManifests();
  } catch {
    manifests = [];
  }
  manifests.sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));

  if (manifests.length === 0) {
    list.innerHTML = '<li class="empty">No local recordings yet.</li>';
    return;
  }

  list.innerHTML = '';
  for (const m of manifests) {
    const li = document.createElement('li');
    li.className = 'saved__item';
    const info = document.createElement('div');
    info.innerHTML = `<div class="t">${escapeHtml(m.title)}</div><div class="m">${new Date(
      m.startedAt,
    ).toLocaleString()}</div>`;
    const dl = document.createElement('button');
    dl.className = 'saved__dl';
    dl.textContent = 'Download';
    dl.onclick = () => void download(m.sessionId);
    li.append(info, dl);
    list.append(li);
  }
}

async function download(sessionId: string): Promise<void> {
  const channels = await manager.reassemble(sessionId);
  for (const ch of channels) {
    const url = URL.createObjectURL(ch.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `echovault-${sessionId.slice(0, 8)}-${ch.channel}.webm`;
    a.click();
    URL.revokeObjectURL(url);
  }
}

function escapeHtml(s: string): string {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

async function init(): Promise<void> {
  activeTab = await getActiveTab();
  renderSource(activeTab);
  $('toggle').addEventListener('click', () => void onToggle());
  await refreshState();
  await renderSaved();
}

void init();
