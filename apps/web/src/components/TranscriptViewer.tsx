import { useCallback, useEffect, useRef, useState } from 'react';
import type { Recording, Summary, Transcript } from '@echovault/shared';
import { api } from '../lib/api';
import { formatDuration } from '../lib/format';
import { buildSpeakerColorMap, distinctSpeakers, groupSegmentsBySpeaker } from '../lib/transcript';

type Tab = 'transcript' | 'summary';

/** Highlight the first match of `q` within `text`. */
function highlight(text: string, q: string): React.ReactNode {
  if (!q) return text;
  const idx = text.toLowerCase().indexOf(q);
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark>{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  );
}

export function TranscriptViewer({
  recording,
  onClose,
}: {
  recording: Recording;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>('transcript');
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [status, setStatus] = useState<string>(recording.transcriptStatus);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const loadSummary = useCallback(async () => {
    try {
      setSummary(await api.getSummary(recording.id));
    } catch {
      setSummary(null);
    }
  }, [recording.id]);

  const loadTranscript = useCallback(async (): Promise<string> => {
    try {
      const t = await api.getTranscript(recording.id);
      setTranscript(t);
      setStatus(t.status);
      return t.status;
    } catch {
      setTranscript(null);
      setStatus('not_requested');
      return 'not_requested';
    }
  }, [recording.id]);

  // Initial load.
  useEffect(() => {
    void (async () => {
      const s = await loadTranscript();
      if (s === 'completed') void loadSummary();
    })();
  }, [loadTranscript, loadSummary]);

  // Poll while a transcription job is in flight.
  const pollRef = useRef<ReturnType<typeof setInterval>>();
  useEffect(() => {
    if (status !== 'queued' && status !== 'processing') return;
    pollRef.current = setInterval(async () => {
      const s = await loadTranscript();
      if (s === 'completed') void loadSummary();
      if (s === 'completed' || s === 'failed') {
        if (pollRef.current) clearInterval(pollRef.current);
      }
    }, 4000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [status, loadTranscript, loadSummary]);

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const generate = async (diarize: boolean) => {
    setBusy(true);
    setError(undefined);
    try {
      await api.requestTranscription(recording.id, { diarize, summarize: true });
      setStatus('queued');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const segments = transcript?.segments ?? [];
  const speakers = distinctSpeakers(segments);
  const colorMap = buildSpeakerColorMap(speakers);
  const blocks = groupSegmentsBySpeaker(segments);
  const filterLc = filter.trim().toLowerCase();

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <header className="modal__head">
          <div className="modal__title">{recording.title}</div>
          <button className="iconbtn" title="Close (Esc)" onClick={onClose}>
            ✕
          </button>
        </header>

        <nav className="modal__tabs">
          <button className={tab === 'transcript' ? 'active' : ''} onClick={() => setTab('transcript')}>
            Transcript
          </button>
          <button
            className={tab === 'summary' ? 'active' : ''}
            onClick={() => {
              setTab('summary');
              if (!summary) void loadSummary();
            }}
          >
            Summary
          </button>
        </nav>

        <div className="modal__body">
          {tab === 'transcript' ? (
            <TranscriptPane
              status={status}
              busy={busy}
              error={error}
              segmentsCount={segments.length}
              blocks={blocks}
              colorMap={colorMap}
              speakers={speakers}
              transcript={transcript}
              filter={filter}
              filterLc={filterLc}
              setFilter={setFilter}
              onGenerate={generate}
            />
          ) : (
            <SummaryPane summary={summary} />
          )}
        </div>
      </div>
    </div>
  );
}

function TranscriptPane(props: {
  status: string;
  busy: boolean;
  error?: string;
  segmentsCount: number;
  blocks: ReturnType<typeof groupSegmentsBySpeaker>;
  colorMap: Record<string, string>;
  speakers: string[];
  transcript: Transcript | null;
  filter: string;
  filterLc: string;
  setFilter: (v: string) => void;
  onGenerate: (diarize: boolean) => void;
}) {
  const { status, busy, error, segmentsCount, blocks, colorMap, speakers, transcript, filter, filterLc, setFilter, onGenerate } =
    props;

  if (status === 'not_requested') {
    return (
      <div className="tv__empty">
        <p>No transcript yet. Transcription is optional and runs in the background — your audio is already safe.</p>
        <button className="btn btn--record" disabled={busy} onClick={() => onGenerate(true)}>
          Generate transcript + summary
        </button>
        {error && <div className="alert alert--error">{error}</div>}
      </div>
    );
  }
  if (status === 'queued' || status === 'processing') {
    return (
      <div className="tv__empty">
        <span className="spinner" /> Transcribing… this updates automatically.
      </div>
    );
  }
  if (status === 'failed') {
    return (
      <div className="tv__empty">
        <div className="alert alert--error">Transcription failed.</div>
        <button className="btn" disabled={busy} onClick={() => onGenerate(true)}>
          Retry
        </button>
      </div>
    );
  }
  if (segmentsCount === 0) {
    return <div className="tv__empty">Transcript is empty.</div>;
  }

  return (
    <>
      <div className="tv__meta">
        {speakers.length > 0 && (
          <span>
            {speakers.length} speaker{speakers.length > 1 ? 's' : ''}
          </span>
        )}
        {transcript?.language && <span>{transcript.language}</span>}
        {transcript?.model && <span className="tv__model">{transcript.model}</span>}
        <input
          className="tv__filter"
          placeholder="Filter lines…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>

      <div className="tv__transcript">
        {blocks.map((block, i) => {
          const lines = filterLc
            ? block.segments.filter((s) => s.text.toLowerCase().includes(filterLc))
            : block.segments;
          if (lines.length === 0) return null;
          const color = block.speaker ? colorMap[block.speaker] : undefined;
          return (
            <div className="tv__block" key={i}>
              {block.speaker && (
                <div className="tv__speaker" style={{ color }}>
                  <span className="tv__dot" style={{ background: color }} />
                  {block.speaker}
                </div>
              )}
              <div className="tv__lines">
                {lines.map((s, j) => (
                  <div className="tv__line" key={j}>
                    <span className="tv__ts">{formatDuration(s.startMs)}</span>
                    <span className="tv__text">{highlight(s.text, filterLc)}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function SummaryPane({ summary }: { summary: Summary | null }) {
  if (!summary) {
    return (
      <div className="tv__empty">
        No summary yet. Generate a transcript (summary is produced alongside it).
      </div>
    );
  }
  return (
    <div className="tv__summary">
      {summary.executiveSummary && (
        <section>
          <h4>Executive summary</h4>
          <p>{summary.executiveSummary}</p>
        </section>
      )}
      <SummaryList title="Action items" items={summary.actionItems} />
      <SummaryList title="Key decisions" items={summary.keyDecisions} />
      <SummaryList title="Questions asked" items={summary.questionsAsked} />
      <SummaryList title="Follow-ups" items={summary.followUps} />
    </div>
  );
}

function SummaryList({ title, items }: { title: string; items: string[] }) {
  if (!items || items.length === 0) return null;
  return (
    <section>
      <h4>{title}</h4>
      <ul>
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </section>
  );
}
