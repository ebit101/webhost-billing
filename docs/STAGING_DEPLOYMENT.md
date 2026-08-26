# Staging Deployment

## Current deployment

- Environment: staging only
- URL: `https://my.speedhost.bd`
- Deployed application version: `b2b2d61`
- Compose project: `webhost-billing-staging`
- Host root: `/srv/webhost-billing-staging`
- Current release: `/srv/webhost-billing-staging/releases/b2b2d61`
- Current web overlay: `webhost-billing-web:3bedc40-settings-hotfix1`
- Web listener: `127.0.0.1:19500`
- API listener: `127.0.0.1:19600`
- Edge: the host Nginx instance, after a successful `nginx -t` and graceful reload
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
