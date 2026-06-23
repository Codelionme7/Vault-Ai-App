import { useCallback, useEffect, useState } from 'react';
import type { Recording } from '@echovault/shared';
import { api } from '../lib/api';
import { downloadServerExport, exportWavClient } from '../lib/export-client';
import { formatBytes, formatDate, formatDuration, sourceLabel } from '../lib/format';
import { TranscriptViewer } from './TranscriptViewer';

export function Library() {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [openMenu, setOpenMenu] = useState<string>();
  const [busy, setBusy] = useState<string>();
  const [viewing, setViewing] = useState<Recording | null>(null);

  const load = useCallback(async (q: string) => {
    setLoading(true);
    setError(undefined);
    try {
      if (q.trim()) {
        const res = await api.search({ q, includeTranscript: 'true', pageSize: '50' });
        setRecordings(res.items);
      } else {
        setRecordings(await api.listRecordings());
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load('');
  }, [load]);

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    void load(query);
  };

  const transcribe = async (id: string) => {
    try {
      await api.requestTranscription(id, { summarize: true, diarize: true });
      await load(query);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const runExport = async (id: string, label: string, fn: () => Promise<void>) => {
    setBusy(`${id}:${label}`);
    setError(undefined);
    try {
      await fn();
      setOpenMenu(undefined);
    } catch (err) {
      setError(`${label} export failed: ${(err as Error).message}`);
    } finally {
      setBusy(undefined);
    }
  };

  return (
    <div className="panel library">
      <form className="library__search" onSubmit={onSearch}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search title, notes, tags, transcript…"
        />
        <button className="btn" type="submit">
          Search
        </button>
      </form>

      {error && <div className="alert alert--error">{error}</div>}
      {loading && <div className="library__empty">Loading…</div>}
      {!loading && recordings.length === 0 && (
        <div className="library__empty">No recordings yet. Capture your first one.</div>
      )}

      <ul className="library__list">
        {recordings.map((r) => (
          <li key={r.id} className="rec">
            <div className="rec__main">
              <button
                className="rec__title rec__title--btn"
                onClick={() => setViewing(r)}
                title="View transcript & summary"
              >
                {r.title}
              </button>
              <div className="rec__meta">
                <span className={`tag tag--${r.sourceType}`}>{sourceLabel(r.sourceType)}</span>
                <span>{formatDate(r.startedAt)}</span>
                <span>{formatDuration(r.durationMs)}</span>
                <span>{formatBytes(r.sizeBytes)}</span>
                {r.hasPendingUploads && <span className="rec__pending">syncing…</span>}
              </div>
              {r.tags.length > 0 && (
                <div className="rec__tags">
                  {r.tags.map((t) => (
                    <span key={t} className="chip">
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="rec__actions">
              <button className="btn btn--ghost" onClick={() => setViewing(r)}>
                View
              </button>
              <span className={`transcript transcript--${r.transcriptStatus}`}>
                {transcriptLabel(r.transcriptStatus)}
              </span>
              {r.transcriptStatus === 'not_requested' && (
                <button className="btn btn--ghost" onClick={() => transcribe(r.id)}>
                  Transcribe
                </button>
              )}
              <div className="export">
                <button
                  className="btn btn--ghost"
                  onClick={() => setOpenMenu(openMenu === r.id ? undefined : r.id)}
                >
                  ⤓ Export ▾
                </button>
                {openMenu === r.id && (
                  <div className="export__menu" role="menu">
                    <ExportItem
                      label="ZIP bundle"
                      busy={busy === `${r.id}:ZIP bundle`}
                      onClick={() => runExport(r.id, 'ZIP bundle', () => downloadServerExport(r.id, 'zip'))}
                    />
                    <ExportItem
                      label="WAV (in-browser)"
                      busy={busy === `${r.id}:WAV (in-browser)`}
                      onClick={() => runExport(r.id, 'WAV (in-browser)', () => exportWavClient(r.id))}
                    />
                    <ExportItem
                      label="Audio (original .webm)"
                      busy={busy === `${r.id}:Audio (original .webm)`}
                      onClick={() =>
                        runExport(r.id, 'Audio (original .webm)', () =>
                          downloadServerExport(r.id, 'audio', { format: 'webm' }),
                        )
                      }
                    />
                    <ExportItem
                      label="Transcript (.txt)"
                      disabled={r.transcriptStatus !== 'completed'}
                      busy={busy === `${r.id}:Transcript (.txt)`}
                      onClick={() =>
                        runExport(r.id, 'Transcript (.txt)', () =>
                          downloadServerExport(r.id, 'transcript', { format: 'txt' }),
                        )
                      }
                    />
                    <ExportItem
                      label="Summary notes (.md)"
                      busy={busy === `${r.id}:Summary notes (.md)`}
                      onClick={() =>
                        runExport(r.id, 'Summary notes (.md)', () =>
                          downloadServerExport(r.id, 'summary', { format: 'md' }),
                        )
                      }
                    />
                    <ExportItem
                      label="Summary (.pdf)"
                      busy={busy === `${r.id}:Summary (.pdf)`}
                      onClick={() =>
                        runExport(r.id, 'Summary (.pdf)', () =>
                          downloadServerExport(r.id, 'summary', { format: 'pdf' }),
                        )
                      }
                    />
                  </div>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>

      {viewing && (
        <TranscriptViewer
          recording={viewing}
          onClose={() => {
            setViewing(null);
            void load(query);
          }}
        />
      )}
    </div>
  );
}

function ExportItem({
  label,
  onClick,
  busy,
  disabled,
}: {
  label: string;
  onClick: () => void;
  busy?: boolean;
  disabled?: boolean;
}) {
  return (
    <button className="export__item" onClick={onClick} disabled={busy || disabled} role="menuitem">
      {busy ? 'Preparing…' : label}
    </button>
  );
}

function transcriptLabel(status: string): string {
  switch (status) {
    case 'completed':
      return '✓ Transcript';
    case 'processing':
      return 'Transcribing…';
    case 'queued':
      return 'Queued';
    case 'failed':
      return 'Transcript failed';
    default:
      return 'No transcript';
  }
}
