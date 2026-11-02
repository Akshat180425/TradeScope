import { z } from 'zod';

export const journalSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    notes: z.string().trim().max(5000).default(''),
    strategy: z.string().trim().max(80).default(''),
    tags: z
      .array(z.string().trim().min(1).max(30))
      .max(8)
      .transform((tags) => [...new Set(tags)])
      .default([]),
    status: z.enum(['planned', 'reviewed']).default('planned'),
    symbol: z.enum(['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA']),
    tradeId: z.string().min(1).max(80).nullable().default(null),
  })
  .strict();
