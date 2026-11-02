import test from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../backend/src/domain/engine.js';
import { DatabaseStore } from '../backend/src/storage/database.js';
import { DEFAULT_RISK_LIMITS } from '../backend/src/domain/risk.js';
import { MINUTES_PER_DAY } from '../backend/src/domain/catalog.js';

const account = 'U-risk';
const input = (extra = {}) => ({
  userId: account,
  symbol: 'AAPL',
  instrument: 'spot',
  side: 'buy',
  orderType: 'market',
  quantity: 2,
  ...extra,
});
function engine() {
  const e = new Engine();
  e.createAccount(account);
  e.state.feeBps = 10;
  return e;
}
function limits(e, patch) {
  return e.setRiskLimits(account, { ...e.state.risk[account].limits, ...patch });
}
const note = (extra = {}) => ({
  title: 'Entry thesis',
  notes: 'Wait for confirmation.',
  strategy: 'Breakout',
  symbol: 'AAPL',
  tags: ['review'],
  status: 'planned',
  tradeId: null,
  ...extra,
});

test('position limits count holdings, resting buys and stops without crediting pending sales', () => {
  const e = engine();
  limits(e, { maxSharesPerSymbol: 5 });
  e.placeOrder(input());
  const pending = e.placeOrder(input({ orderType: 'limit', limitPrice: 1, quantity: 2 }));
  e.placeOrder(input({ orderType: 'stop_limit', stopPrice: 900, limitPrice: 901, quantity: 1 }));
  e.placeOrder(input({ side: 'sell', orderType: 'limit', limitPrice: 1000, quantity: 2 }));
  assert.throws(() => e.placeOrder(input({ quantity: 1 })), /position limit/);
  e.cancelOrder(pending.id, account);
  assert.doesNotThrow(() => e.placeOrder(input({ quantity: 1 })));
  assert.equal(e.snapshot(account).risk.exposures[0].pendingShares, 1);
});

test('futures and options limits use gross contract quantities per symbol', () => {
  const e = engine();
  limits(e, { maxFuturesPerSymbol: 1, maxOptionsPerSymbol: 1 });
  e.placeOrder(input({ instrument: 'futures', quantity: 1, expiryDays: 7 }));
  assert.throws(
    () => e.placeOrder(input({ instrument: 'futures', side: 'sell', quantity: 1 })),
    /position limit/,
  );
  e.placeOrder(
    input({ instrument: 'options', optionType: 'call', strike: 225, quantity: 1, expiryDays: 7 }),
  );
  assert.throws(
    () =>
      e.placeOrder(input({ instrument: 'options', optionType: 'put', strike: 225, quantity: 1 })),
    /position limit/,
  );
  e.closePosition(e.portfolio(account).positions[0].id, account);
  assert.doesNotThrow(() =>
    e.placeOrder(input({ instrument: 'futures', side: 'sell', quantity: 1 })),
  );
});

test('concentration warnings include derivative underlying exposure and pending buys', () => {
  const e = engine();
  limits(e, { concentrationWarningPercent: 20 });
  e.placeOrder(input({ instrument: 'futures', quantity: 1 }));
  const exposure = e.snapshot(account).risk.exposures[0];
  assert.equal(exposure.warning, true);
  assert.equal(exposure.grossExposure, e.market('AAPL').price * 100);
  assert.match(e.orderRisk(input({ quantity: 1 })).warning, /Projected AAPL/);
  e.user(account).cash = -100000;
  assert.equal(e.snapshot(account).risk.exposures[0].concentration, null);
});

test('manual pauses cancel new exposure but preserve exits and other accounts', () => {
  const e = engine();
  e.createAccount('U-other');
  e.placeOrder(input({ quantity: 3 }));
  e.placeOrder(input({ instrument: 'futures', quantity: 1 }));
  const pending = e.placeOrder(input({ orderType: 'limit', limitPrice: 1 }));
  const sell = e.placeOrder(
    input({ side: 'sell', quantity: 1, orderType: 'stop_market', stopPrice: 1 }),
  );
  e.setTradingPause(account, true);
  assert.equal(pending.status, 'cancelled');
  assert.equal(sell.status, 'waiting');
  assert.throws(() => e.placeOrder(input()), /paused/);
  assert.doesNotThrow(() => e.placeOrder(input({ side: 'sell', quantity: 1 })));
  assert.doesNotThrow(() => e.closePosition(e.portfolio(account).positions[0].id, account));
  assert.doesNotThrow(() => e.placeOrder(input({ userId: 'U-other' })));
  e.setTradingPause(account, false);
  assert.doesNotThrow(() => e.placeOrder(input()));
});

test('daily loss accounting excludes funding and locks even after deposits, rebounds or limit increases', () => {
  const e = engine();
  limits(e, { dailyLossLimit: 100 });
  e.fund(account, 5000);
  e.fund(account, -2000);
  assert.equal(e.snapshot(account).risk.dailyPnl, 0);
  e.placeOrder(input({ quantity: 10 }));
  e.market('AAPL').price -= 20;
  e.enforceRisk();
  assert.equal(e.snapshot(account).risk.lossLocked, true);
  const loss = e.snapshot(account).risk.dailyPnl;
  e.fund(account, 10000);
  assert.equal(e.snapshot(account).risk.dailyPnl, loss);
  e.market('AAPL').price += 40;
  limits(e, { dailyLossLimit: 100000 });
  assert.equal(e.snapshot(account).risk.lossLocked, true);
  assert.throws(() => e.setTradingPause(account, false), /next simulated session/);
  assert.throws(() => e.placeOrder(input()), /paused/);
  e.state.tick = MINUTES_PER_DAY - 1;
  e.advance(1);
  assert.equal(e.snapshot(account).risk.lossLocked, false);
  assert.doesNotThrow(() => e.placeOrder(input()));
});

