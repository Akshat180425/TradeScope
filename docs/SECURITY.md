# Security and Deployment

## Implemented Controls

- Asynchronous salted scrypt hashes; no plaintext password storage.
- Random session tokens with hashed database representation, HttpOnly/SameSite cookies, expiry and logout invalidation.
- Per-session CSRF tokens and browser-origin checks on mutations.
- Server-side account ownership and administrator authorization.
- Authentication rate limiting, input validation, body limits and generic internal-error responses.
- Prepared SQL statements, transaction rollback, ledger reconciliation and immutable cash-entry triggers.
- Account-scoped idempotency records for financial actions.
- Local process lock preventing two market engines from writing one database.
- Production content security policy, frame restriction, MIME-sniffing protection and request IDs.
- No real payments, broker credentials or external account access.

## Local Use

The default listener is `127.0.0.1`. Keep the workspace local while developing. Do not use a valuable or reused password for test accounts. Demo access creates persistent anonymous records; it is for demonstrations, not unlimited public traffic. `.local/`, `.env`, logs, caches and browser artifacts must not be committed.

The application is not encrypted at rest. Anyone who controls the machine or database can access local records and alter the software. SQL ledger triggers are an application integrity safeguard, not protection against a database owner.

## Before Public Hosting

Public deployment has not been performed. A production build alone does not make the app internet-ready. Before exposing it:

1. Put it behind HTTPS, set `SECURE_COOKIES=true` and the exact `APP_ORIGIN`.
2. Review proxy trust, IP-based rate limits, TLS termination and process supervision for the chosen host.
3. Implement email verification, recovery, abuse controls, account retention and privacy policies.
4. Disable or appropriately restrict demo-account creation.
5. Add durable backups, operational monitoring, disk/storage limits and failure alerting.
6. Review all dependencies, runtime patch levels, authorization and deployment secrets.
7. Load-test and replace single-process snapshot coordination before horizontal scaling.

There is currently no email verification, Google OAuth, password-recovery service, two-factor authentication, device/session-management screen, live market-data license, or real-money regulatory infrastructure. Do not present the app as a production brokerage.

## Future Identity Integrations

Verification and Google-subject fields are placeholders for later implementation. A future Google flow must validate state/nonce and provider tokens, and must not automatically link accounts based only on an unverified matching email address. Design recovery and account linking explicitly when that integration is added.
