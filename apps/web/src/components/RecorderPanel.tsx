import { useState } from 'react';
import type { SourceType } from '@echovault/shared';
import { useRecorder } from '../hooks/useRecorder';
import { formatBytes, formatDuration } from '../lib/format';
import { LevelMeter } from './LevelMeter';

const SOURCE_OPTIONS: { value: SourceType; label: string }[] = [
  { value: 'manual', label: 'Manual / Voice memo' },
  { value: 'google_meet', label: 'Google Meet' },
  { value: 'zoom_web', label: 'Zoom' },
  { value: 'teams_web', label: 'Microsoft Teams' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'podcast', label: 'Podcast' },
  { value: 'webinar', label: 'Webinar' },
  { value: 'interview', label: 'Interview' },
];

export function RecorderPanel({ onFinished }: { onFinished: () => void }) {
  const { state, start, pause, resume, stop, reset } = useRecorder();
  const [title, setTitle] = useState('');
  const [captureTab, setCaptureTab] = useState(true);
  const [captureMic, setCaptureMic] = useState(false);
  const [sourceType, setSourceType] = useState<SourceType>('manual');

  const isIdle = state.status === 'idle' || state.status === 'error';
  const isLive = state.status === 'recording' || state.status === 'paused';
  const isStopped = state.status === 'stopped';

  return (
    <div className="panel recorder">
      <div className="recorder__status">
        <span className={`dot dot--${state.status}`} />
        <span className="recorder__statustext">{statusLabel(state.status)}</span>
      </div>

      <div className="recorder__timer">{formatDuration(state.durationMs)}</div>

      <div className="recorder__stats">
        <Stat label="Chunks" value={String(state.chunkCount)} />
        <Stat label="Stored" value={formatBytes(state.sizeBytes)} />
        <Stat label="Pending sync" value={String(state.pendingUploads)} />
      </div>

      {(isLive || isStopped) && (
        <div className="recorder__meters">
          <LevelMeter label="Tab audio" level={state.levels.tab} />
          <LevelMeter label="Microphone" level={state.levels.mic} />
        </div>
      )}

      {isIdle && (
        <div className="recorder__setup">
          <label className="field">
            <span>Title</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Product sync — Jun 22"
            />
          </label>
          <label className="field">
            <span>Source type</span>
            <select value={sourceType} onChange={(e) => setSourceType(e.target.value as SourceType)}>
              {SOURCE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <div className="recorder__sources">
            <label className="check">
              <input
                type="checkbox"
                checked={captureTab}
                onChange={(e) => setCaptureTab(e.target.checked)}
              />
              <span>Browser tab audio</span>
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={captureMic}
                onChange={(e) => setCaptureMic(e.target.checked)}
              />
              <span>Microphone</span>
            </label>
          </div>
        </div>
      )}

      {state.error && <div className="alert alert--error">{state.error}</div>}
      {state.warning && <div className="alert alert--warn">{state.warning}</div>}

      <div className="recorder__controls">
        {isIdle && (
          <button
            className="btn btn--record"
            disabled={!captureTab && !captureMic}
            onClick={() => start({ title, captureTab, captureMic, sourceType })}
          >
            ● Start recording
          </button>
        )}
        {state.status === 'recording' && (
          <>
            <button className="btn" onClick={pause}>
              ⏸ Pause
            </button>
            <button className="btn btn--stop" onClick={stop}>
              ■ Stop
            </button>
          </>
        )}
        {state.status === 'paused' && (
          <>
            <button className="btn" onClick={resume}>
              ▶ Resume
            </button>
            <button className="btn btn--stop" onClick={stop}>
              ■ Stop
            </button>
          </>
        )}
        {isStopped && (
          <>
            <button
              className="btn btn--record"
              onClick={() => {
                reset();
                onFinished();
              }}
            >
              ✓ Done — view library
            </button>
            <button className="btn" onClick={reset}>
              Record another
            </button>
          </>
        )}
      </div>

      <p className="recorder__hint">
        Audio is saved to your device the moment it is captured, in 5-minute chunks. A crash, a
        closed tab, or a dropped connection can cost at most one chunk — everything else is
        recoverable.
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <div className="stat__value">{value}</div>
      <div className="stat__label">{label}</div>
    </div>
  );
}

function statusLabel(status: string): string {
  switch (status) {
    case 'recording':
      return 'Recording';
    case 'paused':
      return 'Paused';
    case 'starting':
      return 'Starting…';
    case 'stopping':
      return 'Finalizing…';
    case 'stopped':
      return 'Saved';
    case 'error':
      return 'Error';
    default:
      return 'Ready';
  }
}
