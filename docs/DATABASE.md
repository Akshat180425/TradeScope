# Database

## Schema

Migration: `backend/src/storage/migrations/001-platform.sql`.

| Table               | Responsibility                                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------------ |
| `schema_migrations` | Applied schema version and timestamp                                                                         |
| `identities`        | Account ID, normalized email, password hash, role, demo flag, preferences, future verification/Google fields |
| `sessions`          | Hashed session token, identity foreign key, CSRF value and expiry                                            |
| `market_state`      | One versioned JSON snapshot containing the market engine's complete state                                    |
| `ledger_entries`    | Append-only cash events, integer-cent amounts and balances, account/reference/tick                           |
| `executions`        | Immutable-by-application execution projections, indexed by account                                           |
| `order_records`     | Latest order state and details, indexed by account/status                                                    |
| `idempotency`       | Account + request key uniqueness, request fingerprint and original response                                  |
| `audit_events`      | Account action and wall-clock timestamp                                                                      |
| `archives`          | Reserved whole-scenario archive records                                                                      |

The market snapshot remains the engine's restart representation. Tables provide independent account/session storage and searchable ledger/order/execution projections. Holdings, positions, chart history, notifications and alerts currently live inside the snapshot; they are not all normalized into separate tables. This deliberate local design avoids coupling matching logic to SQL but is not optimized for large datasets.

## Invariants

- Foreign keys link sessions and request keys to identities.
- Email and Google-subject fields are unique when non-null.
- Ledger amounts and balances are integer cents. The sum of an account's entries must equal its current cash on every save.
- SQL triggers prohibit updates and deletes to cash-ledger rows. Corrections should be new compensating entries, not edited history.
- Market state, projections and idempotency result participate in the same transaction.
- A failed SQL save restores the pre-action in-memory engine.
- One engine process owns the database lock. SQLite WAL and full synchronous mode protect committed writes; the file is not encrypted or tamper-proof against someone controlling the machine.

## Legacy Migration

First startup only: if the new database has no market snapshot and the original `.local/state.json` exists, copy that file to `.local/backups/pre-sqlite-state.json` and import it. The source file is left untouched. Existing anonymous labels, IDs, balances, holdings, positions, orders and histories are preserved. Ledger tracking begins with each account's actual migration cash balance. Past cash events are not reconstructed from incomplete information.

Legacy accounts have no invented passwords and cannot be selected through public login. Administrators see their preserved-equity summary. New accounts are separate UUID-based identities. No automatic transfer of legacy money to a new registrant occurs.

## Backup

Stop the server before copying the database. If SQLite WAL/SHM files are present after an abrupt termination, retain them with the database until SQLite recovers/checkpoints; do not copy only an actively changing main file. Keep backups outside a public repository. `.local` is ignored by Git.

For independent experiments, set `INVESTOGRAM_DATABASE` to a separate filename. Do not point two server instances at one engine database. A new filename does not import the original JSON unless the normal default migration path is used.

## MongoDB Atlas Later

The repository interface is the replacement boundary: load/save, transactional execution, identities, preferences, sessions, request results, audit and admin queries. An Atlas adapter will need collections and unique indexes corresponding to those guarantees, as well as a multi-document transaction for each financial operation. Merely copying JSON into a collection is not a complete migration.

Plan a backed-up export/import, cent-value type checks, session invalidation or migration, ledger reconciliation, and rerun the same privacy/concurrency tests. Multiple application instances will also need durable market ownership and event coordination; the current process-file lock cannot coordinate separate hosts.
