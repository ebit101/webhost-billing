# Production Launch Runbook

## Control status

- Prepared by: Command 32 — Prepare the Production Launch
- Prepared on: 2026-08-26
- Prepared from source: `3d65c8a3e72b5e1a8dc2d40e11ae58c4a1486bf4`
- Staging application version tested: `b2b2d61`
- Production mutation authorized by Command 32: **No**
- Current production decision: **NO-GO**

This document is the final launch procedure, not authorization to execute it. Replace every
angle-bracket placeholder, attach evidence for every gate, obtain the business owner's
written approval, and then use the separate explicit production-deployment command from
`CODEX_DEVELOPMENT_COMMANDS.md`. Stop if the target, release, owner, or evidence differs.

The production release must be rebuilt from the final approved commit. Staging proved the
core application and shared-host topology with fictional data, TLS-required Mailpit, fake
payment/hosting contracts, all 21 migrations, and seven healthy processes. It did not prove
real SMTP delivery, bKash/SSLCOMMERZ acceptance, cPanel/WHM behavior, public alerting, an
off-site restore, or a production target.

## Non-negotiable boundaries

- Use a dedicated production VPS or equivalent approved infrastructure. The Command 31
  shared server is staging and hosts other important applications; it is not the default
  production target.
- Never reuse staging passwords, database/Redis values, TLS keys, encryption/session keys,
  provider credentials, Compose volumes, queue prefixes, or backup passphrases.
- Never run `pnpm db:seed`, `prisma db push`, an improvised down migration, or
  `docker compose down --volumes` in production. Never use Docker prune or a host-wide
  service/firewall restart for this application.
- A redirect does not prove payment, a paid invoice does not prove provisioning, and a
  container health check does not prove provider acceptance.
- Stop workers and the scheduler before migration or recovery. Start exactly one scheduler
  only after the first-renewal policy is approved.
- Automatic permanent termination does not exist and must remain absent. Manual cPanel
  termination still requires an administrator reason and exact `TERMINATE` confirmation.

## Owners

One person may hold several roles for this small business, but every row needs a named
person, a backup person, and a reachable contact before launch.

| Role                      | Responsibility                                                    | Required record                    |
| ------------------------- | ----------------------------------------------------------------- | ---------------------------------- |
| Business owner            | Scope, business policies, provider mode, downtime, final go/no-go | Name, approval time, decision      |
| Release operator          | Exact target/release, commands, checkpoints, launch record        | Name, SSH identity, window         |
| Infrastructure/DNS owner  | VPS, capacity, patching, firewall, time, DNS, TLS renewal         | Name, provider/ticket references   |
| Database/recovery owner   | Backup, off-site copy, restore drill, RPO/RTO, cutover            | Name, backup IDs, drill evidence   |
| Secrets/security owner    | Secret manager, key escrow, access, rotation, admin MFA           | Name, vault references only        |
| Payment owner             | Manual-only decision or separately approved live gateways         | Name, merchant acceptance evidence |
| Hosting owner             | Manual-only decision or credentialed cPanel acceptance            | Name, reseller/package evidence    |
| Email owner               | Sender/DNS reputation, SMTP acceptance, bounce handling           | Name, provider evidence            |
| Monitoring/incident owner | Checks, alerts, log retention, escalation and response            | Primary/backup contacts            |
| Communication owner       | Maintenance and incident/customer messages                        | Channels and approved text         |

Never put credentials, recovery codes, provider payloads, login URLs, or decrypted values in
the launch record.

## Launch gates

`PASS` requires linked evidence. `BLOCKED` cannot be waived silently. A limited manual-first
launch may satisfy a provider gate only when the owner explicitly accepts the reduced mode
and the corresponding provider stays disabled.

