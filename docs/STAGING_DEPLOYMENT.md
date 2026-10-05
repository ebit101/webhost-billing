# Staging Deployment

## Current deployment

- Environment: staging only
- URL: `https://my.speedhost.bd`
- Deployed application version: `6085629` (source `608562903cd2adbd3b70b8ace5c92259c2ba4c4b`)
- Compose project: `webhost-billing-staging`
- Host root: `/srv/webhost-billing-staging`
- Current release: `/srv/webhost-billing-staging/releases/6085629`
- API image: `webhost-billing-api:6085629`
- Web image: `webhost-billing-web:6085629`
- Worker and scheduler image: `webhost-billing-worker:6085629`
- Migration image: `webhost-billing-migration:6085629`
- Web listener: `127.0.0.1:19500`
- API listener: `127.0.0.1:19600`
- Edge: the existing host Nginx instance; unchanged during the latest rollout
- TLS: Let's Encrypt certificate for `my.speedhost.bd`; automatic Certbot renewal is installed

This is a side-by-side deployment on a shared server. It must not manage, restart, prune,
rename, reconfigure, or reuse resources belonging to another application. PostgreSQL,
Redis, and Mailpit have no host-published ports. Only the staging web and API processes
publish loopback ports, and the host Nginx site is the public edge.

## Protected host material

The following paths are intentionally outside Git:

- Environment file: `/srv/webhost-billing-staging/.env.staging`
- Runtime secrets: `/srv/webhost-billing-staging/secrets`
- Staging logins: `/srv/webhost-billing-staging/STAGING_LOGIN_CREDENTIALS.txt`
- Encrypted backups: `/srv/webhost-billing-staging/backups`
- Nginx rollback archive: `/srv/webhost-billing-staging/rollback`

Do not print secret values in shell history, logs, tickets, or reports. Keep the staging
login file and backup artifacts at mode `0600`, the backup passphrase at mode `0400`,
and their parent directories accessible only to root. Container-readable Compose bind
secrets use the minimum host permissions supported by this deployment and remain inside
the root-only secret directory.

## Routine inspection

Run commands from the release selected by the `current` symlink:

```bash
cd /srv/webhost-billing-staging/current
docker compose \
  --env-file /srv/webhost-billing-staging/.env.staging \
  -f deploy/production/compose.production.yaml \
  -f deploy/staging/compose.staging.yaml \
  ps
curl --fail --silent --show-error https://my.speedhost.bd/health
curl --fail --silent --show-error https://my.speedhost.bd/ready
nginx -t
```

Verify that the browser bundle was built for the staging API origin. The API-only smoke is
not sufficient because it can pass even when the Next.js client bundle contains a placeholder
or different origin:

```bash
node deploy/staging/verify-web-origin.cjs \
  https://my.speedhost.bd \
  https://my.speedhost.bd
```

Run this check after every web-image build and deployment. It validates both the CSP and the
JavaScript assets and fails if `api.billing.example.com` appears. `NEXT_PUBLIC_API_URL` is a
Next.js build input; changing only the runtime environment cannot repair an already-built
client bundle.

Inspect logs only for this project:

```bash
cd /srv/webhost-billing-staging/current
docker compose \
  --env-file /srv/webhost-billing-staging/.env.staging \
  -f deploy/production/compose.production.yaml \
  -f deploy/staging/compose.staging.yaml \
  logs --since=30m api web worker scheduler
```

Never use host-wide `docker compose down`, `docker stop $(docker ps -q)`, Docker prune,
firewall replacement, or a global Nginx restart for this application.

## Controlled start and stop

Start only the seven staging services:

```bash
cd /srv/webhost-billing-staging/current
docker compose \
  --env-file /srv/webhost-billing-staging/.env.staging \
  -f deploy/production/compose.production.yaml \
  -f deploy/staging/compose.staging.yaml \
  up -d --wait postgres redis mailpit api web worker scheduler
```

Stop only this project while preserving its volumes:

```bash
cd /srv/webhost-billing-staging/current
docker compose \
  --env-file /srv/webhost-billing-staging/.env.staging \
  -f deploy/production/compose.production.yaml \
  -f deploy/staging/compose.staging.yaml \
  stop api web worker scheduler mailpit redis postgres
```

Do not use `down --volumes` during normal operation or rollback.

## Migration boundary

