import { useEffect, useState } from 'react';
import { RecoveryManager, type RecoverableSession } from '@echovault/audio-engine';
import { formatBytes, formatDuration } from '../lib/format';

/**
 * On launch, surface any recording session that was interrupted (the app/tab
 * died before it closed cleanly) and let the user recover or discard it.
 */
export function RecoveryBanner() {
  const [sessions, setSessions] = useState<RecoverableSession[]>([]);
  const [manager] = useState(() => new RecoveryManager());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    manager
      .findRecoverable()
      .then(setSessions)
      .catch(() => undefined);
  }, [manager]);

  if (sessions.length === 0) return null;

  const download = async (sessionId: string) => {
    setBusy(true);
    try {
      const channels = await manager.reassemble(sessionId);
      for (const ch of channels) {
        const url = URL.createObjectURL(ch.blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${sessionId}-${ch.channel}.webm`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } finally {
      setBusy(false);
    }
  };

  const discard = async (sessionId: string) => {
    await manager.discard(sessionId);
    setSessions((s) => s.filter((x) => x.manifest.sessionId !== sessionId));
  };

  return (
    <div className="recovery">
      <div className="recovery__head">⚠ Interrupted recordings recovered</div>
      {sessions.map(({ manifest, plan, hasGaps }) => (
        <div key={manifest.sessionId} className="recovery__item">
          <div>
            <strong>{manifest.title}</strong>
            <div className="recovery__meta">
              {formatDuration(plan.totalDurationMs)} · {formatBytes(plan.totalBytes)}
              {hasGaps && <span className="recovery__gap"> · partial (some chunks missing)</span>}
            </div>
          </div>
          <div className="recovery__actions">
            <button className="btn btn--ghost" disabled={busy} onClick={() => download(manifest.sessionId)}>
              Download audio
            </button>
            <button className="btn btn--ghost" onClick={() => discard(manifest.sessionId)}>
              Discard
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
