import express from 'express';
import { randomUUID } from 'node:crypto';
import { z, ZodError } from 'zod';
import { Engine, DomainError } from '../domain/engine.js';
import { orderSchema, simulationSchema } from './validation.js';
import { clockLabel } from '../domain/catalog.js';
import { samplePerformance } from '../domain/analytics.js';
import { DatabaseStore } from '../storage/database.js';
import {
  digest,
  hashPassword,
  verifyPassword,
  issueSession,
  sessionFromRequest,
  publicIdentity,
  rateLimiter,
} from '../services/auth.js';

const credentials = z
  .object({
    email: z
      .string()
      .trim()
      .email()
      .max(254)
      .transform((s) => s.toLowerCase()),
    password: z.string().min(10, 'Use at least 10 characters.').max(128),
  })
  .strict();
const preferences = z
  .object({
    currency: z.enum(['USD', 'INR']),
    watchlist: z
      .array(z.enum(['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA']))
      .max(5)
      .transform((a) => [...new Set(a)]),
  })
  .strict();
const priceAlert = z
  .object({
    symbol: z.enum(['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA']),
    direction: z.enum(['above', 'below']),
    price: z.number().finite().min(0.01).max(1000000),
  })
  .strict();

export function createApp(store = new DatabaseStore(':memory:'), options = {}) {
  const saved = store.load();
  let engine = new Engine(saved, options.seed || 2026);
  if (!saved) engine.state.feeBps = 10;
  if (options.feeBps !== undefined) engine.state.feeBps = options.feeBps;
  for (const user of engine.state.users)
    if (!engine.state.performance[user.id]?.length) samplePerformance(engine, user.id);
  store.save(engine.state);
  const listeners = new Set();
  let revision = 0;
  const broadcast = () => {
    revision++;
    for (const callback of listeners) callback(revision);
  };
  const mutate = (operation) => {
    const before = structuredClone(engine.state);
    try {
      const result = store.transaction(() => {
        const result = operation();
        store.save(engine.state);
        return result;
      });
      broadcast();
      return result;
    } catch (error) {
      engine = new Engine(before);
      throw error;
    }
  };
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '32kb' }));
  app.use((req, res, next) => {
    req.requestId = randomUUID();
    res.set({
      'X-Request-ID': req.requestId,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'same-origin',
      'X-Frame-Options': 'DENY',
    });
    if (req.path.startsWith('/api')) res.set('Cache-Control', 'no-store');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const origin = req.get('origin');
      const expected = options.origin || `${req.protocol}://${req.get('host')}`;
      if (req.get('sec-fetch-site') === 'cross-site' || (origin && origin !== expected))
        return next(new DomainError('Request origin is not allowed.', 403));
      if (!req.is('application/json'))
        return next(new DomainError('Send an application/json request.', 415));
    }
    next();
  });
  app.get('/api/health', (_req, res) =>
    res.json({
      status: 'ok',
      name: 'Investogram',
      version: '2.0.0',
      storage: 'sqlite',
      devSessionId: process.env.INVESTOGRAM_DEV_SESSION || null,
    }),
  );
  app.get('/api/auth/session', (req, res) => {
    const session = sessionFromRequest(store, req);
    if (!session) return res.status(401).json({ error: 'Sign in to continue.' });
    res.json({
      user: publicIdentity(store.identity(session.user_id)),
      csrf: session.csrf,
      preferences: store.preferences(session.user_id),
    });
  });
  const authLimit = rateLimiter({ limit: options.authLimit || 20 });
  app.post('/api/auth/register', authLimit, async (req, res) => {
    const input = credentials.parse(req.body);
    const passwordHash = await hashPassword(input.password);
    const id = 'U-' + randomUUID();
    mutate(() => {
      if (store.byEmail(input.email))
        throw new DomainError('An account with this email already exists.', 409);
      store.addIdentity({ id, email: input.email, passwordHash });
      engine.createAccount(id);
      store.audit(id, 'account_registered');
    });
    const csrf = issueSession(store, res, id, options.secureCookies);
    res
      .status(201)
      .json({ user: publicIdentity(store.identity(id)), csrf, preferences: store.preferences(id) });
  });
  app.post('/api/auth/login', authLimit, async (req, res) => {
    const input = credentials.parse(req.body);
    const identity = store.byEmail(input.email);
    if (!(await verifyPassword(input.password, identity?.password_hash)))
      throw new DomainError('Email or password is incorrect.', 401);
    const prior = sessionFromRequest(store, req);
    if (prior) store.deleteSession(prior.token_hash);
    const csrf = issueSession(store, res, identity.id, options.secureCookies);
    store.audit(identity.id, 'signed_in');
    res.json({ user: publicIdentity(identity), csrf, preferences: store.preferences(identity.id) });
  });
  app.post('/api/auth/demo', authLimit, (_req, res) => {
    if (options.demo === false) throw new DomainError('Demo access is disabled.', 403);
    const id = 'D-' + randomUUID();
    mutate(() => {
      store.addIdentity({ id, demo: true });
      engine.createAccount(id, 'Demo workspace');
      store.audit(id, 'demo_created');
    });
    const csrf = issueSession(store, res, id, options.secureCookies);
    res
      .status(201)
      .json({ user: publicIdentity(store.identity(id)), csrf, preferences: store.preferences(id) });
  });
  app.use('/api', (req, _res, next) => {
    const session = sessionFromRequest(store, req);
    if (!session) return next(new DomainError('Your session has ended. Sign in again.', 401));
    req.session = session;
    req.identity = store.identity(session.user_id);
    if (!['GET', 'HEAD'].includes(req.method) && req.get('X-CSRF-Token') !== session.csrf)
      return next(new DomainError('Session token is missing or invalid.', 403));
    if (
      (req.body?.userId && req.body.userId !== session.user_id) ||
      (req.query.userId && req.query.userId !== session.user_id)
    )
      return next(new DomainError('This account is private.', 403));
    next();
  });
  const admin = (req, _res, next) =>
    req.identity.role === 'admin'
      ? next()
      : next(new DomainError('Administrator access required.', 403));
  const financial = (req, res, action, status = 200) => {
    const key = req.get('Idempotency-Key');
    if (!key || !/^[a-zA-Z0-9-]{16,100}$/.test(key))
      throw new DomainError('A valid Idempotency-Key is required.');
    const id = req.session.user_id;
    const fingerprint = digest(JSON.stringify([req.method, req.path, req.body]));
    const prior = store.previous(id, key);
    if (prior) {
      if (prior.fingerprint !== fingerprint)
        throw new DomainError('This request key was already used for a different action.', 409);
      return res.status(status).json(JSON.parse(prior.response));
    }
    const result = mutate(() => {
      const result = action(id);
      samplePerformance(engine, id);
      store.remember(id, key, fingerprint, result);
      store.audit(id, req.method + ' ' + req.path);
      return result;
    });
    res.status(status).json(result);
  };
  app.post('/api/auth/logout', (req, res) => {
    store.deleteSession(req.session.token_hash);
    res.clearCookie('investogram_session', {
      path: '/',
      httpOnly: true,
      sameSite: 'strict',
      secure: !!options.secureCookies,
    });
    res.json({ ok: true });
  });
  app.get('/api/state', (req, res) => {
    const snapshot = engine.snapshot(req.session.user_id, req.query.symbol || 'AAPL');
    delete snapshot.users;
    snapshot.stats = { orders: snapshot.orders.length, trades: snapshot.activity.length };
    snapshot.preferences = store.preferences(req.session.user_id);
    res.json(snapshot);
  });
  app.get('/api/events', (req, res) => {
    res.set({
      'Content-Type': 'text/event-stream',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
    const send = (value) => {
      if (!res.destroyed) res.write(`event: revision\ndata: ${value}\n\n`);
    };
    listeners.add(send);
    send(revision);
    const heartbeat = setInterval(() => {
      if (!store.session(req.session.token_hash)) {
        res.write('event: expired\ndata: {}\n\n');
        res.end();
      } else res.write(': heartbeat\n\n');
    }, 15000);
    req.on('close', () => {
      clearInterval(heartbeat);
      listeners.delete(send);
    });
  });
  app.patch('/api/preferences', (req, res) => {
    const input = preferences.parse(req.body);
    res.json(store.preferences(req.session.user_id, input));
  });
  app.post('/api/quote', (req, res) =>
    res.json(engine.quote(orderSchema.parse({ ...req.body, userId: req.session.user_id }))),
  );
  app.post('/api/orders', (req, res) =>
    financial(
      req,
      res,
      (id) => engine.placeOrder(orderSchema.parse({ ...req.body, userId: id })),
      201,
    ),
  );
  app.delete('/api/orders/:id', (req, res) =>
    financial(req, res, (id) => engine.cancelOrder(req.params.id, id)),
  );
  app.post('/api/positions/:id/close', (req, res) =>
    financial(req, res, (id) => engine.closePosition(req.params.id, id)),
  );
  app.post('/api/funding', (req, res) =>
    financial(req, res, (id) => {
      const { amount } = z
        .object({ amount: z.number().finite().multipleOf(0.01).min(-1000000).max(1000000) })
        .strict()
        .parse(req.body);
      engine.fund(id, amount);
      return { cash: engine.portfolio(id).cash };
    }),
  );
  app.post('/api/alerts', (req, res) => {
    const input = priceAlert.parse(req.body);
    res.status(201).json(
      mutate(() => {
        if (
          engine.state.alerts.filter(
            (a) => a.userId === req.session.user_id && a.status === 'active',
          ).length >= 25
        )
          throw new DomainError('Keep at most 25 active alerts.');
        const alert = {
          ...input,
          id: 'A' + engine.state.nextId++,
          userId: req.session.user_id,
          status: 'active',
          createdTick: engine.state.tick,
        };
        engine.state.alerts.push(alert);
        return alert;
      }),
    );
  });
  app.delete('/api/alerts/:id', (req, res) =>
    res.json(
      mutate(() => {
        const alert = engine.state.alerts.find(
          (a) => a.id === req.params.id && a.userId === req.session.user_id,
        );
        if (!alert) throw new DomainError('Alert not found.', 404);
        alert.status = 'cancelled';
        return alert;
      }),
    ),
  );
  app.post('/api/notifications/read', (req, res) =>
    res.json(
      mutate(() => {
        for (const n of engine.state.notifications)
          if (n.userId === req.session.user_id) n.read = true;
        return { ok: true };
      }),
    ),
  );
  app.post('/api/simulation', admin, (req, res) => {
    const input = simulationSchema.parse(req.body);
    if (input.action === 'reset')
      throw new DomainError(
        'Reset is disabled to preserve account ledgers. Use a separate database for a new scenario.',
      );
    mutate(() => {
      if (input.action === 'start') engine.state.running = true;
      if (input.action === 'pause') engine.state.running = false;
      if (input.action === 'step') {
        if (engine.state.running)
          throw new DomainError('Pause the simulation before advancing manually.');
        engine.advance(input.steps || 1);
      }
      for (const key of ['speed', 'volatility', 'feeBps', 'fxRate'])
        if (input[key] !== undefined) engine.state[key] = input[key];
      store.audit(req.session.user_id, 'simulation_' + input.action);
    });
    res.json({ simulation: engine.snapshot(req.session.user_id).simulation });
  });
  app.get('/api/admin', admin, (_req, res) =>
    res.json({
      ...store.stats(),
      running: engine.state.running,
      legacyAccounts: engine.state.users
        .filter((u) => /^\d+$/.test(u.id))
        .map((u) => ({ id: u.id, label: u.name, equity: engine.portfolio(u.id).equity })),
      audit: store.auditLog(),
    }),
  );
  app.get('/api/export.csv', (req, res) => {
    const ledger = req.query.kind === 'ledger';
    const rows = ledger
      ? [
          ['Entry ID', 'Kind', 'Amount USD', 'Cash balance USD', 'Reference', 'Simulation time'],
          ...engine.state.ledger
            .filter((e) => e.userId === req.session.user_id)
            .map((e) => [
              e.id,
              e.kind,
              e.amountCents / 100,
              e.balanceCents / 100,
              e.reference || '',
              clockLabel(e.tick),
            ]),
        ]
      : [
          [
            'Trade ID',
            'Order ID',
            'Instrument',
            'Symbol',
            'Side',
            'Quantity',
            'Price USD',
            'Notional USD',
            'Fee USD',
            'Simulation time',
          ],
          ...engine.state.trades
            .filter((t) => t.userId === req.session.user_id)
            .map((t) => [
              t.id,
              t.orderId || t.positionId || '',
              t.instrument,
              t.symbol,
              t.side,
              t.quantity,
              t.price,
              t.total,
              t.fee || 0,
              clockLabel(t.tick),
            ]),
        ];
    res
      .type('text/csv')
      .attachment('investogram-' + (ledger ? 'ledger' : 'trades') + '.csv')
      .send(
        rows
          .map((row) => row.map((v) => '"' + String(v).replaceAll('"', '""') + '"').join(','))
          .join('\r\n'),
      );
  });
  app.use('/api', (_req, res) => res.status(404).json({ error: 'API endpoint not found.' }));
  app.use((error, req, res, _next) => {
    const status = error instanceof ZodError ? 400 : error.status || 500;
    if (status >= 500)
      console.error(
        JSON.stringify({
          level: 'error',
          event: 'request_failed',
          requestId: req.requestId,
          message: error.message,
        }),
      );
    res.status(status).json({
      error:
        error instanceof ZodError
          ? error.issues[0].message
          : status >= 500
            ? 'The request could not be completed. Please retry.'
            : error.message,
      requestId: req.requestId,
    });
  });
  return {
    app,
    store,
    get engine() {
      return engine;
    },
    pulse() {
      if (engine.state.running) mutate(() => engine.advance(engine.state.speed));
    },
    dispose() {
      listeners.clear();
    },
  };
}
