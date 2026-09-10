import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createApp } from '../backend/src/api/app.js';
import { DatabaseStore } from '../backend/src/storage/database.js';

async function setup(t, options = {}) {
  const store = new DatabaseStore(':memory:');
  const service = createApp(store, { authLimit: 100, ...options });
  const server = service.app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  t.after(async () => {
    service.dispose();
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    store.close();
  });
  const base = 'http://127.0.0.1:' + server.address().port;
  const client = () => {
    let cookie = '',
      csrf = '';
    return async (
      url,
      body,
      { method = body === undefined ? 'GET' : 'POST', headers = {}, key = randomUUID() } = {},
    ) => {
      const response = await fetch(base + url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookie,
          'X-CSRF-Token': csrf,
          'Idempotency-Key': key,
          ...headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (response.headers.get('set-cookie'))
        cookie = response.headers.get('set-cookie').split(';')[0];
      const data = response.headers.get('content-type')?.includes('json')
        ? await response.json()
        : await response.text();
      if (data.csrf) csrf = data.csrf;
      return { status: response.status, data, headers: response.headers };
    };
  };
  return { store, service, client, base };
}
const order = { instrument: 'spot', symbol: 'AAPL', side: 'buy', quantity: 2, orderType: 'market' };
const credentials = { email: 'account@example.test', password: 'correct-example-password' };

test('distinct concurrent withdrawals cannot spend the same cash twice', async (t) => {
  const { client } = await setup(t);
  const request = client();
  await request('/api/auth/demo', {});
  const results = await Promise.all([
    request('/api/funding', { amount: -60000 }),
    request('/api/funding', { amount: -60000 }),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 400]);
  assert.equal((await request('/api/state')).data.portfolio.cash, 40000);
});

test('authenticated SSE sends committed revisions and rejects anonymous streams', async (t) => {
  const { client, base, service } = await setup(t);
  const request = client();
  assert.equal((await request('/api/events')).status, 401);
  const signedIn = await request('/api/auth/demo', {});
  const controller = new AbortController();
  const response = await fetch(base + '/api/events', {
    headers: { Cookie: signedIn.headers.get('set-cookie').split(';')[0] },
    signal: controller.signal,
  });
  const reader = response.body.getReader();
  try {
    const initial = new TextDecoder().decode((await reader.read()).value);
    assert.match(initial, /event: revision/);
    service.engine.state.running = true;
    service.pulse();
    const next = new TextDecoder().decode((await reader.read()).value);
    assert.match(next, /event: revision/);
    assert.notEqual(initial, next);
  } finally {
    controller.abort();
    await reader.cancel().catch(() => {});
  }
});

test('registration hashes passwords, sets private cookies, and supports login/logout', async (t) => {
  const { client, store } = await setup(t);
  const request = client();
  assert.equal((await request('/api/state')).status, 401);
  const registered = await request('/api/auth/register', credentials);
  assert.equal(registered.status, 201);
  assert.match(registered.headers.get('set-cookie'), /HttpOnly/);
  assert.match(registered.headers.get('set-cookie'), /SameSite=Strict/);
  assert.notEqual(store.byEmail(credentials.email).password_hash, credentials.password);
  assert.equal(registered.data.user.role, 'trader');
  assert.equal((await request('/api/state')).data.portfolio.cash, 100000);
  assert.equal((await request('/api/auth/logout', {})).status, 200);
  assert.equal((await request('/api/state')).status, 401);
  assert.equal(
    (await request('/api/auth/login', { ...credentials, password: 'incorrect-example-password' }))
      .status,
    401,
  );
  assert.equal((await request('/api/auth/login', credentials)).status, 200);
  assert.equal((await request('/api/auth/register', credentials)).status, 409);
});

test('private accounts cannot read, cancel, close, or export another account', async (t) => {
  const { client } = await setup(t);
  const a = client(),
    b = client();
  const identity = (await a('/api/auth/demo', {})).data.user;
  await b('/api/auth/demo', {});
  const placed = (await a('/api/orders', { ...order, orderType: 'limit', limitPrice: 100 })).data;
  const position = await a('/api/orders', { ...order, instrument: 'futures', quantity: 1 });
  assert.equal(position.status, 201);
  const p = (await a('/api/state')).data.portfolio.positions[0];
  assert.equal((await b('/api/state?userId=' + identity.id)).status, 403);
  assert.equal((await b('/api/export.csv?userId=' + identity.id)).status, 403);
  assert.equal((await b('/api/orders/' + placed.id, {}, { method: 'DELETE' })).status, 404);
  assert.equal((await b('/api/positions/' + p.id + '/close', {})).status, 404);
  assert.equal((await b('/api/state')).data.users, undefined);
  assert.equal((await b('/api/simulation', { action: 'start' })).status, 403);
});

test('CSRF tokens, origins, and credentials are validated', async (t) => {
  const { client } = await setup(t);
  const request = client();
  await request('/api/auth/demo', {});
  assert.equal(
    (await request('/api/orders', order, { headers: { 'X-CSRF-Token': '' } })).status,
    403,
  );
  assert.equal(
    (await request('/api/orders', order, { headers: { Origin: 'https://untrusted.example' } }))
      .status,
    403,
  );
  assert.equal((await request('/api/orders', { ...order, quantity: -1 })).status, 400);
  assert.equal(
    (await request('/api/auth/register', { ...credentials, role: 'admin' })).status,
    400,
  );
  assert.equal((await request('/api/orders', order, { key: 'short' })).status, 400);
});

test('simultaneous retries place one order and one set of cash entries', async (t) => {
  const { client, store } = await setup(t);
  const request = client();
  await request('/api/auth/demo', {});
  const key = randomUUID();
  const responses = await Promise.all(
    Array.from({ length: 8 }, () => request('/api/orders', order, { key })),
  );
  assert.ok(responses.every((r) => r.status === 201));
  assert.equal(new Set(responses.map((r) => r.data.id)).size, 1);
  const state = (await request('/api/state')).data;
  assert.equal(state.orders.length, 1);
  assert.equal(state.portfolio.holdings[0].quantity, 2);
  const sum = store.db
    .prepare('SELECT SUM(amount_cents) AS n FROM ledger_entries WHERE user_id=?')
    .get(state.portfolio.user.id).n;
  assert.equal(sum, Math.round(state.portfolio.cash * 100));
  assert.equal((await request('/api/orders', { ...order, quantity: 3 }, { key })).status, 409);
});

test('a failed save rolls back financial state, SQL projections, and request keys', async (t) => {
  const { client, store } = await setup(t);
  const request = client();
  await request('/api/auth/demo', {});
  const before = (await request('/api/state')).data.portfolio;
  const save = store.save.bind(store);
  let fail = true;
  t.mock.method(console, 'error', () => {});
  t.mock.method(store, 'save', (state) => {
    save(state);
    if (fail) throw new Error('Simulated disk failure');
  });
  const key = randomUUID();
  assert.equal((await request('/api/orders', order, { key })).status, 500);
  assert.deepEqual((await request('/api/state')).data.portfolio, before);
  assert.equal(store.previous(before.user.id, key), undefined);
  assert.equal(
    store.db.prepare('SELECT COUNT(*) AS n FROM order_records WHERE user_id=?').get(before.user.id)
      .n,
    0,
  );
  fail = false;
  assert.equal((await request('/api/orders', order, { key })).status, 201);
});

test('virtual funding changes cash without creating investment return', async (t) => {
  const { client } = await setup(t);
  const request = client();
  await request('/api/auth/demo', {});
  const before = (await request('/api/state')).data;
  assert.equal((await request('/api/funding', { amount: 10000 })).status, 200);
  const after = (await request('/api/state')).data;
  assert.equal(after.portfolio.cash, before.portfolio.cash + 10000);
  assert.equal(after.performance.returnPercent, before.performance.returnPercent);
  assert.equal(after.portfolio.pnl, 0);
  assert.equal((await request('/api/funding', { amount: -120000 })).status, 400);
  assert.equal((await request('/api/funding', { amount: 0 })).status, 400);
});

test('preferences, alerts, notifications and CSV exports remain account-scoped', async (t) => {
  const { client, service } = await setup(t);
  const request = client();
  const id = (await request('/api/auth/demo', {})).data.user.id;
  assert.equal(
    (
      await request(
        '/api/preferences',
        { currency: 'INR', watchlist: ['AAPL', 'AAPL'] },
        { method: 'PATCH' },
      )
    ).status,
    200,
  );
  const alert = (await request('/api/alerts', { symbol: 'AAPL', direction: 'above', price: 1 }))
    .data;
  service.engine.advance(1);
  assert.equal((await request('/api/state')).data.preferences.currency, 'INR');
  assert.equal(service.engine.state.alerts.find((a) => a.id === alert.id).status, 'triggered');
  assert.ok(
    service.engine.state.notifications.some((n) => n.userId === id && n.title === 'Price alert'),
  );
  await request('/api/orders', order);
  const csv = await request('/api/export.csv');
  assert.match(csv.data, /Fee USD/);
  assert.match(csv.data, /AAPL/);
  assert.match((await request('/api/export.csv?kind=ledger')).data, /initial_funding/);
});

test('only a locally promoted administrator can control the market', async (t) => {
  const { client, store } = await setup(t);
  const request = client();
  const id = (await request('/api/auth/register', credentials)).data.user.id;
  assert.equal((await request('/api/admin')).status, 403);
  store.db.prepare("UPDATE identities SET role='admin' WHERE id=?").run(id);
  assert.equal(
    (await request('/api/simulation', { action: 'configure', feeBps: 20, fxRate: 90, speed: 5 }))
      .status,
    200,
  );
  assert.equal((await request('/api/simulation', { action: 'step' })).status, 200);
  assert.equal((await request('/api/admin')).data.schema, 1);
});

test('authentication attempts are rate limited', async (t) => {
  const { client } = await setup(t, { authLimit: 2 });
  const request = client();
  await request('/api/auth/demo', {});
  await request('/api/auth/demo', {});
  const response = await request('/api/auth/demo', {});
  assert.equal(response.status, 429);
  assert.ok(response.headers.get('retry-after'));
});
