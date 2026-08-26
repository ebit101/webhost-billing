# Production Deployment

This runbook describes the initial single-host production topology for Webhost Billing. It is a deployment specification, not evidence that production has been deployed. Command 29 builds and validates the images locally only.

The authorization-gated, checkpoint-by-checkpoint launch procedure is in `docs/PRODUCTION_LAUNCH_RUNBOOK.md`. Its current decision is `NO-GO`; this topology document alone does not authorize production mutation.

## Topology and trust boundaries

```text
Internet
  -> TCP 80/443 only
  -> non-root Nginx
       billing.example.com -> Next.js web:3000
       api.billing.example.com -> NestJS API:3001
  -> private frontend/backend Docker networks
       API/worker/scheduler -> PostgreSQL:5432 and Redis:6379
  -> explicit edge/egress networks with no additional published ports
```

The UI and API require separate HTTPS hostnames because application configuration treats public URLs as origins without paths. Both names can use one SAN/wildcard certificate. PostgreSQL, Redis, API, web, worker, and scheduler have no host-published port. Nginx uses an edge network for host publishing; API/worker/scheduler use a separate egress network for SMTP and authorized provider traffic. Nginx replaces client forwarding/request-ID headers and the API trusts exactly one proxy hop. Never publish ports 3000, 3001, 5432, or 6379, and enforce destination allowlists with host/provider firewalls where available.

The scheduler is a dedicated process and must have exactly one active replica in this initial deployment. PostgreSQL advisory locking remains a second line of duplicate-scheduling protection. The worker and scheduler share an image but use different entry points.

## Deployment files

- `deploy/production/compose.production.yaml` — production service graph, health checks, private networks, secrets, volumes, and log limits
- `apps/api/Dockerfile` — production API image
- `apps/web/Dockerfile` — standalone Next.js production image
- `apps/worker/Dockerfile` — worker/scheduler image
- `deploy/production/migration/Dockerfile` — isolated Prisma migration tool
- `deploy/production/nginx/` — non-root TLS reverse proxy
- `deploy/production/redis/` — authenticated AOF/no-eviction Redis configuration
- `deploy/production/.env.example` — non-secret configuration template

All application and Nginx images run with an explicit unprivileged user. Application containers use a read-only root filesystem, drop Linux capabilities, use `no-new-privileges`, and receive writable temporary storage only through bounded `tmpfs` mounts. The official PostgreSQL entry point drops to its database user after initializing storage; Redis is explicitly run as UID/GID 999. Revalidate upstream image users whenever a pinned base image changes.

## Host prerequisites

- A supported Linux host with current Docker Engine and Compose plugin
- DNS A/AAAA records for the billing and API hostnames
- TCP 80/443 allowed; application/database/cache ports denied at both cloud and host firewalls
- Encrypted persistent disk with adequate capacity and free-space/inode alerts
- An SMTP provider with certificate-validated TLS and authenticated credentials
- A protected secret manager or root-owned secret directory outside the repository
- Tested off-site encrypted PostgreSQL backup storage from `docs/BACKUP_AND_RECOVERY.md`
- A process/readiness monitor and an alert destination following `docs/OBSERVABILITY.md`

Do not run this stack as an additional project on a cPanel/WHM server until port ownership, Docker support, memory/disk budget, firewalling, cPanel update behavior, and backup isolation have been explicitly reviewed. A dedicated VPS is preferred. Nginx cannot bind 80/443 while Apache/cPanel owns those ports; in that case use the existing trusted edge proxy and remove public Nginx port publishing only after a separately reviewed configuration.

## Non-secret configuration

Create the ignored production environment file and restrict it:

```bash
cp deploy/production/.env.example deploy/production/.env.production
chmod 0600 deploy/production/.env.production
```

Set `IMAGE_TAG` to an immutable release identifier, preferably the Git commit SHA. Set distinct `BILLING_HOST` and `API_HOST`, SMTP/business branding values, and `PRODUCTION_SECRET_DIRECTORY` to an absolute path outside the checkout. This file must contain no credential or private key.

The API and web image are compiled for `https://$API_HOST`; changing the API hostname requires rebuilding the web image. Provider credentials configured through the administrator settings remain encrypted in PostgreSQL. The Compose environment deliberately keeps legacy environment-based bKash and SSLCommerz adapters disabled.

## Secret injection

Create these newline-free files in `PRODUCTION_SECRET_DIRECTORY`:

| File                        | Requirement                                                             |
| --------------------------- | ----------------------------------------------------------------------- |
| `postgres_password`         | Random 64-hex-character database password                               |
| `redis_password`            | At least 48 characters, only letters/digits/underscore/hyphen           |
| `database_url`              | `postgresql://webhost_billing:<password>@postgres:5432/webhost_billing` |
| `redis_url`                 | `redis://:<password>@redis:6379/0`                                      |
| `session_secret`            | Independent random value, at least 48 characters                        |
| `credential_encryption_key` | Independent random value, at least 48 characters; escrow separately     |
| `smtp_username`             | SMTP authentication username                                            |
| `smtp_password`             | SMTP authentication password                                            |
| `tls_certificate.pem`       | Full certificate chain for both public hostnames                        |
| `tls_private_key.pem`       | Matching unencrypted PEM private key                                    |

