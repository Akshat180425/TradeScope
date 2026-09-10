import { useState } from 'react';
import { ArrowUpRight, ArrowDownRight, Star, Search } from 'lucide-react';
import { currency, number, percent } from '../lib/api.js';
import { PriceChart, Sparkline } from '../components/Charts.jsx';
import OrderTicket from '../components/OrderTicket.jsx';
import OrderBook from '../components/OrderBook.jsx';
export default function Markets({ data, symbol, setSymbol, refresh, busy, onPreferences }) {
  const [query, setQuery] = useState(''),
    [onlyWatchlist, setOnlyWatchlist] = useState(false);
  const watchlist = data.preferences?.watchlist || [];
  const markets = data.markets.filter(
    (m) =>
      (!onlyWatchlist || watchlist.includes(m.symbol)) &&
      (m.symbol + ' ' + m.name).toLowerCase().includes(query.toLowerCase()),
  );
  const market = data.markets.find((m) => m.symbol === symbol);
  return (
    <div className="workspace-grid">
      <div className="market-workspace">
        <div className="instrument-heading">
          <div className="instrument-name">
            <span className={'stock-avatar ' + market.symbol.toLowerCase()}>
              {market.symbol === 'GOOGL'
                ? 'G'
                : market.symbol === 'MSFT'
                  ? 'M'
                  : market.symbol === 'AMZN'
                    ? 'a'
                    : market.symbol === 'TSLA'
                      ? 'T'
                      : 'A'}
            </span>
            <div>
              <h2>
                {market.name} <span>{market.symbol}</span>
              </h2>
              <span className="muted">{market.sector} / Simulated market</span>
            </div>
          </div>
          <div className="instrument-price">
            <strong>{currency(market.price)}</strong>
            <span className={market.change >= 0 ? 'positive' : 'negative'}>
              {market.change >= 0 ? <ArrowUpRight size={15} /> : <ArrowDownRight size={15} />}{' '}
              {currency(Math.abs(market.change))} ({percent(market.changePercent)})
            </span>
          </div>
        </div>
        <div className="market-metrics">
          <div>
            <span>Session open</span>
            <strong>{currency(market.open)}</strong>
          </div>
          <div>
            <span>Session high</span>
            <strong>{currency(market.high)}</strong>
          </div>
          <div>
            <span>Session low</span>
            <strong>{currency(market.low)}</strong>
          </div>
          <div>
            <span>Simulated volume</span>
            <strong>{number(market.volume)}</strong>
          </div>
        </div>
        <PriceChart market={market} />
        <section className="watchlist">
          <div className="section-heading">
            <div className="segmented compact">
              <button
                className={!onlyWatchlist ? 'selected' : ''}
                onClick={() => setOnlyWatchlist(false)}
              >
                All instruments
              </button>
              <button
                className={onlyWatchlist ? 'selected' : ''}
                onClick={() => setOnlyWatchlist(true)}
              >
                Watchlist
              </button>
            </div>
            <label className="search-field instrument-search">
              <Search size={15} />
              <input
                aria-label="Search instruments"
                placeholder="Search instruments"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Last price</th>
                  <th>Session change</th>
                  <th className="trend-col">Trend</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {markets.map((m) => (
                  <tr key={m.symbol} className={symbol === m.symbol ? 'active-row' : ''}>
                    <td>
                      <button
                        className="company-button"
                        onClick={() => setSymbol(m.symbol)}
                        aria-label={'Select ' + m.name}
                      >
                        <span className={'stock-avatar small ' + m.symbol.toLowerCase()}>
                          {m.symbol === 'GOOGL' ? 'G' : m.symbol === 'AMZN' ? 'a' : m.symbol[0]}
                        </span>
                        <span>
                          <strong>{m.symbol}</strong>
                          <small>{m.name}</small>
                        </span>
                      </button>
                    </td>
                    <td className="numeric">{currency(m.price)}</td>
                    <td className={'numeric ' + (m.change >= 0 ? 'positive' : 'negative')}>
                      {percent(m.changePercent)}
                    </td>
                    <td className="trend-col">
                      <Sparkline data={m.history} color={m.change >= 0 ? '#148369' : '#c34d55'} />
                    </td>
                    <td>
                      <button
                        className={
                          'icon-button star-button ' +
                          (watchlist.includes(m.symbol) ? 'starred' : '')
                        }
                        aria-label={
                          (watchlist.includes(m.symbol) ? 'Remove ' : 'Add ') +
                          m.symbol +
                          (watchlist.includes(m.symbol) ? ' from watchlist' : ' to watchlist')
                        }
                        title="Toggle watchlist"
                        aria-pressed={watchlist.includes(m.symbol)}
                        onClick={() =>
                          onPreferences({
                            watchlist: watchlist.includes(m.symbol)
                              ? watchlist.filter((s) => s !== m.symbol)
                              : [...watchlist, m.symbol],
                          })
                        }
                      >
                        <Star
                          size={16}
                          fill={watchlist.includes(m.symbol) ? 'currentColor' : 'none'}
                        />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!markets.length && (
              <div className="empty-state">
                <Search size={25} />
                <h3>No matching instruments</h3>
              </div>
            )}
          </div>
        </section>
      </div>
      <div className="right-rail">
        <OrderTicket key={symbol} data={data} symbol={symbol} onComplete={refresh} busy={busy} />
        <OrderBook book={data.book} />
      </div>
    </div>
  );
}
