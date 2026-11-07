# SSLCOMMERZ checkout and recovery

Command 220, implemented locally on 2026-11-07 (Asia/Dhaka). The provider
transport is replaced with fictional responses for acceptance. No sandbox
account, payment network, deployment or live refund was used. Both payment
adapters remain sandbox-only; the owner does not yet have provider access.

## Checkout identity and retry policy

The customer must own a payable invoice, have an active verified account and a
valid phone number, and pay its exact balance in BDT. The supported SSL range is
BDT 10.00–500,000.00. Historical billing identity comes from the invoice snapshot;
the contact phone comes from the current customer record. No placeholder phone,
currency conversion, saved card or automatic recurring debit is introduced.

Before contacting the provider, lock the invoice and retain a pending payment
and `SslCheckout`. Persist a stable merchant transaction reference, sandbox
environment, hashed merchant identity, credential revision and encrypted
credential snapshot. The merchant reference, hosted session key and bank
transaction reference are separate values. Public responses never include the
credential snapshot or raw provider/card data.

The browser retains its invoice/provider submission key in session storage,
with an in-memory fallback when storage is unavailable. The server remains
authoritative: even different keys cannot create a second unresolved SSL
checkout for the same invoice. A provider switch also holds pending online
attempts for reconciliation. Pending manual references are not online captures.

Only a saved, unexpired `OPEN` checkout with an unchanged invoice balance can be
reused. An interrupted create call remains `CREATING` or `UNKNOWN`, with its
pre-saved reference available for an administrator query. Never retry a create
mutation merely because its response was lost. An empty, ambiguous or unknown
query result does not authorize a new charge. An `UNATTEMPTED` observation also
remains unresolved. A definitive provider failure permits a deliberate new
attempt, while preserving the earlier history and its delayed-success handling.

The 30-minute URL lifetime is a local reuse policy, not proof of provider expiry.
Delayed authoritative capture can still be reconciled after that time.

## Proof and settlement

Browser success/failure/cancel returns only navigate to the invoice. They do not
change payment, invoice, order or hosting state.

For a successful IPN, locate the saved merchant transaction, then authenticate
the validation request using that attempt's frozen credentials. The IPN need
not contain an undocumented store ID; if it does, it must match. Also reject a
contradictory store ID in the authenticated response. Bind the validated
transaction, validation ID, exact amount and base currency to the saved invoice
and payment. Check echoed internal IDs and additional currency fields when
provided. A failed/cancel callback alone cannot fail a payment: query the
provider independently before changing its state.

Settlement requires a unique bank transaction reference, explicit safe risk
level and a valid provider completion time. Missing/unknown/high risk or missing
time remains held. Interpret the documented local transaction timestamp in
Asia/Dhaka and store UTC. Keep semantic observation hashes so pending or held
proof can progress, and reordered form fields or `VALID`/`VALIDATED` spelling
cannot create another settlement. Reject duplicate form parameters.

Under the invoice lock, retain the authenticated capture once. Credit the
invoice only when it is still payable and its balance exactly matches the
capture. Emit the existing payment/email/renewal outbox work only for that
applied capture. Payment moves an awaiting-payment order to paid; it does not
claim successful hosting provisioning.

If manual settlement, another checkout or cancellation has already closed the
balance, retain the remote capture as a successful charge **without another
invoice credit**, mark it unapplied and require refund review. A later failure
or network error cannot downgrade an already captured charge. This distinction
retains money that actually arrived instead of hiding it behind a failed local
settlement.

## Administrator recovery and refunds

In **Billing → Transactions → Gateway exceptions → SSLCOMMERZ checkout review**, a full administrator
can load the most recent 50 attempts and query a saved payment. The attention
queue also includes unapplied successful captures. The bounded view is an
operational queue, not a complete historical export.

Refund approval and reconciliation require a full administrator with an active
session verified by two-step authentication within 15 minutes. A refund requires
a positive exact amount, support reason, stable UUID and explicit sandbox
confirmation. Customer support sessions cannot mutate anything.

1. Reserve the amount under the invoice lock. Pending, submitting, unknown and
   successful refunds all consume the original capture's available amount.
   Concurrent requests cannot exceed it; exact retries reuse the same request.
2. Submit one provider refund mutation using the saved merchant/bank identity.
   Never automatically resubmit it after timeout or process interruption.
3. Treat successful initiation as pending. Only authenticated refund-status
   confirmation can append a successful `REFUND` payment linked to the charge.
