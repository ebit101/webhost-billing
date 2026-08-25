# Webhost Billing Worker

This NestJS application context owns the PostgreSQL transactional-outbox dispatcher and future BullMQ consumers.

Command 17 provides:

- seven explicitly named queues and bounded retry policies;
- deterministic, reference-only BullMQ jobs;
- `FOR UPDATE SKIP LOCKED` outbox claiming and stale-lease recovery;
- structured correlation logs and safe failure classification;
- retained failures and administrator-controlled retry;
- graceful Nest/BullMQ/Prisma/Redis shutdown; and
- real Redis/PostgreSQL integration tests.

It intentionally does not consume email, renewal, or hosting-mutation jobs until their business handlers are implemented by later authorized commands.

From the repository root:

```bash
pnpm --filter @webhost-billing/worker dev
pnpm --filter @webhost-billing/worker test --runInBand
pnpm --filter @webhost-billing/worker build
```

PostgreSQL and Redis must be healthy and the ignored repository-root `.env` must contain valid local settings. See `docs/BACKGROUND_JOBS.md` for the queue contract and operational rules.
