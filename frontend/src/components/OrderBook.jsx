import { number, currency, currencyCode } from '../lib/api.js';
export default function OrderBook({ book }) {
  const max = Math.max(...book.bids.map((l) => l.quantity), ...book.asks.map((l) => l.quantity), 1);
  return (
    <section className="book-section">
      <div className="section-heading">
        <h2>Order book</h2>
        <span className="muted">8 levels</span>
      </div>
      <div className="book-columns">
        {[
          ['Bid', book.bids, 'positive'],
          ['Ask', book.asks, 'negative'],
        ].map(([name, levels, color]) => (
          <div key={name}>
            <div className="book-header">
              <span>
                {name} ({currencyCode()})
              </span>
              <span>Shares</span>
            </div>
            {levels.slice(0, 8).map((level) => (
              <div className={'book-row ' + color} key={level.price}>
                <i style={{ width: (level.quantity / max) * 100 + '%' }} />
                <strong>{currency(level.price)}</strong>
                <span>{number(level.quantity)}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
