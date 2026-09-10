import { useState } from 'react';
import { Search, Download, X, ClipboardList } from 'lucide-react';
import { currency, time } from '../lib/api.js';
import Modal from '../components/Modal.jsx';
export default function Orders({ data, onCancel, busy }) {
  const [status, setStatus] = useState('all'),
    [query, setQuery] = useState(''),
    [instrument, setInstrument] = useState('all');
  const [selected, setSelected] = useState(null);
  const detail = data.orders.find((o) => o.id === selected);
  const orders = data.orders.filter(
    (o) =>
      (status === 'all' ||
        (status === 'open'
          ? ['open', 'partial', 'waiting'].includes(o.status)
          : o.status === status)) &&
      (instrument === 'all' || o.instrument === instrument) &&
      (o.symbol + ' ' + o.id).toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <section className="orders-view">
      <div className="orders-toolbar">
        <div className="segmented">
          {['all', 'open', 'filled', 'cancelled', 'expired', 'rejected'].map((s) => (
            <button key={s} className={status === s ? 'selected' : ''} onClick={() => setStatus(s)}>
              {s === 'all' ? 'All orders' : s[0].toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        <div className="filter-controls">
          <label className="search-field">
            <Search size={16} />
            <input
              placeholder="Search symbol or order"
              aria-label="Search orders"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <select
            aria-label="Filter instrument"
            value={instrument}
            onChange={(e) => setInstrument(e.target.value)}
          >
            <option value="all">All instruments</option>
            <option value="spot">Spot</option>
            <option value="futures">Futures</option>
            <option value="options">Options</option>
          </select>
          <a
            className="icon-button"
            href={'/api/export.csv?userId=' + data.portfolio.user.id}
            aria-label="Export trades CSV"
            title="Export trades CSV"
          >
            <Download size={19} />
          </a>
        </div>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Order</th>
              <th>Asset</th>
              <th>Side / type</th>
              <th>Filled / qty</th>
              <th>Price</th>
              <th>Status</th>
              <th>Placed</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id}>
                <td>
                  <button
                    className="text-button"
                    aria-label={'View order ' + o.id}
                    onClick={() => setSelected(o.id)}
                  >
                    #{o.id}
                  </button>
                </td>
                <td>
                  <strong>{o.symbol}</strong>
                  <small>{o.instrument}</small>
                </td>
                <td>
                  <span className={o.side === 'buy' ? 'positive' : 'negative'}>
                    {o.instrument === 'options' ? o.optionType : o.side}
                  </span>
                  <small>
                    {o.orderType.replaceAll('_', ' ')} / {(o.timeInForce || 'gtc').toUpperCase()}
                  </small>
                </td>
                <td>
                  {o.quantity - o.remaining} / {o.quantity}
                </td>
                <td>
                  {o.averagePrice
                    ? currency(o.averagePrice)
                    : o.limitPrice
                      ? currency(o.limitPrice)
                      : '--'}
                </td>
                <td>
                  <span className={'status ' + o.status}>{o.status}</span>
                </td>
                <td className="muted">{time(o.createdTick)}</td>
                <td>
                  {['open', 'partial', 'waiting'].includes(o.status) && (
                    <button
                      className="icon-button"
                      title="Cancel order"
                      aria-label={'Cancel order ' + o.id}
                      disabled={busy}
                      onClick={() => onCancel(o)}
                    >
                      <X size={17} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!orders.length && (
        <div className="empty-state">
          <ClipboardList size={30} />
          <h3>No matching orders</h3>
          <span>
            {status === 'open' ? 'No orders are waiting to fill.' : 'Try another filter.'}
          </span>
        </div>
      )}
      <div className="table-footer">{orders.length} recent orders / up to 500 displayed</div>
      <Modal
        open={!!detail}
        onClose={() => setSelected(null)}
        title={'Order ' + (detail?.id || '')}
        description={detail ? detail.symbol + ' / ' + detail.instrument : ''}
      >
        {detail && (
          <>
            <dl className="detail-list">
              <div>
                <dt>Status</dt>
                <dd>
                  <span className={'status ' + detail.status}>{detail.status}</span>
                </dd>
              </div>
              <div>
                <dt>Quantity filled</dt>
                <dd>
                  {detail.quantity - detail.remaining} / {detail.quantity}
                </dd>
              </div>
              <div>
                <dt>Average execution</dt>
                <dd>{currency(detail.averagePrice)}</dd>
              </div>
              <div>
                <dt>Fees paid</dt>
                <dd>{currency(detail.feesPaid || 0)}</dd>
              </div>
              {detail.stopPrice && (
                <div>
                  <dt>Stop trigger</dt>
                  <dd>{currency(detail.stopPrice)}</dd>
                </div>
              )}
              {detail.limitPrice && (
                <div>
                  <dt>Limit</dt>
                  <dd>{currency(detail.limitPrice)}</dd>
                </div>
              )}
            </dl>
            <h3>Order lifecycle</h3>
            <ol className="order-timeline">
              {(detail.events || []).map((e, i) => (
                <li key={i}>
                  <strong>{e.status}</strong>
                  <span>{e.detail}</span>
                  <small>{time(e.tick)}</small>
                </li>
              ))}
            </ol>
            <h3>Executions</h3>
            <div className="fill-list">
              {data.activity
                .filter((t) => t.orderId === detail.id)
                .map((t) => (
                  <div key={t.id}>
                    <span>
                      {t.quantity} at {currency(t.price)}
                    </span>
                    <small>
                      {currency(t.fee || 0)} fee / {time(t.tick)}
                    </small>
                  </div>
                ))}
            </div>
            {!data.activity.some((t) => t.orderId === detail.id) && (
              <p className="muted">No recent executions.</p>
            )}
          </>
        )}
      </Modal>
    </section>
  );
}