Migrations are a reviewed, one-shot action. Do not run them as part of API startup and do
not run a down migration. Before applying a future migration, create and verify a current
encrypted backup, record the old image/release, review the migration list, then run the
production migration image exactly once. A schema-incompatible rollback requires restoring
the verified pre-migration backup into a separate database and an explicit connection
cutover; it must never overwrite the active database.

## TLS renewal and Mailpit

Host Nginx reads the Let's Encrypt certificate directly. Staging Mailpit reads a protected
copy because its internal SMTP endpoint requires STARTTLS. After Certbot renews the
certificate, copy the renewed certificate and key into the two existing secret files,
preserve their permissions, and recreate only `mailpit`, `worker`, and `scheduler`. Validate
Mailpit delivery and all health checks afterward. Do not reload unrelated containers.

## Rollback

Application rollback is release-based:

1. Confirm the target prior release directory and image tag.
2. Confirm that its database schema is compatible with the current database.
3. Atomically repoint `/srv/webhost-billing-staging/current` to that explicit release.
4. Set the explicit prior `IMAGE_TAG` in `.env.staging`.
5. Recreate only `api`, `web`, `worker`, and `scheduler` with `--no-deps`.
6. Verify `/health`, `/ready`, HTTPS login, both roles, authorization, queue processing,
   email delivery, and that exactly one scheduler is running.

If Nginx rollback is required, inspect the timestamped archive in
`/srv/webhost-billing-staging/rollback`, restore only the files added or changed for
`my.speedhost.bd`, run `nginx -t`, and use a graceful reload. Do not replace the complete
Nginx configuration without a separate shared-host review.

### 2026-10-05 current-main staging deployment

Source `608562903cd2adbd3b70b8ace5c92259c2ba4c4b` is the current isolated staging
release. It includes all implemented work through Command 90 and the Command 91
definition only. The user's request to deploy all changes updated the existing
staging installation; it did not authorize production promotion or real providers.
Exact-source CI run `37322118344` and CodeQL run `37322118370` passed before rollout.

Clean pinned Git archives supplied both the new source directory and sequential
Linux/amd64 builds. All four images use UID/GID `10001:10001`; local/remote image
IDs matched. Packaged dependency-version inventories matched the source lockfile:
migration 165, API 309, worker 281 and standalone web 14. Frozen install and
supply-chain checks passed; slow registry retries and image-copy/export stages
extended the build time without changing dependency versions or policies.
Web compilation, TypeScript and static generation passed with
`NEXT_PUBLIC_API_URL=https://my.speedhost.bd`.

- API image ID: `sha256:f6a6db61143708d4acb8d62849af363d3f31287db688ff1620e87b1c3c643e2e`
- Web image ID: `sha256:4c41f68a449a367be88e11f52e29a9b11a43e1d44f8684788f9b9e4ca5e462e6`
- Worker/scheduler image ID: `sha256:c867928a9c09be530205c2cb55a0a4338adef949863344efb66f415db1b3e823`
- Migration image ID: `sha256:fccf06afc5ba005d162fa59a355632b96c88062297602c2ca368eac0c91913bd`

Candidate Compose validation, entrypoint shell syntax and read-only Prisma status
passed: all 21 migrations were already applied. No migration, seed, reset or
business-record write was needed. Immediately before the switch, a fresh encrypted
backup passed checksum, OpenPGP integrity, archive-structure and required-table checks:

- Backup: `/srv/webhost-billing-staging/backups/webhost-billing-webhost_billing_staging-20261005T154456Z.dump.gpg`
- SHA-256: `3b78a7c42d0c389caa0b5a91dac8480e190ec0ba9c81e1f03cc98e9ba13af450`
- Protected prior environment: `/srv/webhost-billing-staging/rollback/.env.staging-pre-6085629`
- Prior release/tag: `71558a8`, retained with its images for schema-compatible application rollback
- Protected inventories/business fingerprints: `/srv/webhost-billing-staging/rollback/deploy-6085629-*`

Only the old staging worker/scheduler were stopped before atomically switching the
release/tag and recreating API, web, worker and scheduler with `--no-deps`. All four
became healthy with zero restarts; exactly one scheduler remains. PostgreSQL, Redis,
Mailpit and every unrelated running container retained their IDs/images. Counts and
row fingerprints of 15 business tables matched the fresh pre-switch baseline.
The host retained about 83 GB free. No Nginx edit/reload, daemon restart, prune,
volume deletion, SSH configuration change or unrelated application change occurred.

