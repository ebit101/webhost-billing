# Observability and Health Checks

Webhost Billing emits newline-delimited JSON logs and exposes narrowly scoped health and operational views. These controls help one administrator detect failures without copying secrets, customer payloads, or provider responses into telemetry.

## Endpoints

| Endpoint                      | Access                | Meaning                                                                                                                |
| ----------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `GET /health`                 | Public                | Process liveness only. Returns `200` when the API can answer HTTP. It deliberately performs no dependency check.       |
| `GET /ready`                  | Public                | Dependency readiness. Returns `200` only when PostgreSQL and Redis answer within two seconds; otherwise returns `503`. |
| `GET /observability/overview` | Administrator session | Queue counts, failed outbox count, automation history and 24-hour provider failure totals.                             |

Health responses contain only state names and timestamps. They never contain hosts, ports, connection URLs, exception messages, credentials, or stack traces. A basic local check is:

```bash
curl --fail http://127.0.0.1:3001/health
curl --fail http://127.0.0.1:3001/ready
```

Use `/health` for process supervision. Use `/ready` for reverse-proxy or deployment traffic admission. Do not automatically restart an otherwise live API solely because a dependency is briefly unavailable; first inspect PostgreSQL and Redis.

## Correlation

- The API accepts `X-Request-ID` only when it is a UUID. Missing or invalid values are replaced with a server-generated UUID, returned in the response header, and attached to request-scoped logs.
- Request logs contain method, URL path without the query string, status, duration, and request ID. Bodies, query parameters, headers, cookies, and client addresses are excluded.
- BullMQ jobs retain their existing reference-only correlation UUID. Worker logs attach `correlationId`, `jobId`, and `queueName` through the complete handler lifecycle.
- Payment processing logs the provider, provider event identifier, safe processing state, and replay flag. It never logs the webhook signature, raw body, normalized payload, checkout credentials, or provider response.

Search the JSON log stream by `requestId`, `correlationId`, or `providerEventId` to join safe operational evidence. These identifiers are investigation aids, not proof of payment or successful provisioning.

## Redaction and log handling

The shared logger emits one JSON object per line with `timestamp`, `level`, `service`, `environment`, and `event`. A recursive fail-safe redactor replaces sensitive key values and common inline credential patterns before output. Errors are reduced to a sanitized name and message; stack traces are not emitted by the shared formatter.

Never add any of the following to a log call:

- passwords, recovery codes, TOTP values, session cookies, CSRF values, or authorization headers;
- API keys, gateway secrets, webhook signatures, SMTP credentials, WHM tokens, or decrypted integration bundles;
- raw request/webhook/provider bodies, normalized payment payloads, bank-deposit proof, or arbitrary headers;
- cPanel passwords, one-time login URLs, encrypted credential blobs, or customer ticket/message bodies.

Redaction is a final safety layer, not permission to log sensitive inputs. Restrict log access, encrypt transport/storage, set a bounded retention policy, and avoid copying production logs into development.

## Administrator operational view

The administrator page at `/admin/automation` displays:

- waiting, active, delayed, and retained failed BullMQ counts per queue;
- failed outbox publications and their existing safe retry controls;
- running and failed automation counts plus recent automation-run history;
- payment gateway, cPanel adapter, and email provider failure/inconsistent totals for the previous 24 hours.

Failed counts are retained evidence, so a non-zero BullMQ failed total may remain after the underlying issue is reconciled. Inspect the failure list, audit trail, external provider state, and business record before retrying. An inconsistent hosting or email result must not be blindly retried.

## Alert policy

The current application exposes the signals but does not contact an alerting vendor. Configure the deployment monitor in Command 29 or the selected infrastructure platform using this policy.

### Wake the administrator immediately

- `/health` fails for two consecutive checks or for more than two minutes.
- `/ready` returns `503` for three consecutive checks or for more than five minutes; identify whether PostgreSQL or Redis is down.
- Any payment gateway event is rejected/inconsistent after a customer may have been charged, or provider evidence and the local invoice/payment disagree.
- Any cPanel operation is `INCONSISTENT`, especially create, suspend, unsuspend, password, or package operations with an unknown external outcome.
- A paid order cannot proceed because provisioning fails, or an overdue/payment-linked service transition disagrees with verified WHM state.
- A renewal cycle is `FAILED`, has failed items, or no daily renewal run has completed by 02:00 in the configured business timezone.
- The payment or hosting queue has failed work, or its waiting/delayed backlog makes no progress for ten minutes.

### Notify during business hours

- Email failures persist for 15 minutes, an email attempt is `INCONSISTENT`, or authentication/billing email backlog grows without progress.
- Any outbox event reaches `FAILED`, non-critical queue failures appear, or a backlog remains above 100 jobs for more than 15 minutes.
- Provider failure totals increase repeatedly even when reconciliation shows no immediate financial or service inconsistency.
- A renewal run is partially successful but all risky hosting outcomes are verified and contained.

### Investigation order

1. Preserve the alert time, request/job/provider event identifier, and safe status evidence.
2. Check `/health`, `/ready`, the administrator operational view, process logs, and PostgreSQL/Redis service state.
3. For financial or hosting uncertainty, query the provider through its authenticated read-only status operation before changing local state or retrying.
4. Use only an existing explicitly safe retry control. Do not retry an inconsistent external mutation.
5. Record the decision and resulting reconciliation in the application audit path or incident notes.

Public liveness/readiness endpoints should be rate-limited and network-filtered at the reverse proxy when deployed. The administrator overview remains protected by the normal secure session, role authorization, CSRF rules for mutations, and service-layer access controls.