Generate random values with a cryptographic generator, for example `openssl rand -hex 32`. Use a database/Redis password composed of URL-safe characters so the exact value can be embedded in its connection URL without ambiguous encoding. Store one value per file and make the directory root-owned `0700`. With local Docker Compose file secrets, make the files `0444` inside that non-traversable directory: Compose uses bind mounts and does not reliably remap a root-owned `0400` file to the non-root container UID. Only explicitly attached secret files are mounted into each service. If an external secret driver supports UID/mode mapping, prefer container-owner `0400`. Do not place this directory under the repository, copy secrets into images, pass them as build arguments, print them in validation output, or back them up beside the encrypted database dump.

Compose mounts files under `/run/secrets`. The application entry point loads an allowlisted `*_FILE` value without logging it, then removes the file-variable name from the child environment. Secrets still exist in process memory and require host/root access controls. Docker Compose file secrets are bind-mounted, not a full secret manager; production should use a supported external secret manager when available.

Keep historical `CREDENTIAL_ENCRYPTION_KEY` material available through protected escrow for as long as encrypted integration/TOTP data may be restored. Rotation requires planned credential re-entry; see `docs/SETTINGS_AND_SECRETS.md` and `docs/BACKUP_AND_RECOVERY.md`.

## HTTPS and reverse proxy

Obtain a trusted certificate whose SANs include both hostnames. ACME validation and renewal are host responsibilities; the application stack does not request certificates. Copy the full chain and private key into the protected secret directory. Validate the certificate/key match and expiry before startup without printing key material.

Nginx:

- redirects known hosts from HTTP to HTTPS with status 308;
- rejects unknown hosts;
- allows TLS 1.2/1.3 and disables session tickets;
- sends HSTS, frame denial, MIME-sniffing denial, referrer, and permissions headers;
- replaces forwarding and request-correlation headers at the trust boundary;
- limits request bodies to 1 MiB and applies short header/body/connect timeouts;
- emits JSON access logs without query strings;
- leaves the application CSP to Next.js so framework asset rules stay consistent.

Do not enable HSTS `preload` at the edge until every subdomain is permanently HTTPS and the operational consequence has been accepted. After certificate renewal, recreate Nginx so bind-mounted secret files are refreshed, then recheck both HTTPS names. Never expose the unauthenticated API readiness detail; `/health` and `/ready` already return only coarse status.

## Database, Redis, and persistent storage

Named volumes `postgres_data` and `redis_data` persist across ordinary container recreation and `docker compose down`. Never use `down --volumes` in production. Named volumes are not backups.

PostgreSQL is authoritative. Continue the encrypted, verified, off-site backup process and isolated restore drills in `docs/BACKUP_AND_RECOVERY.md`. Monitor disk, connection saturation, slow queries, transaction age, and backup age. A managed PostgreSQL service is acceptable if TLS, least-privilege roles, supported version, backup/PITR, and restore testing are documented; update only the secret `database_url` and remove the local database service in a reviewed override.

Redis holds BullMQ delivery state rather than authoritative financial truth. It requires authentication, AOF with `everysec`, and `noeviction`. Put `redis_data` on persistent encrypted storage and monitor memory, AOF errors, queue backlog, and failed jobs. Redis loss can lose published work and must trigger outbox/provider reconciliation, never blind replay. A managed Redis replacement must support persistence, TLS, authentication, and `noeviction` semantics.

## Image build and inspection

From a clean, reviewed release commit:

```bash
pnpm production:config
pnpm production:build
docker image inspect \
  webhost-billing-api:$IMAGE_TAG \
  webhost-billing-web:$IMAGE_TAG \
  webhost-billing-worker:$IMAGE_TAG \
  webhost-billing-migration:$IMAGE_TAG \
  webhost-billing-nginx:$IMAGE_TAG
```

The first four application images are built from the same reviewed source; do not use a mutable `latest` tag. Record image digests in the release record. If images move through a private registry, sign/scan them and deploy by digest. This command authorizes no registry push.

## Reviewed migration command

Migrations are deliberately not automatic at API startup. First take and verify a pre-migration backup. Review every pending SQL migration and check status using the tool container, then execute once:

```bash
docker compose --env-file deploy/production/.env.production \
  -f deploy/production/compose.production.yaml --profile tools \
  run --rm migrate ./node_modules/.bin/prisma migrate status --config prisma.config.ts

pnpm production:migrate
```

Prisma migrations are forward-only. A successful command is followed by another status check showing no pending/failed migration. Do not start a new application image against an incompatible or partially migrated schema.

## Startup, health, and graceful shutdown

After migration:

