# End-to-End Browser Testing

Command 26 adds one deterministic Playwright lifecycle that exercises the public store, customer portal, administrator workspace, NestJS API, PostgreSQL, and the real renewal/hosting automation services. It uses fictional identities and the fake payment and hosting adapters only. No bKash, SSLCOMMERZ, SMTP, cPanel/WHM, or registrar request is made.

## Run locally

Start the loopback-only PostgreSQL and Redis services described in `docs/DEVELOPMENT.md`, then install the pinned Chromium runtime once and run the root command:

```bash
pnpm --filter @webhost-billing/web exec playwright install chromium
pnpm test:e2e
```

The root command builds the shared packages; the web pre-test builds the worker, resets the isolated PostgreSQL schema, deploys all migrations, inserts fictional fixtures, starts the API on `127.0.0.1:3201`, starts Next.js on `127.0.0.1:3200`, and runs Chromium with one worker. The ordinary `public` schema and the running development Next.js output are not reset or reused.

The test database URL must be a valid PostgreSQL URL. Runtime queries honor its Prisma `schema` parameter through the PostgreSQL adapter. The preparation script refuses to reset any schema except `command26_e2e`.

## Covered lifecycle

| Browser step                          | Proof asserted                                                                                                              |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Anonymous and cross-role navigation   | Private workspaces redirect before rendering and an authenticated user reaches only the correct workspace                   |
| Plan browsing                         | The public monthly plan links to the server-identified product and price                                                    |
| Registration, verification, and login | A strict registration succeeds, the encrypted test delivery token verifies the account, and cookie login reaches the portal |
| Order creation                        | The customer submits a domain and receives an order/invoice calculated by the API                                           |
| Fake gateway payment                  | A signed raw fake callback settles the exact invoice; browser navigation alone is never treated as proof                    |
| Administrator approval                | A paid order is explicitly approved into `PROCESSING`                                                                       |
| Fake hosting provisioning             | One pending service is created and activated through the provider-neutral hosting boundary                                  |
| Active service visibility             | The owning customer sees the active service                                                                                 |
| Renewal                               | The real renewal processor creates the next invoice for the service period                                                  |
| Overdue suspension                    | The real automation processor marks the invoice overdue and suspends the linked fake hosting account                        |
| Payment unsuspension                  | Verified payment advances the lifecycle and unsuspends only the invoice-linked suspension                                   |
| Support                               | The customer opens a service-linked ticket, an administrator replies, and the customer sees the reply                       |
| Manual termination                    | An incorrect confirmation leaves the service active; exact administrator `TERMINATE` confirmation completes termination     |

## Isolation and failure evidence

- Fixed fictional administrator, product, price, server, and `.test` customer/domain values are recreated for every run.
- The schema is dropped and recreated at the start of each run, so retries do not depend on earlier state.
- Fake gateway and fake panel selection is seeded only in the isolated schema. Test session/encryption keys and queue/rate-limit namespaces are process-specific or fictional.
- The E2E Next.js build directory is `.next-e2e`, keeping it separate from the normal `.next` development output.
- Playwright retains a trace, screenshot, and video only when a test fails. Results are ignored by Git under `apps/web/test-results/` and `apps/web/playwright-report/`.
- Run with one worker. The lifecycle is intentionally sequential because later assertions consume the exact invoice, service, and suspension created by earlier steps.

Do not point this suite at a production database, reuse real identities, or replace fake providers with live credentials. Real-provider acceptance remains a separate explicitly authorized operation.
