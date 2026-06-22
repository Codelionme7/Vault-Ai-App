import { useCallback, useEffect, useState } from 'react';
import type { Recording } from '@echovault/shared';
import { api } from '../lib/api';
import { formatBytes, formatDate, formatDuration, sourceLabel } from '../lib/format';

export function Library() {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

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
      await api.requestTranscription(id, true);
      await load(query);
    } catch (err) {
      setError((err as Error).message);
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
              <div className="rec__title">{r.title}</div>
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
              <span className={`transcript transcript--${r.transcriptStatus}`}>
                {transcriptLabel(r.transcriptStatus)}
              </span>
              {r.transcriptStatus === 'not_requested' && (
                <button className="btn btn--ghost" onClick={() => transcribe(r.id)}>
                  Transcribe
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
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