Post-deployment checks passed for public health/readiness, browser API origin/CSP,
both roles, customer denial of administrator APIs, owned invoice/PDF/support,
logout/session rejection, disabled credentialed payment gateways, fake payment and
hosting contracts, and administrator settings in clean Chromium. A fresh fictional
password-reset email reached `SENT` via staging SMTP with a `PUBLISHED` outbox event;
Mailpit retained the sandbox message. Authentication/audit/email side effects were
expected; financial, service, support and settings records were unchanged.

Clean-browser checks passed for the public hosting-plan CTA, plan selection through
customer sign-in, and all six administrator/customer invoice/order/service ledgers:
search, page size 100, reload/back/forward, clear filters, keyboard and 375px filter
layout. Ledger browsing emitted no mutations or browser errors. Temporary operator
runner mistakes (old checkout selector, premature administrator navigation, exact
select-label matching and link/button roles) were corrected against repository
source/tests; successful administrator and customer runs provide the evidence.
No application change or rate-limit reset/bypass was made. The fake-provider runner
initially failed resolving piped `/dev/stdin`; rerunning Node with `-` passed.

The existing unrelated Nginx IPv6 protocol-options warning remains, with syntax
validation successful. Same-host backup/passphrase storage is not off-site recovery.
Production remains **NO-GO**; provider, public SMTP, monitoring, off-site immutable
recovery, policy/infrastructure and operator-pilot gates remain separate. Command 91
still requires explicit authorization.

### 2026-10-03 prior-main staging deployment

Commit `71558a8` was the isolated staging release before the 2026-10-05 rollout. It contains all application work
through the Commands 76–78 phase review plus a deployment correction that normalizes the
shared shell entrypoint inside both the migration and worker images. The correction was
required because a Windows checkout supplied CRLF line endings and the first one-shot
migration candidate stopped at `bash\r` before connecting to PostgreSQL. The corrected
image passed an in-container line-ending and shell-syntax check before migration was retried.

The deployed images and verified image IDs are:

- `webhost-billing-migration:71558a8` — `sha256:9b2975396a5b...`
- `webhost-billing-api:71558a8` — `sha256:a663d5d16a7a...`
- `webhost-billing-web:71558a8` — `sha256:45cb210ab321...`
- `webhost-billing-worker:71558a8` — `sha256:4d82c8ffab7c...`; used by exactly one
  worker and one scheduler

Before the switch, the deployment created and fully verified this encrypted PostgreSQL
backup:

`/srv/webhost-billing-staging/backups/webhost-billing-webhost_billing_staging-20261003T143421Z.dump.gpg`

Its SHA-256 is
`bfaa3c4e897812c2d6eca3361bafbbadea9b5388b6c8eb03531f9bb78ba668ba`.
Checksum, OpenPGP integrity, archive structure, required tables, PostgreSQL 18.6, and all
21 completed non-rolled-back migrations passed. The final one-shot migration reported
21 migrations and no pending migration.

The protected final-switch environment backup is
`/srv/webhost-billing-staging/rollback/.env.staging-pre-71558a8-20261003T154242Z`.
Because the prior state used mixed historical image tags, the executable rollback
environment is
`/srv/webhost-billing-staging/rollback/.env.staging-rollback-pre-a0a7354`; it is mode
`0600` and resolves the prior API, web, worker, and scheduler images through the verified
`rollback-pre-a0a7354` aliases. Roll back only after confirming schema compatibility:

1. Atomically repoint `current` to `/srv/webhost-billing-staging/releases/b2b2d61`.
2. Install the executable rollback environment as `.env.staging`, preserving mode `0600`.
3. Recreate only `api`, `web`, `worker`, and `scheduler` with `--no-deps --wait`.
4. Rerun health, origin, both-role, authorization, provider-safety, email, browser, and
   single-scheduler checks.

Post-deployment verification passed `/health`, `/ready`, public storefront and live plan
selection in clean Chromium, staging API-origin bundle inspection, administrator settings
in clean Chromium, both credentialed roles, ownership and administrator authorization,
invoice detail/PDF, support detail, password-reset queue and Mailpit delivery, fake payment
and hosting-panel contracts, all four application health checks with zero restarts, exactly
one scheduler, 21 applied migrations, and zero error-level application logs. Host Nginx
configuration validation passed; Nginx was not changed or reloaded. The unrelated
NodeWatch, RemotePilot, MessageDock, and Travel Mate containers remained running, and the
NodeWatch and RemotePilot public endpoints returned valid redirects.

