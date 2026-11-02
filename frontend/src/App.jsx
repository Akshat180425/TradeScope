import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import {
  ChartNoAxesCombined,
  BriefcaseBusiness,
  Layers3,
  ListOrdered,
  SlidersHorizontal,
  Play,
  Pause,
  StepForward,
  FastForward,
  Menu,
  X,
  ArrowUpRight,
  ArrowDownRight,
  LoaderCircle,
  Activity,
  Check,
  AlertCircle,
  Bell,
  ShieldCheck,
  LogOut,
  Wallet,
  Settings2,
  BookOpen,
  ShieldAlert,
} from 'lucide-react';
import { api, currency, percent, configureCurrency, setSessionToken, time } from './lib/api.js';
import Auth from './views/Auth.jsx';
import Modal from './components/Modal.jsx';
const Markets = lazy(() => import('./views/Markets.jsx'));
const Derivatives = lazy(() => import('./views/Derivatives.jsx'));
const Portfolios = lazy(() => import('./views/Portfolios.jsx'));
const Orders = lazy(() => import('./views/Orders.jsx'));
const ActivityView = lazy(() => import('./views/Activity.jsx'));
const Alerts = lazy(() => import('./views/Alerts.jsx'));
const Admin = lazy(() => import('./views/Admin.jsx'));
const Risk = lazy(() => import('./views/Risk.jsx'));
const Journal = lazy(() => import('./views/Journal.jsx'));

