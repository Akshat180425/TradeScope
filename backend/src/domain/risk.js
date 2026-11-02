import { LOT_SIZE, MINUTES_PER_DAY, money } from './catalog.js';
import { z } from 'zod';

export const riskLimitsSchema = z
  .object({
    maxSharesPerSymbol: z.number().int().min(1).max(1000000),
    maxFuturesPerSymbol: z.number().int().min(1).max(1000),
    maxOptionsPerSymbol: z.number().int().min(1).max(1000),
    concentrationWarningPercent: z.number().finite().min(1).max(100),
    dailyLossLimit: z.number().finite().multipleOf(0.01).min(1).max(1000000),
  })
  .strict();

export const DEFAULT_RISK_LIMITS = Object.freeze({
  maxSharesPerSymbol: 1000,
  maxFuturesPerSymbol: 10,
  maxOptionsPerSymbol: 10,
  concentrationWarningPercent: 40,
  dailyLossLimit: 5000,
});
export const openOrder = (order) => ['open', 'partial', 'waiting'].includes(order.status);
export const increasesRisk = (order) => order.instrument !== 'spot' || order.side === 'buy';
export const sessionDay = (tick) => Math.floor(tick / MINUTES_PER_DAY);

export function initializeRisk(engine, userId) {
  engine.state.risk ||= {};
  if (!engine.state.risk[userId]) {
    engine.state.risk[userId] = {
      limits: { ...DEFAULT_RISK_LIMITS },
      day: sessionDay(engine.state.tick),
      openingEquity: engine.portfolio(userId).equity,
      openingFunding: engine.user(userId).netFunding,
      manualPause: false,
      breachedDay: null,
      events: [],
    };
  }
  return engine.state.risk[userId];
}

export function riskEvent(engine, userId, kind, detail) {
  const events = engine.state.risk[userId].events;
  events.push({ id: 'R' + engine.state.nextId++, tick: engine.state.tick, kind, detail });
  if (events.length > 100) events.splice(0, events.length - 100);
}

export function riskSummary(engine, userId) {
  const risk = engine.state.risk?.[userId];
  if (!risk) return null;
  const portfolio = engine.portfolio(userId);
  const dailyPnl = money(
    portfolio.equity - risk.openingEquity - (engine.user(userId).netFunding - risk.openingFunding),
  );
  const exposures = engine.state.markets.map((market) => {
    const shares = engine.user(userId).holdings[market.symbol]?.quantity || 0;
    const pendingShares = engine.state.orders
      .filter(
        (o) =>
          o.userId === userId && o.symbol === market.symbol && o.side === 'buy' && openOrder(o),
      )
      .reduce((sum, o) => sum + o.remaining, 0);
    const positions = portfolio.positions.filter((p) => p.symbol === market.symbol);
    const futures = positions
      .filter((p) => p.instrument === 'futures')
      .reduce((sum, p) => sum + p.quantity, 0);
    const options = positions
      .filter((p) => p.instrument === 'options')
      .reduce((sum, p) => sum + p.quantity, 0);
    // Gross underlying notional deliberately does not net opposing contracts or estimate delta.
    const grossExposure = money(
      (shares + pendingShares + LOT_SIZE * (futures + options)) * market.price,
    );
    const concentration =
      portfolio.equity > 0
        ? (grossExposure / portfolio.equity) * 100
        : grossExposure > 0
          ? null
          : 0;
    return {
      symbol: market.symbol,
      shares,
      pendingShares,
      futures,
      options,
      grossExposure,
      concentration,
      warning:
        grossExposure > 0 &&
        (concentration === null || concentration >= risk.limits.concentrationWarningPercent),
      overLimit:
        shares + pendingShares > risk.limits.maxSharesPerSymbol ||
        futures > risk.limits.maxFuturesPerSymbol ||
        options > risk.limits.maxOptionsPerSymbol,
    };
  });
  const lossLocked = risk.breachedDay === risk.day;
  return {
    limits: risk.limits,
    day: risk.day,
    openingEquity: risk.openingEquity,
    dailyPnl,
    lossUsed: Math.max(0, -dailyPnl),
    lossRemaining: Math.max(0, money(risk.limits.dailyLossLimit + Math.min(0, dailyPnl))),
    paused: risk.manualPause || lossLocked,
    manualPause: risk.manualPause,
    lossLocked,
    reason: lossLocked
      ? 'Daily loss limit reached'
      : risk.manualPause
        ? 'Trading manually paused'
        : null,
    exposures,
    events: [...risk.events].reverse(),
  };
}

export function riskOrderError(engine, input, excludeOrderId) {
  const risk = engine.state.risk?.[input.userId];
  if (!risk || !increasesRisk(input)) return null;
  const summary = riskSummary(engine, input.userId);
  if (
    risk.manualPause ||
    risk.breachedDay === risk.day ||
    summary.dailyPnl <= -risk.limits.dailyLossLimit
  )
    return 'Trading is paused. Only sales of existing shares and position closes are allowed.';
  const exposure = summary.exposures.find((e) => e.symbol === input.symbol);
  const excluded = engine.state.orders.find((o) => o.id === excludeOrderId);
  const quantity = input.remaining ?? input.quantity;
  const projected =
    input.instrument === 'spot'
      ? exposure.shares + exposure.pendingShares - (excluded?.remaining || 0) + quantity
      : exposure[input.instrument] + quantity;
  const limit =
    input.instrument === 'spot'
      ? risk.limits.maxSharesPerSymbol
      : input.instrument === 'futures'
        ? risk.limits.maxFuturesPerSymbol
        : risk.limits.maxOptionsPerSymbol;
  return projected > limit
    ? `${input.symbol} ${input.instrument} position limit is ${limit}; projected quantity is ${projected}, including pending buys.`
    : null;
}