```bash
pnpm production:up
docker compose --env-file deploy/production/.env.production \
  -f deploy/production/compose.production.yaml ps
```

Compose waits on PostgreSQL/Redis, API `/ready`, web `/login`, and Nginx liveness. Worker/scheduler health verifies that their Node PID remains signalable; queue/automation health must also be checked in the administrator operations screen. Validate externally:

```bash
curl --fail --silent --show-error https://api.billing.example.com/health
curl --fail --silent --show-error https://api.billing.example.com/ready
curl --fail --silent --show-error --output /dev/null https://billing.example.com/login
```

Replace the example names. Test an administrator and customer login, logout, CSRF-protected mutation, invoice PDF, support ticket, SMTP delivery, and only explicitly authorized provider read-only checks.

Nest API/worker/scheduler processes install SIGINT/SIGTERM shutdown hooks. Compose supplies an init process and grace periods; BullMQ workers stop accepting work and wait for active jobs within their configured shutdown timeout. Nginx, Next.js, PostgreSQL, and Redis receive their normal termination signal. A forced kill is an incident: inspect retained job/outbox/automation/payment/hosting evidence before retry.

Routine shutdown is:

```bash
pnpm production:down
```

This preserves volumes. Use `docker compose stop scheduler worker` before maintenance that must prevent new scheduled/background work.

## Logs and monitoring

Every service uses Docker `json-file` rotation at 10 MiB with five files. This cap prevents unbounded local growth but is not durable log retention. Ship structured application/Nginx logs over encrypted transport to an access-controlled store, preserve request/job correlation IDs, define retention/deletion, and alert on collector failure. Never enable body/header/cookie/provider-payload logging.

Monitor external UI/API reachability, API readiness, container restarts, PostgreSQL/Redis health and capacity, scheduler recency, queue/outbox backlog, provider failures/inconsistent outcomes, SMTP failures, certificate expiry, backup age/integrity, disk/inodes, CPU, memory, and clock synchronization. Apply the thresholds in `docs/OBSERVABILITY.md`.

## Deployment checklist

- [ ] Production host/provider, capacity, firewall, patching, time sync, monitoring, and alert recipient approved.
- [ ] Release commit reviewed; worktree clean; Command 30 release audit passed.
- [ ] Immutable `IMAGE_TAG`, both DNS names, SMTP provider, and final business settings approved.
- [ ] Secret directory is outside Git, root-owned, restricted, independently backed up/escrowed, and contains no placeholder value.
- [ ] TLS chain/key match, include both names, and have monitored renewal.
- [ ] Compose config renders without secrets in output; all five images build, scan, and report non-root users.
- [ ] PostgreSQL/Redis ports are not published; only 80/443 are reachable externally.
- [ ] Fresh encrypted PostgreSQL backup passed checksum/archive/table verification and exists off-host.
- [ ] Pending migration SQL reviewed for compatibility, locks, runtime, and rollback implications.
- [ ] Worker and scheduler stopped before migration; migration status clean after one reviewed execution.
- [ ] Stack starts healthy; Nginx rejects unknown hosts and HTTP redirects known hosts.
- [ ] HTTPS headers, 1 MiB body rejection, API health/readiness, and certificate chain verified externally.
- [ ] Admin/customer login/logout, authorization denial, CSRF mutation, invoice PDF, support, and SMTP smoke tests pass with fictional records.
- [ ] Payment, cPanel, and registrar actions remain disabled until their credentialed staging/production acceptance is separately approved.
- [ ] Backup, monitoring, logs, escalation, rollback owner, and maintenance-window communication are active.
- [ ] Release commit, image digests, migration result, checks, operator, and timestamp recorded.

## Rollback checklist

- [ ] Stop scheduler and worker first to prevent new automated or queued mutations.
- [ ] Record current image digests, container/log state, migration history, and health evidence; do not delete failed containers/volumes.
- [ ] Classify whether the failure is web/API code, configuration/secret, dependency, migration, data, or uncertain external provider state.
- [ ] For a configuration-only error, restore the prior protected configuration/secret version and recreate only affected services.
- [ ] For code compatible with the current additive schema, set the previous immutable `IMAGE_TAG`, recreate API/web/worker/scheduler, and re-run health/workflow checks.
- [ ] Never improvise a Prisma down migration and never rewrite issued invoices, payments, callbacks, audit, or provider evidence.
- [ ] If migration/data is incompatible, leave the failed database intact and follow the isolated pre-migration restore/cutover procedure in `docs/BACKUP_AND_RECOVERY.md`.
- [ ] Reconcile Redis/outbox and every uncertain payment/hosting/email outcome with durable evidence and authenticated read-only provider checks before any retry.
- [ ] Restart one scheduler and the worker only after database/API health and reconciliation are approved.
- [ ] Record the rollback, data point selected, verification, unresolved external effects, and incident follow-up.

Rollback is complete only when health checks and primary administrator/customer workflows pass and financial/provisioning state separation remains intact.
