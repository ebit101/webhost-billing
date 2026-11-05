# Registrar fact synchronization

Command 213 adds an explicit read of a registered domain at its recorded
registrar account. It provides current observations for future renewal work;
it does not register, renew, transfer, change nameservers or enable auto-renewal.

## Administrator and customer workflow

Open a registered domain record from the administrator domain inventory or the
client workspace. A full administrator with two-factor authentication can choose
**Synchronize registrar facts** and confirm the exact domain name. The API checks
the owning customer, selected registrar account, provider order and original
registration or existing-domain ownership evidence before accepting a result.

Owning customers and read-only support sessions see saved facts. **Refresh saved
facts** reloads the saved observation without contacting a registrar. The record
shows the latest attempt, last successful synchronization, observation time,
trusted expiry, supported provider status, renewal eligibility, registrar
auto-renewal and freshness. Existing record information identifies the registrar.
Unknown capability is displayed as unknown, rather than as permission to renew.

## Date and ownership conflicts

An earlier expiry, an active status with a past expiry, or an expired status with
a future expiry requires review. The new date is held separately. A full
administrator must confirm the exact name, acknowledge the discrepancy and give
a reason to accept a fresh date; the audit records the old and accepted dates.
Review is idempotent and rejects stale observations, replaced attempts or changed
bindings. Unknown/pending provider status cannot establish trusted current facts.

An account, customer, domain or provider-order mismatch cannot be overridden.
No foreign observation is persisted or exposed. Investigate the binding and
obtain a new ownership-verified read. Raw provider exceptions are not returned
or saved. A failed or rejected check retains the last successful facts for the
same binding. Binding changes hide observations tied to the previous identity.

Only the domain's observed expiry is updated after acceptance. Provider status
remains a separate observation: it does not rewrite the local domain lifecycle.
Invoice due dates, issued invoice items, payment records, historical snapshots,
customer ownership and local auto-renewal preferences are unchanged.

## Freshness, bounded reads and retry

- Accept responses observed within five minutes, allowing thirty seconds of
  forward clock skew. Conflict review requires the same freshness window.
- Mark saved observations stale after one hour or when their expiry differs
  from the local accepted expiry. Stale facts are historical evidence, not
  authorization for future billing or purchase operations.
- Serialize synchronization per domain, preserve caller submission keys and
  enforce a ten-second interval between new attempts. Concurrent replay performs
  one read. New attempts cannot overlap an active claim.
- Bound the facts read to twelve seconds. Existing authenticated live-context
  reads retain their existing transport deadlines and account read limits.
  A ninety-second abandoned claim can be replaced explicitly; late responses
  from the replaced claim cannot overwrite the newer accepted facts.
- Retry using a new submission after the interval. Reuse a submission key only
  to recover that request's result. There is no automatic polling scheduler.

## Provider support and live gate

The fake provider reads existing fictional registration rows without creating
registrations. It reports active/suspended/unknown state, expiry and simulated
eligibility. Configured catalogue extensions and legacy account offers remain
readable even when sales are disabled. Unsupported provider/TLD capabilities
produce an unavailable result. Fake reads are rejected in production.

The existing Resellbiz adapter reuses authenticated domain/customer/contact
ownership reads. Its current management contract confirms active records only;
other states fail closed. It deliberately returns unknown renewal eligibility
and unknown registrar auto-renewal because those flags are not established by
the implemented contract. Unit tests use an injected mock transport only.

Both API environment flags `RESELLBIZ_LIVE_ENABLED` and
`REGISTRAR_DOMAIN_SYNC_LIVE_ENABLED` must be true before live synchronization can
reach the adapter. The new flag defaults to false; this command leaves networking
disabled. It is separate from existing registrar management and worker settings.
Real account/domain scope and enabling reads require separate owner authorization.

## Local acceptance

Use the guarded API runner for the focused PostgreSQL suite:

```powershell
pnpm --filter @webhost-billing/web exec tsx e2e/run-api-tests.ts domain-facts
```

Use the guarded Chromium runner for the administrator synchronization and saved
customer view:

```powershell
pnpm --filter @webhost-billing/web exec tsx e2e/run-tests.ts e2e/specs/domain-facts.spec.ts --timeout=180000
```

Both runners require the existing local test prerequisites and create marked,
isolated fictional database scopes. They do not use production data or live
registrar credentials. Focused cases cover expiry changes, trusted-cache
retention, stale/unavailable responses, ownership mismatch, unsupported TLDs,
authorization, binding changes, concurrent replay, abandoned-read recovery,
audited date review and unchanged financial history.

Command 214 remains a separate task: renewal invoices and reminders must inspect
fresh ownership-bound facts, supported eligibility, expiry and renewal
responsibility. Synchronization alone authorizes no charge or remote renewal.
