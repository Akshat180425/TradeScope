import { ArrowUpRight, BriefcaseBusiness, Download, Wallet } from 'lucide-react';
import { PerformanceChart } from '../components/PerformanceChart.jsx';
import { Allocation } from '../components/Charts.jsx';
import FxValuation from '../components/FxValuation.jsx';
import { currency, number, time } from '../lib/api.js';
export default function Portfolios({ data, onTrade, onClose, onFunding, busy }) {
  const { portfolio } = data;
  return (
    <div className="portfolio-view">
      <PerformanceChart performance={data.performance} portfolio={portfolio} />
      <FxValuation portfolio={portfolio} rate={data.simulation.fxRate} />
      <div className="portfolio-actions">
        <span className="muted">Net contributions {currency(portfolio.netFunding)}</span>
        <button className="button subtle" onClick={onFunding}>
          <Wallet size={16} />
          Virtual funding
        </button>
      </div>
      <div className="portfolio-upper">
        <section>
          <div className="section-heading">
            <h2>Holdings</h2>
            <span className="count">{portfolio.holdings.length}</span>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Asset</th>
                  <th>Shares</th>
                  <th>Avg. cost</th>
                  <th>Market value</th>
                  <th>Unrealized P&L</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {portfolio.holdings.map((h) => (
                  <tr key={h.symbol}>
                    <td>
                      <strong>{h.symbol}</strong>
                      <small>{h.name}</small>
                    </td>
                    <td className="numeric">{number(h.quantity)}</td>
                    <td className="numeric">{currency(h.averageCost)}</td>
                    <td className="numeric">{currency(h.value)}</td>
                    <td className={'numeric ' + (h.pnl >= 0 ? 'positive' : 'negative')}>
                      {currency(h.pnl)}
                    </td>
                    <td>
                      <button
                        className="icon-button"
                        title={'Trade ' + h.symbol}
                        aria-label={'Trade ' + h.symbol}
                        onClick={() => onTrade(h.symbol)}
                      >
                        <ArrowUpRight size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!portfolio.holdings.length && (
              <div className="empty-state">
                <BriefcaseBusiness size={28} />
                <h3>No stock holdings</h3>
              </div>
            )}
          </div>
          <div className="portfolio-cash">
            <span>Cash balance</span>
            <strong>{currency(portfolio.cash)}</strong>
          </div>
          <div className="portfolio-cash muted">
            <span>Reserved for open orders</span>
            <strong>{currency(portfolio.reservedCash)}</strong>
          </div>
        </section>
        <section className="allocation-section">
          <div className="section-heading">
            <h2>Allocation</h2>
            <span className="muted">By value</span>
          </div>
          <Allocation portfolio={portfolio} markets={data.markets} />
        </section>
      </div>
      <section className="positions-section">
        <div className="section-heading">
          <h2>Derivative positions</h2>
          <span className="count">{portfolio.positions.length}</span>
        </div>
        {portfolio.positions.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Contract</th>
                  <th>Type</th>
                  <th>Quantity</th>
                  <th>Mark</th>
                  <th>Unrealized P&L</th>
                  <th>Expiry</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {portfolio.positions.map((p) => (
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
                    <td className="capitalize">{p.instrument}</td>
                    <td>{p.quantity}</td>
                    <td>{currency(p.mark)}</td>
                    <td className={p.pnl >= 0 ? 'positive' : 'negative'}>{currency(p.pnl)}</td>
                    <td>{time(p.expiryTick)}</td>
                    <td>
                      <button className="text-button" disabled={busy} onClick={() => onClose(p)}>
                        Close position
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state compact-empty">
            <BriefcaseBusiness size={25} />
            <h3>No open derivative positions</h3>
          </div>
        )}
      </section>
      <section className="activity-section">
        <div className="section-heading">
          <h2>Recent activity</h2>
          <a className="button subtle" href={'/api/export.csv?userId=' + portfolio.user.id}>
            <Download size={16} /> Export CSV
          </a>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Asset</th>
                <th>Transaction</th>
                <th>Quantity</th>
                <th>Price</th>
                <th>Notional</th>
              </tr>
            </thead>
            <tbody>
              {data.activity.slice(0, 12).map((t) => (
                <tr key={t.id}>
                  <td className="muted">{time(t.tick)}</td>
                  <td>
                    <strong>{t.symbol}</strong>
                    <small>{t.instrument}</small>
                  </td>
                  <td>
                    <span
                      className={
                        'status ' +
                        (t.side === 'buy' ? 'filled' : t.side === 'sell' ? 'sell' : 'neutral')
                      }
                    >
                      {t.side}
                    </span>
                  </td>
                  <td>{t.quantity}</td>
                  <td>{currency(t.price)}</td>
                  <td>{currency(t.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
