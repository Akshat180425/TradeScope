import test from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../backend/src/domain/engine.js';
import { Exchange } from '../backend/src/domain/exchange.js';
import { contractPrice } from '../backend/src/domain/pricing.js';
import { money } from '../backend/src/domain/catalog.js';
const spot = (extra = {}) => ({
  userId: '1',
  symbol: 'AAPL',
  instrument: 'spot',
  side: 'buy',
  orderType: 'market',
  quantity: 3,
  ...extra,
});
const derivative = (extra = {}) => ({
  ...spot(),
  instrument: 'futures',
  quantity: 1,
  expiryDays: 1,
  ...extra,
});

test('a seed reproduces all five independent price histories', () => {
  const a = new Engine(null, 42),
    b = new Engine(null, 42),
    c = new Engine(null, 43);
  a.advance(5);
  b.advance(5);
  assert.deepEqual(a.state.markets, b.state.markets);
  assert.notDeepEqual(a.state.markets, c.state.markets);
  assert.equal(new Set(a.state.markets.map((m) => m.price)).size, 5);
});
test('market buy uses the quote and debits cash exactly once', () => {
  const e = new Engine(),
    before = e.portfolio('1'),
    quote = e.quote(spot());
  const order = e.placeOrder(spot());
  assert.equal(order.status, 'filled');
  assert.equal(order.remaining, 0);
  assert.equal(e.portfolio('1').cash, money(before.cash - quote.total));
  assert.equal(e.portfolio('1').holdings.find((h) => h.symbol === 'AAPL').quantity, 18);
});
test('multi-level market fills conserve quantities and cash', () => {
  const e = new Engine(),
    input = spot({ quantity: 201 }),
    before = e.portfolio('1').cash,
    q = e.quote(input);
  e.placeOrder(input);
  assert.equal(e.portfolio('1').cash, money(before - q.total));
  assert.equal(e.portfolio('1').holdings.find((h) => h.symbol === 'AAPL').quantity, 216);
});
test('limit orders reserve funds, prevent overspending, and release on cancellation', () => {
  const e = new Engine();
  const before = e.portfolio('1');
  const order = e.placeOrder(spot({ orderType: 'limit', limitPrice: 100, quantity: 500 }));
  assert.equal(order.status, 'open');
  assert.equal(e.portfolio('1').reservedCash, 50000);
  assert.throws(() => e.placeOrder(spot({ quantity: 100 })), /Insufficient/);
  e.cancelOrder(order.id, '1');
  assert.equal(e.portfolio('1').availableCash, before.availableCash);
  assert.throws(() => e.cancelOrder(order.id, '1'), /Only an open/);
});
test('sell orders reserve shares and cannot oversell or be cancelled by another account', () => {
  const e = new Engine(),
    o = e.placeOrder(spot({ side: 'sell', orderType: 'limit', limitPrice: 500, quantity: 10 }));
  assert.equal(e.portfolio('1').holdings.find((h) => h.symbol === 'AAPL').available, 5);
  assert.throws(() => e.placeOrder(spot({ side: 'sell', quantity: 6 })), /Not enough/);
  assert.throws(() => e.cancelOrder(o.id, '2'), /not found/);
  e.cancelOrder(o.id, '1');
  assert.equal(e.portfolio('1').holdings.find((h) => h.symbol === 'AAPL').available, 15);
});
test('pending orders execute when the simulated market crosses their limit', () => {
  const e = new Engine();
  const o = e.placeOrder(spot({ orderType: 'limit', limitPrice: 200, quantity: 4 }));
  e.market('AAPL').price = 190;
  e.exchange.refresh();
  assert.equal(o.status, 'filled');
  assert.equal(o.averagePrice, 200);
  assert.equal(e.portfolio('1').reservedCash, 0);
});
test('the exchange preserves symbol isolation, FIFO, and partial quantities', () => {
  const state = { markets: [{ symbol: 'AAPL' }, { symbol: 'MSFT' }], orders: [], liquidity: [] };
  const events = [];
  const ex = new Exchange(state, (o, q, p) => events.push({ id: o.id, q, p }));
  const order = (id, symbol, side, quantity, limitPrice) => ({
    id,
    symbol,
    side,
    quantity,
    remaining: quantity,
    limitPrice,
    orderType: 'limit',
    userId: id,
    status: 'open',
  });
  const first = order('first', 'AAPL', 'sell', 5, 100),
    second = order('second', 'AAPL', 'sell', 5, 100),
    other = order('other', 'MSFT', 'sell', 10, 1);
  ex.submit(first);
  ex.submit(second);
  ex.submit(other);
  ex.submit(order('taker', 'AAPL', 'buy', 7, 101));
  assert.equal(first.remaining, 0);
  assert.equal(second.remaining, 3);
  assert.equal(other.remaining, 10);
  assert.deepEqual(
    events.filter((e) => e.id !== 'taker'),
    [
      { id: 'first', q: 5, p: 100 },
      { id: 'second', q: 2, p: 100 },
    ],
  );
});
test('self-trade prevention cancels an account own resting order', () => {
  const state = { markets: [{ symbol: 'AAPL' }], orders: [], liquidity: [] };
  let fills = 0;
  const ex = new Exchange(state, () => fills++);
  const first = {
    id: 'a',
    symbol: 'AAPL',
    side: 'sell',
    quantity: 1,
    remaining: 1,
    limitPrice: 100,
    orderType: 'limit',
    userId: 'same',
    status: 'open',
  };
  ex.submit(first);
  ex.submit({ ...first, id: 'b', side: 'buy', limitPrice: 101 });
  assert.equal(fills, 0);
  assert.equal(first.status, 'cancelled');
});
test('selling records realized profit using average cost', () => {
  const e = new Engine(),
    h = e.portfolio('1').holdings.find((h) => h.symbol === 'AAPL'),
    q = e.quote(spot({ side: 'sell' }));
  e.placeOrder(spot({ side: 'sell' }));
  assert.equal(e.portfolio('1').realizedPnl, money(q.total - h.averageCost * 3));
});
test('futures debit margin, preserve equity, and close without duplicating cash', () => {
  const e = new Engine(),
    before = e.portfolio('1');
  const input = derivative(),
    q = e.quote(input);
  e.placeOrder(input);
  const p = e.portfolio('1').positions[0];
  assert.equal(p.margin, q.requiredCash);
  assert.equal(e.portfolio('1').cash, money(before.cash - q.requiredCash));
  assert.equal(e.portfolio('1').equity, before.equity);
  e.closePosition(p.id, '1');
  assert.equal(e.portfolio('1').cash, before.cash);
  assert.throws(() => e.closePosition(p.id, '1'), /already/);
});
test('long and short futures have opposite mark-to-market P&L', () => {
  const e = new Engine();
  e.placeOrder(derivative());
  e.placeOrder(derivative({ side: 'sell' }));
  e.market('AAPL').price += 5;
  const p = e.portfolio('1').positions;
  assert.equal(p[0].pnl, -p[1].pnl);
});
test('long options debit premium and both call and put settle at intrinsic value', () => {
  assert.equal(
    contractPrice({ instrument: 'options', optionType: 'call', strike: 100, expiryTick: 0 }, 90, 1),
    0,
  );
  assert.equal(
    contractPrice({ instrument: 'options', optionType: 'put', strike: 100, expiryTick: 0 }, 90, 1),
    10,
  );
  const e = new Engine(),
    before = e.portfolio('1').cash;
  e.placeOrder(derivative({ instrument: 'options', optionType: 'put', strike: 230 }));
  const p = e.portfolio('1').positions[0];
  assert.equal(e.portfolio('1').cash, money(before - p.entryPrice * 100));
  e.advance(390);
  assert.equal(e.state.positions[0].status, 'expired');
  assert.equal(e.portfolio('1').positions.length, 0);
  assert.equal(
    e.portfolio('1').cash,
    money(before - p.entryPrice * 100 + Math.max(0, 230 - e.market('AAPL').price) * 100),
  );
});
test('futures are liquidated when equity falls below maintenance margin', () => {
  const e = new Engine();
  e.placeOrder(derivative());
  e.market('AAPL').price = 150;
  e.advance();
  assert.equal(e.state.positions[0].status, 'liquidated');
});
test('restoring an engine preserves balances and resting orders', () => {
  const e = new Engine();
  e.placeOrder(spot({ orderType: 'limit', limitPrice: 100 }));
  const restored = new Engine(structuredClone(e.state));
  assert.deepEqual(restored.portfolio('1'), e.portfolio('1'));
  assert.deepEqual(restored.exchange.depth('AAPL'), e.exchange.depth('AAPL'));
  restored.advance(10);
  e.advance(10);
  assert.deepEqual(restored.portfolio('1'), e.portfolio('1'));
});

