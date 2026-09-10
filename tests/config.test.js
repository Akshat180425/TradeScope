import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
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

test('database naming preserves existing installations and prefers explicit new settings', (t) => {
  const root = mkdtempSync(path.join(tmpdir(), 'tradescope-config-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const current = path.join(root, '.local/tradescope.sqlite');
  const previous = path.join(root, '.local/investogram.sqlite');
  assert.equal(parseConfig({}, root).database, current);
  mkdirSync(path.dirname(previous));
  writeFileSync(previous, '');
  assert.equal(parseConfig({}, root).database, previous);
  writeFileSync(current, '');
  assert.equal(parseConfig({}, root).database, current);
  assert.equal(
    parseConfig({ INVESTOGRAM_DATABASE: 'existing.sqlite' }, root).database,
    path.join(root, 'existing.sqlite'),
  );
  const custom = parseConfig(
    { TRADESCOPE_DATABASE: 'chosen.sqlite', INVESTOGRAM_DATABASE: 'existing.sqlite' },
    root,
  );
  assert.equal(custom.database, path.join(root, 'chosen.sqlite'));
  assert.equal(custom.legacyFile, undefined);
  assert.throws(() => parseConfig({ TRADESCOPE_DATABASE: '' }, root));
});