| Gate                                   | Current status           | Pass condition and owner                                                                                                                                                                                |
| -------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Production target identity             | **BLOCKED**              | Infrastructure owner approves dedicated host/provider, immutable host key, capacity, patching, time sync, firewall and Docker support                                                                   |
| Current production backup              | **BLOCKED**              | Recovery owner verifies a fresh pre-migration encrypted backup at the approved off-site immutable destination; a new empty installation records an empty baseline plus infrastructure recovery evidence |
| Tested restoration                     | **PARTIAL**              | Command 30 local recovery passed and Command 31 backup integrity passed; recovery owner must complete and time an isolated restore on production-like hardware                                          |
| Secrets and escrow                     | **BLOCKED**              | Security owner supplies independent production secrets from an approved manager, separately escrows historical encryption key/backup passphrase, and proves recovery without printing values            |
| HTTPS and DNS                          | **BLOCKED**              | Infrastructure owner approves distinct billing/API names, A/AAAA targets, TTL/cutover, trusted SAN certificate, renewal, CAA if used, and rollback                                                      |
| Migration plan                         | **READY FOR REVIEW**     | Release/database owners review all pending SQL, take backup, run one migration tool once, and prove clean status                                                                                        |
| Rollback plan                          | **READY BUT UNASSIGNED** | Owner names rollback operator, prior compatible image/digests, pre-migration restore point, thresholds and decision authority                                                                           |
| Maintenance communication              | **BLOCKED**              | Communication owner approves audience, channel, start/end updates, status location and incident message                                                                                                 |
| Gateway production configuration       | **BLOCKED**              | Current bKash/SSLCOMMERZ adapters are sandbox-only and unaccepted with credentials. Choose manual payments only, or authorize separate production-provider implementation and sandbox/live acceptance   |
| Hosting-panel production configuration | **BLOCKED**              | Choose manual provisioning only, or pass credentialed development/staging cPanel tests with least-privilege IP-restricted token, disposable accounts and reconciliation evidence                        |
| SMTP reputation/configuration          | **BLOCKED**              | Email owner verifies sender, authenticated TLS, SPF, DKIM, DMARC, bounce path, quotas, credential rotation and fictional delivery                                                                       |
| Monitoring and alerts                  | **BLOCKED**              | Monitoring owner configures external UI/API/readiness, process, database/Redis, queue/outbox, provider, SMTP, renewal, certificate, clock, disk and backup-age alerts to tested contacts                |
| First-renewal schedule                 | **BLOCKED**              | Business/hosting owners approve timezone, lead/reminder/grace values, first eligible services, first run date, supervision window and suspension policy                                                 |
| Termination automation disabled        | **PASS**                 | No scheduler event or worker handler exists for termination; retain manual confirmation and review this invariant in the final release gate                                                             |
| Business/legal settings                | **BLOCKED**              | Owner approves legal identity, address, currency, VAT/tax treatment, invoice numbering, order approval, manual proof, cancellation/refund and retention policies                                        |
| Image supply chain                     | **PARTIAL**              | Local non-root images passed; production needs approved registry, vulnerability scan, signature/provenance and digest-pinned release record                                                             |
| Initial administrator                  | **PREPARED**             | One-time utility exists; operator creates only the first admin from a protected password file, removes that file, verifies the audit entry, and enrolls TOTP before exposure                            |

### Permitted first-launch provider modes

Choose and sign exactly one option for payment and one for hosting:

- **Manual-first payment:** keep bKash and SSLCOMMERZ inactive. Publish only approved
  cash/bank/manual-payment instructions and require administrator verification.
- **Online payment:** remains blocked until a separately authorized command adds/reviews
  production endpoints and credentials and credentialed sandbox/live acceptance passes.
- **Manual-first hosting:** do not configure a WHM token/server and do not invoke hosting
  operations. Provision in WHM outside the application and record only verified manual
  service states. The selected adapter name remains `cpanel-whm`, but it has no authority
  without a configured server token.
- **Automated cPanel:** remains blocked until credentialed disposable-account acceptance
  passes and production egress is restricted to the approved WHM address/port.

