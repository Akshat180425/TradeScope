import { money } from './catalog.js';

export function initializeRecords(state) {
  state.ledger ||= [];
  state.notifications ||= [];
  state.alerts ||= [];
  state.performance ||= {};
  state.feeBps ??= 0;
  state.fxRate ??= 83;
  for (const user of state.users) {
    user.netFunding ??= 100000;
    user.feesPaid ??= 0;
    if (!state.ledger.some((entry) => entry.userId === user.id)) {
      state.ledger.push({
        id: 'L-' + user.id + '-opening',
        userId: user.id,
        amountCents: Math.round(user.cash * 100),
        balanceCents: Math.round(user.cash * 100),
        kind: state.tick ? 'migration_balance' : 'initial_funding',
        reference: null,
        tick: state.tick,
      });
    }
  }
}

export function recordCash(state, user, amount, kind, reference = null) {
  const amountCents = Math.round(amount * 100);
  const balanceCents = Math.round(user.cash * 100) + amountCents;
  if (!Number.isSafeInteger(balanceCents)) throw new Error('Cash balance exceeds safe limits.');
  user.cash = balanceCents / 100;
  state.ledger.push({
    id: 'L' + state.nextId++,
    userId: user.id,
    amountCents,
    balanceCents,
    kind,
    reference,
    tick: state.tick,
  });
}

export function notify(state, userId, title, detail, reference = null) {
  state.notifications.push({
    id: 'N' + state.nextId++,
    userId,
    title,
    detail,
    reference,
    tick: state.tick,
    read: false,
  });
}

export function samplePerformance(engine, userId) {
  const user = engine.user(userId);
  const portfolio = engine.portfolio(userId);
  const history = (engine.state.performance[userId] ||= []);
  const previous = history.at(-1);
  // Remove external cash flows before linking successive portfolio returns.
  const factor =
    previous && previous.equity > 0
      ? (portfolio.equity - (user.netFunding - previous.netFunding)) / previous.equity
      : 1;
  const index = previous ? previous.index * factor : 100;
  const peak = Math.max(previous?.peak || 100, index);
  const drawdown = peak > 0 ? Math.max(0, (1 - index / peak) * 100) : 0;
  history.push({
    tick: engine.state.tick,
    equity: portfolio.equity,
    netFunding: user.netFunding,
    index,
    peak,
    drawdown,
    maxDrawdown: Math.max(
      previous?.maxDrawdown ?? history.reduce((max, p) => Math.max(max, p.drawdown), 0),
      drawdown,
    ),
    sinceTick: previous?.sinceTick ?? history[0]?.tick ?? engine.state.tick,
  });
  if (history.length > 10000) history.splice(0, history.length - 10000);
}

export function performanceSummary(state, userId) {
  const history = state.performance[userId] || [];
  return {
    history,
    returnPercent: history.length ? history.at(-1).index - 100 : 0,
    maxDrawdown:
      history.at(-1)?.maxDrawdown ?? history.reduce((max, p) => Math.max(max, p.drawdown), 0),
    sinceTick: history.at(-1)?.sinceTick ?? history[0]?.tick ?? state.tick,
  };
}

export const feeFor = (notional, bps) => money((notional * bps) / 10000);
