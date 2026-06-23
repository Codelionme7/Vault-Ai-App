import { useEffect, useState } from 'react';
import { AuthScreen } from './components/AuthScreen';
import { Library } from './components/Library';
import { RecorderPanel } from './components/RecorderPanel';
import { RecoveryBanner } from './components/RecoveryBanner';
import { api } from './lib/api';

type Tab = 'record' | 'library';

export default function App() {
  const [authed, setAuthed] = useState(api.isAuthenticated);
  const [tab, setTab] = useState<Tab>('record');
  const [theme, setTheme] = useState<'dark' | 'light'>(
    (localStorage.getItem('echovault.theme') as 'dark' | 'light') ?? 'dark',
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('echovault.theme', theme);
  }, [theme]);

  if (!authed) return <AuthScreen onAuthed={() => setAuthed(true)} />;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand__mark">◉</span> EchoVault <span className="brand__ai">AI</span>
        </div>
        <nav className="tabs">
          <button className={tab === 'record' ? 'active' : ''} onClick={() => setTab('record')}>
            Record
          </button>
          <button className={tab === 'library' ? 'active' : ''} onClick={() => setTab('library')}>
            Library
          </button>
        </nav>
        <div className="topbar__right">
          <button
            className="iconbtn"
            title="Toggle theme"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          >
            {theme === 'dark' ? '☀' : '☾'}
          </button>
          <button
            className="iconbtn"
            title="Sign out"
            onClick={() => {
              api.clearTokens();
              setAuthed(false);
            }}
          >
            ⎋
          </button>
        </div>
      </header>

      <main className="content">
        <RecoveryBanner />
        {tab === 'record' ? (
          <RecorderPanel onFinished={() => setTab('library')} />
        ) : (
          <Library />
        )}
      </main>

      <footer className="footer">
        Audio is the source of truth · recordings saved locally first · transcription is optional
      </footer>
    </div>
  );
}
