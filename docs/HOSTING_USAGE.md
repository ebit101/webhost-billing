# Hosting usage statistics

Command 222 adds a read-only usage card to customer hosting details and the
administrator service review. It shows disk and bandwidth counters, finite or
unlimited allowances, the retrieval timestamp and the queried bandwidth month.
Missing metrics and unknown limits say **Unavailable**; they never become zero
usage or an unlimited allowance. A finite zero limit remains zero. Over-limit
readings are informational and do not trigger billing or hosting actions.

## Supported adapters

| Adapter                                          | Supported readings                                                                  | Verification                                                              |
| ------------------------------------------------ | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| cPanel/WHM                                       | Account disk usage/quota and bandwidth usage/limit for the requested calendar month | Local mocked HTTP responses only; no real server or token was contacted   |
| Fake hosting panel                               | Deterministic disk and bandwidth samples, clearly labelled fictional                | Local unit and PostgreSQL/Redis API acceptance; unavailable in production |
| Virtualizor, Vultr, ShoutCast and other adapters | Not implemented                                                                     | Explicit unsupported state; no account or node-wide usage is guessed      |

The cPanel adapter uses only the documented read-only
[accountsummary](https://api.docs.cpanel.net/specifications/whm.openapi/account-management/accounts-accountsummary)
and [showbw](https://api.docs.cpanel.net/specifications/whm.openapi/bandwidth-and-disk-quotas/bandwidth-showbw)
operations. The [official OpenAPI bundle](https://api.docs.cpanel.net/_bundle/specifications/whm.openapi.yaml)
defines account-summary disk values in MiB and bandwidth counters/limits in bytes.
Normalize them to integer byte strings with exact arithmetic. Reject unsafe
numeric JSON instead of rounding it. The screen uses binary units such as MiB
and GiB; these are usage values, independent of currency.

Request bandwidth for an explicit year/month selected from the UTC clock; this
is a calendar month, not the service's billing cycle. Check the returned period,
username and main domain against the saved account binding. Reject mismatched,
deleted or ambiguous accounts. Missing counters remain unknown. Statistics can
lag at the provider; the displayed time means retrieved, not continuously measured.
Actual WHM permissions and returned counters still need separately authorized
server acceptance. Do not broaden an API token's privileges as part of this feature.

## Cache and polling policy

- Authorize the current service owner, full administrator and optional parent
  customer before reading Redis or consulting a provider. Read-only customer
  support sessions may view the same owned data.
- Cache each account binding in Redis for five minutes. Retain the last sample
  for at most 24 hours to show a labelled stale value after a failed read. A new
  UTC month uses a new key, so prior-month bandwidth is not presented as current.
- Include service, customer, server/configuration revision, adapter, domain,
  username, external account and package binding in cache identity. Recheck the
  binding after a provider read; discard a transferred or reassigned observation.
- A shared Redis attempt lease deduplicates concurrent reads across API instances
  and enforces a cooldown of at least 60 seconds, including failures. At most
  four provider reads run per API process. Multiple replicas each have this cap;
  it is not a global four-read limit.
- Bound provider reads to two configured panel timeouts plus 500 milliseconds.
  Existing per-request HTTP timeout, response-size, HTTPS and public-address
  safeguards remain in force. A Redis failure returns unavailable without an
  uncapped direct-provider fallback.
- The authenticated route is limited to 30 requests per minute by the existing
  rate-limit guard. Refresh uses GET and cannot bypass server caching or leases.
  The card makes no automatic network polling requests; its timer only enables
  refresh and marks an expired displayed sample stale.

Only active or suspended services with a bound account on an active, non-retired
server may be queried. Other lifecycle/configuration states show not ready.
Saved payloads and responses contain normalized counters and safe metadata only,
not credentials, provider responses, login URLs or other customers' accounts.
No usage snapshot table, migration, scheduled job or lifecycle operation is added.
Website SSL remains a separate feature.

## Local acceptance

Use fictional accounts, the fake panel and mocked cPanel HTTP responses. The
focused API launcher creates a fresh marked schema, applies migrations and drops
only that owned schema afterward:

```powershell
pnpm --filter @webhost-billing/shared build
pnpm --filter @webhost-billing/api exec jest --runInBand --runTestsByPath src/modules/services/service-usage.service.spec.ts src/modules/hosting-panels/cpanel-usage.spec.ts src/modules/hosting-panels/fake-hosting-panel.spec.ts src/modules/hosting-panels/cpanel-whm.hosting-panel.spec.ts
pnpm --filter @webhost-billing/web exec vitest run src/components/services/hosting-usage.test.tsx src/components/services/service-management.test.tsx src/components/services/admin-service-review.test.tsx
pnpm --filter @webhost-billing/shared exec tsx --test test/hosting-usage.spec.ts
pnpm --filter @webhost-billing/web exec tsx e2e/run-api-tests.ts usage --verify-schema
```

The guarded launcher requires a loopback PostgreSQL URL and working local Redis
credentials. A temporary loopback-only Redis instance can be supplied through
the test process's `REDIS_URL` without modifying the normal environment file.
Never point acceptance at a production database or provider. The API test checks
real Redis cache reuse and unchanged service, invoice, payment, panel-operation
and outbox records, as well as ownership and input validation. See
[the progress record](PROGRESS.md) for actual results and limits.
