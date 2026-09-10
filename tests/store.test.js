import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Engine } from '../backend/src/domain/engine.js';
import { StateStore } from '../backend/src/storage/store.js';
import { USERS } from '../backend/src/domain/catalog.js';

test('fresh simulations use unique, anonymous demo account labels', () => {
  const state = new Engine().state;
  assert.equal(state.users.length, 12);
  assert.equal(new Set(USERS).size, 12);
  for (const user of state.users) {
    assert.equal(user.name, 'Demo Account ' + user.id.padStart(2, '0'));
  }
});

test('startup anonymizes saved demo labels without changing financial data', (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'tradescope-labels-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const filename = path.join(dir, 'state.json');
  const store = new StateStore(filename);
  const engine = new Engine();
  engine.placeOrder({
    userId: '1',
    symbol: 'AAPL',
    instrument: 'spot',
    side: 'buy',
    quantity: 2,
    orderType: 'limit',
    limitPrice: 100,
  });
  for (const user of engine.state.users) user.name = 'Legacy label ' + user.id;
  engine.state.running = true;
  store.save(engine.state);
  const expected = structuredClone(engine.state);
  expected.running = false;
  for (const user of expected.users) user.name = USERS[Number(user.id) - 1];

  const state = store.load();
  store.save(state);
  assert.deepEqual(state, expected);
  assert.deepEqual(JSON.parse(readFileSync(filename, 'utf8')), expected);
  assert.deepEqual(store.load(), expected);
});
