# Capability and Limitation Matrix

This matrix states what an evaluator can safely observe today. “Implemented” means
source and automated evidence exist; it does not mean the feature has passed the
credentialed staging, operator, provider, or production acceptance required for live
use.

Updated 2026-11-01 through Command 160. The repository capability column describes
current `main`, not the older immutable `v0.1.0-alpha.1` source archive. The isolated
one-command demo has its own intentionally limited fixtures and no live providers.

| Area                | Safe demo                                                            | Repository capability                                                                                                                                       | Current limitation                                                                                                                                                                  |
| ------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authentication      | Generated fictional admin/customer logins and secure cookie sessions | Registration, verification/resend, password reset, session revocation, staff roles, admin MFA, remembered sessions and authenticated login redirects        | Remembered access does not skip MFA on a new sign-in; demo MFA enrollment/email are not exercised; production acceptance is incomplete                                              |
| Product catalogue   | Public fictional product and monthly BDT price                       | Product groups, compact administration, product lifecycle and append-only price versions                                                                    | One seeded plan; not multi-currency and not a general tax engine                                                                                                                    |
| Customers           | Seeded fictional customer and admin views                            | Persistent client workspace with nine scoped profile, hosting/domain, billing, support and email-history tabs                                               | Reads retain service-layer ownership/staff checks; not a complete WHMCS profile or customer-import workflow                                                                         |
| Orders              | Seeded order visible to both permitted roles                         | Idempotent checkout and combined admin hosting/domain billing, immutable snapshots, one invoice and default-off registration dispatch                       | Existing-domain billing requires verified linking and does not register/renew; no meaningful domains or real business records in demo                                               |
| Invoices            | Seeded issued/paid invoice and printable/downloadable views          | Draft/issue lifecycle, identity/price snapshots, contact/payment instructions, consistent due calendar date, credits, PDF and numbering                     | No accepted live tax/VAT, cancellation or refund policy; sample payment is not actual bank evidence                                                                                 |
| Payments            | Fictional settled transaction in admin/customer history              | Manual review plus bKash and SSLCOMMERZ sandbox adapters, authenticated idempotent callbacks, reconciliation                                                | Gateway adapters are disabled in the demo; no credentialed provider acceptance; redirects never prove payment                                                                       |
| Services            | Fictional active hosting service                                     | Separate service lifecycle and evidence-based provisioning states                                                                                           | A paid invoice never proves provisioning; no real hosting system is contacted                                                                                                       |
| Hosting panels      | No provider process or credential                                    | Fake and cPanel/WHM adapters, explicit website/email preservation, idempotent creation, five safe attempts and uncertain-result hold across submission keys | Real hosting is disabled in demo and normal staging posture; a prior controlled trial is not production acceptance                                                                  |
| Domain registration | Not seeded; no registrar worker in the one-command demo              | Mocked register-once workflow, StarGate/UK2 contracts, registrar-account ownership verification and existing-domain linking/billing                         | Registrar networking stays off; initial existing-domain billing neither extends expiry nor establishes renewal/transfer; [evaluation guide](LOGICBOXES_REGISTRAR_IMPLEMENTATION.md) |
| Email               | No worker or SMTP process                                            | Queued SMTP/preview delivery, admin verification resend, client-scoped email history and append-only attempts                                               | Selected operator-authorized staging messages reached SMTP; demo sends none and broad deliverability is not certified                                                               |
| Notifications       | No delivery worker or external provider                              | Admin/Client notification lists/history, email alerts and important WhatsApp alerts including new/overdue invoices                                          | Delivery defaults disabled; staging WhatsApp/new alert delivery remains off; no public WhatsApp delivery acceptance                                                                 |
| Renewals            | Seed records may be inspected; scheduler is absent                   | Idempotent daily scheduler, invoices/reminders, conservative suspension/reactivation                                                                        | Not exercised in demo; no automatic permanent termination exists                                                                                                                    |
| Support             | Fictional ownership-bound ticket and messages                        | Customer/admin plain-text ticket workflow and reply notifications                                                                                           | No attachments, departments, or SLA engine                                                                                                                                          |
| Dashboard/reports   | Admin dashboard plus an authenticated customer account summary       | Transaction-sourced metrics, bounded audited CSV reports, business-timezone periods, ownership-bound portal data                                            | Some administrator summary values depend on the selected reporting period                                                                                                           |
| Operations          | Loopback health/readiness through the gateway                        | Structured logs, metrics, encrypted backup/recovery scripts, production Compose/runbooks                                                                    | Demo is not an operations drill; monitoring, off-site backup, alerting, DNS/TLS, and operator gates remain unaccepted                                                               |

## Explicit non-goals

The initial product is for one web-hosting business per installation. Multi-tenant
reseller operation, marketplaces, affiliate systems, worldwide tax handling,
multi-currency accounting, and automatic permanent hosting termination are outside
the authorized scope.

## Production status

Command 158 strengthened recovery with all 56 tables, exact trusted release migrations
and full row-content comparison. Eight inventory/checksum cases and encrypted recovery
acceptance passed locally. An independently stored encrypted snapshot was retrieved and
restored into a network-isolated temporary database in 14 seconds, matching 56 tables
and 39 migrations. This is database-only evidence; immutable recurring backup, secret
escrow, full application recovery, incident routing, host hardening and multi-service
capacity acceptance remain open. Installed staging still uses the earlier bounded
domain list. Command 160 adds a complete paginated administrator inventory in source,
with literal client/domain search, state/origin filters, full counts and lightweight
summaries. Fictional API acceptance covers 200 clients, 600 services and 600 domains
with two administrators; this is not a production capacity limit or deployment.
See [the inventory contract](DOMAIN_INVENTORY.md).
See the [current readiness review](PRODUCTION_READINESS_REVIEW.md).

Command 159 adds reviewed build-tool dependency fixes and an enforced deepmerge
source patch with 28 installed security/compatibility cases. The raw full audit
retains two documented version-based warnings and no high findings; the production
audit is clear. See [the remediation register](TOOLCHAIN_SECURITY_REMEDIATION.md).
No staging deployment or production approval follows from source validation.

Command 156 passed 62 related fictional API/database cases for combined orders,
sample-payment review, actual fake hosting success, temporary retry, uncertain
creation and the attempt bound. Command 157 deployed the validated guard to
operator-controlled staging after fresh verified backups. Installed guard smoke,
public/authenticated read-only inspection and preservation checks passed; see
[the command reports](PROGRESS.md) and [deployment record](STAGING_DEPLOYMENT.md).
SMTP stays active there while payment, real hosting, registrar and WhatsApp providers
remain disabled. Staging is not a public test target, and this document authorizes
no provider activation, message, financial operation or deployment.

Production remains **NO-GO**. Real data, credentials, providers, email delivery,
payment callbacks, hosting mutations, DNS, deployment targets, and external systems
remain outside this demo. The immutable `v0.1.0-alpha.1` source prerelease is an
evaluation artifact, not a live-use recommendation.

For the evaluator path, see [`SAFE_EVALUATION_DEMO.md`](SAFE_EVALUATION_DEMO.md).
For detailed gates and residual risks, see
[`RELEASE_CHECKLIST.md`](RELEASE_CHECKLIST.md) and
[`PRODUCTION_DEPLOYMENT.md`](PRODUCTION_DEPLOYMENT.md).
