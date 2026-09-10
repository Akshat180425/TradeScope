import { useState, useEffect } from 'react';
import { Check, ShieldCheck } from 'lucide-react';
import { api, currency } from '../lib/api.js';
export default function Admin({ data, mutate, busy }) {
  const [speed, setSpeed] = useState(String(data.simulation.speed)),
    [volatility, setVolatility] = useState(data.simulation.volatility * 100),
    [fees, setFees] = useState(data.simulation.feeBps),
    [rate, setRate] = useState(data.simulation.fxRate),
    [info, setInfo] = useState(null),
    [error, setError] = useState('');
  useEffect(() => {
    api('/admin')
      .then(setInfo)
      .catch((e) => setError(e.message));
  }, [data.simulation.tick]);
  return (
    <div className="admin-layout">
      <section className="admin-settings">
        <h2>
          <ShieldCheck size={19} />
          Market parameters
        </h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            mutate(
              '/simulation',
              {
                action: 'configure',
                speed: Number(speed),
                volatility: Number(volatility) / 100,
                feeBps: Number(fees),
                fxRate: Number(rate),
              },
              'POST',
              'Market settings updated.',
            );
          }}
        >
          <label>
            Simulation speed
            <select value={speed} onChange={(e) => setSpeed(e.target.value)}>
              {[1, 5, 15].map((s) => (
                <option key={s} value={s}>
                  {s} minute(s) / second
                </option>
              ))}
            </select>
          </label>
          <label>
            Annual volatility: {volatility}%
            <input
              type="range"
              min="5"
              max="80"
              value={volatility}
              onChange={(e) => setVolatility(e.target.value)}
            />
          </label>
          <label>
            Trading fee (basis points)
            <input
              type="number"
              required
              min="0"
              max="100"
              step="1"
              value={fees}
              onChange={(e) => setFees(e.target.value)}
            />
          </label>
          <label>
            Simulated INR per USD
            <input
              type="number"
              required
              min="1"
              max="200"
              step="0.01"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
            />
          </label>
          <button className="button primary" disabled={busy}>
            <Check size={17} />
            Apply settings
          </button>
        </form>
        <p className="muted">
          Fee changes apply to new orders. Existing orders keep their accepted fee rate.
        </p>
      </section>
      <section className="admin-records">
        {error && <p role="alert">{error}</p>}
        {info && (
          <>
            <div className="section-heading">
              <h2>Storage health</h2>
              <span className="status filled">SQLite / schema {info.schema}</span>
            </div>
            <dl className="detail-list">
              <div>
                <dt>Registered and demo accounts</dt>
                <dd>{info.accounts}</dd>
              </div>
              <div>
                <dt>Ledger entries</dt>
                <dd>{info.ledgerEntries}</dd>
              </div>
            </dl>
            <div className="section-heading">
              <h2>Preserved legacy accounts</h2>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Account</th>
                    <th>Equity</th>
                  </tr>
                </thead>
                <tbody>
                  {info.legacyAccounts.map((a) => (
                    <tr key={a.id}>
                      <td>{a.label}</td>
                      <td>{currency(a.equity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="section-heading">
              <h2>Audit trail</h2>
            </div>
            <div className="audit-list">
              {info.audit.map((a, i) => (
                <div key={i}>
                  <span>{a.action}</span>
                  <small>{new Date(a.created_at).toLocaleString()}</small>
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
