import { useState } from 'react';
import { ArrowRightLeft } from 'lucide-react';

export default function FxValuation({ portfolio, rate }) {
  const [amount, setAmount] = useState('1000'),
    [from, setFrom] = useState('USD');
  const format = (value, code) =>
    new Intl.NumberFormat(code === 'INR' ? 'en-IN' : 'en-US', {
      style: 'currency',
      currency: code,
    }).format(value);
  const valid =
    amount !== '' &&
    Number.isFinite(Number(amount)) &&
    Number(amount) >= 0 &&
    Number(amount) <= 1000000000;
  const target = from === 'USD' ? 'INR' : 'USD';
  return (
    <section className="fx-valuation" aria-label="FX valuation">
      <div className="section-heading">
        <h2>USD / INR valuation</h2>
        <span className="muted">Simulated rate: 1 USD = {rate.toFixed(2)} INR</span>
      </div>
      <div className="fx-layout">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Account value</th>
                <th>USD</th>
                <th>INR</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['Equity', portfolio.equity],
                ['Cash', portfolio.cash],
                ['Realized P&L', portfolio.realizedPnl],
                ['Unrealized P&L', portfolio.unrealizedPnl],
              ].map(([label, value]) => (
                <tr key={label}>
                  <td>{label}</td>
                  <td>{format(value, 'USD')}</td>
                  <td>{format(value * rate, 'INR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="fx-converter">
          <label>
            Conversion amount
            <input
              type="number"
              min="0"
              max="1000000000"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
          <label>
            From currency
            <select value={from} onChange={(e) => setFrom(e.target.value)}>
              <option>USD</option>
              <option>INR</option>
            </select>
          </label>
          <output aria-label="Converted amount">
            <ArrowRightLeft size={18} />
            {valid
              ? format(from === 'USD' ? Number(amount) * rate : Number(amount) / rate, target)
              : '--'}
          </output>
        </div>
      </div>
    </section>
  );
}
