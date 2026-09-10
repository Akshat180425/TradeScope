# Contributing

## Setup

Use Node.js 22.16 or newer. From the repository root:

```sh
npm ci
npm run dev
```

No external database or service credentials are needed. Configuration defaults are documented in `.env.example` and the README.

## Changes

Keep frontend work in `frontend/`, API and domain changes in `backend/`, and automated checks in `tests/`. Add focused tests for changed behavior, particularly authorization, reservations, financial rounding, idempotency and persistence. Update documentation when changing behavior or commands.

Use neutral example identities and synthetic data. Never commit `.env` files, account databases, session records, backups, private keys or generated test artifacts. Do not reset an existing database to test a change; use a separate `INVESTOGRAM_DATABASE` path.

## Verification

```sh
npm run format:check
npm test
npm run build
npm run test:e2e
npm audit --audit-level=high
```

Browser tests use Edge when installed in its default Windows location; otherwise install Chromium with `npx playwright install chromium`. On Linux, `npx playwright install --with-deps chromium` installs the browser and required system dependencies. Browser checks use an isolated test database and port 3041.

Run `npm run format` to apply formatting when needed. Pull requests should describe the change, its motivation and the checks performed. Keep unrelated changes separate.

## Security

Read [security notes](docs/SECURITY.md) before proposing deployment changes. Do not put credentials, private account data or exploit details in public issues. Use GitHub's private vulnerability reporting option in the Security tab when the repository has it enabled; otherwise ask the maintainer for a private reporting channel without posting sensitive details.
