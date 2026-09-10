import { useState } from 'react';
import {
  ChartNoAxesCombined,
  ArrowRight,
  Eye,
  EyeOff,
  LockKeyhole,
  LoaderCircle,
} from 'lucide-react';
import { api } from '../lib/api.js';

export default function Auth({ onSession }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event, demo = false) {
    event?.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      onSession(
        await api('/auth/' + (demo ? 'demo' : mode), {
          method: 'POST',
          body: demo ? {} : { email, password },
        }),
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-page">
      <header className="auth-header">
        <a className="brand" href="#">
          <ChartNoAxesCombined size={27} />
          TradeScope<span className="brand-dot">.</span>
        </a>
        <span className="environment-tag">Paper trading</span>
      </header>
      <main className="auth-main">
        <div className="auth-form">
          <div className="auth-mark">
            <LockKeyhole size={24} />
          </div>
          <h1>{mode === 'login' ? 'Your trading workspace' : 'Create your account'}</h1>
          <p className="muted">Virtual capital. A market of possibilities.</p>
          <div className="segmented auth-tabs">
            {[
              ['login', 'Sign in'],
              ['register', 'Register'],
            ].map(([id, label]) => (
              <button
                key={id}
                aria-pressed={mode === id}
                className={mode === id ? 'selected' : ''}
                onClick={() => {
                  setMode(id);
                  setError('');
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <form onSubmit={submit}>
            <label>
              Email
              <input
                type="email"
                autoComplete="email"
                required
                maxLength={254}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="account@example.com"
              />
            </label>
            <label>
              Password
              <div className="password-field">
                <input
                  type={show ? 'text' : 'password'}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  required
                  minLength={10}
                  maxLength={128}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 10 characters"
                />
                <button
                  type="button"
                  className="icon-button"
                  aria-label={show ? 'Hide password' : 'Show password'}
                  title={show ? 'Hide password' : 'Show password'}
                  onClick={() => setShow(!show)}
                >
                  {show ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </label>
            {error && (
              <p className="inline-error" role="alert">
                {error}
              </p>
            )}
            <button className="button primary full" disabled={busy}>
              {busy ? <LoaderCircle size={17} className="spin" /> : <ArrowRight size={17} />}
              {mode === 'login' ? 'Sign in' : 'Create account'}
            </button>
          </form>
          <div className="auth-divider">
            <span>or</span>
          </div>
          <button className="button subtle full" disabled={busy} onClick={() => submit(null, true)}>
            Open demo workspace <ArrowRight size={16} />
          </button>
          <p className="auth-note">
            $100,000 virtual starting capital. No real-money transactions.
          </p>
        </div>
      </main>
      <footer className="auth-footer">
        TRADESCOPE <span>Simulated US equities / USD + INR</span>
      </footer>
    </div>
  );
}