UK2Group is outside this launch in every mode.

## Required approval record

Before any mutation, create an access-controlled launch record containing:

```text
Production target/provider:
Expected hostname and server identifier:
Pinned SSH host-key fingerprint:
Billing hostname / expected A/AAAA:
API hostname / expected A/AAAA:
Approved release commit:
Approved image digests:
Database migration count and pending migration names:
Pre-migration backup object/version/checksum:
Restore-drill date and measured RPO/RTO:
Payment mode:
Hosting mode:
SMTP provider/sender:
First renewal date/timezone/policy:
Maintenance start/end and communication channel:
Release operator:
Rollback operator and decision authority:
Business owner approval and timestamp:
```

Any blank line is a stop condition.

## Phase 0 — Freeze and verify the release

Run on the trusted build/operator host, not on production:

```bash
export RELEASE_COMMIT='<approved-40-character-commit>'
export BILLING_HOST='<approved-billing-hostname>'
export API_HOST='<approved-api-hostname>'
export PRODUCTION_SECRET_DIRECTORY='<approved-absolute-secret-directory>'

git fetch origin main
test -z "$(git status --porcelain=v1)"
test "$(git rev-parse HEAD)" = "$RELEASE_COMMIT"
test "$(git rev-parse origin/main)" = "$RELEASE_COMMIT"
test "$(git rev-parse --abbrev-ref HEAD)" = main
git show --stat --oneline "$RELEASE_COMMIT"
```

Re-run the release gates from the clean commit:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:invariants
pnpm --filter @webhost-billing/api test:e2e
pnpm test:e2e
pnpm audit --prod
```

Stop on any failure or new dependency finding. Preserve the output in the protected release
record without environment or credential values.

## Phase 1 — Confirm the target without mutation

The infrastructure owner supplies the pinned known-hosts file out of band. Do not accept a
new host key interactively during the launch.

```bash
export PROD_SSH_TARGET='<user@approved-production-host>'
export PROD_SSH_KEY='<absolute-path-to-dedicated-production-key>'
export PROD_KNOWN_HOSTS='<absolute-path-to-pinned-known-hosts-file>'

ssh -i "$PROD_SSH_KEY" \
  -o IdentitiesOnly=yes \
  -o UserKnownHostsFile="$PROD_KNOWN_HOSTS" \
  -o StrictHostKeyChecking=yes \
  "$PROD_SSH_TARGET" \
  'hostnamectl --static; uname -sr; docker version --format "{{.Server.Version}}"; docker compose version; timedatectl show -p NTPSynchronized --value; df -h /; free -h'
```

Compare every value with the approval record. Then inventory listening ports, Docker
projects, firewall policy, disk encryption/provider controls and existing services using
read-only commands. Stop if the host contains unreviewed applications, owns unexpected
ports, lacks time sync, or is not the approved dedicated target.

## Phase 2 — DNS, TLS, network and monitoring preflight

Before lowering TTL or changing a record, record its current value and rollback value:

```bash
dig +short A "$BILLING_HOST"
dig +short AAAA "$BILLING_HOST"
dig +short A "$API_HOST"
dig +short AAAA "$API_HOST"
```

Validate the staged certificate files without printing private material:

```bash
openssl x509 -in "$PRODUCTION_SECRET_DIRECTORY/tls_certificate.pem" \
  -noout -subject -issuer -dates -ext subjectAltName
openssl x509 -in "$PRODUCTION_SECRET_DIRECTORY/tls_certificate.pem" \
  -pubkey -noout | openssl pkey -pubin -outform DER | openssl sha256
openssl pkey -in "$PRODUCTION_SECRET_DIRECTORY/tls_private_key.pem" \
  -pubout -outform DER | openssl sha256
