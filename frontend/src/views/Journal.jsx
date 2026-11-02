import { useEffect, useState } from 'react';
import { BookOpen, Plus, Pencil, Trash2, Save, Search } from 'lucide-react';
import { api, currency, time } from '../lib/api.js';
import Modal from '../components/Modal.jsx';

const blank = {
  title: '',
  notes: '',
  strategy: '',
  tags: [],
  status: 'planned',
  symbol: 'AAPL',
  tradeId: null,
};
export default function Journal({ data, mutate, busy }) {
  const [entries, setEntries] = useState([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState('');
  const [query, setQuery] = useState(''),
    [filter, setFilter] = useState('all'),
    [symbol, setSymbol] = useState('all');
  const [draft, setDraft] = useState(null),
    [tags, setTags] = useState(''),
    [removing, setRemoving] = useState(null);
  async function load() {
    try {
      setEntries(await api('/journal'));
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);
  function edit(entry) {
    setDraft(entry);
    setTags(entry.tags.join(', '));
  }
  const rows = entries.filter(
    (entry) =>
      (filter === 'all' || entry.status === filter) &&
      (symbol === 'all' || entry.symbol === symbol) &&
      [entry.title, entry.notes, entry.strategy, ...entry.tags]
        .join(' ')
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const trades = draft
    ? [
        ...(draft.trade && !data.activity.some((t) => t.id === draft.tradeId) ? [draft.trade] : []),
        ...data.activity,
      ].filter((t) => t.symbol === draft.symbol)
    : [];
  return (
    <div className="journal-view">
      <div className="journal-toolbar">
        <label className="search-field">
          <Search size={16} />
          <input
            aria-label="Search journal"
            placeholder="Search journal"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <select
          aria-label="Journal review status"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">All statuses</option>
          <option value="planned">Planned</option>
          <option value="reviewed">Reviewed</option>
        </select>
        <select
          aria-label="Journal symbol filter"
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
        >
          <option value="all">All symbols</option>
          {data.markets.map((m) => (
            <option key={m.symbol}>{m.symbol}</option>
          ))}
        </select>
        <button className="button primary" onClick={() => edit({ ...blank })}>
          <Plus size={16} />
          New entry
        </button>
      </div>
      {error && (
        <div className="error-banner" role="alert">
          {error}
          <button className="text-button" onClick={load}>
            Retry
          </button>
        </div>
      )}
      {loading ? (
        <div className="loading-state">Loading journal</div>
      ) : rows.length ? (
        <div className="journal-entries">
          {rows.map((entry) => (
            <article className="journal-entry" key={entry.id}>
              <div className="journal-entry-heading">
                <div>
                  <span className="eyebrow">
                    {entry.symbol} / {entry.strategy || 'No strategy'} / {entry.status}
                  </span>
                  <h2>{entry.title}</h2>
                </div>
                <div className="journal-actions">
                  <button
                    className="icon-button"
                    title="Edit entry"
                    aria-label={'Edit ' + entry.title}
                    onClick={() => edit(entry)}
                  >
                    <Pencil size={17} />
                  </button>
                  <button
                    className="icon-button"
                    title="Delete entry"
                    aria-label={'Delete ' + entry.title}
                    onClick={() => setRemoving(entry)}
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              </div>
              {entry.trade && (
                <div className="journal-execution">
                  <strong>
                    {entry.trade.instrument} / {entry.trade.side}
                  </strong>
                  <span>
                    {entry.trade.quantity} at {currency(entry.trade.price)}
                  </span>
                  <span>Fee {currency(entry.trade.fee || 0)}</span>
                  {entry.trade.pnl != null && (
                    <span className={entry.trade.pnl < 0 ? 'negative' : 'positive'}>
                      Realized {currency(entry.trade.pnl)}
                    </span>
                  )}
                </div>
              )}
              <p className="journal-notes">{entry.notes || 'No notes'}</p>
              <div className="journal-entry-footer">
                <span>{entry.tags.map((tag) => '#' + tag).join('  ')}</span>
                <time>{time(entry.createdTick)}</time>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <BookOpen />
          <h3>{entries.length ? 'No matching journal entries' : 'No journal entries yet'}</h3>
        </div>
      )}
      <Modal
        open={!!draft}
        onClose={() => {
          if (!busy) setDraft(null);
        }}
        title={draft?.id ? 'Edit journal entry' : 'New journal entry'}
        description="Private account journal"
      >
        {draft && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const payload = {
                title: draft.title,
                notes: draft.notes,
                strategy: draft.strategy,
                status: draft.status,
                symbol: draft.symbol,
                tradeId: draft.tradeId,
                tags: tags
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean),
              };
              if (
                await mutate(
                  '/journal' + (draft.id ? '/' + draft.id : ''),
                  payload,
                  draft.id ? 'PATCH' : 'POST',
                  'Journal entry saved.',
                )
              ) {
                setDraft(null);
                await load();
              }
            }}
          >
            <label>
              Title
              <input
                required
                maxLength={120}
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </label>
            <div className="journal-form-row">
              <label>
                Symbol
                <select
                  value={draft.symbol}
                  onChange={(e) =>
                    setDraft({ ...draft, symbol: e.target.value, tradeId: null, trade: null })
                  }
                >
                  {data.markets.map((m) => (
                    <option key={m.symbol}>{m.symbol}</option>
                  ))}
                </select>
              </label>
              <label>
                Review status
                <select
                  value={draft.status}
                  onChange={(e) => setDraft({ ...draft, status: e.target.value })}
                >
                  <option value="planned">Planned</option>
                  <option value="reviewed">Reviewed</option>
                </select>
              </label>
            </div>
            <label>
              Linked execution
              <select
                value={draft.tradeId || ''}
                onChange={(e) => setDraft({ ...draft, tradeId: e.target.value || null })}
              >
                <option value="">No execution</option>
                {trades.map((trade) => (
                  <option key={trade.id} value={trade.id}>
                    {trade.id} / {trade.instrument} / {trade.side} / {trade.quantity}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Strategy
              <input
                maxLength={80}
                value={draft.strategy}
                onChange={(e) => setDraft({ ...draft, strategy: e.target.value })}
              />
            </label>
            <label>
              Tags (comma-separated, up to 8)
              <input maxLength={246} value={tags} onChange={(e) => setTags(e.target.value)} />
            </label>
            <label>
              Trade thesis and review
              <textarea
                rows={6}
                maxLength={5000}
                value={draft.notes}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              />
            </label>
            <button className="button primary" disabled={busy}>
              <Save size={16} />
              Save entry
            </button>
          </form>
        )}
      </Modal>
      <Modal
        open={!!removing}
        onClose={() => {
          if (!busy) setRemoving(null);
        }}
        title="Delete journal entry?"
        description={removing?.title}
      >
        <button
          className="button primary"
          disabled={busy}
          onClick={async () => {
            if (await mutate('/journal/' + removing.id, {}, 'DELETE', 'Journal entry deleted.')) {
              setRemoving(null);
              await load();
            }
          }}
        >
          <Trash2 size={16} />
          Delete entry
        </button>
      </Modal>
    </div>
  );
}
