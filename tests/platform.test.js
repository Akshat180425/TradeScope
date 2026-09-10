import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { Engine } from '../backend/src/domain/engine.js';
import { StateStore } from '../backend/src/storage/store.js';
import { DatabaseStore } from '../backend/src/storage/database.js';
import { createApp } from '../backend/src/api/app.js';
import { samplePerformance, performanceSummary } from '../backend/src/domain/analytics.js';

const limit = {
  userId: '1',
  instrument: 'spot',
  symbol: 'AAPL',
  side: 'buy',
  quantity: 5,
  orderType: 'limit',
  limitPrice: 100,
};
test('performance retains inception and maximum drawdown after chart history is trimmed', () => {
  const engine = new Engine();
  const current = engine.portfolio('1');
  engine.state.performance['1'] = Array.from({ length: 10000 }, (_, i) => ({
    tick: i + 10,
    equity: current.equity,
    netFunding: 100000,
    index: 100,
    peak: 100,
    drawdown: 0,
    maxDrawdown: 12,
    sinceTick: 10,
  }));
  engine.state.tick = 10010;
  samplePerformance(engine, '1');
  const summary = performanceSummary(engine.state, '1');
  assert.equal(summary.history.length, 10000);
  assert.equal(summary.maxDrawdown, 12);
  assert.equal(summary.sinceTick, 10);
});
test('stop orders reserve funds and only enter the book after triggering', () => {
  const engine = new Engine();
  const cash = engine.portfolio('1').availableCash;
  const order = engine.placeOrder({
    ...limit,
    orderType: 'stop_limit',
    stopPrice: 300,
    limitPrice: 310,
  });
  assert.equal(order.status, 'waiting');
  assert.equal(engine.portfolio('1').availableCash, cash - 1550);
  assert.ok(!engine.exchange.orders.has(order.id));
  engine.market('AAPL').price = 301;
  engine.triggerStops();
  assert.equal(order.status, 'filled');
  assert.ok(order.events.some((e) => e.status === 'triggered'));
});
test('a gapped stop-market order rejects without overspending and releases its reservation', () => {
  const engine = new Engine();
  const user = engine.user('1');
  user.cash = 300;
  const order = engine.placeOrder({
    ...limit,
    orderType: 'stop_market',
    quantity: 1,
    limitPrice: undefined,
    stopPrice: 290,
  });
  engine.market('AAPL').price = 400;
  engine.exchange.refresh();
  engine.triggerStops();
  assert.equal(order.status, 'rejected');
  assert.equal(engine.portfolio('1').availableCash, 300);
});
test('day orders expire while GTC orders remain active', () => {
  const engine = new Engine();
  const day = engine.placeOrder({ ...limit, timeInForce: 'day' });
  const gtc = engine.placeOrder({ ...limit, timeInForce: 'gtc' });
  engine.advance(300);
  assert.equal(day.status, 'expired');
  assert.equal(gtc.status, 'open');
});
test('fees reconcile for purchases, sales and derivative settlements', () => {
  const engine = new Engine();
  engine.state.feeBps = 10;
  const buy = engine.placeOrder({ ...limit, orderType: 'market' });
  assert.ok(buy.feesPaid > 0);
  engine.placeOrder({ ...limit, orderType: 'market', side: 'sell' });
  engine.placeOrder({ ...limit, instrument: 'futures', orderType: 'market', quantity: 1 });
  const position = engine.portfolio('1').positions[0];
  engine.closePosition(position.id, '1');
  const sum = engine.state.ledger
    .filter((e) => e.userId === '1')
    .reduce((s, e) => s + e.amountCents, 0);
  assert.equal(sum, Math.round(engine.user('1').cash * 100));
});
test('SQLite migration preserves portfolios, backs up JSON, and survives restart', (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'tradescope-migration-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const legacy = path.join(dir, 'state.json');
  const original = new Engine();
  original.placeOrder(limit);
  // Emulate the original snapshot schema before the platform fields existed.
  const state = structuredClone(original.state);
  for (const key of ['ledger', 'notifications', 'performance', 'alerts', 'feeBps', 'fxRate'])
    delete state[key];
  new StateStore(legacy).save(state);
  const filename = path.join(dir, 'platform.sqlite');
  const db = new DatabaseStore(filename, { legacyFile: legacy });
  const app = createApp(db);
  assert.equal(app.engine.user('1').cash, original.user('1').cash);
  assert.deepEqual(app.engine.user('1').holdings, original.user('1').holdings);
  assert.ok(existsSync(path.join(dir, 'backups/pre-sqlite-state.json')));
  assert.throws(() => db.db.prepare('UPDATE ledger_entries SET amount_cents=0').run(), /immutable/);
  const before = structuredClone(app.engine.state);
  db.close();
  const second = new DatabaseStore(filename);
  assert.deepEqual(createApp(second).engine.state, before);
  second.close();
});
