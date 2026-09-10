# API Reference

Base URL: `/api`. JSON mutation bodies are limited to 32 KB. All money inputs use USD, not the selected display currency.

## Authentication

| Method | Endpoint         | Body / result                                                               |
| ------ | ---------------- | --------------------------------------------------------------------------- |
| POST   | `/auth/register` | `{ "email": "account@example.com", "password": "a-long-example-password" }` |
| POST   | `/auth/login`    | Same credential fields                                                      |
| POST   | `/auth/demo`     | `{}`; creates a separate anonymous account                                  |
| GET    | `/auth/session`  | Current public identity, preferences and CSRF token                         |
| POST   | `/auth/logout`   | `{}`; invalidates the current session                                       |
| GET    | `/health`        | Public process/version/storage health                                       |

Successful register/login/demo responses include `{ user, csrf, preferences }` and set the HttpOnly session cookie. Email is normalized to lowercase. Password length is 10-128 characters. Extra registration fields such as `role` are rejected. Failed login does not distinguish an unknown email from an incorrect password.

Authenticated mutation requests require `X-CSRF-Token` from the session response. Browser `Origin` must match the configured application origin. Use the cookie on all private requests. There is no bearer-token or public account-switching API.

## Workspace

| Method | Endpoint                  | Purpose                                                                                                       |
| ------ | ------------------------- | ------------------------------------------------------------------------------------------------------------- |
| GET    | `/state?symbol=AAPL`      | Own portfolio, recent orders/executions/ledger, performance, notifications, alerts, markets and selected book |
| GET    | `/events`                 | SSE `revision` events and heartbeat comments; `expired` closes an expired session stream                      |
| PATCH  | `/preferences`            | `{ "currency": "INR", "watchlist": ["AAPL", "MSFT"] }`                                                        |
| POST   | `/quote`                  | Order fields below; estimates only, no reservation                                                            |
| POST   | `/orders`                 | Place an order                                                                                                |
| DELETE | `/orders/:id`             | `{}`; cancel own unfilled remainder                                                                           |
| POST   | `/positions/:id/close`    | `{}`; close own open derivative                                                                               |
| POST   | `/funding`                | `{ "amount": 1000 }`; positive virtual deposit, negative withdrawal                                           |
| POST   | `/alerts`                 | `{ "symbol": "AAPL", "direction": "above", "price": 250 }`                                                    |
| DELETE | `/alerts/:id`             | `{}`; cancel own alert                                                                                        |
| POST   | `/notifications/read`     | `{}`; mark own notifications read                                                                             |
| GET    | `/export.csv`             | All own executions with USD fees                                                                              |
| GET    | `/export.csv?kind=ledger` | All own cash entries in USD                                                                                   |

The authenticated account is authoritative. Requests specifying someone else's `userId` return 403. Looking up a non-owned order, position or alert returns 404.

### Order Input

```json
{
  "symbol": "AAPL",
  "instrument": "spot",
  "side": "buy",
  "orderType": "stop_limit",
  "quantity": 2,
  "stopPrice": 250,
  "limitPrice": 252,
  "timeInForce": "day"
}
```

Symbols: `AAPL`, `MSFT`, `GOOGL`, `AMZN`, `TSLA`. Instruments: `spot`, `futures`, `options`. Side: `buy`/`sell`; options are buy-only. Stock order types: `market`, `limit`, `stop_market`, `stop_limit`. Default time-in-force is `gtc`; `day` expires at the next trading-session boundary.

Quantity is an integer from 1 to 1,000. Limit and strike values must be positive. Stops require `stopPrice`; stop-limit orders additionally require `limitPrice`. Derivatives use market/model execution and accept `expiryDays` from 1 to 30; options also require `optionType` (`call` or `put`) and `strike`. Each contract represents 100 underlying shares.

Quotes include `price`, `total`, `fee`, `requiredCash` and `lotSize`; futures also include margin. Estimated spot proceeds are notional less fees. Waiting-stop estimates are conditional, not guaranteed execution prices. Accepted orders capture the configured fee rate so later settings changes do not alter their fees.

### Financial Request Keys

Order placement/cancellation, position closing and funding require an `Idempotency-Key` header, 16-100 alphanumeric/hyphen characters. Generate a UUID per intended action. Reuse it after an uncertain network result. An identical retry returns the original response; different content with the same account/key returns 409. Do not generate a new key merely because the connection failed.

## Administration

`GET /admin` returns storage counts, preserved legacy-account values and recent audit actions. `POST /simulation` accepts:

```json
{ "action": "configure", "speed": 5, "volatility": 0.3, "feeBps": 10, "fxRate": 83 }
```

Actions: `start`, `pause`, `step`, `configure`. Step count is 1-390 and requires a paused market. Speed is 1/5/15 ticks per second; volatility is 0.05-0.8; fees are 0-100 basis points; simulated INR/USD is 1-200. Only an administrator can use these endpoints. A destructive `reset` is rejected; use an independent database for a fresh scenario.

## Errors

Errors contain `{ "error": "message", "requestId": "..." }` where available. Responses carry `X-Request-ID`.

| Status | Meaning                                                                             |
| ------ | ----------------------------------------------------------------------------------- |
| 400    | Invalid input, insufficient funds/shares, unsupported action or invalid request key |
| 401    | Missing/expired session or incorrect credentials                                    |
| 403    | Account/role, origin or CSRF restriction                                            |
| 404    | Missing or non-owned entity                                                         |
| 409    | Existing registration or conflicting idempotency request                            |
| 415    | Mutation request is not JSON                                                        |
| 429    | Authentication rate limit; includes `Retry-After`                                   |
| 500    | Failed internal operation; financial mutation rolled back                           |
