import {
  SYMBOLS,
  USERS,
  INITIAL_CASH,
  MINUTES_PER_DAY,
  LOT_SIZE,
  money,
  clockLabel,
} from './catalog.js';
import { normal, random } from './random.js';
import { contractPrice, positionValue } from './pricing.js';
import { Exchange } from './exchange.js';
import {
  feeFor,
  initializeRecords,
  recordCash,
  notify,
  samplePerformance,
  performanceSummary,
} from './analytics.js';

export class DomainError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
export class Engine {
  constructor(saved = null, seed = 2026) {
    this.state = saved || {
      version: 1,
      seed,
      rng: seed,
      tick: 0,
      running: false,
      speed: 1,
      volatility: 0.3,
      nextId: 1,
      orders: [],
      trades: [],
      positions: [],
      liquidity: [],
      markets: SYMBOLS.map((s) => ({
        ...s,
        open: s.price,
        high: s.price,
        low: s.price,
        volume: 0,
        history: [{ tick: 0, price: s.price, volume: 0 }],
      })),
      users: USERS.map((name, i) => ({
        id: String(i + 1),
        name,
        cash: INITIAL_CASH,
        realizedPnl: 0,
        holdings: {},
      })),
    };
    initializeRecords(this.state);
    this.exchange = new Exchange(this.state, (order, quantity, price) =>
      this.fillSpot(order, quantity, price),
    );
    if (!saved) {
      this.exchange.refresh();
      for (const user of this.state.users) {
        for (const [index, market] of this.state.markets.entries()) {
          this.placeOrder({
            userId: user.id,
            symbol: market.symbol,
            instrument: 'spot',
            side: 'buy',
            orderType: 'market',
            quantity: 8 + ((Number(user.id) * 7 + index * 11) % 35),
          });
        }
      }
      this.advance(90);
    }
  }
  user(id) {
    const user = this.state.users.find((u) => u.id === id);
    if (!user) throw new DomainError('Account not found.', 404);
    return user;
  }
  market(symbol) {
    const market = this.state.markets.find((m) => m.symbol === symbol);
    if (!market) throw new DomainError('Unknown stock symbol.');
    return market;
  }
  portfolio(userId, excludeOrderId) {
    const user = this.user(userId);
    const pending = this.state.orders.filter(
      (o) =>
        o.userId === userId &&
        o.id !== excludeOrderId &&
        ['open', 'partial', 'waiting'].includes(o.status),
    );
    const reservedCash = money(
      pending
        .filter((o) => o.side === 'buy')
        .reduce((sum, o) => {
          const notional = o.remaining * (o.limitPrice || o.stopPrice);
          return (
            sum +
            notional +
            Math.max(
              0,
              feeFor((o.filledNotional || 0) + notional, o.feeBps || 0) - (o.feesPaid || 0),
            )
          );
        }, 0),
    );
    const holdings = Object.entries(user.holdings)
      .filter(([, h]) => h.quantity > 0)
      .map(([symbol, h]) => {
        const market = this.market(symbol);
        const reserved = pending
          .filter((o) => o.symbol === symbol && o.side === 'sell')
          .reduce((sum, o) => sum + o.remaining, 0);
        return {
          ...h,
          symbol,
          name: market.name,
          price: market.price,
          value: money(h.quantity * market.price),
          pnl: money(h.quantity * (market.price - h.averageCost)),
          available: h.quantity - reserved,
        };
      });
    const positions = this.state.positions
      .filter((p) => p.userId === userId && p.status === 'open')
      .map((p) => ({
        ...p,
        ...positionValue(p, this.market(p.symbol).price, this.state.tick, this.state.volatility),
        expiryLabel: clockLabel(p.expiryTick),
      }));
    const equity = money(
      user.cash +
        holdings.reduce((s, h) => s + h.value, 0) +
        positions.reduce((s, p) => s + p.value, 0),
    );
    return {
      user: { id: user.id, name: user.name },
      cash: money(user.cash),
      availableCash: money(user.cash - reservedCash),
      reservedCash,
      equity,
      pnl: money(equity - user.netFunding),
      returnPercent: user.netFunding > 0 ? (equity / user.netFunding - 1) * 100 : 0,
      netFunding: user.netFunding,
      feesPaid: user.feesPaid,
      realizedPnl: money(user.realizedPnl),
      unrealizedPnl: money(
        holdings.reduce((s, h) => s + h.pnl, 0) + positions.reduce((s, p) => s + p.pnl, 0),
      ),
      holdings,
      positions,
    };
  }
  fillSpot(order, quantity, price) {
    const user = this.user(order.userId);
    const holding = (user.holdings[order.symbol] ||= { quantity: 0, averageCost: 0 });
    const cost = money(quantity * price);
    const fee = money(
      feeFor(order.filledNotional || cost, order.feeBps || 0) - (order.feesPaid || 0),
    );
    order.feesPaid = money((order.feesPaid || 0) + fee);
    user.feesPaid = money(user.feesPaid + fee);
    if (order.side === 'buy') {
      holding.averageCost =
        (holding.averageCost * holding.quantity + cost + fee) / (holding.quantity + quantity);
      holding.quantity += quantity;
      recordCash(this.state, user, -cost, 'stock_purchase', order.id);
    } else {
      user.realizedPnl = money(user.realizedPnl + quantity * (price - holding.averageCost) - fee);
      holding.quantity -= quantity;
      recordCash(this.state, user, cost, 'stock_sale', order.id);
      if (holding.quantity === 0) holding.averageCost = 0;
    }
    if (fee) recordCash(this.state, user, -fee, 'trading_fee', order.id);
    (order.events ||= []).push({
      tick: this.state.tick,
      status: order.status,
      detail: `${quantity} shares at ${price.toFixed(2)} USD`,
    });
    notify(
      this.state,
      user.id,
      order.status === 'filled' ? 'Order filled' : 'Partial fill',
      `${order.side.toUpperCase()} ${quantity} ${order.symbol}`,
      order.id,
    );
    this.state.trades.push({
      id: 'T' + this.state.nextId++,
      orderId: order.id,
      userId: user.id,
      instrument: 'spot',
      symbol: order.symbol,
      side: order.side,
      quantity,
      price,
      total: cost,
      fee,
      tick: this.state.tick,
    });
  }
  quote(input) {
    const market = this.market(input.symbol);
    const quantity = input.quantity || 1;
    const bps = input.feeBps ?? this.state.feeBps;
    if (input.instrument === 'spot') {
      if (['stop_market', 'stop_limit'].includes(input.orderType)) {
        const total = money(quantity * (input.limitPrice || input.stopPrice || market.price));
        const fee = feeFor(total, bps);
        return {
          price: total / quantity,
          total,
          fee,
          requiredCash: input.side === 'buy' ? money(total + fee) : 0,
          lotSize: 1,
          conditional: true,
        };
      }
      const depth = this.exchange.depth(input.symbol, {
        excludeUserId: input.userId,
        limit: Infinity,
      });
      const levels = input.side === 'sell' ? depth.bids : depth.asks;
      let left = quantity,
        total = 0;
      for (const level of levels) {
        if (
          input.orderType === 'limit' &&
          (input.side === 'buy' ? level.price > input.limitPrice : level.price < input.limitPrice)
        )
          break;
        const size = Math.min(left, level.quantity);
        total += size * level.price;
        left -= size;
        if (!left) break;
      }
      const notional = money(total + left * (input.limitPrice || market.price));
      const fee = feeFor(notional, bps);
      return {
        price:
          quantity - left ? money(total / (quantity - left)) : input.limitPrice || market.price,
        total: notional,
        fee,
        requiredCash:
          input.side === 'sell'
            ? 0
            : money(
                (input.orderType === 'limit' ? quantity * input.limitPrice : total) +
                  feeFor(input.orderType === 'limit' ? quantity * input.limitPrice : total, bps),
              ),
        availableQuantity: quantity - left,
        lotSize: 1,
      };
    }
    const position = {
      ...input,
      expiryTick: this.state.tick + (input.expiryDays || 7) * MINUTES_PER_DAY,
    };
    const price = contractPrice(position, market.price, this.state.tick, this.state.volatility);
    const total = money(price * quantity * LOT_SIZE);
    return {
      price,
      total,
      fee: feeFor(total, bps),
      margin: input.instrument === 'futures' ? money(total * 0.2) : 0,
      requiredCash: money(
        (input.instrument === 'futures' ? money(total * 0.2) : total) + feeFor(total, bps),
      ),
      lotSize: LOT_SIZE,
      expiryTick: position.expiryTick,
    };
  }
  placeOrder(input) {
    input = { orderType: 'market', timeInForce: 'gtc', ...input, feeBps: this.state.feeBps };
    const user = this.user(input.userId);
    this.market(input.symbol);
    if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > 1000)
      throw new DomainError('Quantity must be a whole number from 1 to 1,000.');
    if (!['buy', 'sell'].includes(input.side)) throw new DomainError('Invalid side.');
    if (!['spot', 'futures', 'options'].includes(input.instrument))
      throw new DomainError('Invalid instrument.');
    if (
      input.instrument === 'spot' &&
      ['limit', 'stop_limit'].includes(input.orderType) &&
      !(Number.isFinite(input.limitPrice) && input.limitPrice >= 0.01)
    )
      throw new DomainError('Enter a positive limit price.');
    if (
      input.orderType.startsWith('stop_') &&
      !(Number.isFinite(input.stopPrice) && input.stopPrice > 0)
    )
      throw new DomainError('Enter a positive stop price.');
    if (input.instrument === 'options' && input.side !== 'buy')
      throw new DomainError(
        'Options support buying calls and puts. Close an existing position from Portfolios.',
      );
    const portfolio = this.portfolio(user.id);
    const quote = this.quote(input);
    if (input.instrument === 'spot' && input.side === 'sell') {
      const holding = portfolio.holdings.find((h) => h.symbol === input.symbol);
      if (!holding || holding.available < input.quantity)
        throw new DomainError(
          'Not enough available shares. Cancel pending sell orders or reduce the quantity.',
        );
    } else if (quote.requiredCash > portfolio.availableCash) {
      throw new DomainError('Insufficient available cash for this order.');
    }
    if (
      input.instrument === 'spot' &&
      input.orderType === 'market' &&
      quote.availableQuantity < input.quantity
    )
      throw new DomainError(
        'Not enough market liquidity. Reduce the quantity or advance the simulation.',
      );
    const order = {
      ...input,
      id: 'O' + this.state.nextId++,
      createdTick: this.state.tick,
      remaining: input.quantity,
      averagePrice: 0,
      status: 'open',
      feesPaid: 0,
      events: [{ tick: this.state.tick, status: 'accepted', detail: 'Order accepted' }],
    };
    this.state.orders.push(order);
    if (input.instrument === 'spot') {
      if (input.orderType.startsWith('stop_')) {
        order.status = 'waiting';
        order.events.push({
          tick: this.state.tick,
          status: 'waiting',
          detail: 'Waiting for stop trigger',
        });
      } else this.exchange.submit(order);
    } else {
      order.status = 'filled';
      order.remaining = 0;
      order.averagePrice = quote.price;
      recordCash(
        this.state,
        user,
        -(quote.requiredCash - quote.fee),
        input.instrument === 'futures' ? 'margin_deposit' : 'option_premium',
        order.id,
      );
      if (quote.fee) recordCash(this.state, user, -quote.fee, 'trading_fee', order.id);
      user.realizedPnl = money(user.realizedPnl - quote.fee);
      user.feesPaid = money(user.feesPaid + quote.fee);
      order.feesPaid = quote.fee;
      order.events.push({
        tick: this.state.tick,
        status: 'filled',
        detail: 'Executed at model price',
      });
      notify(
        this.state,
        user.id,
        'Position opened',
        `${input.symbol} ${input.instrument}`,
        order.id,
      );
      this.state.positions.push({
        ...input,
        id: 'P' + this.state.nextId++,
        entryPrice: quote.price,
        margin: quote.margin,
        entryFee: quote.fee,
        expiryTick: quote.expiryTick,
        openedTick: this.state.tick,
        status: 'open',
      });
      this.state.trades.push({
        id: 'T' + this.state.nextId++,
        orderId: order.id,
        userId: user.id,
        instrument: input.instrument,
        symbol: input.symbol,
        side: input.side,
        quantity: input.quantity,
        price: quote.price,
        total: quote.total,
        fee: quote.fee,
        tick: this.state.tick,
      });
    }
    return order;
  }
  cancelOrder(id, userId) {
    const order = this.state.orders.find((o) => o.id === id && o.userId === userId);
    if (!order) throw new DomainError('Order not found.', 404);
    if (!['open', 'partial', 'waiting'].includes(order.status))
      throw new DomainError('Only an open order can be cancelled.');
    if (order.status !== 'waiting') this.exchange.cancel(order);
    order.status = 'cancelled';
    (order.events ||= []).push({
      tick: this.state.tick,
      status: 'cancelled',
      detail: 'Unfilled remainder cancelled',
    });
    notify(this.state, userId, 'Order cancelled', `${order.symbol} / ${order.id}`, order.id);
    return order;
  }
  closePosition(id, userId, reason = 'closed') {
    const position = this.state.positions.find((p) => p.id === id && p.userId === userId);
    if (!position) throw new DomainError('Position not found.', 404);
    if (position.status !== 'open') throw new DomainError('This position has already been closed.');
    const user = this.user(userId);
    const value = positionValue(
      position,
      this.market(position.symbol).price,
      this.state.tick,
      this.state.volatility,
    );
    const fee = feeFor(value.mark * position.quantity * LOT_SIZE, position.feeBps || 0);
    recordCash(this.state, user, value.value, 'position_' + reason, position.id);
    if (fee) recordCash(this.state, user, -fee, 'trading_fee', position.id);
    user.feesPaid = money(user.feesPaid + fee);
    user.realizedPnl = money(user.realizedPnl + value.pnl - fee);
    position.status = reason;
    position.closedTick = this.state.tick;
    position.realizedPnl = money(value.pnl - fee - (position.entryFee || 0));
    position.exitFee = fee;
    notify(
      this.state,
      userId,
      reason === 'liquidated' ? 'Margin liquidation' : 'Position ' + reason,
      `${position.symbol} / ${position.id}`,
      position.id,
    );
    this.state.trades.push({
      id: 'T' + this.state.nextId++,
      userId,
      symbol: position.symbol,
      instrument: position.instrument,
      side: reason,
      quantity: position.quantity,
      price: value.mark,
      total: money(value.mark * position.quantity * LOT_SIZE),
      tick: this.state.tick,
      pnl: value.pnl,
      fee,
      positionId: position.id,
    });
    return position;
  }
  advance(steps = 1) {
    for (let step = 0; step < steps; step++) {
      this.state.tick++;
      for (const order of this.state.orders.filter((o) =>
        ['open', 'partial', 'waiting'].includes(o.status),
      )) {
        if (
          order.timeInForce === 'day' &&
          Math.floor(order.createdTick / MINUTES_PER_DAY) <
            Math.floor(this.state.tick / MINUTES_PER_DAY)
        ) {
          this.cancelOrder(order.id, order.userId);
          order.status = 'expired';
          order.events.push({
            tick: this.state.tick,
            status: 'expired',
            detail: 'Day order expired',
          });
        }
      }
      for (const market of this.state.markets) {
        if (this.state.tick % MINUTES_PER_DAY === 0) {
          market.open = market.price;
          market.high = market.price;
          market.low = market.price;
          market.volume = 0;
        }
        const shock =
          (normal(this.state) * this.state.volatility) / Math.sqrt(252 * MINUTES_PER_DAY);
        market.price = money(
          Math.max(1, market.price * Math.exp(0.06 / (252 * MINUTES_PER_DAY) + shock)),
        );
        market.high = Math.max(market.high, market.price);
        market.low = Math.min(market.low, market.price);
        const volume = 100 + Math.floor(random(this.state) * 1900);
        market.volume += volume;
        market.history.push({ tick: this.state.tick, price: market.price, volume });
        if (market.history.length > 2340) market.history.shift();
      }
      this.exchange.refresh();
      this.triggerStops();
      for (const position of this.state.positions.filter((p) => p.status === 'open')) {
        const value = positionValue(
          position,
          this.market(position.symbol).price,
          this.state.tick,
          this.state.volatility,
        );
        if (position.expiryTick <= this.state.tick)
          this.closePosition(position.id, position.userId, 'expired');
        else if (position.instrument === 'futures' && value.value <= position.margin * 0.25)
          this.closePosition(position.id, position.userId, 'liquidated');
      }
      for (const alert of this.state.alerts.filter((a) => a.status === 'active')) {
        const price = this.market(alert.symbol).price;
        if (alert.direction === 'above' ? price >= alert.price : price <= alert.price) {
          alert.status = 'triggered';
          alert.triggeredTick = this.state.tick;
          notify(
            this.state,
            alert.userId,
            'Price alert',
            `${alert.symbol} ${alert.direction} ${alert.price.toFixed(2)} USD`,
            alert.id,
          );
        }
      }
      for (const user of this.state.users) samplePerformance(this, user.id);
    }
  }
  triggerStops() {
    for (const order of this.state.orders.filter((o) => o.status === 'waiting')) {
      const price = this.market(order.symbol).price;
      if (!(order.side === 'buy' ? price >= order.stopPrice : price <= order.stopPrice)) continue;
      const executionType = order.orderType === 'stop_limit' ? 'limit' : 'market';
      const quote = this.quote({ ...order, orderType: executionType, quantity: order.remaining });
      const portfolio = this.portfolio(order.userId, order.id);
      const reason =
        order.side === 'buy' && quote.requiredCash > portfolio.availableCash
          ? 'Insufficient cash at trigger'
          : executionType === 'market' && quote.availableQuantity < order.remaining
            ? 'Insufficient liquidity at trigger'
            : null;
      order.events.push({
        tick: this.state.tick,
        status: 'triggered',
        detail: `Stop triggered at ${price.toFixed(2)} USD`,
      });
      if (reason) {
        order.status = 'rejected';
        order.reason = reason;
        order.events.push({ tick: this.state.tick, status: 'rejected', detail: reason });
        notify(this.state, order.userId, 'Stop order rejected', reason, order.id);
      } else {
        order.triggeredTick = this.state.tick;
        order.executionType = executionType;
        order.status = 'open';
        this.exchange.submit(order);
      }
    }
  }
  createAccount(id, label = 'Trading account') {
    const user = {
      id,
      name: label,
      cash: 0,
      realizedPnl: 0,
      holdings: {},
      netFunding: INITIAL_CASH,
      feesPaid: 0,
    };
    this.state.users.push(user);
    recordCash(this.state, user, INITIAL_CASH, 'initial_funding');
    samplePerformance(this, id);
    return user;
  }
  fund(userId, amount) {
    const user = this.user(userId);
    if (!Number.isFinite(amount) || amount === 0 || Math.abs(amount) > 1000000)
      throw new DomainError('Funding must be between 0.01 and 1,000,000 USD.');
    if (amount < 0 && -amount > this.portfolio(userId).availableCash)
      throw new DomainError('Insufficient available cash.');
    if (user.netFunding + amount < 0)
      throw new DomainError('Withdrawals cannot exceed net contributions.');
    recordCash(
      this.state,
      user,
      money(amount),
      amount > 0 ? 'virtual_deposit' : 'virtual_withdrawal',
    );
    user.netFunding = money(user.netFunding + amount);
    samplePerformance(this, userId);
  }
  snapshot(userId = '1', symbol = 'AAPL') {
    this.market(symbol);
    return {
      simulation: {
        running: this.state.running,
        speed: this.state.speed,
        volatility: this.state.volatility,
        seed: this.state.seed,
        tick: this.state.tick,
        label: clockLabel(this.state.tick),
        feeBps: this.state.feeBps,
        fxRate: this.state.fxRate,
      },
      markets: this.state.markets.map((m) => ({
        ...m,
        change: money(m.price - m.open),
        changePercent: (m.price / m.open - 1) * 100,
      })),
      users: this.state.users.map(({ id, name }) => ({ id, name })),
      portfolio: this.portfolio(userId),
      book: this.exchange.depth(symbol),
      orders: this.state.orders
        .filter((o) => o.userId === userId)
        .slice(-500)
        .reverse(),
      activity: this.state.trades
        .filter((t) => t.userId === userId)
        .slice(-300)
        .reverse(),
      performance: performanceSummary(this.state, userId),
      ledger: this.state.ledger
        .filter((e) => e.userId === userId)
        .slice(-500)
        .reverse(),
      notifications: this.state.notifications
        .filter((n) => n.userId === userId)
        .slice(-100)
        .reverse(),
      alerts: this.state.alerts.filter((a) => a.userId === userId),
      stats: {
        trades: this.state.trades.length,
        orders: this.state.orders.length,
        accounts: this.state.users.length,
      },
    };
  }
}
