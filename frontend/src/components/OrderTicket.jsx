import { useState, useEffect, useRef } from 'react';
import { ArrowUpRight, ArrowDownRight, LoaderCircle, CheckCircle2 } from 'lucide-react';
import { api, currency, number } from '../lib/api.js';
export default function OrderTicket({ data, symbol, instrument = 'spot', onComplete, busy }) {
  const [side, setSide] = useState('buy'),
    [orderType, setType] = useState('market'),
    [quantity, setQuantity] = useState('10');
  const [limitPrice, setLimit] = useState(''),
    [strike, setStrike] = useState(''),
    [optionType, setOption] = useState('call'),
    [expiryDays, setExpiry] = useState('7');
  const [stopPrice, setStop] = useState(''),
    [timeInForce, setTimeInForce] = useState('gtc');
  const pending = useRef(null),
    sendingRef = useRef(false);
  const [quote, setQuote] = useState(null),
    [quoteError, setQuoteError] = useState(''),
    [sending, setSending] = useState(false),
    [message, setMessage] = useState('');
  const market = data.markets.find((m) => m.symbol === symbol);
  useEffect(() => {
    setLimit(market.price.toFixed(2));
    setStop(market.price.toFixed(2));
    setStrike((Math.round(market.price / 5) * 5).toFixed(2));
    setMessage('');
  }, [symbol]);
  useEffect(() => {
    setQuantity(instrument === 'spot' ? '10' : '1');
    setType('market');
    setSide('buy');
    setMessage('');
  }, [instrument]);
  const input = {
    symbol,
    instrument,
    side: instrument === 'options' ? 'buy' : side,
    orderType: instrument === 'spot' ? orderType : 'market',
    quantity: Number(quantity),
    ...(instrument === 'spot' && ['limit', 'stop_limit'].includes(orderType)
      ? { limitPrice: Number(limitPrice) }
      : {}),
    ...(instrument === 'spot' && orderType.startsWith('stop_')
      ? { stopPrice: Number(stopPrice) }
      : {}),
    timeInForce,
    ...(instrument === 'options' ? { strike: Number(strike), optionType } : {}),
    expiryDays: Number(expiryDays),
  };
  const inputKey = JSON.stringify(input);
  useEffect(() => {
    let active = true;
    let timer;
    setQuote(null);
    setQuoteError('');
    const refreshQuote = () => {
      api('/quote', { method: 'POST', body: JSON.parse(inputKey) })
        .then((q) => {
          if (active) {
            setQuote(q);
            setQuoteError('');
          }
        })
        .catch((e) => {
          if (active) {
            setQuote(null);
            setQuoteError(e.message);
          }
        })
        .finally(() => {
          // Poll after completion: market ticks must not keep cancelling the
          // debounce or discard every response while prices are moving.
          if (active) timer = setTimeout(refreshQuote, 1000);
        });
    };
    timer = setTimeout(refreshQuote, 180);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [
    inputKey,
    data.simulation.volatility,
    data.simulation.feeBps,
    JSON.stringify(data.risk?.limits),
    data.risk?.paused,
  ]);
  async function submit(event) {
    event.preventDefault();
    if (sendingRef.current) return;
    sendingRef.current = true;
    if (pending.current?.signature !== inputKey)
      pending.current = { signature: inputKey, key: crypto.randomUUID() };
    setSending(true);
    setMessage('');
    try {
      const order = await api('/orders', {
        method: 'POST',
        body: input,
        requestKey: pending.current.key,
      });
      pending.current = null;
      setMessage(
        order.status === 'filled'
          ? 'Order filled at ' + currency(order.averagePrice)
          : order.status === 'partial'
            ? 'Order partially filled; remainder is open.'
            : order.status === 'waiting'
              ? 'Stop order accepted. Waiting for trigger.'
              : 'Limit order placed.',
      );
      await onComplete();
    } catch (error) {
      if (error.status && error.status < 500) pending.current = null;
      setMessage(error.message);
    } finally {
      setSending(false);
      sendingRef.current = false;
    }
  }
  const available = data.portfolio.holdings.find((h) => h.symbol === symbol)?.available || 0;
  const shortCash =
    quote &&
    (input.side === 'buy' || instrument !== 'spot') &&
    quote.requiredCash > data.portfolio.availableCash;
  return (
    <aside className="order-ticket">
      <div className="section-heading">
        <h2>{instrument === 'spot' ? 'Place an order' : 'Open a position'}</h2>
        <span className="small-tag">{symbol}</span>
      </div>
      <form onSubmit={submit}>
        <div className="segmented trade-side">
          {(instrument === 'options' ? ['call', 'put'] : ['buy', 'sell']).map((value) => (
            <button
              type="button"
              key={value}
              aria-pressed={(instrument === 'options' ? optionType : side) === value}
              className={
                (instrument === 'options' ? optionType : side) === value
                  ? value === 'sell'
                    ? 'selected sell'
                    : 'selected buy'
                  : ''
              }
              onClick={() => {
                instrument === 'options' ? setOption(value) : setSide(value);
                setMessage('');
              }}
            >
              {value === 'buy' ? (
                <ArrowUpRight size={16} />
              ) : value === 'sell' ? (
                <ArrowDownRight size={16} />
              ) : null}
              {instrument === 'futures'
                ? value === 'buy'
                  ? 'Long'
                  : 'Short'
                : value[0].toUpperCase() + value.slice(1)}
            </button>
          ))}
        </div>
        {instrument === 'spot' ? (
          <label>
            Order type
            <select value={orderType} onChange={(e) => setType(e.target.value)}>
              <option value="market">Market</option>
              <option value="limit">Limit</option>
              <option value="stop_market">Stop market</option>
              <option value="stop_limit">Stop limit</option>
            </select>
          </label>
        ) : (
          <label>
            Expiry
            <select value={expiryDays} onChange={(e) => setExpiry(e.target.value)}>
              {[1, 3, 7, 14, 30].map((d) => (
                <option key={d} value={d}>
                  {d} trading {d === 1 ? 'day' : 'days'}
                </option>
              ))}
            </select>
          </label>
        )}
        {instrument === 'spot' && ['limit', 'stop_limit'].includes(orderType) && (
          <label>
            Limit price (USD)
            <input
              type="number"
              min="0.01"
              step="0.01"
              required
              value={limitPrice}
              onChange={(e) => setLimit(e.target.value)}
            />
          </label>
        )}
        {instrument === 'spot' && orderType.startsWith('stop_') && (
          <label>
            Stop price (USD)
            <input
              type="number"
              required
              min="0.01"
              step="0.01"
              value={stopPrice}
              onChange={(e) => setStop(e.target.value)}
            />
          </label>
        )}
        {instrument === 'spot' && orderType !== 'market' && (
          <label>
            Time in force
            <select value={timeInForce} onChange={(e) => setTimeInForce(e.target.value)}>
              <option value="gtc">Good till cancelled</option>
              <option value="day">Day</option>
            </select>
          </label>
        )}
        {instrument === 'options' && (
          <label>
            Strike price (USD)
            <input
              type="number"
              min="0.01"
              step="0.01"
              required
              value={strike}
              onChange={(e) => setStrike(e.target.value)}
            />
          </label>
        )}
        <label>
          Quantity <span>{instrument === 'spot' ? 'Shares' : 'Contracts'}</span>
          <input
            type="number"
            min="1"
            max="1000"
            step="1"
            required
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </label>
        <dl className="order-estimate">
          <div>
            <dt>{instrument === 'options' ? 'Premium / share' : 'Estimated price'}</dt>
            <dd>{quote ? currency(quote.price) : '--'}</dd>
          </div>
          {instrument !== 'spot' && (
            <div>
              <dt>Contract size</dt>
              <dd>100 shares</dd>
            </div>
          )}
          <div>
            <dt>{instrument === 'futures' ? 'Notional value' : 'Estimated total'}</dt>
            <dd>{quote ? currency(quote.total) : '--'}</dd>
          </div>
          {instrument === 'futures' && (
            <div>
              <dt>Initial margin (20%)</dt>
              <dd>{quote ? currency(quote.margin) : '--'}</dd>
            </div>
          )}
        </dl>
        <dl className="order-fees">
          <div>
            <dt>Simulated fee ({data.simulation.feeBps / 100}%)</dt>
            <dd>{quote ? currency(quote.fee) : '--'}</dd>
          </div>
          <div>
            <dt>
              {input.side === 'sell' && instrument === 'spot'
                ? 'Estimated proceeds'
                : 'Cash required'}
            </dt>
            <dd>
              {quote
                ? currency(
                    input.side === 'sell' && instrument === 'spot'
                      ? quote.total - quote.fee
                      : quote.requiredCash,
                  )
                : '--'}
            </dd>
          </div>
        </dl>
        {orderType.startsWith('stop_') && (
          <p className="ticket-disclosure">
            Trigger uses the simulated stock price. Gaps can change execution cost; insufficient
            cash or liquidity may cause rejection.
          </p>
        )}
        <div className="balance-line">
          <span>
            {instrument === 'spot' && side === 'sell' ? 'Available shares' : 'Available cash'}
          </span>
          <strong>
            {instrument === 'spot' && side === 'sell'
              ? number(available)
              : currency(data.portfolio.availableCash)}
          </strong>
        </div>
        {quote?.risk?.warning && (
          <p className="risk-ticket-warning">
            <span>{quote.risk.warning}</span>
          </p>
        )}
        {quote?.risk?.error && (
          <p className="field-error" role="alert">
            {quote.risk.error}
          </p>
        )}
        {(quoteError || shortCash) && (
          <p className="inline-error" role="status">
            {quoteError || 'Insufficient available cash.'}
          </p>
        )}
        <button
          className={
            'button primary full ' +
            (side === 'sell' && instrument !== 'options' ? 'danger-fill' : '')
          }
          type="submit"
          disabled={
            !!quote?.risk?.error ||
            sending ||
            busy ||
            !quote ||
            !!shortCash ||
            (instrument === 'spot' && side === 'sell' && Number(quantity) > available)
          }
        >
          {sending ? <LoaderCircle size={17} className="spin" /> : <ArrowUpRight size={17} />}{' '}
          {instrument === 'options'
            ? 'Buy ' + optionType
            : instrument === 'futures'
              ? 'Open ' + (side === 'buy' ? 'long' : 'short')
              : side === 'buy'
                ? 'Buy'
                : 'Sell'}{' '}
          {symbol}
        </button>
        {message && (
          <p className="order-message" role="status">
            {message}
          </p>
        )}
      </form>
      <div className="ticket-footer">
        <CheckCircle2 size={14} />
        <span>Paper trading · USD</span>
      </div>
    </aside>
  );
}