const navigation = [
  { id: 'markets', label: 'Markets', icon: ChartNoAxesCombined, title: 'Market overview' },
  { id: 'derivatives', label: 'Futures & Options', icon: Layers3, title: 'Futures & Options' },
  { id: 'portfolios', label: 'Portfolio', icon: BriefcaseBusiness, title: 'Portfolio overview' },
  { id: 'orders', label: 'Orders', icon: ListOrdered, title: 'Order history' },
  { id: 'activity', label: 'Activity', icon: Activity, title: 'Account activity' },
  { id: 'alerts', label: 'Price alerts', icon: Bell, title: 'Price alerts' },
  { id: 'journal', label: 'Trading journal', icon: BookOpen, title: 'Trading journal' },
  { id: 'risk', label: 'Risk center', icon: ShieldAlert, title: 'Risk center' },
  { id: 'admin', label: 'Administration', icon: ShieldCheck, title: 'Market administration' },
];
export default function App() {
  const [session, setSession] = useState(null),
    [checking, setChecking] = useState(true);
  const [view, setView] = useState(location.hash.slice(1) || 'markets');
  const [symbol, setSymbol] = useState('AAPL');
  const [data, setData] = useState(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [toast, setToast] = useState('');
  const [mobileNav, setMobileNav] = useState(false),
    [account, setAccount] = useState(false),
    [notifications, setNotifications] = useState(false),
    [confirm, setConfirm] = useState(null),
    [funding, setFunding] = useState(false);
  const [amount, setAmount] = useState('1000'),
    [fundingType, setFundingType] = useState('deposit');
  const [connection, setConnection] = useState('connecting');
  const requestId = useRef(0),
    activeRefresh = useRef(null),
    requests = useRef(new Map()),
    mutationBusy = useRef(false);
  const admin = session?.user.role === 'admin';
  const items = navigation.filter((n) => n.id !== 'admin' || admin);
  const item = items.find((n) => n.id === view) || items[0];
  function acceptSession(next) {
    setSessionToken(next.csrf);
    setSession(next);
    setData(null);
    setError('');
  }
  useEffect(() => {
    api('/auth/session')
      .then(acceptSession)
      .catch((e) => {
        if (e.status !== 401) setError(e.message);
      })
      .finally(() => setChecking(false));
    const expired = () => {
      setSession(null);
      setSessionToken('');
      setData(null);
    };
    window.addEventListener('tradescope:expired', expired);
    return () => window.removeEventListener('tradescope:expired', expired);
  }, []);
  const refresh = useCallback(() => {
    if (!session) return Promise.resolve();
    const key = session.user.id + ':' + symbol;
    // Coalesce live revisions while a snapshot is in flight. Otherwise a busy
    // market can invalidate every response before the account ever renders.
    if (activeRefresh.current?.key === key) return activeRefresh.current.promise;
    const id = ++requestId.current;
    const promise = (async () => {
      try {
        const next = await api('/state?symbol=' + symbol);
        if (id === requestId.current) {
          setData(next);
          setError('');
        }
      } catch (e) {
        if (id === requestId.current) setError(e.message);
      } finally {
        if (activeRefresh.current?.id === id) activeRefresh.current = null;
      }
    })();
    activeRefresh.current = { key, id, promise };
    return promise;
  }, [session?.user.id, symbol]);
  useEffect(() => {
    if (!session) return;
    refresh();
    const stream = new EventSource('/api/events');
    stream.onopen = () => setConnection('connected');
    stream.onerror = () => setConnection('reconnecting');
    stream.addEventListener('revision', refresh);
    stream.addEventListener('expired', () => window.dispatchEvent(new Event('tradescope:expired')));
    const timer = setInterval(refresh, 30000);
    return () => {
      stream.close();
      clearInterval(timer);
      requestId.current++;
      activeRefresh.current = null;
    };
  }, [refresh]);
  useEffect(() => {
    const handler = () => {
      setView(location.hash.slice(1) || 'markets');
      setMobileNav(false);
    };
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 7000);
    return () => clearTimeout(timer);
  }, [toast]);
  function navigate(id) {
    location.hash = id;
    setView(id);
    setMobileNav(false);
  }
  async function mutate(path, body = {}, method = 'POST', success = '') {
    if (mutationBusy.current) return false;
    mutationBusy.current = true;
    setBusy(true);
    const signature = JSON.stringify([path, method, body]);
    const key = requests.current.get(signature) || crypto.randomUUID();
    requests.current.set(signature, key);
    try {
      await api(path, { method, body, requestKey: key });
      requests.current.delete(signature);
      await refresh();
      if (success) setToast(success);
      return true;
    } catch (e) {
      if (e.status && e.status < 500) requests.current.delete(signature);
      setToast(e.message);
      return false;
    } finally {
      mutationBusy.current = false;
      setBusy(false);
    }
  }
  async function updatePreferences(patch) {
    try {
      const preferences = await api('/preferences', {
        method: 'PATCH',
        body: { ...session.preferences, ...patch },
      });
      setSession((s) => ({ ...s, preferences }));
      setData((d) => (d ? { ...d, preferences } : d));
    } catch (e) {
      setToast(e.message);
    }
  }
  function closePosition(position) {
    setConfirm({
      title: 'Close ' + position.symbol + ' position?',
      description: `${position.quantity} contract(s) will settle at the current model price, less simulated fees.`,
      action: () => mutate('/positions/' + position.id + '/close', {}, 'POST', 'Position closed.'),
      label: 'Close position',
    });
  }
  function cancelOrder(order) {
    setConfirm({
      title: 'Cancel order ' + order.id + '?',
      description: `${order.remaining} unfilled shares will be cancelled. Completed executions are unchanged.`,
      action: () => mutate('/orders/' + order.id, {}, 'DELETE', 'Order cancelled.'),
      label: 'Cancel order',
    });
  }
  configureCurrency(session?.preferences.currency, data?.simulation.fxRate);
  if (checking)
    return (
      <div className="loading-state">
        <LoaderCircle className="spin" />
        <span>Opening workspace</span>
      </div>
    );
  if (!session) return <Auth onSession={acceptSession} />;
  const p = data?.portfolio;
  const unread = data?.notifications.filter((n) => !n.read).length || 0;
  return (
    <div className="app-shell">
      {mobileNav && (
        <button
          className="nav-scrim"
          aria-label="Close navigation"
          onClick={() => setMobileNav(false)}
        />
      )}
      <aside className={'sidebar ' + (mobileNav ? 'mobile-open' : '')}>
        <a className="brand" href="#markets" onClick={() => navigate('markets')}>
          <span className="brand-icon">
            <ChartNoAxesCombined size={23} />
          </span>
          <span>
            TradeScope<span className="brand-dot">.</span>
          </span>
        </a>
        <div className="workspace-label">TRADING WORKSPACE</div>
        <nav aria-label="Main navigation">
          {items.map(({ id, label, icon: Icon }) => (
            <a
              key={id}
              href={'#' + id}
              aria-label={label}
              onClick={() => navigate(id)}
              className={item.id === id ? 'nav-link active' : 'nav-link'}
              aria-current={item.id === id ? 'page' : undefined}
            >
              <Icon size={19} />
              <span>{label}</span>
              {id === 'orders' && data && (
                <small>
                  {
                    data.orders.filter((o) => ['open', 'partial', 'waiting'].includes(o.status))
                      .length
                  }
                </small>
              )}
            </a>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button className="nav-link" onClick={() => setAccount(true)}>
            <Settings2 size={18} />
            Account settings
          </button>
          <div className="session-card">
            <span className="status-dot" />
            <div>
              <strong>{session.user.demo ? 'Demo workspace' : 'Paper account'}</strong>
              <span>Virtual money only</span>
            </div>
          </div>
          <div className="sidebar-foot">
            TRADESCOPE <span>02</span>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              title="Open navigation"
              aria-label="Open navigation"
              onClick={() => setMobileNav(true)}
            >
              <Menu size={21} />
            </button>
            <span>Workspace</span>
            <span className="mobile-brand">TradeScope</span>
            <span className="breadcrumb-slash">/</span>
            <strong>{item.label}</strong>
          </div>
          <div className="topbar-right">
            <select
              className="currency-select"
              aria-label="Display currency"
              value={session.preferences.currency}
              onChange={(e) => updatePreferences({ currency: e.target.value })}
            >
              <option>USD</option>
              <option>INR</option>
            </select>
            <button
              className="icon-button notification-button"
              title="Notifications"
              aria-label="Notifications"
              onClick={() => setNotifications(true)}
            >
              <Bell size={19} />
              {unread > 0 && <i />}
            </button>
            <button
              className="account-button"
              aria-label="Account settings"
              onClick={() => setAccount(true)}
            >
              <span className="avatar">
                {admin ? <ShieldCheck size={17} /> : <Wallet size={17} />}
              </span>
              <span>{session.user.label}</span>
            </button>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">PAPER TRADING / US EQUITIES</div>
              <h1>{item.title}</h1>
            </div>
            {data && (
              <div className="simulation-controls">
                <span className="simulation-time">
                  <i className={'status-dot ' + (data.simulation.running ? '' : 'paused')} />
                  {data.simulation.label}
                </span>
                {admin && (
                  <>
                    <button
                      className="icon-button bordered"
                      disabled={busy || data.simulation.running}
                      title="Advance one minute"
                      aria-label="Advance one minute"
                      onClick={() => mutate('/simulation', { action: 'step', steps: 1 })}
                    >
                      <StepForward size={18} />
                    </button>
                    <button
                      className="icon-button bordered"
                      disabled={busy || data.simulation.running}
                      title="Advance one trading day"
                      aria-label="Advance one trading day"
                      onClick={() => mutate('/simulation', { action: 'step', steps: 390 })}
                    >
                      <FastForward size={18} />
                    </button>
                    <button
                      className="button primary"
                      disabled={busy}
                      onClick={() =>
                        mutate('/simulation', {
                          action: data.simulation.running ? 'pause' : 'start',
                        })
                      }
                    >
                      {data.simulation.running ? <Pause size={16} /> : <Play size={16} />}
                      {data.simulation.running ? 'Pause' : 'Run simulation'}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
          {error && (
            <div className="error-banner" role="alert">
              <AlertCircle size={18} />
              <span>Backend unavailable. {error}</span>
              <button className="text-button" onClick={refresh}>
                Retry
              </button>
            </div>
          )}
          {session.preferences.currency === 'INR' && data && (
            <div className="fx-disclosure">
              INR display / 1 USD = {data.simulation.fxRate.toFixed(2)} INR / simulated rate. Orders
              and cash settle in USD.
            </div>
          )}
          {data?.risk?.paused && (
            <div className="risk-pause-banner" role="status">
              <ShieldAlert size={19} />
              <span>{data.risk.reason}. Sales and position closes remain available.</span>
              <button className="text-button" onClick={() => navigate('risk')}>
                Risk center
              </button>
            </div>
          )}
          {!data?.risk?.paused && data?.risk?.exposures.some((e) => e.warning) && (
            <div className="risk-pause-banner concentration-banner" role="status">
              <ShieldAlert size={19} />
              <span>
                Concentration warning:{' '}
                {data.risk.exposures
                  .filter((e) => e.warning)
                  .map((e) => e.symbol)
                  .join(', ')}
              </span>
              <button className="text-button" onClick={() => navigate('risk')}>
                Review exposure
              </button>
            </div>
          )}
          {!data ? (
            <div className="loading-state" role="status">
              <LoaderCircle size={26} className="spin" />
              <span>Loading account</span>
            </div>
          ) : (
            <>
              <section className="summary-band" aria-label="Account summary">
                <div className="summary-stat">
                  <span>Portfolio value</span>
                  <strong>{currency(p.equity)}</strong>
                  <small>{session.user.label}</small>
                </div>
                <div className="summary-stat">
                  <span>Net profit / loss</span>
                  <strong className={p.pnl >= 0 ? 'positive' : 'negative'}>
                    {p.pnl >= 0 ? '+' : ''}
                    {currency(p.pnl)}
                  </strong>
                  <small className={p.pnl >= 0 ? 'positive' : 'negative'}>
                    {p.pnl >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                    {percent(p.returnPercent)} vs net contributions
                  </small>
                </div>
                <div className="summary-stat">
                  <span>Available cash</span>
                  <strong>{currency(p.availableCash)}</strong>
                  <small>{currency(p.reservedCash)} reserved</small>
                </div>
                <div className="summary-stat">
                  <span>Realized P&L</span>
                  <strong className={p.realizedPnl < 0 ? 'negative' : ''}>
                    {currency(p.realizedPnl)}
                  </strong>
                  <small>{currency(p.feesPaid)} total fees</small>
                </div>
              </section>
              <Suspense
                fallback={
                  <div className="loading-state" role="status">
                    <LoaderCircle className="spin" size={24} />
                    <span>Loading workspace</span>
                  </div>
                }
              >
                {item.id === 'markets' && (
                  <Markets
                    data={data}
                    symbol={symbol}
                    setSymbol={setSymbol}
                    refresh={refresh}
                    busy={busy}
                    onPreferences={updatePreferences}
                  />
                )}
                {item.id === 'derivatives' && (
                  <Derivatives
                    data={data}
                    symbol={symbol}
                    setSymbol={setSymbol}
                    refresh={refresh}
                    busy={busy}
                    onClose={closePosition}
                  />
                )}
                {item.id === 'portfolios' && (
                  <Portfolios
                    data={data}
                    busy={busy}
                    onTrade={(s) => {
                      setSymbol(s);
                      navigate('markets');
                    }}
                    onClose={closePosition}
                    onFunding={() => setFunding(true)}
                  />
                )}
                {item.id === 'orders' && <Orders data={data} busy={busy} onCancel={cancelOrder} />}
                {item.id === 'activity' && <ActivityView data={data} />}
                {item.id === 'alerts' && <Alerts data={data} mutate={mutate} busy={busy} />}
                {item.id === 'admin' && <Admin data={data} mutate={mutate} busy={busy} />}
                {item.id === 'risk' && data.risk && (
                  <Risk data={data} mutate={mutate} busy={busy} />
                )}
                {item.id === 'journal' && <Journal data={data} mutate={mutate} busy={busy} />}
              </Suspense>
              <footer className="workspace-footer">
                <span>
                  <i className={'status-dot ' + (connection === 'connected' ? '' : 'paused')} />
                  {connection === 'connected'
                    ? 'Live connection'
                    : connection === 'reconnecting'
                      ? 'Reconnecting'
                      : 'Connecting'}
                </span>
                <span>Simulated prices / {data.simulation.feeBps / 100}% fees / SQLite</span>
              </footer>
            </>
          )}
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <Activity size={18} />
          <span>{toast}</span>
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => setToast('')}
          >
            <X size={15} />
          </button>
        </div>
      )}
      <Modal
        open={account}
        onClose={() => setAccount(false)}
        title="Account settings"
        description={session.user.label}
      >
        <dl className="detail-list">
          <div>
            <dt>Account</dt>
            <dd>{session.user.email || 'Anonymous demo'}</dd>
          </div>
          <div>
            <dt>Role</dt>
            <dd>{session.user.role}</dd>
          </div>
          <div>
            <dt>Verification</dt>
            <dd>{session.user.demo ? 'Not applicable' : 'Not enabled yet'}</dd>
          </div>
          <div>
            <dt>Session</dt>
            <dd>8 hours / private cookie</dd>
          </div>
        </dl>
        <label>
          Display currency
          <select
            value={session.preferences.currency}
            onChange={(e) => updatePreferences({ currency: e.target.value })}
          >
            <option>USD</option>
            <option>INR</option>
          </select>
        </label>
        <button
          className="button subtle full"
          onClick={async () => {
            try {
              await api('/auth/logout', { method: 'POST', body: {} });
              setAccount(false);
              setSession(null);
              setData(null);
              setSessionToken('');
            } catch (e) {
              setToast(e.message);
            }
          }}
        >
          <LogOut size={17} />
          Sign out
        </button>
      </Modal>
      <Modal
        open={notifications}
        onClose={() => setNotifications(false)}
        title="Notifications"
        description="Account updates"
      >
        <div className="notification-list">
          {data?.notifications.length ? (
            data.notifications.map((n) => (
              <div key={n.id} className={n.read ? 'read' : ''}>
                <span className="notification-mark">
                  <Bell size={16} />
                </span>
                <div>
                  <strong>{n.title}</strong>
                  <p>{n.detail}</p>
                  <small>{time(n.tick)}</small>
                </div>
                {!n.read && <i className="status-dot" />}
              </div>
            ))
          ) : (
            <div className="empty-state">
              <Bell />
              <h3>No notifications yet</h3>
            </div>
          )}
        </div>
        {unread > 0 && (
          <button
            className="button subtle full"
            disabled={busy}
            onClick={() => mutate('/notifications/read', {})}
          >
            <Check size={17} />
            Mark all read
          </button>
        )}
      </Modal>
      <Modal
        open={funding}
        onClose={() => setFunding(false)}
        title="Virtual funding"
        description="Simulation funds only"
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (
              await mutate(
                '/funding',
                { amount: Number(amount) * (fundingType === 'deposit' ? 1 : -1) },
                'POST',
                'Virtual funding recorded.',
              )
            )
              setFunding(false);
          }}
        >
          <div className="segmented">
            {['deposit', 'withdrawal'].map((t) => (
              <button
                key={t}
                type="button"
                className={t === fundingType ? 'selected' : ''}
                onClick={() => setFundingType(t)}
              >
                {t === 'deposit' ? 'Deposit' : 'Withdraw'}
              </button>
            ))}
          </div>
          <label>
            Amount (USD)
            <input
              type="number"
              min="0.01"
              max="1000000"
              step="0.01"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
          <p className="muted">Available: {currency(p?.availableCash)}. No real money moves.</p>
          <button className="button primary full" disabled={busy}>
            <Wallet size={16} />
            Confirm virtual {fundingType}
          </button>
        </form>
      </Modal>
      <Modal
        open={!!confirm}
        onClose={() => {
          if (!busy) setConfirm(null);
        }}
        title={confirm?.title || 'Confirm'}
        description={confirm?.description}
      >
        <div className="modal-actions">
          <button className="button subtle" disabled={busy} onClick={() => setConfirm(null)}>
            Keep current
          </button>
          <button
            className="button primary"
            disabled={busy}
            onClick={async () => {
              if (await confirm.action()) setConfirm(null);
            }}
          >
            {busy ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}
            {confirm?.label}
          </button>
        </div>
      </Modal>
    </div>
  );
}
