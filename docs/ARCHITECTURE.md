# Architecture

## Request Flow

```text
React workspace
  -> authenticated REST request + CSRF token + idempotency key
  -> Express validation and account/role authorization
  -> domain engine: book matching, prices, accounting, positions
  -> SQLite transaction: snapshot + ledger + projections + request result
  -> commit, then notify connected clients through an SSE revision
  -> browser fetches its own account snapshot
```

The frontend never supplies an authoritative account balance or fee. The backend binds every action to the session's account. Supplying a different account ID is forbidden, and entity lookups additionally require ownership. Administrator functions have a separate role check. All code is JavaScript/JSX, with npm workspaces for frontend and backend.

## Domain Logic

The existing `nodejs-order-book` library remains the spot matching core. Each symbol has an independent price/time queue; synthetic market-maker and user orders share it. The adapter preserves queue priority across restart and prevents self-trades. Conditional stop orders are not inserted into the book until their trigger is met. Day-order expiration runs before matching the first minute of the next session.

Cash ledger amounts and running balances use integer cents. Stock cost basis retains fractional precision. Each fill records its notional cash movement and its fee independently. Fees use cumulative order notional, so splitting an order into many executions cannot multiply rounding charges. Pending buys reserve principal plus expected remaining fees; pending sells reserve shares.

Futures lock 20% initial margin and use a simplified 4% cost-of-carry mark. Open value is margin plus signed unrealized P&L. Options are long-only, use the `black-scholes` library and a fixed 4% rate, and settle in cash. Entry and exit fees are recorded. These are model-priced educational positions, not exchange-specific derivative matching.

Seeded independent random paths drive one-minute stock prices. Price/volume history is aggregated into 5-minute or 30-minute OHLC bars, without inventing intra-minute prices. User fills consume liquidity but do not change the random reference-price process. Market-maker liquidity is regenerated each tick.

## Accounting and Performance

Equity includes cash, stock values, option values and futures margin equity. Total P&L compares equity with net virtual contributions. Time-weighted performance links successive returns after removing funding changes. A new account starts with one real baseline snapshot; later observations come from actual ticks/actions. No performance history is retroactively invented for migrated accounts.

Portfolio charts retain up to 10,000 snapshots per account. Equity charts include funding jumps; the return view removes those external flows. The current INR setting converts dollar values for presentation only. Order parameters, cash settlement and CSV exports remain USD. Changing the simulated FX rate does not alter the ledger or USD investment returns.

## Transactions and Idempotency

`createApp` snapshots the in-memory engine before a mutation and starts a synchronous SQLite transaction. The business action, ledger projections, state snapshot, audit record and idempotency response commit together. An exception rolls SQL back and rebuilds the engine from the saved in-memory snapshot. SSE publication occurs only after a successful commit.

Financial mutations require an account-scoped idempotency key. An exact retry returns the stored response; using the same key for different content returns 409. The browser holds the key while an outcome is uncertain and disables duplicate submission. The server still validates and deduplicates independently.

The event loop serializes synchronous market mutations within one process. A database file lock prevents a second market engine from loading a stale snapshot. This is not a distributed exchange: multiple worker processes, a message bus and high-volume order handling would require a different coordination model.

## Identity and Sessions

Registration hashes passwords using asynchronous scrypt with a random salt. Sessions use 256-bit random tokens, stored as SHA-256 hashes in SQLite. Browser cookies are HttpOnly and SameSite=Strict, with an eight-hour lifetime. Mutation requests require the session's CSRF token, and browser origins are checked. Production cookies can require HTTPS.

Google subject and verification timestamp fields are reserved for future integrations; no OAuth or email flow exists yet. Anonymous demos are independent private accounts and have no recoverable credentials. Administrator status is granted through a local CLI, never signup parameters.

## Storage and Lifecycle

See [database notes](DATABASE.md). The repository contains SQL; the domain engine has no SQL dependency. The former JSON store is retained only as an import reader. Existing data is backed up before first migration; legacy accounts are not assigned to new registrations.

The server defaults to loopback binding, starts the market unless `AUTO_RUN=false`, and supports orderly shutdown. The production process serves the built frontend and API together. Development uses Vite's API proxy. SSE reconnects automatically, while a 30-second fetch provides a fallback.

## Verification

Domain tests cover matching, reservations, fees, stops, expiry, derivatives and accounting. API tests cover session handling, role/ownership restrictions, CSRF, duplicate concurrent requests, funding, alerts, CSV exports and transaction rollback. Migration tests preserve financial records and reject ledger tampering. Browser tests exercise the production build on desktop/mobile, including chart geometry, forms, currency, account sessions and error recovery.

Primary implementation references: [Node.js SQLite](https://nodejs.org/download/release/v22.16.0/docs/api/sqlite.html), [Node.js crypto](https://nodejs.org/docs/latest-v22.x/api/crypto.html), [OWASP session guidance](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html), [order-book library](https://www.npmjs.com/package/nodejs-order-book), [option-pricing library](https://www.npmjs.com/package/black-scholes).
