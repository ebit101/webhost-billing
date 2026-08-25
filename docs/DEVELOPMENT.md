# Webhost Billing Development Environment

## Purpose

The local infrastructure is an isolated Docker Compose project named `webhost-billing-dev`. It does not use cPanel's MariaDB service or the existing RustDesk containers.

`HOSTING_PANEL_TIMEOUT_MS` bounds cPanel/WHM requests between 1 and 30 seconds and defaults to 10 seconds. Real WHM credentials are configured only through the administrator connection form and stored as encrypted database ciphertext; do not add them to `.env`, shell history, fixtures, or documentation. See `docs/HOSTING_PANELS.md` before any manually authorized development-server check.

The current infrastructure contains:

- PostgreSQL 18.6
- Redis 8.10

BullMQ uses the environment-specific `BULLMQ_PREFIX`. The worker polls the PostgreSQL outbox according to `OUTBOX_POLL_INTERVAL_MS`, `OUTBOX_BATCH_SIZE`, and `OUTBOX_LOCK_TIMEOUT_SECONDS`; see `docs/BACKGROUND_JOBS.md`. Redis job data is reference-only and must never contain credentials or raw outbox payloads.

Redis AOF uses `appendfsync always` because this instance is a durable queue backend, not a disposable cache. Do not weaken persistence or configure eviction for a staging/production queue deployment without a reviewed recovery design.

Email delivery is implemented by the worker. Development defaults to the private `.eml` preview transport, while production configuration requires SMTP, HTTPS public links, and TLS. See `docs/EMAIL_NOTIFICATIONS.md`; do not expose or commit the preview directory because messages may contain action links and customer information.

## Prerequisites

- Docker Engine with Docker Compose
- Node.js 24 LTS and pnpm 11.22 when running applications directly on the host
- Ports `5432` and `6379` available on the loopback interface

## Initial setup

Create the ignored local environment file:

```bash
cp .env.example .env
```

Replace every `replace-with-...` value in `.env`. Development values must never be reused for staging or production.

Validate the Compose configuration without printing interpolated secrets:

```bash
docker compose config --quiet
```

## Start the infrastructure

```bash
docker compose pull
docker compose up --detach --wait postgres redis
docker compose ps
```

Equivalent pnpm commands are available when Node.js is installed on the host:

```bash
pnpm infra:config
pnpm infra:up
pnpm infra:ps
```

Both services must report `healthy` before running migrations or application integration tests.

## Connectivity

PostgreSQL and Redis publish loopback-only development ports:

```text
PostgreSQL: 127.0.0.1:5432
Redis:      127.0.0.1:6379
```

They are not published on the server's public network interfaces.

Check PostgreSQL:

```bash
docker compose exec postgres sh -lc 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

Check Redis:

```bash
docker compose exec redis sh -lc 'redis-cli --no-auth-warning -a "$REDIS_PASSWORD" ping'
```

Expected Redis output is `PONG`.

## Run application checks

```bash
corepack enable
corepack prepare pnpm@11.22.0 --activate
pnpm install --frozen-lockfile
pnpm dev
```

The applications load the repository-root `.env` file and validate their required settings before startup. Next.js public settings have safe local defaults and can be overridden through environment variables.

Run one application at a time when focused development is preferable:

```bash
pnpm --filter @webhost-billing/api dev
pnpm --filter @webhost-billing/web dev
pnpm --filter @webhost-billing/worker dev
pnpm --filter @webhost-billing/worker start:scheduler:dev
```

The first worker command runs outbox and queue consumers. The second runs the dedicated renewal scheduler. Run one scheduler instance per environment; PostgreSQL advisory locking and daily unique keys also prevent duplicate cycles. See `docs/RENEWAL_AUTOMATION.md`.

The default local endpoints are the web application at `http://localhost:3000` and the API at `http://localhost:3001`.

Authentication requires the exact web origin, session and credential-encryption secrets, token lifetimes, and a rate-limit namespace from `.env`. The placeholder file provides valid local shapes but must be replaced with unique values. See `docs/AUTHENTICATION.md` for the flows and security model.

With PostgreSQL and Redis healthy, run the API end-to-end suites with:

```bash
pnpm --filter @webhost-billing/api test:e2e
```

The queue-package and worker tests are Redis/PostgreSQL integration tests and therefore also require both healthy services:

```bash
pnpm --filter @webhost-billing/queue test --runInBand
pnpm --filter @webhost-billing/worker test --runInBand
```

## Database migrations

Validate the Prisma schema, generate the client, and apply development migrations:

```bash
pnpm db:validate
pnpm db:generate
pnpm db:migrate:dev
```

Check migration state without changing the database:

```bash
pnpm db:migrate:status
```

Deployment environments apply committed migrations non-interactively with `pnpm db:migrate:deploy`; they must never use `migrate dev` or generate migration files during deployment.

Load the idempotent, fictional development dataset and verify the resulting schema:

```bash
pnpm db:seed
pnpm db:verify
```

The seed uses only reserved `.test` domains and does not create a usable password. Never run the development seed against staging or production.

## Stop without deleting data

```bash
docker compose stop
```

Or remove the containers while retaining named volumes:

```bash
docker compose down
```

## Reset development data

The following operation permanently deletes the local PostgreSQL and Redis volumes. It must never be run against staging or production:

```bash
docker compose down --volumes
```

Confirm the Compose project name is `webhost-billing-dev` before running it.

## Logs and troubleshooting

```bash
docker compose logs --follow postgres redis
docker compose ps
docker inspect webhost-billing-dev-postgres-1
docker inspect webhost-billing-dev-redis-1
```

If a configured port is occupied, change `POSTGRES_PORT` or `REDIS_PORT` in the ignored `.env` file and update the corresponding connection URL.

Do not expose database ports publicly. Do not place real customer data, production credentials, or production database dumps in this environment.