test('mark-to-market loss cancels queued buys before refreshed liquidity can execute them', () => {
  const e = engine();
  limits(e, { dailyLossLimit: 50 });
  e.placeOrder(input({ quantity: 10 }));
  const pending = e.placeOrder(
    input({ orderType: 'limit', limitPrice: e.market('AAPL').price - 5 }),
  );
  const stop = e.placeOrder(
    input({ orderType: 'stop_market', stopPrice: e.market('AAPL').price + 5 }),
  );
  const count = e.state.trades.filter((t) => t.userId === account).length;
  e.market('AAPL').price -= 15;
  e.advance(1);
  assert.equal(pending.status, 'cancelled');
  assert.equal(stop.status, 'cancelled');
  assert.equal(e.state.trades.filter((t) => t.userId === account).length, count);
  assert.equal(e.portfolio(account).reservedCash, 0);
});

test('fees and partial matches can trip the loss guard and cancel the unfilled remainder', () => {
  const e = engine();
  limits(e, { dailyLossLimit: 1 });
  const bestAsk = e.exchange.depth('AAPL').asks[0];
  const order = e.placeOrder(
    input({ quantity: bestAsk.quantity + 5, orderType: 'limit', limitPrice: bestAsk.price }),
  );
  assert.equal(order.status, 'cancelled');
  assert.equal(order.remaining, 5);
  assert.equal(e.snapshot(account).risk.lossLocked, true);
  assert.equal(e.portfolio(account).reservedCash, 0);
  assert.equal(e.exchange.orders.has(order.id), false);
});

test('lower limits cancel newest pending exposure but do not liquidate existing holdings', () => {
  const e = engine();
  e.placeOrder(input({ quantity: 3 }));
  const older = e.placeOrder(input({ orderType: 'limit', limitPrice: 1, quantity: 2 }));
  const newer = e.placeOrder(input({ orderType: 'limit', limitPrice: 2, quantity: 2 }));
  limits(e, { maxSharesPerSymbol: 5 });
  assert.equal(newer.status, 'cancelled');
  assert.equal(older.status, 'open');
  limits(e, { maxSharesPerSymbol: 1 });
  assert.equal(older.status, 'cancelled');
  assert.equal(e.user(account).holdings.AAPL.quantity, 3);
  assert.equal(e.snapshot(account).risk.exposures[0].overLimit, true);
  assert.doesNotThrow(() => e.placeOrder(input({ side: 'sell', quantity: 3 })));
});

test('risk limits reject invalid settings without changing the active policy', () => {
  const e = engine();
  for (const patch of [
    { maxSharesPerSymbol: 0 },
    { maxFuturesPerSymbol: 1.5 },
    { dailyLossLimit: -1 },
    { dailyLossLimit: 1.001 },
    { concentrationWarningPercent: 101 },
    { unexpected: true },
  ])
    assert.throws(() => limits(e, patch));
  assert.deepEqual(e.state.risk[account].limits, DEFAULT_RISK_LIMITS);
});

test('journals enforce ownership, linked symbols, validation, editing and deletion', () => {
  const e = engine();
  e.createAccount('U-other');
  e.placeOrder(input());
  const trade = e.state.trades.at(-1);
  const entry = e.saveJournal(account, note({ tradeId: trade.id }));
  assert.equal(e.journalEntries(account)[0].trade.id, trade.id);
  assert.deepEqual(e.journalEntries('U-other'), []);
  assert.throws(() => e.saveJournal('U-other', note(), entry.id), /not found/);
  assert.throws(() => e.deleteJournal('U-other', entry.id), /not found/);
  assert.throws(() => e.saveJournal('U-other', note({ tradeId: trade.id })), /not found/);
  assert.throws(() => e.saveJournal(account, note({ symbol: 'MSFT', tradeId: trade.id })), /match/);
  assert.throws(() => e.saveJournal(account, note({ notes: 'x'.repeat(5001) })));
  e.saveJournal(account, note({ status: 'reviewed' }), entry.id);
  assert.equal(e.journalEntries(account)[0].status, 'reviewed');
  e.deleteJournal(account, entry.id);
  assert.deepEqual(e.journalEntries(account), []);
});

test('risk baselines, pause latches and journals survive SQLite save and engine restore', (t) => {
  const e = engine();
  e.setTradingPause(account, true);
  e.saveJournal(account, note());
  const store = new DatabaseStore(':memory:');
  t.after(() => store.close());
  store.save(e.state);
  const restored = new Engine(store.load());
  assert.deepEqual(restored.state.risk, e.state.risk);
  assert.deepEqual(restored.journalEntries(account), e.journalEntries(account));
  assert.equal(restored.snapshot(account).risk.paused, true);
});

test('spot realization reconciles purchase fees and sale fees in the journal execution record', () => {
  const e = engine();
  e.placeOrder(input());
  const before = e.portfolio(account).realizedPnl;
  e.placeOrder(input({ side: 'sell' }));
  const trade = e.state.trades.at(-1);
  assert.equal(trade.pnl, e.portfolio(account).realizedPnl - before);
  e.saveJournal(account, note({ tradeId: trade.id }));
  assert.equal(e.journalEntries(account)[0].trade.pnl, trade.pnl);
});
