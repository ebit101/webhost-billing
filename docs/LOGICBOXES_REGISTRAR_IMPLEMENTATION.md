# Simulated StarGate/UK2 registration

Command 50 implements the [approved registrar design](LOGICBOXES_REGISTRAR_DESIGN.md).
This is a local evaluation workflow, not provider acceptance or permission to sell
real domains. No registrar network client or production fallback is present.
The proprietary, ionCube-encoded owner archive is not implementation source.
With `NODE_ENV=production`, simulated offers and all registrar write routes are
closed, and the registrar consumer does not start. Existing history remains read-only.
Evaluate only in a development/test installation with fictional records.

## Evaluate with fictional records

1. Upgrade only an owned local evaluation installation with the reviewed additive
   migration `20261012000100_domain_registrar`. Back up existing installations first;
   disabling the registrar is the rollback, not dropping historical records.
2. Sign in as an enrolled full administrator. Open `/admin/domains`, enter an explicit
   positive one-year BDT selling price in minor units, and type
   `Enable simulated registrar`. Networking stays disabled. This creates two fictional
   `.com`/`.net` offers; it does not synchronize live provider prices.
3. Use the existing customer manager and customer sign-in with fictional identities.
   Open `/portal/domains`, select an offer and an ordinary ASCII second-level name,
   complete all registrant fields and explicitly accept `fictional-registration-v1`.
   Nameservers are fixed to `ns1.example.test` and `ns2.example.test`. A validated offer
   and domain survive sign-in; contacts, consent and price authority never travel in URLs.
4. Request a five-minute quote. Fixed BDT revenue and observed simulated USD cost are
   independent integer amounts: there is no FX calculation or converted profit.
   Explicitly create the order and immutable unpaid invoice. Submission replay does
   not create another purchase. Expired quotes require new customer review.
5. Submit a fictional receipt using the existing invoice/manual-payment workflow.
   A pending receipt or an administrator-set paid summary is insufficient; the verified
   charge ledger must fully settle the invoice in BDT, without refund or reversal.
6. The full administrator reviews the customer/order/invoice, contacts, consent,
   nameservers and native cost, types the exact domain name and approves an immutable
   positive USD cost ceiling. This commits an outbox reference, not a registration.
7. The dedicated worker claims the operation durably before provider work, rechecks
   financial/customer/administrator eligibility, ensures fictional contact mappings
   and dispatches once. Only ownership-matched status and expiry complete the order.
   Invoice status, domain status and contact verification remain independent.

Administrator and customer lists show at most the latest 100 requests. Administrator
contact review is read-only; customer domain-detail responses omit private contacts, native cost,
provider IDs and operation evidence. The administrator screenshot is a layout reference
only: its real customer values, prices and available actions were not copied.
Request time is not registration time; observed registry expiry is not a billing date.
Renewal price and next billing date are deliberately not invented.

## Fictional outcomes and recovery

| Name prefix     | Local simulated result                                                               |
| --------------- | ------------------------------------------------------------------------------------ |
| Ordinary name   | Registered after matching lookup; contact verification remains pending               |
| `taken-`        | Unavailable; quote denied                                                            |
| `price-`        | Native cost 1,500 USD minor units rather than 1,000; a lower ceiling denies dispatch |
| `pending-`      | Pending external outcome; payment does not imply registration                        |
| `reject-`       | Rejected outcome; paid invoice is retained                                           |
| `lost-`         | Mutation succeeds but response is lost; lookup confirms without another mutation     |
| `contact-lost-` | Ambiguous mapping creation; registration is not attempted or silently retried        |

There is one outstanding mutation per registrar account. An unresolved request can
block later unclaimed approvals; after resolving it, deliberately reapprove an unclaimed
request with its original budget. Never clear a claimed operation or change its intent.
Redelivery is read-only reconciliation, including a crash before a proven send. An absent
lookup is not permission to register again. Reads are bounded to ten per operation with
backoff; failed reads also consume an attempt. After the budget is exhausted, retain
the request for operator investigation.
There is no automatic reconciliation scheduler or automatic domain renewal in this slice.