```

The two hashes must match and the SAN must contain both exact hosts. Verify externally that
only TCP 80/443 will be public; application, PostgreSQL and Redis ports must remain private.
Test the configured alert receiver before proceeding.

## Phase 3 — Configuration, secrets and images

Create the non-secret environment file from the template on the trusted deployment host,
set `IMAGE_TAG=$RELEASE_COMMIT`, distinct approved hostnames, unique project/queue names,
SMTP identity and an absolute external secret path, then restrict it to `0600`. Never put a
credential in this file.

The root-owned secret directory must be `0700` and contain the exact files in
`docs/PRODUCTION_DEPLOYMENT.md`. Values must be unique to production and independently
escrowed. Confirm names, ownership, modes, non-empty status and placeholder absence without
printing contents.

```bash
pnpm production:config
pnpm production:build
docker image inspect \
  "webhost-billing-api:$RELEASE_COMMIT" \
  "webhost-billing-web:$RELEASE_COMMIT" \
  "webhost-billing-worker:$RELEASE_COMMIT" \
  "webhost-billing-migration:$RELEASE_COMMIT" \
  "webhost-billing-nginx:$RELEASE_COMMIT" \
  --format '{{.RepoTags}} {{.Id}} {{.Config.User}}'
```

Run the approved scanner and signer, push only to the approved private registry, deploy by
recorded digest, and verify each pulled digest. Registry, scanner and signing commands stay
blocked until those products and identities are selected; do not invent them during launch.

## Phase 4 — Backup and maintenance checkpoint

Send the maintenance-start message and record the freeze time. Disable new orders/provider
callbacks at the trusted edge or use the approved maintenance procedure. Stop worker and
scheduler before selecting the backup point.

For an existing database:

```bash
BACKUP_DATABASE_NAME=webhost_billing \
  pnpm backup:create \
  '<approved-local-protected-backup-directory>' \
  '<absolute-path-to-separately-stored-backup-passphrase>'

pnpm backup:verify \
  '<exact-created-backup.dump.gpg>' \
  '<absolute-path-to-separately-stored-backup-passphrase>'
```

Copy the ciphertext and sidecars to the approved immutable off-site object/version, then run
`backup:verify` against the retrieved copy. Record its object version, checksum, migration
count and timestamp. For a brand-new empty database, record the empty baseline and complete
the approved infrastructure recovery check before applying migrations. No backup evidence,
same-host-only evidence, or failed restore drill permits migration.

## Phase 5 — Database and one-time administrator

On the approved deployment checkout:

```bash
COMPOSE=(docker compose \
  --env-file deploy/production/.env.production \
  -f deploy/production/compose.production.yaml)

"${COMPOSE[@]}" up -d --wait postgres redis
"${COMPOSE[@]}" --profile tools run --rm migrate \
  ./node_modules/.bin/prisma migrate status --config prisma.config.ts
"${COMPOSE[@]}" --profile tools run --rm migrate
"${COMPOSE[@]}" --profile tools run --rm migrate \
  ./node_modules/.bin/prisma migrate status --config prisma.config.ts
```

The first status output must match the reviewed migration list. Run the middle command once
only. The final status must say the schema is up to date. Stop on any failed/unknown migration
or unexpected SQL duration/lock behavior.

For a new installation only, create the first administrator. Never run the development seed:

```bash
export ADMIN_EMAIL='<approved-owner-email>'
export ADMIN_DISPLAY_NAME='<approved-owner-name>'
export ADMIN_JOB_TITLE='Owner'
export ADMIN_PASSWORD_FILE='<absolute-newline-free-password-file-in-root-owned-0700-directory>'
export ADMIN_BOOTSTRAP_CONFIRMATION='CREATE_FIRST_PRODUCTION_ADMIN'

