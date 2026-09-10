import { useState } from 'react';
import { Search, Download, ReceiptText } from 'lucide-react';
import { currency, time } from '../lib/api.js';
export default function ActivityView({ data }) {
  const [tab, setTab] = useState('trades'),
    [query, setQuery] = useState('');
  const rows = (tab === 'trades' ? data.activity : data.ledger).filter((r) =>
    JSON.stringify([r.id, r.symbol, r.side, r.kind, r.reference, r.orderId])
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <section className="orders-view">
      <div className="orders-toolbar">
        <div className="segmented">
          {['trades', 'ledger'].map((t) => (
            <button key={t} className={tab === t ? 'selected' : ''} onClick={() => setTab(t)}>
              {t === 'trades' ? 'Executions' : 'Cash ledger'}
            </button>
          ))}
        </div>
        <div className="filter-controls">
          <label className="search-field">
            <Search size={16} />
            <input
              aria-label="Search transactions"
              placeholder="Search transactions"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <a className="button subtle" href={'/api/export.csv?kind=' + tab}>
            <Download size={16} />
            Export CSV
          </a>
        </div>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Reference</th>
              <th>Time</th>
              <th>{tab === 'trades' ? 'Asset / side' : 'Entry'}</th>
              <th>{tab === 'trades' ? 'Quantity' : 'Amount'}</th>
              <th>{tab === 'trades' ? 'Notional' : 'Cash balance'}</th>
              {tab === 'trades' && <th>Fee</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <strong>{r.id}</strong>
                  <small>{r.orderId || r.reference || r.positionId || '--'}</small>
                </td>
                <td>{time(r.tick)}</td>
                <td>
                  {tab === 'trades' ? (
                    <>
                      <strong>{r.symbol}</strong>
                      <small>
                        {r.instrument} / {r.side}
                      </small>
                    </>
                  ) : (
                    r.kind.replaceAll('_', ' ')
                  )}
                </td>
                <td>
                  {tab === 'trades' ? (
                    r.quantity
                  ) : (
                    <span className={r.amountCents >= 0 ? 'positive' : 'negative'}>
                      {currency(r.amountCents / 100)}
                    </span>
                  )}
                </td>
                <td>{currency(tab === 'trades' ? r.total : r.balanceCents / 100)}</td>
                {tab === 'trades' && <td>{currency(r.fee || 0)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && (
        <div className="empty-state">
          <ReceiptText />
          <h3>No matching transactions</h3>
        </div>
      )}
      <div className="table-footer">
        {rows.length} recent records / exports include all records / settlement currency USD
      </div>
    </section>
  );
}