The registrar kill switch stops both dispatch and queued reconciliation. Disabling does
not cancel, refund or undo an action already in progress. Refund/reversal after claim is
new financial history and creates an attention record; reconciliation still records
the actual simulated registrar outcome, even when the local invoice has been refunded.

## Official contract mock, not a credentialed sandbox

`LogicBoxesSandboxRegistrar` accepts only an injected transport whose kind is `MOCK`,
mode `HTTP_MOCK`, fixed host `test.httpapi.com` and the public fictional mock key.
There is no socket/fetch implementation or environment credential reader. Calls have a
ten-second deadline, no redirects, a 65,536-byte response ceiling and bounded JSON shape;
duplicate keys, excessive nesting, malformed/missing prices and unsupported states deny.
Numeric financial tokens are parsed losslessly before exact minor-unit conversion.

The mock reconciles explicitly pre-bound customer/contact IDs against
[customer details by ID](https://manage.logicboxes.com/kb/answer/967) and
[contact details](https://manage.logicboxes.com/kb/answer/792), including owner and exact
contact fields. Missing, archived, mismatched or ambiguous evidence stops the operation;
no email-only adoption, automatic signup or repeated contact creation is implemented.
The fake adapter creates immutable, customer/account-bound fictional mappings.
Actual demo signup/contact creation and account-specific status vocabulary need separate
protected acceptance; this mock does not establish that those obligations are satisfied.

The registration projection uses POST, one year, `NoInvoice`, approved nameservers and
explicitly disabled auto-renew/privacy. `NoInvoice` and HTTP success are not ownership,
payment or registration proof. Independent lookup checks account, customer, domain,
status and expiry, discarding provider PINs and domain secrets. A fresh price check is
not an atomic provider charge cap. The pinned USD mock convention does not establish
the real account's cost currency, taxes, promotions or wallet effect.

## Persistence and validation boundaries

Nine additive registrar tables are separate from hosting services. Existing products
and order items default to `HOSTING`; domain products cannot enter the hosting catalogue,
hosting order creation, service creation or hosting renewal pipeline. SQL guards enforce
ownership, immutable quotes/contacts/credentials/offers/invoice snapshots and lines,
append-only evidence, single dispatch claims and domain-order completion/cancellation.
Credentials and contacts use authenticated encryption bound to account, fake mode,
purpose and credential version. Jobs contain only local references; errors and evidence
contain fixed codes, never provider responses or registrant bodies.

Prisma schema plus hand-reviewed SQL constraints/triggers form the migration contract;
do not replace custom safeguards with an unreviewed generated schema diff. Prior 28
migration bytes and existing financial rows must remain unchanged. Historical currency
acceptance retains the exact original migration pins; test-only hosting discriminator
columns make historical fixtures compatible with the current Prisma client. This does
not activate or advance currency selection, conversion or authorization.

Automated acceptance uses disposable loopback schemas, fictional users and a private
random BullMQ prefix. The mobile test exercises customer sign-in, verified manual payment,
administrator approval, actual outbox publication and the actual registrar consumer.
No screenshot/trace of registrant details is retained. Validation results and any failures
are recorded in [progress](PROGRESS.md); this guide is not a claim that every gate passed.

## Next authority boundary

**Command 51 — Run credentialed UK2Group test acceptance** requires the protected demo
identity, provider isolation confirmation, key/IP permissions, exact disposable inputs,
agreement, native cost/charge evidence, operator window and explicit mutation approval
listed in the design. The test hostname with live credentials is not safe isolation.
Until those prerequisites are established, keep fake/mock evaluation and stop.
Transfer, renewal, deletion, authorization-code retrieval, nameserver/contact editing,
privacy, DNS/email tools, reminders, WHMCS import and production rollout are not enabled.
Both existing unwaived tooling advisories and the currency-development hold remain.
