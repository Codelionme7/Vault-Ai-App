import { useState } from 'react';
import { api, type Session } from '../lib/api';

export function AuthScreen({ onAuthed }: { onAuthed: (s: Session) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('demo@echovault.ai');
  const [password, setPassword] = useState('echovault-demo');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const session =
        mode === 'login'
          ? await api.login(email, password)
          : await api.register(email, password, displayName || undefined);
      onAuthed(session);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <div className="auth__card panel">
        <div className="brand brand--lg">
          <span className="brand__mark">◉</span> EchoVault <span className="brand__ai">AI</span>
        </div>
        <p className="auth__tagline">Audio-first capture. Never lose a recording.</p>

        <form onSubmit={submit}>
          {mode === 'register' && (
            <label className="field">
              <span>Name</span>
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </label>
          )}
          <label className="field">
            <span>Email</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
          </label>

          {error && <div className="alert alert--error">{error}</div>}

          <button className="btn btn--record auth__submit" type="submit" disabled={busy}>
            {busy ? '…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <button
          className="auth__switch"
          onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
        >
          {mode === 'login' ? 'Need an account? Register' : 'Have an account? Sign in'}
        </button>
      </div>
    </div>
  );
}
