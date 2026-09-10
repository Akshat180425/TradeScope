CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
CREATE TABLE market_state (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL);
CREATE TABLE identities (
  id TEXT PRIMARY KEY, email TEXT UNIQUE, password_hash TEXT,
  role TEXT NOT NULL DEFAULT 'trader' CHECK(role IN ('trader','admin')),
  is_demo INTEGER NOT NULL DEFAULT 0 CHECK(is_demo IN (0,1)),
  verified_at TEXT, google_subject TEXT UNIQUE, created_at TEXT NOT NULL,
  preferences TEXT NOT NULL DEFAULT '{"currency":"USD","watchlist":["AAPL","MSFT","TSLA"]}'
);
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES identities(id),
  csrf TEXT NOT NULL, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE TABLE ledger_entries (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, kind TEXT NOT NULL,
  amount_cents INTEGER NOT NULL, balance_cents INTEGER NOT NULL,
  reference TEXT, tick INTEGER NOT NULL
);
CREATE INDEX ledger_user ON ledger_entries(user_id, tick);
CREATE TRIGGER ledger_no_update BEFORE UPDATE ON ledger_entries BEGIN SELECT RAISE(ABORT, 'Ledger entries are immutable'); END;
CREATE TRIGGER ledger_no_delete BEFORE DELETE ON ledger_entries BEGIN SELECT RAISE(ABORT, 'Ledger entries are immutable'); END;
CREATE TABLE executions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, order_id TEXT, data TEXT NOT NULL);
CREATE INDEX executions_user ON executions(user_id);
CREATE TABLE order_records (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, status TEXT NOT NULL, data TEXT NOT NULL);
CREATE INDEX orders_user_status ON order_records(user_id, status);
CREATE TABLE idempotency (
  user_id TEXT NOT NULL REFERENCES identities(id), key TEXT NOT NULL, fingerprint TEXT NOT NULL,
  response TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(user_id, key)
);
CREATE TABLE audit_events (id INTEGER PRIMARY KEY, user_id TEXT, action TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE archives (id INTEGER PRIMARY KEY, created_at TEXT NOT NULL, data TEXT NOT NULL);
INSERT INTO schema_migrations VALUES (1, datetime('now'));