"${COMPOSE[@]}" run --rm --no-deps \
  -e ADMIN_EMAIL \
  -e ADMIN_DISPLAY_NAME \
  -e ADMIN_JOB_TITLE \
  -e ADMIN_BOOTSTRAP_CONFIRMATION \
  -v "$PWD/deploy/production/bootstrap-admin.cjs:/run/bootstrap-admin.cjs:ro" \
  -v "$ADMIN_PASSWORD_FILE:/run/bootstrap-admin-password:ro" \
  api node /run/bootstrap-admin.cjs /run/bootstrap-admin-password
```

The utility refuses if an administrator or the email already exists and writes a safe audit
record. Because the unprivileged container reads a direct bind mount, set this one file to
`0444` inside its root-owned `0700` parent immediately before the command. Remove it after
confirmed login. Enroll TOTP, store recovery codes offline, log out other sessions, and
verify the audit record before public exposure.

## Phase 6 — Start without background or renewal automation

Keep the manual payment gateway selected and leave every cPanel server token unconfigured.
Start core traffic, but not the worker or scheduler:

```bash
"${COMPOSE[@]}" up -d --wait api web nginx
"${COMPOSE[@]}" ps
test "$("${COMPOSE[@]}" ps -q worker | wc -l)" -eq 0
test "$("${COMPOSE[@]}" ps -q scheduler | wc -l)" -eq 0
```

Use DNS override/direct origin testing before cutover:

```bash
curl --fail --silent --show-error \
  --resolve "$API_HOST:443:<approved-production-ip>" \
  "https://$API_HOST/health"
curl --fail --silent --show-error \
  --resolve "$API_HOST:443:<approved-production-ip>" \
  "https://$API_HOST/ready"
curl --fail --silent --show-error --output /dev/null \
  --resolve "$BILLING_HOST:443:<approved-production-ip>" \
  "https://$BILLING_HOST/login"
