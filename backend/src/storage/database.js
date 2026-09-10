import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, existsSync, copyFileSync, constants } from 'node:fs';
import path from 'node:path';
import { StateStore } from './store.js';

export class DatabaseStore {
  constructor(filename, { legacyFile } = {}) {
    if (filename !== ':memory:') mkdirSync(path.dirname(filename), { recursive: true });
    this.db = new DatabaseSync(filename, { timeout: 5000 });
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA synchronous=FULL;');
    const migrated = this.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'")
      .get();
    if (!migrated)
      this.transaction(() =>
        this.db.exec(
          readFileSync(new URL('./migrations/001-platform.sql', import.meta.url), 'utf8'),
        ),
      );
    if (!this.load() && legacyFile && existsSync(legacyFile)) {
      const backup = path.join(path.dirname(legacyFile), 'backups', 'pre-sqlite-state.json');
      mkdirSync(path.dirname(backup), { recursive: true });
      if (!existsSync(backup)) copyFileSync(legacyFile, backup, constants.COPYFILE_EXCL);
      const state = new StateStore(legacyFile).load();
      state.feeBps = 10;
      this.db.prepare('INSERT INTO market_state(id,data) VALUES(1,?)').run(JSON.stringify(state));
    }
  }
  transaction(operation) {
    if (this.db.isTransaction) return operation();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = operation();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  load() {
    const row = this.db.prepare('SELECT data FROM market_state WHERE id=1').get();
    if (!row) return null;
    const state = JSON.parse(row.data);
    state.running = false;
    return state;
  }
  save(state) {
    this.transaction(() => {
      this.db
        .prepare(
          'INSERT INTO market_state VALUES(1,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',
        )
        .run(JSON.stringify(state));
      const ledger = this.db.prepare('INSERT OR IGNORE INTO ledger_entries VALUES(?,?,?,?,?,?,?)');
      for (const e of state.ledger)
        ledger.run(e.id, e.userId, e.kind, e.amountCents, e.balanceCents, e.reference, e.tick);
      for (const user of state.users) {
        const sum = this.db
          .prepare(
            'SELECT COALESCE(SUM(amount_cents),0) AS balance FROM ledger_entries WHERE user_id=?',
          )
          .get(user.id).balance;
        if (sum !== Math.round(user.cash * 100)) throw new Error('Ledger reconciliation failed.');
      }
      const orders = this.db.prepare(
        'INSERT INTO order_records VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,data=excluded.data',
      );
      for (const o of state.orders) orders.run(o.id, o.userId, o.status, JSON.stringify(o));
      const trades = this.db.prepare('INSERT OR IGNORE INTO executions VALUES(?,?,?,?)');
      for (const t of state.trades)
        trades.run(t.id, t.userId, t.orderId || null, JSON.stringify(t));
    });
  }
  identity(id) {
    return this.db.prepare('SELECT * FROM identities WHERE id=?').get(id);
  }
  byEmail(email) {
    return this.db.prepare('SELECT * FROM identities WHERE email=?').get(email);
  }
  addIdentity({ id, email = null, passwordHash = null, role = 'trader', demo = false }) {
    this.db
      .prepare(
        'INSERT INTO identities(id,email,password_hash,role,is_demo,created_at) VALUES(?,?,?,?,?,?)',
      )
      .run(id, email, passwordHash, role, Number(demo), new Date().toISOString());
  }
  preferences(id, value) {
    if (value)
      this.db
        .prepare('UPDATE identities SET preferences=? WHERE id=?')
        .run(JSON.stringify(value), id);
    return JSON.parse(this.identity(id).preferences);
  }
  createSession(hash, id, csrf, expires) {
    this.db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());
    this.db
      .prepare('INSERT INTO sessions VALUES(?,?,?,?,?)')
      .run(hash, id, csrf, expires, Date.now());
  }
  session(hash) {
    return this.db
      .prepare('SELECT * FROM sessions WHERE token_hash=? AND expires_at>?')
      .get(hash, Date.now());
  }
  deleteSession(hash) {
    this.db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hash);
  }
  previous(id, key) {
    return this.db.prepare('SELECT * FROM idempotency WHERE user_id=? AND key=?').get(id, key);
  }
  remember(id, key, fingerprint, response) {
    this.db
      .prepare('INSERT INTO idempotency VALUES(?,?,?,?,?)')
      .run(id, key, fingerprint, JSON.stringify(response), Date.now());
  }
  audit(id, action) {
    this.db
      .prepare('INSERT INTO audit_events(user_id,action,created_at) VALUES(?,?,?)')
      .run(id, action, new Date().toISOString());
  }
  auditLog() {
    return this.db
      .prepare('SELECT action,created_at FROM audit_events ORDER BY id DESC LIMIT 30')
      .all();
  }
  promote(id) {
    this.db.prepare("UPDATE identities SET role='admin' WHERE id=? AND is_demo=0").run(id);
  }
  archive(state) {
    this.db
      .prepare('INSERT INTO archives(created_at,data) VALUES(?,?)')
      .run(new Date().toISOString(), JSON.stringify(state));
  }
  stats() {
    return {
      accounts: this.db.prepare('SELECT COUNT(*) AS n FROM identities').get().n,
      ledgerEntries: this.db.prepare('SELECT COUNT(*) AS n FROM ledger_entries').get().n,
      schema: 1,
    };
  }
  close() {
    this.db.close();
  }
}
