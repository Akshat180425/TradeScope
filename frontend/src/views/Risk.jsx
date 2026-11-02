import { useState } from 'react';
import { ShieldCheck, Pause, Play, Save, AlertTriangle } from 'lucide-react';
import { currency, time } from '../lib/api.js';

const fields = [
  ['maxSharesPerSymbol', 'Maximum shares per symbol', 1000000, 1],
  ['maxFuturesPerSymbol', 'Maximum futures contracts per symbol', 1000, 1],
  ['maxOptionsPerSymbol', 'Maximum options contracts per symbol', 1000, 1],
  ['concentrationWarningPercent', 'Concentration warning (%)', 100, 0.1],
  ['dailyLossLimit', 'Daily loss limit (USD)', 1000000, 0.01],
];

export default function Risk({ data, mutate, busy }) {
  const risk = data.risk;
  const [draft, setDraft] = useState(null);
  const limits = draft || risk.limits;
  return (
    <div className="risk-view">
      <section className="risk-status-band" aria-label="Trading risk status">
        <div className="risk-state">
          <ShieldCheck size={25} />
          <div>
            <h2>{risk.paused ? 'New exposure paused' : 'Trading active'}</h2>
            <span className="muted">{risk.reason || 'Account limits enforced'}</span>
          </div>
        </div>
        <button
          className="button subtle"
          disabled={busy || risk.lossLocked}
          onClick={() =>
            mutate(
              '/risk/pause',
              { paused: !risk.paused },
              'POST',
              risk.paused ? 'Trading resumed.' : 'New exposure paused.',
            )
          }
        >
          {risk.paused ? <Play size={16} /> : <Pause size={16} />}
          {risk.paused ? 'Resume trading' : 'Pause new exposure'}
        </button>
      </section>
      <section className="risk-daily" aria-label="Daily loss budget">
        <div>
          <span>Session {risk.day + 1} P&L</span>
          <strong className={risk.dailyPnl < 0 ? 'negative' : 'positive'}>
            {currency(risk.dailyPnl)}
          </strong>
        </div>
        <div>
          <span>Loss budget remaining</span>
          <strong>{currency(risk.lossRemaining)}</strong>
        </div>
        <div>
          <span>Daily limit</span>
          <strong>{currency(risk.limits.dailyLossLimit)}</strong>
        </div>
        <progress
          aria-label="Daily loss budget used"
          max={risk.limits.dailyLossLimit}
          value={Math.min(risk.lossUsed, risk.limits.dailyLossLimit)}
        />
        {risk.lossLocked && (
          <p role="status" className="negative">
            Locked until session {risk.day + 2}. Sales and position closes remain available.
          </p>
        )}
      </section>
      <div className="risk-layout">
        <section className="risk-settings">
          <h2>Account limits</h2>
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              const payload = Object.fromEntries(fields.map(([key]) => [key, Number(limits[key])]));
              if (await mutate('/risk/limits', payload, 'PATCH', 'Risk limits saved.'))
                setDraft(null);
            }}
          >
            {fields.map(([key, label, max, step]) => (
              <label key={key}>
                {label}
                <input
                  type="number"
                  min="1"
                  max={max}
                  step={step}
                  required
                  value={limits[key]}
                  onChange={(e) => setDraft({ ...limits, [key]: e.target.value })}
                />
              </label>
            ))}
            <button className="button primary" disabled={busy || !draft}>
              <Save size={16} />
              Save limits
            </button>
          </form>
        </section>
        <section className="risk-exposures">
          <div className="section-heading">
            <h2>Exposure by symbol</h2>
            <span className="muted">Gross underlying notional</span>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Shares / pending</th>
                  <th>Futures / options</th>
                  <th>Exposure</th>
                  <th>% of equity</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {risk.exposures.map((row) => (
                  <tr key={row.symbol}>
                    <td>
                      <strong>{row.symbol}</strong>
                    </td>
                    <td>
                      {row.shares} / {row.pendingShares}
                    </td>
                    <td>
                      {row.futures} / {row.options}
                    </td>
                    <td>{currency(row.grossExposure)}</td>
                    <td>
                      {row.concentration === null ? 'N/A' : row.concentration.toFixed(1) + '%'}
                    </td>
                    <td>
                      {row.overLimit || row.warning ? (
                        <span className="risk-warning-label">
                          <AlertTriangle size={14} />
                          {row.overLimit ? 'Above position limit' : 'Concentrated'}
                        </span>
                      ) : (
                        'Within limits'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
      <section className="risk-history">
        <div className="section-heading">
          <h2>Risk activity</h2>
          <span className="count">{risk.events.length}</span>
        </div>
        {risk.events.length ? (
          <ul className="risk-event-list">
            {risk.events.map((entry) => (
              <li key={entry.id}>
                <time>{time(entry.tick)}</time>
                <span>{entry.detail}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="empty-state">
            <ShieldCheck />
            <h3>No risk events yet</h3>
          </div>
        )}
      </section>
    </div>
  );
}
