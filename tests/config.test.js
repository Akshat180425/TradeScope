import test from 'node:test';
import assert from 'node:assert/strict';
import { parseConfig } from '../backend/src/config.js';
test('configuration rejects values that could disable security controls accidentally', () => {
  for (const environment of [
    { AUTH_RATE_LIMIT: 'invalid' },
    { AUTH_RATE_LIMIT: '0' },
    { SECURE_COOKIES: 'yes' },
    { PORT: '70000' },
    { APP_ORIGIN: 'https://app.example/path' },
  ]) {
    assert.throws(() => parseConfig(environment, process.cwd()));
  }
  const config = parseConfig({ AUTO_RUN: 'false', SECURE_COOKIES: 'true' }, process.cwd());
  assert.equal(config.autoRun, false);
  assert.equal(config.secureCookies, true);
  assert.equal(config.authLimit, 20);
});