4. Preserve the original successful charge. An applied refund reduces the
   invoice's paid amount and increases its accounting balance by the same amount,
   matching the existing manual-refund invariant. Keep its refund status, which
   does not enable a new checkout, and do not silently change hosting. Refunding unapplied cash leaves the already
   settled invoice and its original settlement unchanged.
5. If initiation lost its response, retain an unknown reserved request. An
   administrator may link a provider refund reference only with a reason,
   confirmation and authenticated evidence matching both bank transaction and
   requested amount. If the provider omits amount evidence, keep it in review.
   There is no force-success or blind-resubmit override.

Database checks, retained records, immutable attempt/capture identity and terminal
refund history reinforce the application locks. Audit approval, reference
linking, capture application/review and confirmed refunds without secrets.

## Transport boundary

Keep the sandbox API/checkout host pins, HTTPS verification, redirect rejection,
timeouts and bounded retries for read-only queries. Limit provider response
bodies to 256 KiB, including streamed responses. Creation and refund mutations
have no automatic transport retry. Return fixed safe errors; never include a
provider error body or credential-bearing validation URL in logs or the UI.
Operators must also redact outbound URLs in any external proxy/APM tooling.

The test fixture implements the HTTP boundary without `fetch`, sockets or a
fallback network implementation. Strings naming provider URLs select mocked
operations only; they are not connections to a sandbox.

## Local acceptance and remaining gates

The guarded `online-payments` API group creates a fresh marked PostgreSQL schema,
applies all migrations, seeds fictional data and removes only that schema on
completion. It covers actual hosting checkout/invoice creation, authenticated
IPN, reconciliation, refunds and the existing fake/manual payment regressions.
Focused component tests cover customer retry identity, administrator review,
decimal refund input and lost-response/reference recovery controls. Exact
executed checks and outcomes are recorded in [the progress log](PROGRESS.md).

This closes selected SSLCOMMERZ code gaps from
[Command 219's review](ONLINE_PAYMENT_READINESS.md) only within local acceptance.
It does not establish real payload compatibility, provider risk transitions,
callback reachability, refund permissions, settlement terms or live readiness.
Out-of-band provider refunds/chargebacks still need a separately scoped import
and reconciliation policy. The bKash execute/version findings remain open and
are outside the selected SSL command.

Existing pending SSL payments created before this migration lack the bound
snapshot/reference contract. They are held for administrator/provider review;
no automatic adoption, deletion or invented credentials is allowed. Inventory
and reconcile those before enabling a genuine provider pilot. Do not mark a
legacy payment failed just to release a checkout hold.

Credential-bundle replacement is covered by the snapshot. Rotation or loss of
the installation's encryption master key is different: retain the required
decryption key/version or plan an explicitly reviewed re-encryption migration.
The current cipher does not provide a multi-key recovery service.

| Command 219 finding | Command 220 local outcome                                                                                             |
| ------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 219-01              | Retained sandbox account/environment/revision binding; live mode remains absent.                                      |
| 219-02              | Semantic observations allow pending/held proof to progress and deduplicate successful capture.                        |
| 219-04              | Durable pre-call reference, invoice hold, persistent browser keys and query recovery.                                 |
| 219-05              | Distinct merchant/session/bank identities with stored invoice/payment checks.                                         |
| 219-06              | Missing, unknown and high risk cannot settle.                                                                         |
| 219-07              | Optional IPN store field; authentication uses the saved merchant account.                                             |
| 219-08              | Valid contact phone and country name instead of placeholders.                                                         |
| 219-09              | Retained unapplied captures and approved append-only refund/query path; out-of-band adjustments remain separate work. |
| 219-10              | Bounded transport and safe SSL errors; external proxy/APM redaction remains an operator requirement.                  |
| 219-11              | Local URL expiry cannot close an uncertain attempt; delayed proof remains acceptable.                                 |
| 219-03 and 219-12   | Alternative bKash execute/version work remains open.                                                                  |

All outcomes above describe fictional local tests, not provider certification.

**Command 221 follow-up — 2026-11-07:** The owner authorized preparation of the
[activation, reconciliation and rollback runbook](SSLCOMMERZ_ACTIVATION_RUNBOOK.md)
only. No operational rehearsal or provider connection was performed. Genuine
sandbox/live steps remain blocked by missing merchant access and require
separately approved environment, implementation, amount, actor and refund scope.
Deployment is separately authorized. Command 222 remains the next proposed
development command while those provider gates stay closed.
