import { useState } from 'react';
import { Layers3 } from 'lucide-react';
import { currency, time } from '../lib/api.js';
import OrderTicket from '../components/OrderTicket.jsx';
import { PriceChart } from '../components/Charts.jsx';
export default function Derivatives({ data, symbol, setSymbol, refresh, busy, onClose }) {
  const [instrument, setInstrument] = useState('futures');
  const market = data.markets.find((m) => m.symbol === symbol);
  const positions = data.portfolio.positions.filter((p) => p.instrument === instrument);
  return (
    <div className="workspace-grid">
      <div className="market-workspace">
        <div className="derivatives-toolbar">
          <div className="segmented">
            <button
              className={instrument === 'futures' ? 'selected' : ''}
              onClick={() => setInstrument('futures')}
            >
              Futures
            </button>
            <button
              className={instrument === 'options' ? 'selected' : ''}
              onClick={() => setInstrument('options')}
            >
              Options
            </button>
          </div>
          <label className="inline-label">
            Underlying
            <select
              aria-label="Derivative stock"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
            >
              {data.markets.map((m) => (
                <option key={m.symbol} value={m.symbol}>
                  {m.symbol} - {m.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="derivative-summary">
          <div>
            <span className="eyebrow">
              {market.name} / {instrument === 'futures' ? 'Futures' : 'European options'}
            </span>
            <h2>
              {currency(market.price)} <small>spot</small>
            </h2>
          </div>
          <div className="contract-facts">
            <span>100 shares / contract</span>
            <span>{instrument === 'futures' ? '20% initial margin' : 'Long calls & puts'}</span>
            <span>Model priced / cash settled</span>
          </div>
        </div>
        <PriceChart market={market} />
        <section className="positions-section">
          <div className="section-heading">
            <h2>Open {instrument} positions</h2>
            <span className="count">{positions.length}</span>
          </div>
          {positions.length ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Contract</th>
                    <th>Qty</th>
                    <th>Entry</th>
                    <th>P&L</th>
                    <th>Expiry / margin</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {positions.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <strong>{p.symbol}</strong>
                        <small>
                          {p.instrument === 'options'
                            ? p.optionType + ' / ' + currency(p.strike)
                            : p.side === 'buy'
                              ? 'Long'
                              : 'Short'}
                        </small>
                      </td>
                      <td>{p.quantity}</td>
                      <td>{currency(p.entryPrice)}</td>
                      <td className={p.pnl >= 0 ? 'positive' : 'negative'}>{currency(p.pnl)}</td>
                      <td>
                        {time(p.expiryTick)}
                        <small>
                          {Math.max(0, p.expiryTick - data.simulation.tick)} min remaining
                        </small>
                        {p.instrument === 'futures' && (
                          <small className={p.value < p.margin * 0.5 ? 'negative' : ''}>
                            Equity {currency(p.value)} / liquidation {currency(p.margin * 0.25)}
                          </small>
                        )}
                      </td>
                      <td>
                        <button className="text-button" disabled={busy} onClick={() => onClose(p)}>
                          Close
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state">
              <Layers3 size={28} />
              <h3>No open {instrument} positions</h3>
              <span>{data.portfolio.user.name}</span>
            </div>
          )}
        </section>
      </div>
      <OrderTicket
        data={data}
        symbol={symbol}
        instrument={instrument}
        onComplete={refresh}
        busy={busy}
      />
    </div>
  );
}