test('quotes exclude own orders that self-trade prevention will cancel', () => {
  const e = new Engine();
  e.placeOrder(
    spot({ side: 'sell', orderType: 'limit', limitPrice: e.market('AAPL').price, quantity: 5 }),
  );
  const input = spot({ quantity: 5 });
  const quote = e.quote(input);
  e.user('1').cash = money(quote.requiredCash - 0.01);
  assert.throws(() => e.placeOrder(input), /Insufficient/);
  e.user('1').cash = quote.requiredCash;
  e.placeOrder(input);
  assert.equal(e.user('1').cash, 0);
});

test('restart preserves queue priority between market makers and user orders', () => {
  const e = new Engine();
  const bestBid = e.exchange.depth('AAPL').bids[0];
  const resting = e.placeOrder(
    spot({ orderType: 'limit', limitPrice: bestBid.price, quantity: 1 }),
  );
  const restored = new Engine(structuredClone(e.state));
  e.placeOrder(spot({ userId: '2', side: 'sell', quantity: 1 }));
  restored.placeOrder(spot({ userId: '2', side: 'sell', quantity: 1 }));
  assert.equal(resting.status, 'open');
  assert.equal(restored.state.orders.find((o) => o.id === resting.id).status, 'open');
  assert.deepEqual(restored.portfolio('1'), e.portfolio('1'));
});