```

Verify certificate chain/SAN, known-host HTTP 308, unknown-host rejection, headers, 1 MiB
limit, public-port restrictions, all started-container health, zero restarts, no worker and
no scheduler. Then verify with fictional records: admin/customer login and logout, MFA,
cross-customer/admin denial, CSRF mutation, invoice/PDF, support, manual payment and the
administrator operational view.

## Phase 7 — Business settings, providers and first renewal

In `/admin/settings`, enter and independently review legal identity, address, BDT/currency,
timezone, invoice numbering, manual instructions, partial-payment rule, sender branding and
the fixed termination policy. Keep online payment inactive and WHM credentials unconfigured
unless their selected gates passed. For manual-first hosting, retain `cpanel-whm` as the
adapter name but do not configure a server token and do not request an operation.

SMTP acceptance requires a fictional verification/reset/invoice email delivered through the
real provider with valid TLS plus SPF/DKIM/DMARC results, safe delivery logs, quota and bounce
evidence. Start the worker only after sender/business settings and SMTP configuration have
been independently reviewed:

```bash
"${COMPOSE[@]}" up -d --wait worker
test "$("${COMPOSE[@]}" ps -q worker | wc -l)" -eq 1
```

Stop the worker on an inconsistent send outcome; do not blindly resend.

Before starting the scheduler, list every service eligible in the next lead/grace window and
approve the exact first-run impact. Save the approved renewal policy with `enabled=false`,
verify timezone/lead/reminder/grace values, then set `enabled=true` immediately before the
supervised first run.

```bash
"${COMPOSE[@]}" up -d --wait scheduler
test "$("${COMPOSE[@]}" ps -q scheduler | wc -l)" -eq 1
```

Observe the first completed `renewal-cycle:YYYY-MM-DD` record, invoice/reminder counts,
outbox/queues and email delivery. Automatic suspension must not be enabled until the owner
has reviewed the first eligible overdue list and cPanel mode is accepted. No termination
event may appear.

## Phase 8 — Traffic cutover and acceptance

Only the infrastructure/DNS owner changes approved A/AAAA records. Keep the prior values and
rollback TTL recorded. After authoritative and recursive DNS converge, repeat external tests
without `--resolve`, send the maintenance-complete message, and monitor continuously through
the agreed observation window.

Accept the launch only when:

- every container is healthy with zero unexpected restarts and exactly one scheduler;
- API liveness/readiness, UI, TLS, redirects, headers and public-port checks pass;
- administrator MFA and customer ownership tests pass;
- real SMTP and the selected manual/provider modes pass;
- database/Redis, queues/outbox, logs, clock, disk, certificate and backup alerts are green;
- no payment, hosting or email outcome is inconsistent;
- the launch record contains commit, digests, migrations, backup object, operators and times.

## Immediate stop and rollback conditions

Stop the launch immediately when any of these occurs:

- target hostname, provider ID, SSH host key, public IP, release commit or digest differs;
- current backup/off-site verification or isolated restore evidence fails;
- migration status or SQL differs, a migration fails, or data/constraints are uncertain;
- liveness/readiness, TLS, authentication, authorization, CSRF or financial smoke fails;
- worker/scheduler is unhealthy, more than one scheduler exists, or queues/outbox stall;
- a payment signature/merchant/amount/currency/invoice check fails;
- a payment, cPanel or SMTP mutation has an unknown/inconsistent outcome;
- monitoring/alerts do not arrive, capacity is unsafe, clock is wrong, or DNS cannot roll back;
- permanent termination automation appears or an unapproved external action becomes enabled.

### Scoped rollback matrix

| Failure                       | Immediate containment                                                 | Recovery                                                                                                                           |
| ----------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Before migration              | Stop this Compose project only; make no DNS change                    | Correct configuration or abandon launch; preserve evidence                                                                         |
| Configuration/secret          | Stop scheduler/worker, restore prior protected version                | Recreate only affected services and re-run checks                                                                                  |
| Compatible application defect | Stop scheduler/worker, retain database/logs                           | Set prior approved image digest and recreate API/web/worker; re-enable one scheduler only after checks                             |
| Migration/data uncertainty    | Stop writes/worker/scheduler and preserve failed database             | Restore verified pre-migration backup into a new isolated database; validate and explicitly cut over; never down-migrate/overwrite |
| Payment uncertainty           | Disable checkout/callback traffic and preserve event/payment evidence | Authenticated read-only provider reconciliation; never infer from redirect or blindly retry                                        |
| cPanel uncertainty            | Stop hosting worker/action, preserve operation and WHM identity       | Read-only `accountsummary` reconciliation before any local change or retry                                                         |
| SMTP uncertainty              | Stop worker, preserve outbox/email attempt                            | Provider/message-ID investigation; do not blindly resend an inconsistent attempt                                                   |
| Renewal/suspension defect     | Stop scheduler then worker                                            | Review run, invoice, outbox and service/provider evidence; resume only after owner approval                                        |
| DNS/TLS/edge                  | Restore recorded DNS/edge value if safe                               | Keep database intact; use approved prior edge/release after certificate and health checks                                          |

Rollback is complete only after health, authentication/ownership, financial history, service
state, queues/outbox and external reconciliation pass and the incident record names every
unresolved effect. A rollback does not erase a payment, email, WHM operation or audit event.

## Final launch record

```text
Decision: GO / NO-GO / ROLLED BACK
Approved release commit:
Deployed image digests:
Target identity and pinned host-key fingerprint:
DNS before/after and convergence time:
Certificate issuer/SAN/expiry:
Migration count/status/start/end/operator:
Pre-migration backup object/version/checksum:
Restore-drill evidence and measured RPO/RTO:
Administrator bootstrap/MFA audit evidence:
Payment and hosting modes:
SMTP/SPF/DKIM/DMARC acceptance:
First renewal policy/run evidence:
Health/security/business smoke evidence:
Monitoring/alert test evidence:
Communication times:
Rollback owner and selected rollback point:
Known residual risks accepted by owner:
Owner approval and timestamp:
```
