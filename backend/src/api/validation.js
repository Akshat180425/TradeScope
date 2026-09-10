import { z } from 'zod';
const positive = z.number().finite().min(0.01).max(1000000);
export const orderSchema = z
  .object({
    userId: z.string().min(1),
    symbol: z.enum(['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA']),
    instrument: z.enum(['spot', 'futures', 'options']),
    side: z.enum(['buy', 'sell']),
    orderType: z.enum(['market', 'limit', 'stop_market', 'stop_limit']).default('market'),
    timeInForce: z.enum(['day', 'gtc']).default('gtc'),
    stopPrice: positive.optional(),
    quantity: z.number().int().min(1).max(1000),
    limitPrice: positive.optional(),
    strike: positive.optional(),
    optionType: z.enum(['call', 'put']).optional(),
    expiryDays: z.number().int().min(1).max(30).default(7),
  })
  .superRefine((order, ctx) => {
    const error = (message) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    if (
      order.instrument === 'spot' &&
      ['limit', 'stop_limit'].includes(order.orderType) &&
      !order.limitPrice
    )
      error('Enter a limit price.');
    if (order.orderType.startsWith('stop_') && !order.stopPrice) error('Enter a stop price.');
    if (order.instrument === 'options' && (!order.strike || !order.optionType))
      error('Options require a strike price and call or put selection.');
    if (order.instrument === 'options' && order.side === 'sell')
      error('Only long calls and puts are supported. Close an existing position to sell it.');
    if (order.instrument !== 'spot' && order.orderType !== 'market')
      error('Derivatives use market orders.');
  });
export const simulationSchema = z.object({
  action: z.enum(['start', 'pause', 'step', 'reset', 'configure']),
  steps: z.number().int().min(1).max(390).optional(),
  speed: z.union([z.literal(1), z.literal(5), z.literal(15)]).optional(),
  seed: z.number().int().min(1).max(4294967295).optional(),
  volatility: z.number().min(0.05).max(0.8).optional(),
  feeBps: z.number().int().min(0).max(100).optional(),
  fxRate: z.number().finite().min(1).max(200).optional(),
});
