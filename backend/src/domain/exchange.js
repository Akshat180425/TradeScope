import { OrderBook } from 'nodejs-order-book';
import { money } from './catalog.js';

export class Exchange {
  constructor(state, onFill) {
    this.state = state;
    this.onFill = onFill;
    this.books = new Map();
    this.orders = new Map();
    for (const market of state.markets) this.books.set(market.symbol, new OrderBook());
    const resting = [...state.orders, ...state.liquidity]
      .filter(
        (o) =>
          (o.instrument === 'spot' || !o.userId) &&
          o.remaining > 0 &&
          ['open', 'partial'].includes(o.status),
      )
      .sort((a, b) => (a.bookSequence || 0) - (b.bookSequence || 0));
    state.nextBookSequence ||= 0;
    for (const order of resting) {
      this.orders.set(order.id, order);
      this.books.get(order.symbol).limit({
        id: order.id,
        side: order.side,
        size: order.remaining,
        price: order.limitPrice,
        accountId: order.userId || order.id,
      });
    }
  }
  submit(order) {
    order.bookSequence = ++this.state.nextBookSequence;
    this.orders.set(order.id, order);
    const book = this.books.get(order.symbol);
    const options = {
      id: order.id,
      side: order.side,
      size: order.remaining,
      accountId: order.userId || order.id,
      stpMode: 'EXPIRE_MAKER',
    };
    const result =
      (order.executionType || order.orderType) === 'market'
        ? book.market(options)
        : book.limit({ ...options, price: order.limitPrice });
    if (result.err) throw new Error(result.err.message);
    for (const expired of result.stpExpired || []) {
      const previous = this.orders.get(expired.id);
      if (previous) {
        previous.status = 'cancelled';
        previous.reason = 'Self-trade prevented';
      }
      this.orders.delete(expired.id);
    }
    for (const done of result.done) {
      if (done.id !== order.id)
        this.fill(order, this.orders.get(done.id), this.orders.get(done.id)?.remaining || 0);
    }
    if (result.partial && result.partial.id !== order.id)
      this.fill(order, this.orders.get(result.partial.id), result.partialQuantityProcessed);
    if ((order.executionType || order.orderType) === 'market' && order.remaining > 0)
      order.status = 'cancelled';
    return order;
  }
  fill(taker, maker, quantity) {
    if (!maker || quantity <= 0) return;
    const price = maker.limitPrice;
    for (const order of [maker, taker]) {
      const filled = order.quantity - order.remaining;
      order.filledNotional = money(
        (order.filledNotional ?? (order.averagePrice || 0) * filled) + price * quantity,
      );
      order.averagePrice = money(order.filledNotional / (filled + quantity));
      order.remaining -= quantity;
      order.status = order.remaining === 0 ? 'filled' : 'partial';
      if (order.userId) this.onFill(order, quantity, price);
      if (order.remaining === 0) this.orders.delete(order.id);
    }
  }
  cancel(order) {
    this.books.get(order.symbol).cancel(order.id);
    this.orders.delete(order.id);
    order.status = 'cancelled';
  }
  refresh() {
    for (const order of this.state.liquidity) {
      this.books.get(order.symbol).cancel(order.id);
      this.orders.delete(order.id);
    }
    this.state.liquidity = [];
    for (const market of this.state.markets) {
      for (let level = 0; level < 8; level++) {
        for (const side of ['buy', 'sell']) {
          const order = {
            id: 'MM-' + market.symbol + '-' + side + '-' + level,
            symbol: market.symbol,
            userId: null,
            side,
            orderType: 'limit',
            limitPrice: money(
              Math.max(
                0.01,
                market.price +
                  (side === 'buy' ? -1 : 1) *
                    Math.max(0.01, money(market.price * 0.0008)) *
                    (level + 1),
              ),
            ),
            quantity: 200 + level * 100,
            remaining: 200 + level * 100,
            status: 'open',
          };
          this.submit(order);
          if (order.remaining > 0) this.state.liquidity.push(order);
        }
      }
    }
  }
  depth(symbol, { excludeUserId, limit = 8 } = {}) {
    const levels = (side) => {
      const prices = new Map();
      for (const order of this.orders.values()) {
        if (
          order.symbol === symbol &&
          order.side === side &&
          (!excludeUserId || order.userId !== excludeUserId) &&
          order.remaining > 0 &&
          ['open', 'partial'].includes(order.status)
        ) {
          prices.set(order.limitPrice, (prices.get(order.limitPrice) || 0) + order.remaining);
        }
      }
      return [...prices]
        .sort((a, b) => (side === 'buy' ? b[0] - a[0] : a[0] - b[0]))
        .slice(0, limit)
        .map(([price, quantity]) => ({ price, quantity }));
    };
    return { bids: levels('buy'), asks: levels('sell') };
  }
}
