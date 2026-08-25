# Background Jobs and Transactional Outbox

## Scope

Command 17 adds the Redis/BullMQ execution boundary and the PostgreSQL outbox dispatcher. It does not send SMTP email, generate renewal invoices, or schedule hosting mutations; their business handlers belong to later explicitly authorized commands.

PostgreSQL remains the source of truth. A business transaction inserts its state changes and one `OutboxEvent` atomically. The worker claims committed events and publishes reference-only BullMQ jobs. A database commit therefore cannot be lost merely because Redis was unavailable at commit time.

The local Redis service uses AOF with `appendfsync always` so an acknowledged queue write is flushed before the outbox row is marked published. Production Redis must provide equivalent durable persistence, restricted access, capacity/eviction controls, monitoring, and tested recovery; an ephemeral cache configuration is not an acceptable queue backend.

## Queue catalogue and retry policy

| Queue                           | Automatic attempts | Initial exponential backoff | Safety class                           |
| ------------------------------- | -----------------: | --------------------------: | -------------------------------------- |
| `emails`                        |                  5 |                   2 seconds | Retryable delivery                     |
| `hosting-provisioning`          |                  1 |                        none | External mutation                      |
| `hosting-suspension`            |                  1 |                        none | External mutation                      |
| `hosting-unsuspension`          |                  1 |                        none | External mutation                      |
| `hosting-status-reconciliation` |                  4 |                   5 seconds | Read-only reconciliation               |
| `payment-reconciliation`        |                  4 |                   5 seconds | Authenticated/read-only reconciliation |
| `renewal-invoice-generation`    |                  3 |                   3 seconds | Database-idempotent generation         |

External hosting mutations never retry automatically. A future handler must classify an ambiguous timeout/result as `INCONSISTENT`; the worker converts permanent and inconsistent failures to BullMQ `UnrecoverableError`. A provider-declared `TEMPORARY` result can be retained for explicit administrator retry. Unknown processor exceptions receive a fixed temporary classification and remain bounded by the queue policy.

## Safe job envelope

Redis stores only:

- schema version;
- outbox event UUID;
- aggregate type and UUID;
- event type;
- correlation UUID; and
- safe normalized failure kind/code after a failure.

The outbox payload itself is not copied into Redis. Recipients, reset/verification material, provider metadata, passwords, API tokens, session links, signatures, and raw requests are prohibited from job data. A future trusted handler loads and runtime-validates the outbox record from PostgreSQL at the execution boundary.

BullMQ job IDs use `outbox-<uuid-without-hyphens>`. They contain no colon and remain deterministic per queue, following BullMQ's official [custom job ID](https://docs.bullmq.io/guide/jobs/job-ids) constraints. Re-publishing an event after a dispatcher crash therefore returns the existing job rather than appending a duplicate. Completed jobs are retained for seven days/up to 10,000 per queue; failed jobs are retained until reviewed.

## Dispatcher behavior

`OutboxDispatcherService` runs in the Nest worker application context:

1. Claims due `PENDING` events and stale `PROCESSING` leases with PostgreSQL `FOR UPDATE SKIP LOCKED`.
2. Increments the durable publication attempt and records a worker lease.
3. Maps a recognized event type to one queue/job name.
4. Adds the reference-only job with its deterministic ID.
5. Marks the outbox event `PUBLISHED` only after BullMQ accepts it.

If the process stops after step 4, the stale lease is reclaimed and the same BullMQ ID closes the publication gap. Redis publication failures return to `PENDING` with exponential delay and become `FAILED` after five attempts. Unrecognized event types fail immediately with the fixed `OUTBOX_EVENT_UNROUTABLE` code so they remain visible instead of disappearing.

The dispatcher interval, batch size, and lease timeout are configured through `OUTBOX_POLL_INTERVAL_MS`, `OUTBOX_BATCH_SIZE`, and `OUTBOX_LOCK_TIMEOUT_SECONDS`. `BULLMQ_PREFIX` isolates one environment's Redis keys.

## Email processor and graceful shutdown

`@webhost-billing/queue` provides the shared `BackgroundWorker` registration boundary. Command 18 registers the `emails` queue consumer with configurable bounded concurrency. It reloads and validates the published outbox event from PostgreSQL, renders the message at the trusted boundary, and persists an `EmailLog` plus an append-only row for every adapter attempt. See `docs/EMAIL_NOTIFICATIONS.md` for the template catalog, SMTP classifications, preview transport, and secret boundary.

Command 19 registers the database-idempotent renewal consumer plus the one-attempt hosting suspension and unsuspension consumers. The dedicated scheduler is a separate Nest application-context entry point, so scaling ordinary workers does not multiply schedule ownership. Payment/hosting reconciliation consumers remain unregistered until their authorized feature commands implement authenticated reconciliation handlers. See `docs/RENEWAL_AUTOMATION.md`.

Every registered worker:

- runtime-validates the job envelope;
- emits fixed structured lifecycle logs with queue, job, and correlation IDs;
- supports an abort signal;
- uses bounded concurrency and one stalled recovery;
- updates only safe failure classification fields; and
- closes with `worker.close()` so active work finishes before Redis/database connections close.

The Nest application enables shutdown hooks for `SIGINT` and `SIGTERM` and closes workers as described by BullMQ's [graceful shutdown](https://docs.bullmq.io/guide/workers/graceful-shutdown) guidance. BullMQ 6 performs stalled-job recovery without the legacy `QueueScheduler` class. Permanent/inconsistent classification uses the documented [unrecoverable-error](https://docs.bullmq.io/patterns/stop-retrying-jobs) mechanism.

## Administrator operations

The Automation page uses administrator-only endpoints:

| Method | Route                                             | Purpose                                         |
| ------ | ------------------------------------------------- | ----------------------------------------------- |
| `GET`  | `/background-jobs/failures`                       | List retained queue and durable outbox failures |
| `POST` | `/background-jobs/queues/:queueName/:jobId/retry` | Retry a failed job classified `TEMPORARY`       |
| `POST` | `/background-jobs/outbox/:eventId/retry`          | Requeue a failed event with a recognized route  |
| `GET`  | `/renewal-automation/policy`                      | Read effective renewal settings                 |
| `PUT`  | `/renewal-automation/policy`                      | Update validated renewal settings               |
| `GET`  | `/renewal-automation/runs`                        | List recent renewal automation results          |

Queue retry requires exact `RETRY_JOB` confirmation. Outbox retry requires `RETRY_OUTBOX`. Both require administrator authentication/CSRF and append an activity log. Raw BullMQ error strings, stack traces, outbox payloads, and `lastError` values are not returned.

Permanent/inconsistent jobs and malformed payloads cannot be retried from the interface. Hosting reconciliation must prove external state before a new mutation is authorized.

## Development verification

Start PostgreSQL and Redis, then run:

```bash
pnpm --filter @webhost-billing/queue test --runInBand
pnpm --filter @webhost-billing/worker test --runInBand
pnpm --filter @webhost-billing/api test:e2e background-jobs.e2e-spec.ts --runInBand
```

The integration tests use unique Redis prefixes and fictional PostgreSQL rows, verify deduplication/retry/unrecoverable behavior, and remove their own artifacts.

## Later command boundary

Command 19 adds renewal scheduling and produces renewal-reminder events; Command 20 produces ticket-reply events. Both templates and routes already exist, but neither later business workflow is implemented here. No command may place secrets in Redis or make uncertain external mutations automatically retryable.
