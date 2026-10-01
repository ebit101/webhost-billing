# Capability and Limitation Matrix

This matrix states what an evaluator can safely observe today. “Implemented” means
source and automated evidence exist; it does not mean the feature has passed the
credentialed staging, operator, provider, or production acceptance required for live
use.

| Area              | Safe demo                                                            | Repository capability                                                                                            | Current limitation                                                                                                    |
| ----------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Authentication    | Generated fictional admin/customer logins and secure cookie sessions | Registration, verification, password reset, session revocation, role/ownership checks, admin MFA                 | Demo email delivery and admin MFA enrollment are not exercised; production acceptance is incomplete                   |
| Product catalogue | Public fictional product and monthly BDT price                       | Admin product lifecycle and append-only price versions                                                           | One seeded plan; not multi-currency and not a general tax engine                                                      |
| Customers         | Seeded fictional customer and admin views                            | Customer profile/access management with service-layer authorization                                              | No real identities or customer import workflow                                                                        |
| Orders            | Seeded order visible to both permitted roles                         | Idempotent customer/admin order creation with immutable snapshots                                                | Demo should not be used to submit meaningful domains or business records                                              |
| Invoices          | Seeded issued/paid invoice and printable/downloadable views          | Draft/issue lifecycle, snapshots, credits, deterministic PDF, sequential numbering                               | No accepted live tax/VAT, cancellation, or refund policy                                                              |
| Payments          | Fictional settled transaction in admin/customer history              | Manual review plus bKash and SSLCOMMERZ sandbox adapters, authenticated idempotent callbacks, reconciliation     | Gateway adapters are disabled in the demo; no credentialed provider acceptance; redirects never prove payment         |
| Services          | Fictional active hosting service                                     | Separate service lifecycle and evidence-based provisioning states                                                | A paid invoice never proves provisioning; no real hosting system is contacted                                         |
| Hosting panels    | No provider process or credential                                    | Provider-neutral adapter, fake adapter, and guarded cPanel/WHM integration                                       | Real cPanel acceptance is incomplete; uncertain mutations require reconciliation                                      |
| Email             | No worker or SMTP process                                            | Queued provider-neutral SMTP/preview delivery with append-only attempt evidence                                  | Demo sends no email; credentialed SMTP acceptance is incomplete                                                       |
| Renewals          | Seed records may be inspected; scheduler is absent                   | Idempotent daily scheduler, invoices/reminders, conservative suspension/reactivation                             | Not exercised in demo; no automatic permanent termination exists                                                      |
| Support           | Fictional ownership-bound ticket and messages                        | Customer/admin plain-text ticket workflow and reply notifications                                                | No attachments, departments, or SLA engine                                                                            |
| Dashboard/reports | Admin dashboard plus an authenticated customer account summary       | Transaction-sourced metrics, bounded audited CSV reports, business-timezone periods, ownership-bound portal data | Some administrator summary values depend on the selected reporting period                                             |
| Operations        | Loopback health/readiness through the gateway                        | Structured logs, metrics, encrypted backup/recovery scripts, production Compose/runbooks                         | Demo is not an operations drill; monitoring, off-site backup, alerting, DNS/TLS, and operator gates remain unaccepted |

## Explicit non-goals

The initial product is for one web-hosting business per installation. Multi-tenant
reseller operation, marketplaces, affiliate systems, worldwide tax handling,
multi-currency accounting, and automatic permanent hosting termination are outside
the authorized scope.

## Production status

Production remains **NO-GO**. Real data, credentials, providers, email delivery,
payment callbacks, hosting mutations, DNS, deployment targets, and external systems
remain outside this demo. The immutable `v0.1.0-alpha.1` source prerelease is an
evaluation artifact, not a live-use recommendation.

For the evaluator path, see [`SAFE_EVALUATION_DEMO.md`](SAFE_EVALUATION_DEMO.md).
For detailed gates and residual risks, see
[`RELEASE_CHECKLIST.md`](RELEASE_CHECKLIST.md) and
[`PRODUCTION_DEPLOYMENT.md`](PRODUCTION_DEPLOYMENT.md).
