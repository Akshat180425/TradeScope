import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { acquireLock } from '../backend/src/storage/lock.js';

test('only one server may use a saved session, and closing releases the lock', (t) => {
  const folder = mkdtempSync(path.join(tmpdir(), 'investogram-lock-'));
  t.after(() => rmSync(folder, { recursive: true, force: true }));
  const filename = path.join(folder, 'session.lock');
  const release = acquireLock(filename);
  assert.throws(() => acquireLock(filename), /already open/);
  release();
  const releaseNext = acquireLock(filename);
  assert.throws(() => acquireLock(filename), /already open/);
  releaseNext();
});
