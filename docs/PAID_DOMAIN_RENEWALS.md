# Paid domain renewal execution and recovery

Command 215 connects a reviewed renewal invoice from Command 214 to a durable,
provider-neutral registrar worker operation. Payment and registrar fulfillment
remain separate. Local acceptance uses fictional registrations and fake provider
mutations only. No deployment or real purchase is included.

## Approve a paid term

1. Open the registered domain and refresh saved registrar facts and renewal
   billing. Resolve ownership, expiry, eligibility and billing-responsibility
   holds first. A prior renewal invoice must exist for this exact domain/term.
2. Settle its invoice through a verified payment workflow. Approval and the
   worker both check the successful charge ledger, amount, BDT currency, invoice
   identity, period and absence of refunds/reversals or pending adjustments.
   A paid status flag or browser redirect alone cannot authorize a purchase.
3. A full administrator with MFA chooses **Approve paid renewal**, confirms the
   exact domain name and one-year term, records a review reason, acknowledges the
   purchase and enters a maximum native registrar cost in USD. The form accepts
   ordinary dollar amounts and converts them to integer minor units exactly.
4. Approval creates one operation and outbox event in the same transaction. It
   does not contact the registrar. The existing registrar queue processes it.
   Refresh renewal billing to see queued, running, rejected, uncertain or
   succeeded fulfillment, the confirmed expiry and financial-review attention.

Customers and read-only support sessions see their saved outcome. They cannot
approve, recover, supply provider references or change fulfillment status.

## Worker checks and confirmation

The worker locks the invoice, domain, operation and registrar account in a stable
order. It rechecks ownership, active customer/administrator access, current MFA,
verified payment, application-managed billing, fresh supported registrar facts
and the approved binding. Before submission, independently read owned provider
facts and the renewal quote. Require the unchanged prior expiry, eligible active
status, registrar auto-renewal off, sufficient provider balance, USD native cost
and a positive price within the approved ceiling.

Immediately before a mutation, the provider must invoke the worker's durable
submission callback. That callback rechecks eligibility/payment under the same
locks and verifies the current lease token. Account changes, refunded payments,
revoked access or a replaced/expired worker claim stop an unsubmitted request.
Another uncertain submitted renewal on the same account holds new submissions.

The fake provider records one mutation per operation and registration/prior-expiry
pair in a retained ledger. Duplicate approvals, queue jobs and replayed events
cannot submit a second purchase. After a submitted request, the worker performs
an independent ownership-bound read. It confirms fulfillment only when the exact
expected one-year expiry is observed for that account/customer/domain/order.
The confirmation atomically updates local expiry, saves a new successful fact
observation and completes the operation. Issued invoice/payment snapshots and
hosting services remain unchanged.

A completed term releases future renewal billing for the next observed period;
it does not replace the old invoice. If payment was refunded/reversed after a
possible purchase, retain the actual confirmed registrar result and record
financial review. Future billing stays held for staff review. No automatic refund
or deletion of the original charge is performed.

## Recovery

| Outcome                               | Administrator action                                                                                                                                                                           |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Queued                                | Check worker/outbox health. Use the existing retry workflow for temporarily retryable delivery, retaining its event and operation ID. Do not create a second invoice or edit operation state.  |
| Running                               | Allow the active worker lease to finish. A duplicate job cannot take over its submission claim.                                                                                                |
| Rejected before submission            | Review the safe reason, such as insufficient balance, cost above the ceiling, changed account or payment. Correct the issue and freshly approve a new linked attempt against the same invoice. |
| Needs reconciliation after submission | After the read lease, use **Reconcile renewal** with exact domain confirmation and an audit reason. This queues an independent read, never another purchase.                                   |
| Confirmed with financial attention    | Review the retained invoice, original payment, adjustments and actual registrar expense. Fulfillment does not rewrite financial history.                                                       |

Once submission might have occurred, an exception, timeout, pending response or
unchanged expiry is not proof of rejection. Never automatically resubmit it.
If a reply is lost after purchase, an independent matching expiry read can finish
the same operation. Foreign, stale or unexpected observations cannot update the
domain or expose another customer's data. Expired worker tokens cannot submit
after recovery takes over.

Provider calls have twelve-second application deadlines. Worker claims reserve
two minutes, uncertain outcomes wait thirty seconds before another read, and
each operation has a ten-attempt read budget. After that budget, investigate
through the provider with the owner; the app provides no force-success or
force-repurchase override. Indefinitely uncertain outcomes and financial-review
holds require separately reviewed operational work rather than history edits.

## Live boundary

`REGISTRAR_RENEWAL_DISPATCH_ENABLED` defaults to false in API and worker settings
and all committed environment examples. Live dispatch also requires
`RESELLBIZ_LIVE_ENABLED`, an enabled recorded account, supported fresh facts,
verified payment and the explicit administrator domain/term/native-cost approval.
Disabling dispatch does not authorize additional reads: reconciliation still
requires the existing live-read/account gate. Keeping reads enabled while
disabling new dispatch permits recovery of an already submitted operation.

The Resellbiz adapter reuses its existing authenticated management, renewal-cost
and one-year renewal contracts. Its current fact and balance interfaces report
unverified eligibility/balance as unknown; those values block live execution,
even if a flag is enabled. They are not inferred from availability or account
configuration. Actual eligibility/balance support and real account/domain tests
need separately authorized provider-readiness work before a real pilot. No real
credentials, network request, renewal, provider charge or external email was used
for this command. Fake execution is rejected in production.

## Local acceptance

```powershell
pnpm --filter @webhost-billing/web exec tsx e2e/run-api-tests.ts domain-renewal-execution --verify-schema
pnpm --filter @webhost-billing/web exec tsx e2e/run-tests.ts e2e/specs/domain-renewal-execution.spec.ts --timeout=180000
```

Use the existing local test prerequisites. Guarded runners create isolated
fictional scopes. Acceptance covers payment/role/ownership restrictions, native
cost and balance rejection, duplicate jobs, lost replies, read-only recovery,
revoked eligibility at submission, stale-worker fencing, foreign observations,
production simulation refusal, refund timing and later-term billing.
