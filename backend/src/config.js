import path from 'node:path';
import { z } from 'zod';

const boolean = z.enum(['true', 'false']).transform((value) => value === 'true');
const schema = z.object({
  HOST: z.string().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  AUTH_RATE_LIMIT: z.coerce.number().int().min(1).max(1000).default(20),
  AUTO_RUN: boolean.default('true'),
  DEMO_ENABLED: boolean.default('true'),
  SECURE_COOKIES: boolean.default('false'),
  APP_ORIGIN: z
    .string()
    .url()
    .refine(
      (value) => new URL(value).origin === value,
      'APP_ORIGIN must be an origin without a path or trailing slash.',
    )
    .optional(),
  INVESTOGRAM_DATABASE: z.string().min(1).optional(),
});
export function parseConfig(environment, root) {
  const value = schema.parse(environment);
  return {
    host: value.HOST,
    port: value.PORT,
    authLimit: value.AUTH_RATE_LIMIT,
    autoRun: value.AUTO_RUN,
    demo: value.DEMO_ENABLED,
    secureCookies: value.SECURE_COOKIES,
    origin: value.APP_ORIGIN,
    database: path.resolve(root, value.INVESTOGRAM_DATABASE || '.local/investogram.sqlite'),
    legacyFile: value.INVESTOGRAM_DATABASE ? undefined : path.join(root, '.local/state.json'),
  };
}
