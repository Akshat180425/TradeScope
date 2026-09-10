import { useState } from 'react';
import { Bell, Plus, X } from 'lucide-react';
import { usd, time } from '../lib/api.js';
export default function Alerts({ data, mutate, busy }) {
  const [symbol, setSymbol] = useState('AAPL'),
    [direction, setDirection] = useState('above'),
    [price, setPrice] = useState('250');
  const rows = data.alerts.filter((a) => a.status !== 'cancelled');
  return (
    <div className="alerts-layout">
      <section className="alert-builder">
        <h2>New price alert</h2>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await mutate(
              '/alerts',
              { symbol, direction, price: Number(price) },
              'POST',
              'Price alert created.',
            );
          }}
        >
          <label>
            Instrument
            <select value={symbol} onChange={(e) => setSymbol(e.target.value)}>
              {data.markets.map((m) => (
                <option key={m.symbol}>{m.symbol}</option>
              ))}
            </select>
          </label>
          <label>
            Condition
            <select value={direction} onChange={(e) => setDirection(e.target.value)}>
              <option value="above">At or above</option>
              <option value="below">At or below</option>
            </select>
          </label>
          <label>
            Target price (USD)
            <input
              type="number"
              min="0.01"
              max="1000000"
              step="0.01"
              required
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </label>
          <button className="button primary" disabled={busy}>
            <Plus size={17} />
            Create alert
          </button>
        </form>
      </section>
      <section className="alerts-list">
        <div className="section-heading">
          <h2>Your alerts</h2>
          <span className="count">{rows.length}</span>
        </div>
        {rows.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Instrument</th>
                  <th>Condition</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <strong>{a.symbol}</strong>
                    </td>
                    <td>
                      {a.direction} {usd(a.price)}
                    </td>
                    <td>
                      <span className={'status ' + (a.status === 'triggered' ? 'filled' : 'open')}>
                        {a.status}
                      </span>
                    </td>
                    <td>{time(a.createdTick)}</td>
                    <td>
                      <button
                        className="icon-button"
                        aria-label={'Remove alert ' + a.id}
                        title="Remove alert"
                        disabled={busy}
                        onClick={() => mutate('/alerts/' + a.id, {}, 'DELETE')}
                      >
                        <X size={17} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <Bell size={30} />
            <h3>No price alerts</h3>
          </div>
        )}
      </section>
    </div>
  );
}
