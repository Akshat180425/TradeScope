import bs from 'black-scholes';
import { LOT_SIZE, MINUTES_PER_DAY, money } from './catalog.js';
export function contractPrice(position, spot, tick, volatility = 0.3) {
  const years = Math.max(0, position.expiryTick - tick) / MINUTES_PER_DAY / 252;
  if (position.instrument === 'futures') return money(spot * Math.exp(0.04 * years));
  if (years === 0)
    return money(
      Math.max(0, position.optionType === 'call' ? spot - position.strike : position.strike - spot),
    );
  return money(
    Math.max(
      0,
      bs.blackScholes(spot, position.strike, years, volatility, 0.04, position.optionType),
    ),
  );
}
export function positionValue(position, spot, tick, volatility) {
  const mark = contractPrice(position, spot, tick, volatility);
  const pnl = money(
    (mark - position.entryPrice) *
      position.quantity *
      LOT_SIZE *
      (position.side === 'sell' ? -1 : 1),
  );
  return {
    mark,
    pnl,
    value: money(
      position.instrument === 'options'
        ? mark * position.quantity * LOT_SIZE
        : position.margin + pnl,
    ),
  };
}