No production environment or real payment, hosting-panel, registrar, or public SMTP
provider was contacted or enabled. Production remains `NO-GO`.

### 2026-08-26 login-origin hotfix

The original `b2b2d61` web image was built with the production example API origin even though
the staging API and Nginx route were healthy. Browsers displayed `Failed to fetch` because
the bundle requested `https://api.billing.example.com`. The replacement
`webhost-billing-web:72ef8ee-login-hotfix1` was built with
`NEXT_PUBLIC_API_URL=https://my.speedhost.bd`; its image ID begins `sha256:2e9a2476f59e`.

Only the Webhost Billing web container was recreated. The protected environment-file backup
is `/srv/webhost-billing-staging/rollback/env-staging-pre-login-hotfix-20260826T103700Z`.
Rollback requires exact image/config review, restoring only the prior `IMAGE_TAG`, recreating
only `web`, and rerunning the browser-origin and credentialed smokes. Do not roll back to the
known-bad web image merely because it is available.

### 2026-08-26 separate entry routes

Web commit `5ee6e7b` removed the public root landing page and established these entry rules:

- `/` returns 307 to `/login`;
- `/login` is the customer sign-in page;
- `/admin` is the administrator sign-in page when no valid session exists;
- anonymous `/admin/*` subpages return to `/admin`, while anonymous `/portal/*` pages return
  to `/login`.

The deployed image is `webhost-billing-web:5ee6e7b-entry-routes`; its image ID begins
`sha256:d27cea3afc5b`. Only `webhost-billing-staging-web-1` was recreated. All non-web
container IDs remained unchanged, and the web container became healthy with zero restarts.
The protected pre-change environment backup is
`/srv/webhost-billing-staging/rollback/env-staging-pre-entry-routes-20260826T111104Z` at mode
`0600`.

Rollback requires restoring only the prior `IMAGE_TAG` after confirming the previous web
image, recreating only `web`, and rerunning the browser-origin, route, and credentialed role
smokes. No schema or data change belongs to this web-only deployment.

### 2026-08-26 settings browser-bundle hotfix

The administrator settings page failed in the browser because the shared CommonJS root
exported Node-only observability code alongside a runtime settings constant. The client chunk
therefore attempted to load `node:async_hooks`. Commit `3bedc40` moved structured logging to
the explicit `@webhost-billing/shared/observability` server subpath and added a package-boundary
regression test.

The deployed image is `webhost-billing-web:3bedc40-settings-hotfix1`; its image ID begins
`sha256:00e328c5184c`. Only `webhost-billing-staging-web-1` was recreated. Every non-web
container retained its ID, and the replacement became healthy with zero restarts. The
protected pre-change environment backup is
`/srv/webhost-billing-staging/rollback/env-staging-pre-settings-hotfix-20260826T115804Z` at
mode `0600`.

Run the clean Chromium regression from the trusted operator workspace without placing the
password in arguments, files or output:

```bash
ssh <strict-pinned-staging-ssh-options> root@my.speedhost.bd \
  'cat /srv/webhost-billing-staging/secrets/staging_admin_password' | \
  NODE_PATH=apps/web/node_modules \
  node deploy/staging/verify-settings-browser.cjs https://my.speedhost.bd
```

Rollback requires restoring only the prior `IMAGE_TAG`, recreating only `web`, and rerunning
the browser settings, browser-origin and credentialed role smokes. No schema, settings value,
API, worker, scheduler or unrelated-service change belongs to this hotfix.

## Provider posture

- Payment: internal fake-adapter contracts passed; bKash and SSLCOMMERZ remain disabled
  because no sandbox credentials were supplied.
- Hosting: the fake hosting-panel contract passed; cPanel/WHM remains disabled because no
  development credentials were supplied.
- Email: staging Mailpit accepted a password-reset message over required STARTTLS. It is
  sandbox delivery, not proof of public SMTP reputation or delivery.
- Registrar: UK2Group remains outside this release and was not contacted.

Credentialed provider testing needs separate authorization, least-privilege sandbox or
development credentials, disposable records, and reviewed mutation limits. Permanent
hosting termination remains a separately confirmed administrator action.

## Backup status

Command 31 created an encrypted PostgreSQL custom-format backup and verified its checksum,
OpenPGP integrity, archive structure, required tables, PostgreSQL version, and all 21
migrations. The backup and passphrase are currently on the same server. This is rollback
evidence, not an off-site or immutable backup. Production remains blocked until an approved
off-site destination and a timed restore drill on production-like hardware are complete.
