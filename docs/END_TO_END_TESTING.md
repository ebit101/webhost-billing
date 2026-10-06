# End-to-End Browser Testing

Command 26 adds one deterministic Playwright lifecycle that exercises the public store, customer portal, administrator workspace, NestJS API, PostgreSQL, and the real renewal/hosting automation services. It uses fictional identities and the fake payment and hosting adapters only. No bKash, SSLCOMMERZ, SMTP, cPanel/WHM, or registrar request is made.

## Run locally

Start the loopback-only PostgreSQL and Redis services described in `docs/DEVELOPMENT.md`, then install the pinned Chromium runtime once and run the root command:

```bash
pnpm --filter @webhost-billing/web exec playwright install chromium
pnpm test:e2e
```

The root command builds the shared packages; the web pre-test builds the worker and API sequentially. The guarded runner creates a fresh isolated PostgreSQL schema, deploys all migrations, verifies isolation, inserts fictional fixtures, starts the compiled API on `127.0.0.1:3201`, starts Next.js on `127.0.0.1:3200`, and runs Chromium with one worker. The ordinary `public` schema and the running development Next.js output are not reset or reused.

The configured database URL must target loopback PostgreSQL. The runner assigns a fresh `command26_e2e_<32 lowercase hexadecimal characters>` schema and supplies both the Prisma `schema` parameter and an explicit PostgreSQL `search_path` with no public fallback. Preparation, API startup, Playwright setup, fixture-mutating journeys and the automation runner verify the live scope. An ownership marker and model/raw-SQL agreement checks fail closed. Unsupported connection-target query overrides are rejected.

Use `pnpm test:e2e` rather than invoking Playwright or preparation directly. A supplied/reused `WEBHOST_BROWSER_E2E_SCHEMA` is rejected by the runner; the generated scope is propagated internally to all subprocesses. A schema collision fails instead of resetting existing data.

Run only on a trusted development machine or isolated CI network. The existing compiled API entrypoint binds all interfaces; loopback test URLs and database checks are not a host-firewall rule. This test repair does not change the production API listener.

For sequential local package/API/invariant acceptance checks on an empty fictional scope, first run `pnpm build:packages`, then:

```bash
pnpm --filter @webhost-billing/web exec tsx e2e/validate-gate.ts packages
pnpm --filter @webhost-billing/web exec tsx e2e/validate-gate.ts api
pnpm --filter @webhost-billing/web exec tsx e2e/validate-gate.ts invariants
```

Each invocation creates and verifies a fresh schema; existing suite assertions and deadlines are unchanged. The API gate adds only the canonical fictional seed customer required by the legacy authentication ownership assertion; it never loads an ordinary application seed or real identities. The packages gate runs every existing script/package suite sequentially, using one Jest/Vitest process at a time to limit memory pressure. The staff UI-only browser suite remains separate: `pnpm --filter @webhost-billing/web exec playwright test --config playwright.staff.config.ts`.

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
- A new schema is created for each run, so retries do not depend on earlier state. After completed preparation, cleanup drops only that invocation's validated, marked fictional schema, including on test failure. Interrupted/incomplete preparation may leave a fictional schema for inspection; it is never reused or automatically reset.
- Fake gateway and fake panel selection is seeded only in the isolated schema. Real gateway enablement is explicitly disabled and email uses preview delivery. Test session/encryption keys are fictional; queue/rate-limit namespaces use the per-run scope.
- The E2E Next.js build directory is `.next-e2e`, keeping it separate from the normal `.next` development output.
- Playwright retains a trace, screenshot, and video only when a test fails. Results are ignored by Git under `apps/web/test-results/` and `apps/web/playwright-report/`.
- Run with one worker. The lifecycle is intentionally sequential because later assertions consume the exact invoice, service, and suspension created by earlier steps.

Do not point this suite at a production database, reuse real identities, or replace fake providers with live credentials. Real-provider acceptance remains a separate explicitly authorized operation.
