# Staging Deployment

## Command 161 recovery and global domain inventory release (2026-11-01)

- **Status:** Deployed and accepted `e2c207a72511b13578dba84e63979ea794449455`,
  containing validated Commands 158–160: complete recovery checks, reviewed runtime/
  build-tool dependency mitigations and the complete administrator domain inventory.
  Deployment/postflight and installed/Speed read-only acceptance pass. No schema,
  migration, business-record, provider-setting or customer-message change.
- **Provenance:** Exact-release [CI](https://github.com/ebit101/webhost-billing/actions/runs/41242546045)
  and [CodeQL](https://github.com/ebit101/webhost-billing/actions/runs/41242546113)
  pass; PR 84 dependency review passed. Four canonical Node 24/pnpm 11.22.0 frozen
  image builds passed serially. Installed API Node is 24.22.2. Source archive SHA-256:
  `5347fbedd731a91e6d27a39bb9821099d9e54fff930486d5b55fcfcd06b9c50f`.
- **Backup and rollback:** Fresh preflight `20261101T025521Z.dump.gpg` passed the
  validated full 56-table/archive and 39-migration source checks before builds.
  The canonical script verified another encrypted archive before stopping writers:
  `/srv/webhost-billing-staging/backups/webhost-billing-webhost_billing_staging-20261101T030919Z.dump.gpg`.
  Its checksum, OpenPGP integrity, archive structure and full required-table inventory
  pass the installed updated verifier. Cutover archive SHA-256:
  `3e4d2a70ad10313075b79e1b6fccfd494629d887f1fbfc017958465e047017fc`.
  Rollback inventory:
  `/srv/webhost-billing-staging/rollback/release-20261101T030918Z-e2c207a72511b13578dba84e63979ea794449455/`.
  No migration is pending; 39 are complete and none unfinished. No restore or prune.
- **Preservation:** All 37 full-row business/email/outbox/notification fingerprints
  match through browser acceptance, without exclusions. Environment apart from
  IMAGE_TAG, mode 0600, installed/served logo, Office environment, infrastructure
  and unrelated container IDs match. Seven services are healthy, four application
  containers use the release tag with zero restarts and exactly one scheduler runs.
  SMTP stays active; payment, real WHM, registrar accounts/networking and WhatsApp/
  new-notification delivery remain disabled. Only application containers were replaced.
- **Acceptance:** The installed compiled read model pages both actual domains,
  matches full counts/order, finds the older record, validates client/status/origin
  filters and invoice summaries, and rejects restricted in-process roles and invalid
  filters. Zero provider HTTP calls, sessions created or external actions. This does
  not substitute for a credentialed HTTP staff/customer or provider trial. Public
  health/readiness/origin/logo pass; anonymous protected routes redirect or deny,
  including inventory 401. Eleven signed-in Speed checks cover pagination/history,
  search/reload, filters/empty counts, clear/scope retention, invalid scope and
  client-owned detail navigation. Full layout visually inspected; temporary tab
  closed and original authenticated dashboard refreshed. No save or operational action.
- **Corrections and limits:** A private preflight driver initially expected API-only
  payment flags on workers. Component-specific checks corrected that expectation
  without modifying configuration or replacing the baseline. Registry warnings
  were non-failing; no build or cutover repeat. Known raw-version dependency warnings
  remain documented; Dependabot's legacy-minimatch update attempts could not resolve
  an update. Exact-release validation and production audit pass. Protected evidence:
  `/srv/webhost-billing-staging/acceptance/command161-release-20261101/`.
  Same-host backup verification and two-domain staging smoke do not establish
  independent off-site recovery, live-provider acceptance or production capacity.
  Production remains NO-GO. Report-only delivery needs no deployment.

## Command 157 hosting retry guard release (2026-10-31)

- **Status:** Deployed `6e5856facabdfa336fff697dae622b63f6610cdd`, containing
  Command 156's account-creation retry-history guard. New submission keys cannot
  bypass the five-attempt bound or uncertain-result hold. Deployment/postflight
  exit 0 and signed-in Speed read-only acceptance passed. No staging business
  record, customer message or provider operation was created.
- **Source gates:** Normal merge of [PR 79](https://github.com/ebit101/webhost-billing/pull/79),
  with independent exact-release [CI](https://github.com/ebit101/webhost-billing/actions/runs/41180243156)
  and [CodeQL](https://github.com/ebit101/webhost-billing/actions/runs/41180243246)
  success. PR dependency review passed; main's PR-only job was correctly skipped.
  The only application-code difference from prior installed `289d00e8a15b6117c82fb2eb3cd7b3941456c535`
  is the hosting-panel service guard. No dependency, schema, migration, asset or
  deployment configuration changed. Four canonical Node 24/pnpm 11.22.0 frozen
  image builds passed; installed API runtime is Node 24.22.2. Archive SHA-256:
  `4b269f5a75a0cd36a327c5415b7ccc63b006b5e5030d580c0eb83b0b89cf0bb0`.
- **Backups and migration:** Fresh preflight archive
  `20261031T072717Z.dump.gpg` passed. Immediately before stopping writers, the
  canonical script verified a second fresh encrypted archive:
  `/srv/webhost-billing-staging/backups/webhost-billing-webhost_billing_staging-20261031T075546Z.dump.gpg`.
  SHA-256: `5d2f7ed7158ed5a187121c1aa5c7dff44d94fdf906b51ab9969bf6bb2f003659`.
  Checksum, OpenPGP integrity, archive structure and required tables passed;
  same-host verification is not an off-site restore drill. No migration was
  pending: 39 complete and none unfinished. Rollback inventory:
  `/srv/webhost-billing-staging/rollback/release-20261031T075545Z-6e5856facabdfa336fff697dae622b63f6610cdd/`.
  Prior releases/images remain available; no prune or restore was performed.
- **Preservation:** All 37 full-row business/email/outbox/notification table
  fingerprints match without exclusions. The draft stays unissued/unpaid,
  prior paid trial history is intact and the pending combined invoice remains
  Unpaid, balance BDT 3,090, with no payment or service. Existing-domain ownership,
  encrypted evidence, initial billing association and preservation/dispatch choices
  are unchanged. Environment apart from IMAGE_TAG, mode 0600, installed/served
  logo and Office environment match. Seven services are healthy, four application
  containers use the target tag with zero restarts and exactly one scheduler runs.
  Infrastructure/unrelated container IDs match. SMTP remains active; payment,
  real WHM, live registrar accounts/networking and WhatsApp/new notifications remain off.
- **Acceptance:** Ten installed guard cases and actual in-memory fake-adapter
  replay passed without Nest/Prisma bootstrap, persistent writes, live-provider
  calls or email delivery. These checks are separate from Command 156's 62 passing
  API/database lifecycle cases. Public HTTPS, health/readiness/origin and logo
  passed; anonymous protected pages redirect and API reads plus sentinel creation
  reject with 401. In Speed, service/operation tables and a fictional service's
  read-only review load correctly. The pending combined invoice shows its two
  original lines, zero paid and the correct Unpaid total/balance. The service
  screenshot was visually reviewed. No operational action was clicked; only the
  temporary inspection tab was closed.
- **Evidence and limits:** Protected deployment/postflight evidence remains at
  `/srv/webhost-billing-staging/acceptance/command157-release-20261031/`.
  Slow registry downloads were non-failing; no repeat cutover or repair was needed.
  Private helpers, logs, credentials, identities and backups stay outside Git.
  Report-only delivery needs no redeployment. Actual bank credit and live
  WHM/registrar behavior are not validated by this release. Future payment and
  fulfillment require their own authorization and evidence; no DNS/mail/contact
  change, registrar purchase or customer message was submitted.

## Command 150 combined administrator order release (2026-10-30)

- **Status:** Deployed `289d00e8a15b6117c82fb2eb3cd7b3941456c535`, containing
  Command 149's combined hosting/domain billing, default-off registration choice,
  verified existing-domain association and separate payment/dispatch gates.
  Automated postflight and authenticated Speed inspection passed. No new order,
  invoice, payment, domain link, message or provider action was created.
- **Source gates:** Normal merge of [PR 72](https://github.com/ebit101/webhost-billing/pull/72),
  with independent exact-release [CI](https://github.com/ebit101/webhost-billing/actions/runs/41091097339)
  and [CodeQL](https://github.com/ebit101/webhost-billing/actions/runs/41091097510)
  success. PR dependency review passed; main's PR-only job was correctly skipped.
  Four canonical Node 24/pnpm 11.22.0 frozen image builds passed. Installed API
  runtime is Node 24.22.2. Source archive SHA-256:
  `782ff2a76d43c92a8426d8c27e7684224e768f425eed87479134015ea4409bba`.
- **Backup and migration:** Fresh preflight archive
  `20261030T164847Z.dump.gpg` passed. The canonical script verified another fresh
  encrypted archive immediately before stopping application writers:
  `/srv/webhost-billing-staging/backups/webhost-billing-webhost_billing_staging-20261030T170316Z.dump.gpg`.
  SHA-256: `ad54051b424cd2b356357f1ef5ca8022ef31a106324e0ed700fc75a553cc5353`.
  Checksum, OpenPGP integrity, archive structure and required tables passed;
  same-host verification is not an off-site restore drill. Migration 39 applied,
  with 39 complete and none unfinished. Exact source/applied checksum, three
  enabled guards, four validated restrictive foreign keys, one deferred binding
  trigger and four invoker functions passed. No legacy order-item backfill or
  initial-domain billing association exists. Rollback inventory:
  `/srv/webhost-billing-staging/rollback/release-20261030T170315Z-289d00e8a15b6117c82fb2eb3cd7b3941456c535/`.
- **Preservation:** All 36 full-row business/email/outbox/notification table
  fingerprints match through acceptance, including the paid trial and saved
  domain ownership evidence. The fictional draft stays unissued and unpaid.
  Environment apart from IMAGE_TAG, mode 0600, installed/served logo and Office
  environment are preserved. Seven services are healthy, application restarts
  are zero and exactly one scheduler runs. Infrastructure and unrelated container
  IDs match. SMTP remains active; payment gateways, real WHM connections, live
  registrar accounts/networking and WhatsApp/new notification delivery remain off.
- **Smoke tests:** Public health/readiness/origin/logo checks passed. Anonymous
  protected routes reject or redirect; fictional customer administrator order,
  domain-options and ownership-link requests return 403. Customer domain intent
  and preservation-policy injection return 400. Signed-in login redirects to the
  portal, and sign-out invalidates the session. Speed form inspection passed
  default-off dispatch, hosting/setup breakdown, missing catalogue-price blocking,
  registration contact/consent requirements, disabled ownership linking,
  nested Escape/focus restoration, retained draft and full-reload reset.
  Historical order/invoice links, client context and saved domain table/details
  load read-only. Screenshot inspected; returned to dashboard without submission.
- **Evidence and limits:** Deployment/postflight exit 0 and repeated preservation
  checks passed under
  `/srv/webhost-billing-staging/acceptance/command150-release-20261030/`.
  No repeat cutover or application repair was needed. Private helpers/payloads,
  logs and backups stay outside Git; report delivery does not require deployment.
  No annual domain catalogue price is configured, so full new combined billing
  remains unexercised on staging. Do not adopt or recharge earlier manual trial
  invoices. Future combined associations require a compatible rollback plan;
  earlier application versions cannot fulfill them. Catalogue changes, orders
  and provider actions require their own authorization.

## Command 147 hosting preservation release (2026-10-30)

- **Status:** Deployed `9b912841f90fbe681da3a62acf24d3838a64da46`, containing
  Command 146's explicit administrator website/email-preservation choice,
  immutable provisioning snapshots and guarded remote-mail verification.
  Automated acceptance and authenticated Speed inspection passed. No order,
  account, provider activation, email or DNS/mail change was performed.
- **Source gates:** Normal merge of [PR 69](https://github.com/ebit101/webhost-billing/pull/69),
  with independent exact-release [CI](https://github.com/ebit101/webhost-billing/actions/runs/41021729534)
  and [CodeQL](https://github.com/ebit101/webhost-billing/actions/runs/41021729707)
  success. PR dependency review passed; main's PR-only job was correctly skipped.
  Source archive SHA-256:
  `2ea045d3004d67bd0f6ead1ad1a48aed1557df8f0963597a9745f6f103705746`.
- **Backup and migration:** Verified fresh preflight archive
  `20261030T080835Z.dump.gpg`. After four Node 24/pnpm 11.22.0 frozen image builds,
  the canonical script verified the fresh cutover archive before stopping writers:
  `/srv/webhost-billing-staging/backups/webhost-billing-webhost_billing_staging-20261030T082427Z.dump.gpg`.
  SHA-256: `3fc6d876bf3383204d60610969cfdd51e4cc81277e26c3595792e134601ea3b4`.
  Checksum, OpenPGP integrity, archive structure and required tables passed;
  same-host verification is not an off-site restore drill. Migration 38 applied:
  38 complete, none unfinished. Read-only checks verified its exact source checksum,
  two validated constraints, two enabled snapshot guards and invoker function.
  Rollback inventory:
  `/srv/webhost-billing-staging/rollback/release-20261030T082425Z-9b912841f90fbe681da3a62acf24d3838a64da46/`.
- **Preservation:** All 32 full-row business-table fingerprints and five
  supplemental email/outbox fingerprints match after acceptance. No legacy
  provisioning snapshot was backfilled. Environment contents apart from IMAGE_TAG,
  mode 0600 and installed/HTTPS-served logo match. Seven services are healthy,
  application restarts are zero, exactly one scheduler runs, and infrastructure
  plus unrelated container IDs are unchanged. Runtime Node is 24.22.2. SMTP is
  active; payment flags, registrar networking, real WHM servers/live registrar
  accounts and notification/WhatsApp delivery remain disabled. The fictional draft
  is still unissued and unpaid; Office environment is unchanged.
- **Smoke tests:** Public/readiness/origin/logo checks passed; anonymous protected
  pages redirect to sign-in and APIs deny access. A fictional customer received
  403 for administrator order creation/linking and 400 for preservation-policy
  injection into customer checkout, with no order created. Signed-in login redirects
  explicitly to the portal, and sign-out invalidates the session. In authenticated
  Speed, the compact creation dialog shows an unchecked preservation choice and
  its limits. Selection, Escape/focus restoration, reopening retained draft and
  full-reload reset passed. Existing fictional order/service reviews load as Standard
  hosting. Closed without submitting and returned to the dashboard; screenshot inspected.
- **Evidence and limits:** Deployment/postflight exit 0 and final preservation
  passed under `/srv/webhost-billing-staging/acceptance/command147-release-20261030/`.
  No application repair or repeat cutover was needed. Helpers, snapshots and secrets
  stay outside Git; this report does not require redeployment. No real preserved-mode
  order, remote-mail read or account creation was attempted. Fresh exact-domain,
  alias/zone/cluster, public DNS/mail and settlement checks remain before a separately
  authorized hosting trial. ADR-146's no-overwrite/remote-mail request is not proof
  of unchanged authoritative DNS across a live cluster.

## Command 144 existing-domain linking release (2026-10-30)

- **Status:** Deployed Command 143 at `115512304107ed1defed0d7770739a3a0d85aac2`.
  Automated postflight and authenticated Speed acceptance passed. No real domain
  was linked and no registration, purchase, provisioning or management write ran.
- **Gates and build:** The normal merge of [PR 66](https://github.com/ebit101/webhost-billing/pull/66)
  independently passed exact-release [CI](https://github.com/ebit101/webhost-billing/actions/runs/40832413439)
  and [CodeQL](https://github.com/ebit101/webhost-billing/actions/runs/40832413638).
  Canonical Node 24/pnpm 11.22.0 frozen builds passed for all four images. Runtime
  API is Node 24.22.2. Source archive SHA-256:
  `f2def44d8fa96cdffcb1ad66ebbad5befb228d1ee74696de63f7ea75dff88fcb`.
- **Verified backup:** Fresh preflight archive `20261029T192711Z.dump.gpg` passed.
  The release script then verified a second encrypted archive before stopping writers:
  `/srv/webhost-billing-staging/backups/webhost-billing-webhost_billing_staging-20261029T194028Z.dump.gpg`.
  SHA-256: `69f0f4b43b4c93beb69df68fa9fe175516f4186644e0a3366a98853b639b2f5e`.
  Checksum, OpenPGP integrity, PostgreSQL archive structure and required tables
  passed; this is same-host verification, not an off-site restore drill. Rollback:
  `/srv/webhost-billing-staging/rollback/release-20261029T194027Z-115512304107ed1defed0d7770739a3a0d85aac2/`.
- **Migration and preservation:** Migration 37 applied; 37 complete and none
  unfinished. All seven services are healthy, application restarts are zero, and
  one scheduler runs. PostgreSQL/Redis/Mailpit and unrelated container IDs are
  unchanged. All 32 business-table fingerprints match, projecting domain rows
  without only the four added metadata columns; separate checks found zero
  existing-origin links, populated link fields or missing billing references.
  Environment contents apart from IMAGE_TAG, mode 0600 and installed/served logo
  hashes are unchanged. Office environment is preserved. The fictional draft is
  still unissued and unpaid. SMTP remains active; payment, hosting, registrar and
  WhatsApp remain disabled.
- **Smoke tests:** Public/readiness routes passed, anonymous administrator pages
  redirected to sign-in and protected APIs returned 401. Linking returned 401
  anonymously and 403 for an ordinary fictional customer. Normal customer sign-in,
  explicit portal streaming redirect and sign-out/session rejection passed.
  In authenticated Speed, the client Domains table/context and linking dialog
  loaded. Matching fictional inputs plus the disabled registrar kept submission
  disabled with the expected notice. Escape/focus restoration and draft retention
  passed. Closed without submission and reloaded to discard transient input.
- **Evidence and limits:** Runner/postflight exit 0 and final preservation passed
  under `/srv/webhost-billing-staging/acceptance/command144-release-20261030/`.
  Initial operator SQL quoting evidence is retained separately; corrected preflight
  passed before launch. Helpers, backups and payloads remain outside Git. Real
  ownership and provider writes remain separately authorized acceptance. Earlier
  releases cannot read actual existing links with null registration billing; once
  links exist, plan compatible rollback without deleting history. No next command
  or provider activation is authorized.

## Command 142 client profile tab release (2026-10-29)

- **Status:** Deployed `9d1bcba6ed37fa87e9ef1b46124db0a1dc162c32`, including Command
  141's Orders, Invoices, Payments, Support and Email history client-profile tabs.
  Automated postflight and customer authorization passed. Owner-assisted visual
  acceptance passed; all live providers except the preserved SMTP remain off.
- **Release gates:** Initial merge `99c151d` was held after its main CI exposed a
  dialog-opening race in an existing order test (708/709 web tests passed). Wait
  for the accessible dialog before querying its disabled submit button. This
  changes no application behavior or test timeout. [PR 64](https://github.com/ebit101/webhost-billing/pull/64)
  passed full CI, CodeQL and dependency review; the identical-tree merge independently
  passed [CI](https://github.com/ebit101/webhost-billing/actions/runs/40816322529)
  and [CodeQL](https://github.com/ebit101/webhost-billing/actions/runs/40816322523).
  No required check was bypassed. Office `.env` is unchanged.
- **Backup and cutover:** Verified preflight backup `20261029T035438Z.dump.gpg`;
  the canonical release script verified a second encrypted archive before stopping
  application writers:
  `/srv/webhost-billing-staging/backups/webhost-billing-webhost_billing_staging-20261029T044955Z.dump.gpg`.
  SHA-256: `c354d78c2622d6e0719eba741a23f8e092374908da7ad1cb80d0fa0c79dab2df`.
  Checksum, OpenPGP integrity, archive structure and required tables passed. This
  is same-host backup verification, not an off-site restore drill. Rollback inventory:
  `/srv/webhost-billing-staging/rollback/release-20261029T044954Z-9d1bcba6ed37fa87e9ef1b46124db0a1dc162c32/`.
- **Builds:** Node 24 / pinned pnpm 11.22.0 frozen builds completed for migration,
  API, web and worker images. Registry retries recovered. Runtime API is Node
  24.22.2. Git archive SHA-256:
  `517d9f23765a664a05df62a480eca65e186e78d9191df763899b67e18afd5386`.
- **Preservation:** Only API/web/worker/scheduler were recreated. All seven services
  are healthy, application restart counts are zero, and exactly one scheduler runs.
  PostgreSQL/Redis/Mailpit and unrelated running-container IDs are unchanged. All
  32 compared table fingerprints, non-image-tag environment contents/mode `0600`,
  installation logo and served HTTPS logo hashes match preflight. Thirty-six
  migrations remain complete, none unfinished; no new migration was needed. SMTP
  is active, real hosting and registrar accounts disabled, payment/registrar flags
  false and notification/WhatsApp delivery disabled. The fictional `INV-001004`
  remains Draft, unissued and paid zero.
- **Automated smoke:** Public and readiness routes returned 200, anonymous
  administrator pages including five new tab URLs redirected to `/admin`, and
  protected APIs returned 401. API-origin validation passed. The existing fictional
  customer's four owned resource families were readable; wrong-client scopes
  returned 404, invalid UUIDs 400, and administrator lists/email history 403.
  Sign-out invalidated the session. Signed-in `/login` used a valid HTTP 200
  streaming redirect with explicit portal refresh meta/digest; the corrected
  operator check validates that target rather than requiring only HTTP 307.
  Original strict-helper evidence is retained; no application change or second
  cutover was needed. No email or business mutation was submitted by acceptance.
- **Visual acceptance:** Owner-prepared Speed was authenticated. A fresh Chrome
  extension tab displayed the deployed nine-tab navigation, retained fictional
  client, populated Orders table and exact-reference search. Subsequent input
  timed out before dispatch; the owner subsequently confirmed all five tabs retain
  client identity and active navigation with compact tables/empty states. Orders
  search/clear and opening/closing a read-only record dialog passed. These are
  owner-reported Speed-profile results, not automated browser results. No unsupported native URL-policy
  workaround, MFA bypass or credential alteration was used.
- **Evidence:** Guarded runner and postflight exit 0 under
  `/srv/webhost-billing-staging/acceptance/command142-release-20261029/`. Post-smoke
  preservation after the owner's walkthrough again matched all 32 fingerprints, environment, logo, provider
  posture and container inventory. Protected helpers, payloads and backups remain
  outside Git. Existing-domain linking, real provisioning and provider activation
  remain separately authorized work.

## Command 140 staging release (2026-10-29)

- **Status:** Deployed `b13d72f0c8ebf999a6c54ddae8497f384120765c`. Corrected automated
  postflight and installed-adapter reads passed. Owner-assisted name/account/client
  workspace and invoice contact/instructions/due-date acceptance passed.
- **Source gates:** [PR 61](https://github.com/ebit101/webhost-billing/pull/61)
  passed full CI, CodeQL and dependency review, including the actual production web
  container. Its merge has the identical checked tree and independently passed
  [exact-release CI](https://github.com/ebit101/webhost-billing/actions/runs/40743282031)
  and [CodeQL](https://github.com/ebit101/webhost-billing/actions/runs/40743282019).
  Office main fast-forwarded cleanly and its `.env` hash is unchanged. The Git
  archive SHA-256 is
  `e788b53f1c75c2b8a932bf991c836d855416837e5800954f61568611b14f8e40`.
- **Fresh preflight and backup:** Seven healthy services, active SMTP, disabled
  payment/registrar networking and real accounts/servers, disabled notification/
  WhatsApp delivery, unchanged fictional Draft invoice and 29 business-table
  fingerprints were recorded separately. Verified
  `/srv/webhost-billing-staging/backups/webhost-billing-webhost_billing_staging-20261028T182334Z.dump.gpg`
  for checksum, OpenPGP integrity, PostgreSQL archive structure and required tables.
  This is same-host archive verification, not a completed off-site restore drill.
- **Preserved evidence:** The failed first attempt remains under
  `acceptance/command140-release-20261028/`. Retry logs and baselines are under
  `/srv/webhost-billing-staging/acceptance/command140-release-20261029-retry1/`.
  The unchanged repository release script verified another fresh backup before
  migration/cutover. No new migration exists in this release.
- **Administrator name:** A read-only check found the owner's saved name present
  and different from the email, without exposing either value or changing data.
  The owner screenshot still showed the old release before cutover. Browser control
  was stopped by physical Escape; authenticated UI results are owner-assisted,
  separate from server and fictional hosted-CI evidence. The owner confirmed the
  sidebar name and compact account after the actual release, and also confirmed
  the four-tab client workspace and tables.
- **Cutover:** Verified
  `/srv/webhost-billing-staging/backups/webhost-billing-webhost_billing_staging-20261028T184157Z.dump.gpg`
  for checksum, OpenPGP integrity, PostgreSQL archive structure and required tables
  before stopping application writers. Rollback inventory is
  `/srv/webhost-billing-staging/rollback/release-20261028T184156Z-b13d72f0c8ebf999a6c54ddae8497f384120765c/`.
  Thirty-six migrations remain complete, none unfinished and none newly applied.
  Only API/web/worker/scheduler were recreated; runtime API is Node 24.22.1.
- **Postflight:** Seven healthy services, zero application restart counts and one
  scheduler. Infrastructure and unrelated running-container IDs, all 29 compared
  business-table fingerprints, non-image-tag environment/mode and installation/
  HTTPS-served logo hashes match preflight. SMTP is active; real hosting and registrar
  accounts are disabled, payment/registrar flags false and notification/WhatsApp
  delivery disabled. The fictional invoice remains Draft, unissued and paid zero.
  Store/account/health/readiness/logo routes returned 200; protected API routes 401;
  anonymous administrator pages redirected 307 to `/admin`; browser API origin passed.
- **Operator check correction:** The canonical deployment completed healthy. Its
  auxiliary postflight originally expected 200 on anonymous protected frontend pages,
  exited 1 on their correct 307 redirect, and stopped its remaining assertions.
  Inspected the exact responses, corrected only that expectation to a strict 307
  sign-in target and reran complete postflight successfully. Original `deployment.log`,
  `deployment.exit`, operator script and first postflight snapshots are retained;
  `postflight-corrected.log` and `postflight-corrected.exit` record the successful
  corrected check. No application change or redeployment was needed for this.
- **Installed registrar compatibility:** The newly installed live adapter passed
  the two GET-only calls that exposed the original parser failures. Availability
  accepted the ordinary `.com` class key and returned the existing domain unavailable
  for registration. Its 75,510-byte/5,667-node cost catalogue parsed losslessly into
  exact minor units. Both HTTP statuses were 200; account and application networking
  remain disabled. No registration, provisioning, purchase, nameserver/contact change,
  local domain/client link or message was submitted. Native cost currency remains
  unverified. Raw pricing/contact data and credentials stay outside Git.
- **Owner acceptance and limit:** The owner confirmed the actual administrator name,
  compact account and four-tab client workspace in Speed, then confirmed the supplied
  phone/country/manual instructions and consistent editor/document due calendar date
  on the fictional draft. Rendered-draft acceptance is closed; no invoice was issued,
  paid or used for a live staging PDF test. The broader WHMCS billing/support tab
  request and existing-domain linking are future bounded work, not features added
  during this deployment.

## Command 140 first attempt stopped before cutover (2026-10-28)

- **Status:** The first image-build attempt failed before cutover. The existing
  `ed7a5941bd0b4287aaaacf5a4fb256c9879ce4ff` release and all seven services remain
  healthy, with no writer stop, migration, environment/image-tag change or switch.
  The attempted commit was `07c0f05e81dceb53c1ae73b11ddde665227fb589`, containing the
  pending Command 132 invoice contact/instructions/date corrections, Command 138
  administrator name/compact account page, Command 139 client workspace and
  Command 140 ordinary-domain registrar compatibility fix. Premium domains remain
  unsupported. Existing-domain adoption is outside this release.
- **Source delivery:** [PR 60](https://github.com/ebit101/webhost-billing/pull/60)
  passed full CI, CodeQL and dependency review at
  `49c3d2efba295f8b76534361e781d4050b89ecda` and merged normally. Office main
  fast-forwarded without reset, cleaning, stashing or force. Its tree matched
  the checked PR source. Exact merge-commit
  [CI](https://github.com/ebit101/webhost-billing/actions/runs/40734728435) and
  [CodeQL](https://github.com/ebit101/webhost-billing/actions/runs/40734728381)
  passed before deployment. Command 127 remains an ancestor. The uploaded Git
  archive SHA-256 is
  `bfb9a11a492750167321a4140c1ce1e600b29318fbaa258efd0a880dd78fce5a`.
  The Office does not have `gh`; the operator wrapper used GitHub's check-runs
  API with the same exact-SHA/name/status/conclusion requirements before invoking
  the unchanged repository release script. No required check was bypassed.
- **Container-only failure and correction:** The web image compiled application
  code, then Next's TypeScript check failed because two `.test.tsx` files imported
  `src/test/client-record-fixtures.ts`, while `.dockerignore` excluded every `test`
  directory. Full checkout CI had passed because that fixture was present there.
  The packaging correction excludes `.test.ts` and `.test.tsx` from production
  context, consistent with the existing `.spec.ts`/test-directory exclusions.
  Complete-checkout tests and type checks retain all fixtures and test cases.
  CI now also builds the actual production web container to cover this missing
  validation boundary. The corrected Linux production web image built successfully
  locally, including compilation, TypeScript checks, static generation and final
  runtime-image export. The two focused client-workspace files passed 18/18 tests;
  workflow YAML parsing, formatting and whitespace checks passed. Reviewed source
  delivery and the newly required hosted container gate must pass before retry.
- **Pre-build backups:** Verified encrypted PostgreSQL archives at
  `/srv/webhost-billing-staging/backups/webhost-billing-webhost_billing_staging-20261028T165019Z.dump.gpg`
  and
  `/srv/webhost-billing-staging/backups/webhost-billing-webhost_billing_staging-20261028T171706Z.dump.gpg`.
  Verification covered checksum, OpenPGP integrity, PostgreSQL custom archive
  structure and required tables. It was not an off-site restore drill. The normal
  release script takes and verifies a further backup before migration/cutover.
- **Preflight:** Seven services were healthy. Saved the prior release, non-image-tag
  environment hash, owner-logo hash, service/container inventory and 29 business-table
  fingerprints in the protected acceptance directory. SMTP is active; payment flags,
  live registrar networking/accounts, real WHM servers and notification/WhatsApp
  delivery remain disabled. The fictional `INV-001004` remains Draft, unissued,
  unpaid and unchanged. No migration or Nginx/source deployment configuration differs
  from the previous staging release.
- **Real provider reads:** The owner's protected Rainbow connection test succeeded.
  A separate TLS-validated read using the existing application WHM client confirmed
  the exact `app-pkg` package, without creating an account or enabling the server.
  GET-only registrar availability/pricing requests returned HTTP 200 and exposed the
  parser incompatibilities. Further GET-only order-ID/details reads verified the
  owner-selected existing domain, active provider state, immediate-reseller ownership,
  contact references and nameserver fields. No local client/domain mapping, signup,
  registration, renewal, transfer, nameserver/contact update or other mutation was
  submitted. Native cost currency and actual mutation capabilities remain unverified.
- **Evidence:** Protected server evidence is under
  `/srv/webhost-billing-staging/acceptance/command140-release-20261028/`, with
  separate pre-build backup evidence under `acceptance/deploy-preflight-*`.
  Ignored operator helpers and redacted observations are in local `release-artifacts/`.
  No credential, provider price/contact payload, owner payment destination or real
  customer record is committed.

The earlier entries below describe their historical release states. The failed
attempt and logs are retained. No cutover or authenticated display acceptance for
these pending changes is claimed yet.

## Local invoice correction prepared, not deployed (2026-10-28, Command 132)

Local source now renders saved issuer phone/country, current manual instructions
in web/print/PDF documents and the editor's UTC due calendar day in invoice lists
and summaries. This does **not** close the earlier staging display findings: the
staging release is still `ed7a5941bd0b4287aaaacf5a4fb256c9879ce4ff`.
Read-only checks confirm unchanged staging environment/mode and logo, active SMTP,
disabled payment/registrar flags and real WHM servers, and disabled notification/
WhatsApp delivery. `INV-001004` is still Draft, unissued and paid zero. No staging
save, email, migration, restart, deployment or provider operation was performed.
See the local validation and constraints in the progress report. Separately
authorize a backed-up staging deployment and bounded invoice acceptance before
claiming the display issues are fixed on staging.

## Fictional billing draft acceptance (2026-10-28, Command 132)

- Created exactly one administrator draft through the signed-in Speed profile:
  `INV-001004`, for the existing fictional customer. One explicitly fictional
  preview line totals BDT 1.00. Status remains `DRAFT`, paid amount zero,
  issue/payment/cancellation timestamps absent, and no order/service is linked.
  Do not issue, pay, cancel or send this acceptance record.
- The rendered draft shows the approved business name, street/city address and
  billing email. Its complete business identity snapshot matches the approved
  private payload, including phone and country. The saved manual bank/bKash
  instructions and manual WhatsApp proof requirements remain exact and unchanged.
- **Display acceptance remains incomplete:** the administrator invoice document
  does not render issuer phone, issuer country or payment instructions. Existing
  source puts manual instructions in the customer payment section, outside the
  shared invoice document. Customer-session, print and PDF delivery were not
  exercised, and no full invoice/payment-instruction display pass is claimed.
  Also, the draft editor shows October 29 while the document/ledger show October 30. Source converts the input to 23:59:59 UTC and renders it in browser local
  time. Do not alter staging code or issue an invoice to investigate this.
- Exact read-only checks confirm one new invoice/item, preserved historical
  invoices/items, 29 unchanged business/email/outbox table fingerprints and every
  setting value preserved except the expected numbering increment. No email,
  outbox event, payment, order or provider operation was created. SMTP stays active;
  payment/registrar switches false, WHM servers disabled and notification/WhatsApp
  delivery disabled. Environment, logo, release and container IDs are unchanged;
  all seven services are healthy and API health/readiness return 200.
- Protected evidence is under
  `/srv/webhost-billing-staging/acceptance/command132-draft-20261028/`.
  The reviewed draft screenshot/helpers stay ignored locally. No deploy, migration,
  restart or provider activation occurred. Next: separately authorize local fixes
  for invoice identity/instruction rendering and consistent due-date presentation,
  with regression validation and no deployment.

## Owner-approved billing configuration (2026-10-28, Command 132)

- The owner supplied and approved real business/contact and manual bank/bKash
  Merchant details for staging. They confirmed the manual WhatsApp contact and
  invoice number plus transaction ID requirements. Applied the approved identity
  and instruction values through the protected administrator settings form.
  Exact account/contact data and screenshots remain outside Git.
- The full street address is retained; area/region/postcode share the existing
  city display line and the country code is `BD`. The tax ID marked not applicable
  is omitted. No fee/review-time promise or payment-policy change was added.
- The UI confirmed the audited save and a reload retained the values. Existing
  runtime schemas and exact private-payload comparisons passed. Only
  `business.identity` and `billing.manual-payment-instructions` values changed.
  Other settings, all 28 checked business-table fingerprints, historical invoices,
  credentials, environment, logo and running-container IDs match preflight.
- SMTP remains **active**. Payment/registrar flags remain false, WHM servers
  disabled and new notification/automated WhatsApp delivery disabled. The manual
  WhatsApp instruction does not enable a connector or send messages. Seven
  services remain healthy; health/readiness return 200.
- Protected evidence: `/srv/webhost-billing-staging/acceptance/command132-20261028/`.
  A persisted-form screenshot was reviewed and retained in ignored local evidence.
  No draft or issued invoice, payment, provider operation or email was created.
  No deployment occurred; application release remains
  `ed7a5941bd0b4287aaaacf5a4fb256c9879ce4ff`.

## Commands 133–134 acceptance closed (2026-10-28)

- Remaining read-only acceptance passed on the current release
  `ed7a5941bd0b4287aaaacf5a4fb256c9879ce4ff`. No release was deployed or restarted.
  Both UI connections failed to initialize, so the owner completed the supplied
  walkthrough in the signed-in Speed profile. The browser results below are
  owner-reported; automated server checks are identified separately.
- Group controls passed: Ungrouped (1) with Starter Hosting; empty Product groups
  table; separate Create group dialog; nested Escape dismissal; product group
  selector showing Ungrouped; closing without saving.
- Compact Customers/Orders/Invoices/Payments/Services/Domains/Support collections,
  available search/filter/count controls, customer search/clear and Add customer
  Escape dismissal passed. The owner affirmed these checks without separately
  reporting a visual count; the database inventory contains four customers.
- WHM servers, registrar connections, staff, domain pricing, automation and email
  collection tables/empty states, separate row/create dialogs and narrow-window
  table-contained scrolling passed. No exact mobile viewport or automated browser
  accessibility/screenshot result is claimed for this walkthrough.
- Automated before/after comparisons passed for 29 business-table fingerprints,
  environment contents/mode, logo and running-container IDs. Seven services are
  healthy, one scheduler runs, health/readiness return 200 and all 36 migrations
  are complete. Zero groups and the one ungrouped product are preserved.
- SMTP remains **active**. Payment/registrar flags are false, WHM servers are
  disabled and new notification/WhatsApp delivery remains disabled. No record,
  price, setting, provider operation or email was changed/triggered by acceptance.
- Protected evidence and the explicitly owner-reported receipt:
  `/srv/webhost-billing-staging/acceptance/commands133-134-20261028-acceptance/`.
  Broader create/assignment/persistence and measured-layout cases remain covered
  by the recorded isolated/hosted tests. Command 132 inputs remain separate.

## SMTP activation and owner verification (2026-10-28)

- The owner explicitly authorized enabling the existing SMTP configuration and
  resending their verification email. Custom SMTP is now **active** for existing
  transactional email, superseding the older disabled-SMTP state below. Application
  release remains `ed7a5941bd0b4287aaaacf5a4fb256c9879ce4ff`; no deployment occurred.
- The existing `smtp.mailchannels.net:587` configuration passed required STARTTLS,
  certificate validation and authentication. No pending email backlog existed;
  three old failed queue jobs were retained without retry. A root-protected
  encrypted configuration baseline and preservation hashes are under
  `/srv/webhost-billing-staging/acceptance/smtp-enable-20261028/`.
- UI automation could not initialize, so the owner used the existing protected
  activation/resend controls. Audited activation was 00:17:56 and resend 00:18:44
  on October 28, Asia/Dhaka. Its outbox is published and SMTP sent the message on
  the first attempt at 00:18:48, with no delivery-attempt failure.
- The connected recipient Gmail Inbox contains the exact submitted Message-ID;
  the message is outside Spam and SPF/DMARC pass. The owner's success screenshot
  is backed by read-only assertions: account active, email verified and newest
  verification token consumed. Tokens and recipient data remain outside Git.
- Saved SMTP fields/credentials, environment and logo match the baseline except
  the intended encrypted SMTP activation flag. All seven services remain healthy.
  Payment, WHM/hosting, registrar and new notification/WhatsApp delivery remain
  disabled. No additional external message or provider action was performed.
- Earlier fictional acceptance queries and the owner's existing account were
  different targets. The earlier owner resend was correctly captured in Mailpit;
  it was not delivered to Gmail while custom SMTP was disabled. Fictional staging
  resend/cooldown coverage remains separate; owner-requested SMTP delivery and
  account verification are now confirmed.

## Current staging release (2026-10-27, Commands 135–137)

- URL: `https://my.speedhost.bd`. Source and all application image tags:
  `ed7a5941bd0b4287aaaacf5a4fb256c9879ce4ff`. Exact-source
  [CI](https://github.com/ebit101/webhost-billing/actions/runs/40550661353) and
  [CodeQL](https://github.com/ebit101/webhost-billing/actions/runs/40550661307)
  passed before cutover. Previous `6879484525e3989548bec8452d7fa22535379180`
  source, images and protected environment are retained.
- Fresh encrypted pre-build backup:
  `/srv/webhost-billing-staging/backups/webhost-billing-webhost_billing_staging-20261027T173052Z.dump.gpg`,
  SHA-256 `274c9e0c8cbf9cc916b91afcd33f801435b248d037001a7a40655964d9008a23`.
  Fresh pre-migration backup:
  `/srv/webhost-billing-staging/backups/webhost-billing-webhost_billing_staging-20261027T174837Z.dump.gpg`,
  SHA-256 `06f1d317f5a54bd9d6fe5544daef1394907152244b1c08c03f8fb53137e7727d`.
  Both passed encrypted checksum, OpenPGP integrity, PostgreSQL archive and
  required-table checks. These remain same-host rollback backups.
- Rollback inventory:
  `/srv/webhost-billing-staging/rollback/release-20261027T174836Z-ed7a5941bd0b4287aaaacf5a4fb256c9879ce4ff/`.
  Protected fingerprints, service inventories, original Nginx configuration,
  fictional fixture and corrected postflight evidence:
  `/srv/webhost-billing-staging/acceptance/commands135-137-20261027-verified/`.
- Four image types built with Node 24 and pinned pnpm 11.22.0, frozen dependency
  installs and package/application builds. API runtime is `v24.22.1`. Applied
  only `20261027150000_notification_plan`: 36 migrations complete, zero unfinished.
  Migration-time capture prevents replaying historical events. No seed or reset.
- All seven services are healthy; application restart counts are zero and one
  scheduler runs. PostgreSQL, Redis, Mailpit and unrelated running-container IDs
  are unchanged. Fingerprints match all 28 existing business tables. The sole
  added business fixture is the explicitly fictional pending customer
  `command135-137-20261027@example.test`, excluded by exact email from that
  preservation comparison. Its orders, invoices and services are all zero.
- Environment contents match except `IMAGE_TAG`, with mode `0600` retained.
  The release and served logo hashes match preflight, and Office `.env` is
  unchanged. Live registrar/payment switches, WHM servers and custom SMTP
  remain disabled. Mailpit remains the existing email capture transport.
  `NOTIFICATION_DELIVERY_MODE=disabled` is effective in API, worker and scheduler
  through its safe Compose default; no environment entry was added or changed.
- Nginx now routes `/notifications/*` to the API, retaining every original prefix.
  The first operator helper accidentally omitted `hosting-panel`; the immediate
  route check also ran before reload settled. Corrected the configuration from
  the preserved original, validated syntax, reloaded and checked both protected
  routes before successful full postflight. No application-source repair was
  needed. Existing shared-host protocol-options warnings remain non-fatal.
- Public storefront, catalogue, sign-in, logo, health/readiness and browser API
  origin passed. Session, product-group, hosting-panel, MessageDock and all four
  notification API routes reject anonymous requests with 401. Normal administrator
  password submission requires MFA and issues no pre-MFA session. Fake payment
  and hosting adapter contract smokes passed without external provider calls.
- Fictional Client Chromium acceptance passed at 1440px and 375px: 21 catalogue
  definitions, invoice-issued/overdue important WhatsApp flags, default-enabled
  preferences without opt-in, globally disabled delivery, all three notification
  tables, selected section semantics, containment, CSRF and administrator-route
  rejection, `/login` redirect and normal sign-out/session rejection. Screenshots
  were reviewed. No preference, billing, payment or provisioning change was made.
- **Administrator acceptance:** Browser automation failed to initialize before
  accessing the owner's Speed profile. The owner reported all three requested
  checks passed: fictional resend/continued pending state, Details/Pricing colors
  and hover without saving, and Admin notification/history tables with disabled
  delivery. The product-tab and Admin notification results are owner-reported.
  However, read-only server audit and Mailpit capture still show only the original
  fictional registration event/token/message, with no administrator resend.
  Asked the owner to submit the confirmation once for fictional customer
  `00dc1285-3acb-493c-a97a-fc5e9970f63f` and report its exact result. Resend
  capture/audit acceptance remains open; staging cooldown was not exercised.
  Prior Commands 133–134 acceptance and Command 132 inputs remain separate.

## Prior staging release (2026-10-27, Commands 133–134)

- URL: `https://my.speedhost.bd`. Source and application image tags:
  `6879484525e3989548bec8452d7fa22535379180`. This includes the validated product
  groups, compact record tables and earlier administrator-logo navigation fix.
  Exact-source [CI](https://github.com/ebit101/webhost-billing/actions/runs/40374242892)
  and [CodeQL](https://github.com/ebit101/webhost-billing/actions/runs/40374242667)
  passed before deployment. Previous source `5321ed7` and images are retained.
- Fresh encrypted backup verified before building:
  `/srv/webhost-billing-staging/backups/webhost-billing-webhost_billing_staging-20261026T183649Z.dump.gpg`.
  Fresh pre-migration backup:
  `/srv/webhost-billing-staging/backups/webhost-billing-webhost_billing_staging-20261026T184713Z.dump.gpg`.
  Both passed checksum, OpenPGP integrity, PostgreSQL archive structure and
  required-table checks. UTC artifact timestamps fall on October 26; deployment
  was October 27 in Asia/Dhaka. These are same-host rollback backups.
- Protected rollback inventory:
  `/srv/webhost-billing-staging/rollback/release-20261026T184712Z-6879484525e3989548bec8452d7fa22535379180/`.
  Preflight fingerprints, service inventories and read-only postflight helpers:
  `/srv/webhost-billing-staging/acceptance/commands133-134-20261027-verified/`.
- Four image types built on-host with Node 24 and pinned pnpm 11.22.0 using
  frozen dependency installs and package/application builds. API runtime is
  `v24.22.1`. Applied only `20261026140000_product_groups`: 35 migrations are
  complete, zero unfinished. The new group store is empty and every existing
  product remains ungrouped. No catalogue group, assignment, price or plan was
  invented for the smoke test.
- All seven services are healthy, application restart counts are zero and
  exactly one scheduler is running. PostgreSQL, Redis, Mailpit and unrelated
  running-container IDs are unchanged. Fingerprints match for 28 existing
  business tables, including products (excluding the new nullable group column),
  prices, customers, financial records, settings and provider-operation history.
- Environment contents match preflight except `IMAGE_TAG`, with mode `0600`
  retained. The release logo and served HTTPS asset match the original hash.
  Office `.env` is unchanged. Registrar/payment flags remain false, WHM servers
  remain disabled and custom SMTP remains disabled with Mailpit capture retained.
  Business identity remains `Speed Host`. No payment, provisioning, registration
  or external customer-email operation was requested by the deployment/smoke.
- Public storefront, hosting catalogue, health/readiness, sign-in and logo
  checks passed. Chromium loaded the existing Starter Hosting price and its
  domain-choice order summary without submitting. Anonymous `/admin` shows
  administrator sign-in with an unchecked remember option and continued-MFA
  explanation. Legacy `/admin/login` redirects to `/admin`; protected session,
  product-group, WHM and MessageDock API routes return 401. Browser API-origin
  verification passed.
- **Authenticated acceptance closed on 2026-10-28:** The owner completed the
  read-only Speed-profile group/table/dialog/layout walkthrough on the current
  release containing Commands 133–134; automated preservation/provider checks
  passed. See the closure above for the distinction between owner-reported UI
  observations and automated evidence. Command 132 remains separate.

## Prior staging release (2026-10-25, Command 129)

- URL: `https://my.speedhost.bd`. Source and application image tags:
  `5321ed7ee00ea4a11cc7e3fabdcb0f5509cae5a3`. Authenticated `/login` visitors
  now go to `/admin` or `/portal` according to their verified role. Exact-source
  CI and CodeQL passed before deployment. Previous source `36642e6` is retained.
- Verified encrypted backup before building:
  `/srv/webhost-billing-staging/backups/webhost-billing-webhost_billing_staging-20261025T102159Z.dump.gpg`.
  Fresh pre-switch backup:
  `/srv/webhost-billing-staging/backups/webhost-billing-webhost_billing_staging-20261025T103133Z.dump.gpg`.
  Both passed checksum, OpenPGP integrity, PostgreSQL archive structure and
  required-table verification. They remain same-host backups.
- Protected rollback inventory:
  `/srv/webhost-billing-staging/rollback/release-20261025T103133Z-5321ed7ee00ea4a11cc7e3fabdcb0f5509cae5a3/`.
  Pre-build fingerprints and shared-host inventories are under
  `/srv/webhost-billing-staging/rollback/command129-preflight-20261025T102157Z/`.
- Four image types built on-host with Node 24 and pnpm 11.22.0. All seven
  services are healthy; app restart counts are zero and exactly one scheduler
  is running. No migration was pending; 34 are complete with none unfinished.
  PostgreSQL, Redis, Mailpit and unrelated running-container IDs are unchanged.
- Environment contents are unchanged except `IMAGE_TAG`, with mode `0600`
  retained. Installation logo and Office `.env` fingerprints are unchanged.
  Registrar/payment flags remain false and the cPanel/WHM server is disabled.
  No real provider operation or business-data change was performed.
- Health/readiness, storefront and logo checks passed, as did protected API
  rejection and the browser API-origin check. Anonymous sign-in remains visible.
  Authenticated staging test-customer `/login → /portal` and sign-out passed.
  The customer redirect uses Next.js's HTTP 200 streamed refresh marker;
  the smoke verifies its exact `/portal` destination. A fresh admin password
  submission with remember selected required MFA and issued no session before
  OTP; `/auth/me` returned 401. Credentials/tokens were not printed.
- Staging acceptance closed on 2026-10-26: after private sign-in, the owner
  confirmed `/login` redirects to the `/admin` dashboard in the same browser.
  This is owner-reported authenticated browser evidence. The agent's read-only
  recheck confirmed the source, healthy services, health/readiness responses,
  preserved environment/logo and disabled registrar/payment flags. No further
  deployment was performed. Full-browser restart/elapsed-duration persistence
  and production/provider acceptance remain separate. See `PROGRESS.md` for details.

## Invoice identity and payment-instruction review (2026-10-26, Command 131)

- Future-invoice business name is now `Speed Host`, saved through the existing
  protected administrator interface. No application deployment or code change
  occurred. The original three invoices and their identity/financial snapshots
  are unchanged; historical issued invoices keep their original issuer.
- Fictional draft `INV-001003` displays Speed Host and remains Draft, unissued
  and unpaid, with no payment, email or order. The normal counter advanced to 1004. Only the business name and expected numbering counter changed; other
  settings, environment and logo fingerprints were preserved.
- Manual-payment instructions remain the generic bank/cash/mobile-service text
  asking for a reference. They contain no approved destination/recipient details;
  partial payments remain disabled. Billing email/address/phone/country/tax
  fields are unspecified. Obtain owner-approved values before customer use;
  do not invent financial instructions or rewrite historical snapshots.
- Scoped Node 24 assertions passed for the setting, visible draft, unchanged
  original invoices and provider boundary. Seven services remain healthy;
  health/readiness return 200. Registrar/payment flags are false, WHM is
  disabled and custom SMTP remains disabled with Mailpit capture in use.
  No provider operation, payment, issuance or provisioning was performed.
- Root-only baseline, validation scripts, redacted passing result and screenshot:
  `/srv/webhost-billing-staging/acceptance/command131-20261026/`.
  See `PROGRESS.md` for exact evidence and remaining operating inputs.

## Guest checkout acceptance (2026-10-26, Command 130)

- Acceptance passed after the owner explicitly authorized disabling custom
  SMTP and leaving it disabled. Its encrypted credentials were preserved, a
  protected pre-change snapshot retained and an operator audit entry recorded
  through server maintenance. The effective adapter now uses Mailpit. Do not
  reactivate SMTP automatically; staging messages remain captured.
- All seven services remain healthy; health/readiness return 200. Registrar and
  payment flags are false, WHM is disabled, and hosting/registrar operation
  counts remain one pre-existing connection test / zero. There are 34 completed
  migrations and zero unfinished. Environment/logo and Office `.env`
  fingerprints are unchanged. No application deployment or restart occurred.
- One anonymous existing-domain browser checkout created fictional customer
  `CUS-12BFD9CE4B8F`, order `ORD-20261025-A452B3888B7CD44B` and invoice
  `INV-001002` for BDT 1,200.00. Sign-in was rejected before verification.
  Mailpit captured verification, order and invoice emails; the captured link
  succeeded through normal public HTTPS verification with CSRF. Normal browser
  sign-in then showed the active account, correct order and unpaid invoice.
- Scoped assertions passed: exactly one account/order/invoice, integer price
  and balance `120000`, zero paid, zero payments and zero services. Order state
  is awaiting payment; invoice state is unpaid. Normal sign-out revoked the
  single fictional session and reopening the portal returned to sign-in. The
  records and audit history remain intact; no provider operation was added.
- Root-only evidence, encrypted SMTP snapshot, scoped assertions, passing
  redacted JSON and screenshots are retained under
  `/srv/webhost-billing-staging/acceptance/command130-20261026/`.
  The invoice still uses the existing `Webhost Billing` issuer label; review
  billing identity/payment instructions separately before real-customer use.
  See `PROGRESS.md` for complete evidence and the next authorization boundary.

## Prior staging release (2026-10-24, Commands 127–128)

- URL: `https://my.speedhost.bd`. Source and all application image tags:
  `36642e60fdc3dbdd177aae095362e919b8b2ae3d`. This includes one-submit guest
  checkout, opt-in administrator session persistence and validated dependency
  security repairs. Exact-source CI and CodeQL passed before deployment.
- The owner explicitly authorized staging deployment with verified backup,
  environment/logo preservation, disabled live providers and smoke tests.
  Previous source `15c8cdb559f985c9d4d20abccaba882353613ed5` is retained.
- Encrypted backup verified before building:
  `/srv/webhost-billing-staging/backups/webhost-billing-webhost_billing_staging-20261024T120128Z.dump.gpg`.
  A second backup immediately before switching also passed checksum, OpenPGP
  integrity, PostgreSQL archive structure and required-table verification:
  `/srv/webhost-billing-staging/backups/webhost-billing-webhost_billing_staging-20261024T121244Z.dump.gpg`.
  These are same-host backups, not off-site recovery acceptance.
- Protected rollback inventory:
  `/srv/webhost-billing-staging/rollback/release-20261024T121244Z-36642e60fdc3dbdd177aae095362e919b8b2ae3d/`.
  It contains the previous release pointer/environment, verified backup path
  and service inventories. Additional pre-build fingerprints and shared-host
  inventories are retained under
  `/srv/webhost-billing-staging/rollback/commands127-128-preflight-20261024T120119Z/`.
- All four images built on-host with Node 24 and pinned pnpm 11.22.0,
  frozen-lockfile installs and package/application builds. Runtime Node is
  `v24.22.1`. Prisma reported no pending migrations; 34 are complete and none
  unfinished. All seven services are healthy with exactly one scheduler.
  Only the four application services were recreated; PostgreSQL, Redis and
  Mailpit IDs are unchanged.
- Staging environment contents are unchanged except `IMAGE_TAG`, with mode
  `0600` retained. The installation logo fingerprint and Office `.env` are
  unchanged. Registrar flags are false in API/worker/scheduler, payment flags
  are false in API, and the existing cPanel/WHM server remains disabled.
  No provider operation, account/order submission or external customer email
  was performed by deployment smoke tests.
- Public storefront, order/configuration/review/checkout, health/readiness and
  logo routes returned 200; protected hosting-panel and MessageDock API routes
  returned 401. The browser API-origin check passed. Fresh anonymous Chromium
  followed the actual hosting card to inline guest checkout without submitting.
  Administrator sign-in showed the unchecked, working “Remember this device”
  option and its 30-day/continued-MFA explanation; customer sign-in is unchanged.
  No mutating browser request or browser page error occurred during that smoke.
- Owner-assisted session acceptance on 2026-10-24 confirmed the MFA prompt,
  remembered access when returning to `/admin`, and OTP required on the next
  sign-in after explicit sign-out. Read-only session metadata showed MFA
  verification and fixed 30-day lifetimes. The owner clarified that only a tab
  had been closed; a full browser restart and real elapsed-duration persistence
  are still unconfirmed. `/login` continues to show the customer sign-in form
  even with an authenticated administrator session; this is a navigation issue,
  not evidence of session expiry. Use `/admin` for administrator return visits.
- The shared-host inventory comparison observed unrelated temporary container
  `shc-intake-verify-db-20261024` disappear during the build window. This
  deployment did not target it; all other unrelated running IDs matched.
  See the detailed deployment report in `PROGRESS.md` for the retained limits.

## Prior staging release (2026-10-19, public cart and checkout)

- URL: `https://my.speedhost.bd/shared-hosting`
- Source and application image tag: `15c8cdb559f985c9d4d20abccaba882353613ed5`.
  This adds public domain choice, hosting configuration, cart review and inline
  guest checkout. The previous release is `326fb4d2745c361fbadf6f974743015ac8d32cff`.
- Protected rollback inventory:
  `/srv/webhost-billing-staging/rollback/release-20261019T020224Z-15c8cdb559f985c9d4d20abccaba882353613ed5/`.
  The verified encrypted backup is
  `/srv/webhost-billing-staging/backups/webhost-billing-webhost_billing_staging-20261019T020225Z.dump.gpg`.
  It remains a same-host backup.
- GitHub Validate and CodeQL passed for the deployed commit. The guarded
  script verified the backup checksum, OpenPGP integrity, archive structure
  and required tables; 34 migrations were complete with none pending. All
  seven staging services became healthy, and PostgreSQL, Redis and Mailpit
  container IDs were unchanged. The browser API-origin check passed.
- `/checkout`, `/order/configure` and `/order/review` returned 200. A fresh
  anonymous Chromium session followed the actual Starter Hosting card through
  existing-domain choice, configuration, cart review and checkout. Inline
  account creation and existing-customer sign-in fields were present. No
  account or order was submitted.
- `RESELLBIZ_LIVE_ENABLED=false` was verified in API, worker and scheduler;
  `BKASH_ENABLED=false` and `SSLCOMMERZ_ENABLED=false` were verified in API.
  No live registrar, payment or WHM operation was made. Production-mode
  staging cannot complete the fake-provider registration/provisioning path;
  that path was tested locally with fake providers.
- The first wrapper attempt stopped before upload or service changes because
  Windows PowerShell 5 lacks the .NET process argument-list API. The release
  completed with PowerShell 7, and the wrapper's archive step now uses Git's
  own output option for compatibility with both PowerShell versions.

## Prior staging release (2026-10-19, guest hosting order)

- URL: `https://my.speedhost.bd/shared-hosting`
- Source and application image tag: `326fb4d2745c361fbadf6f974743015ac8d32cff`.
  This includes Command 125's public order step and renewable administrator sessions.
- Previous retained release: `93523fa6cabba7c5dd715fdfd0a69ffb647812c4`.
- Protected rollback inventory:
  `/srv/webhost-billing-staging/rollback/release-20261018T180742Z-326fb4d2745c361fbadf6f974743015ac8d32cff/`.
  It records the previous release and environment, pre/post service inventories,
  and the verified backup path.
- Fresh encrypted backup:
  `/srv/webhost-billing-staging/backups/webhost-billing-webhost_billing_staging-20261018T180743Z.dump.gpg`.
  Checksum, OpenPGP integrity, PostgreSQL archive structure and required-table
  verification passed. It remains a same-host backup.
- Database: 34 completed migrations and zero unfinished; no migration was pending
  for this release. All seven staging services are healthy. The release script
  confirmed PostgreSQL, Redis and Mailpit container IDs were unchanged, the
  browser API origin, and disabled live registrar flags in API, worker and scheduler.
  Read-only postflight confirmed `BKASH_ENABLED=false` and
  `SSLCOMMERZ_ENABLED=false` in the API.
- Public `/order`, `/health`, `/ready` and the preserved logo returned 200.
  A signed-out live Chromium check followed the actual Starter Hosting card
  through guest domain review and only then to customer sign-in with the
  selected product and price preserved. No order, customer account, payment,
  registrar action or WHM operation was made during that check.
- GitHub Validate and CodeQL passed for the deployed commit. The first apply
  stopped before build or switch because the staging logo setting was quoted;
  the exact-path guard now accepts both quoted and unquoted forms. An interim
  CI run timed out starting the administrator browser fixture; its Next build
  directory is now isolated, and the final CI run passed all browser checks.
  Authenticated live administrator session acceptance still needs the owner's MFA.

## Prior staging release (2026-10-18, combined hosting/domain order)

- URL: `https://my.speedhost.bd/shared-hosting`
- Source and application image tag: `93523fa6cabba7c5dd715fdfd0a69ffb647812c4`.
  The release includes Commands 123 and 124. The subsequent deployment-script
  and report commit is source tooling only; it is not a different running image.
- Previous retained release and images: `7c3b55e4117979317a31e9a477744f2665e69445`.
- Protected rollback inventory:
  `/srv/webhost-billing-staging/rollback/command124-20261018T155203Z/`.
  It records the previous release, prior environment, service inventories and
  verified backup path.
- Fresh encrypted pre-migration backup:
  `/srv/webhost-billing-staging/backups/webhost-billing-webhost_billing_staging-20261018T155204Z.dump.gpg`.
  Checksum, OpenPGP integrity, PostgreSQL archive and required-table checks
  passed; mode is `0600`. This is a same-host backup.
- Applied only `20261018000100_combined_hosting_domain_order`; the database has
  34 completed and zero unfinished migrations. Four application services were
  recreated. All seven owned services are healthy with zero restarts; the
  PostgreSQL, Redis and Mailpit container IDs are unchanged.
- `/`, `/shared-hosting`, `/health`, `/ready` and the preserved installation
  logo returned 200. Anonymous `/admin/servers` redirected to sign-in; the
  protected hosting-panel and MessageDock API routes returned 401. Public
  products returned 200 with the one existing Starter Hosting offer. The web
  bundle API-origin check passed.
- API, worker and scheduler retained `RESELLBIZ_LIVE_ENABLED=false`; API
  `BKASH_ENABLED` and `SSLCOMMERZ_ENABLED` remained false. No real registrar,
  WHM, payment or email operation was performed. Production-mode staging
  cannot complete fake-provider registration/provisioning; use local fake-provider
  tests for the complete flow. The four local annual test plans were not seeded
  into this staging database.

### One-command staging deployment

From a clean, synchronized `main` checkout in Windows PowerShell:

```powershell
.\scripts\deploy-staging.ps1 -IdentityFile C:\path\to\staging_ssh_key
.\scripts\deploy-staging.ps1 -IdentityFile C:\path\to\staging_ssh_key -Apply
```

The first command checks the exact remote commit and GitHub `Validate` and
CodeQL results without changing the server. `-Apply` archives that commit,
uploads it over pinned-key SSH, verifies its SHA-256, copies the installation
logo from the current release, builds four image types, creates and verifies an
encrypted database backup, runs migrations, switches only the application
services, and checks public health and disabled registrar flags. Keep the SSH
identity and staging environment outside Git. Inspect the protected rollback
inventory and host health if any step fails; do not blindly retry after a
partial migration or switch. On-host image builds still take several minutes;
the script removes manual handoffs, not compilation time.

## Prior staging release (2026-10-18, WHM server administration)

- URL: `https://my.speedhost.bd`
- Source and four application image tags: `7c3b55e` (the full tag is recorded by
  the live `IMAGE_TAG` setting and release directory). This source includes both
  Command 121 WHM server administration and the prior MessageDock read-only API.
- Previous API release: the MessageDock release documented below. Its image and
  the older web/worker images remain available for application rollback.
- Preflight: seven healthy services, 85 GiB free, 32 completed/zero unfinished
  migrations, no stored WHM credential or hosting-panel operation, and
  `RESELLBIZ_LIVE_ENABLED=false`.
- Protected rollback inventory:
  `/srv/webhost-billing-staging/rollback/command121-20261018T015306Z/`.
  It contains the prior environment, exact prior release pointer, container
  inventories and safe baseline counts.
- Fresh encrypted pre-migration backup:
  `/srv/webhost-billing-staging/backups/webhost-billing-webhost_billing_staging-20261018T015323Z.dump.gpg`.
  Its protected SHA-256 file, OpenPGP integrity, PostgreSQL custom archive and
  required tables passed verification; the backup is mode `0600` and records
  32 completed migrations. It is same-host rollback evidence, not off-site
  recovery acceptance.
- Applied only `20261017000100_retired_cpanel_servers`; the database has 33
  completed and zero unfinished migrations. Only API, web, worker and scheduler
  were recreated. All seven staging services are healthy with zero restarts;
  unrelated container IDs are unchanged. Exactly one scheduler is running.
- Public `/`, `/health` and `/ready` returned 200. Anonymous `/admin/servers`
  redirected to admin sign-in; protected WHM and MessageDock routes returned 401. The web API-origin check passed. The authenticated read-only MessageDock
  probe returned 200 and zero matches for a fictional query. API, worker and
  scheduler still report `RESELLBIZ_LIVE_ENABLED=false`; WHM credentials and
  hosting-panel operations remain at zero. No WHM token, external account
  action, registrar operation, payment or customer email was performed.
- The protected staging administrator password reached the existing MFA
  challenge in browser testing. Signed-in `/admin/servers` acceptance awaits
  owner MFA; no authenticator code was requested or bypassed.

## Prior staging release (2026-10-18, MessageDock read-only context)

- URL: `https://my.speedhost.bd`
- Source/API image tag: `1985d84105c5663278c897cb02cacf1645b2d0e7`
- Release: `/srv/webhost-billing-staging/releases/1985d84105c5663278c897cb02cacf1645b2d0e7`
- Previous API tag: `a516f6ea5d1279abe27f1131899d490cdb8c4cb1`.
  Web, worker, scheduler and migration images were retagged with the new release
  name but their running containers were not replaced.
- The API alone was recreated. Its nonroot image ID is
  `sha256:b1b364ce1b41f823a3cedb417047dd4f618f6f183f06b921a1ab6b775f4dc46b`.
- A staging-only Compose secret mounts the read token into the API. The host
  Nginx site routes `/integrations/messagedock/` to that API. The token stays
  out of the browser and source repository.
- Postflight: API, web, worker, scheduler, PostgreSQL, Redis and Mailpit healthy;
  public readiness 200; integration route 401 without a token and 200 with a
  fictional authenticated search returning zero customers. The registrar flag
  remains false. No billing migration, payment, registrar or customer-data write
  was performed.
- Private rollback files:
  `/srv/webhost-billing-staging/rollback/messagedock-1985d84105c5663278c897cb02cacf1645b2d0e7/`.
  Restore the previous API tag, environment, release symlink and this site's
  Nginx file together if a rollback is needed; the previous images remain.

## Prior staging release (2026-10-12, admin-assisted domain orders)

- URL: `https://my.speedhost.bd`
- Source and four application image tags: `a516f6ea5d1279abe27f1131899d490cdb8c4cb1`
- Prior retained release: `238359af6e2ccfee3e4db898d6c74efd0b417c57`
- Current release: `/srv/webhost-billing-staging/releases/a516f6ea5d1279abe27f1131899d490cdb8c4cb1`
- Database: 32 completed migrations, zero unfinished; the additive
  `20261012000400_admin_domain_offline_consent` migration applied once.
- Registrar network flag: `RESELLBIZ_LIVE_ENABLED=false` in the protected
  environment and API, worker and scheduler containers. Registrar accounts,
  credentials, operations, domains, quotes and catalogue TLDs remain at zero.
- Rollback inventory: `/srv/webhost-billing-staging/rollback/command120-20261012T132124Z`.
  The fresh pre-migration encrypted backup is
  `/srv/webhost-billing-staging/backups/webhost-billing-webhost_billing_staging-20261012T132148Z.dump.gpg`;
  SHA-256 `b599ecc76ca39285d6216a33b1cad55ec0f81dfd13c512dc7c34b2313a8d44ac`.
  Its checksum, OpenPGP integrity, PostgreSQL archive structure and required
  tables passed verification. It is mode `0600` and records 31 completed
  migrations before the change. Retain this backup, the protected environment
  copy and prior release/images for rollback.

All seven owned services were healthy with zero restarts after cutover; the
existing PostgreSQL, Redis and Mailpit containers stayed running. Six business
table fingerprints and unrelated container IDs matched preflight. Direct-to-host
HTTPS checks returned 200 for `/`, `/health`, `/ready` and the brand asset;
anonymous admin and portal pages redirected, and protected API routes returned 401. The browser API-origin check passed for `https://my.speedhost.bd`.
The home PC's router resolver initially failed to resolve the hostname; both
authoritative Cloudflare nameservers, 1.1.1.1, 9.9.9.9 and OpenDNS returned
its expected A record, while 8.8.8.8 returned NXDOMAIN. The first HTTPS
checks therefore used `curl --resolve` with normal certificate validation.
The router later resolved the hostname and ordinary HTTPS returned 200, but
8.8.8.8 still returned NXDOMAIN. Public DNS consistency needs follow-up.

The admin order form and customer portal are deployed as UI. This installation
has no registrar offers or configured account, and production-mode staging
blocks fake registrar writes. Fictional fake-provider order/registration tests
run locally; this rollout did not create a staging order, send customer email,
configure or call a live registrar, or authorize public launch.

## Prior staging release (2026-10-12, Command 118)

- URL: `https://my.speedhost.bd`
- Source and four application image tags: `238359af6e2ccfee3e4db898d6c74efd0b417c57`
- Prior retained release: `ce5a062be58648fb5332e968dd907c513c24a9d0`
- Release path: `/srv/webhost-billing-staging/releases/238359af6e2ccfee3e4db898d6c74efd0b417c57`
- Database: 31 completed migrations, zero unfinished; Command 118's additive
  `20261012000300_domain_catalogue_registrar_selection` migration applied once.
- Registrar network flag: `RESELLBIZ_LIVE_ENABLED=false` in the protected staging
  environment and API, worker and scheduler containers. There are no configured
  registrar accounts or credentials and no registrar operations or domains.
- Rollout evidence: `/srv/webhost-billing-staging/rollback/command118-20261012T110258Z`.
  The fresh encrypted backup is
  `/srv/webhost-billing-staging/backups/webhost-billing-webhost_billing_staging-20261012T110304Z.dump.gpg`;
  its SHA-256 is `497b576c64b11055824e4d7972ffa48a29d5d9f627750e17242a38a646a397b5`.
  Verification covered its checksum, OpenPGP integrity, archive structure and
  required tables. Retain this backup and the prior release for rollback.

Public health/readiness, the browser API origin, seven service health checks,
unchanged existing business-row fingerprints and unchanged unrelated container
IDs passed. The simulated registration flow passed in an isolated local browser
test. Production-mode staging deliberately blocks fake registrar writes, so its
domain registration flow is not an end-to-end fake-provider test surface. No real
registrar request, purchase, credential setup, or public launch acceptance occurred.

## Historical deployment snapshot (2026-10-11)

The fixed release and image values below record the 2026-10-11 rollout. Later
registrar and SMTP deployments are recorded in `docs/PROGRESS.md`; this snapshot
does not identify the current host release. Verify the live `current` symlink,
image tags, database migration state and protected rollback material before a
new deployment. The 2026-10-12 Command 118 phase review did not obtain that
host inventory.

- Environment: staging only
- URL: `https://my.speedhost.bd`
- Deployed application version: `5445877` (source `5445877b8b4a64cd8b70bf7f41a84c609568a7ba`
  plus the explicit two-file deployment-repair overlay described below)
- Compose project: `webhost-billing-staging`
- Host root: `/srv/webhost-billing-staging`
- Current release: `/srv/webhost-billing-staging/releases/5445877`
- API image: `webhost-billing-api:5445877`
- Web image: `webhost-billing-web:5445877`
- Worker and scheduler image: `webhost-billing-worker:5445877`
- Migration image: `webhost-billing-migration:5445877`
- Web listener: `127.0.0.1:19500`
- API listener: `127.0.0.1:19600`
- Edge: the existing host Nginx instance; only the owned staging site's `/staff` API
  prefix was added during the latest rollout, using a validated graceful reload
- TLS: Let's Encrypt certificate for `my.speedhost.bd`; automatic Certbot renewal is installed

This is a side-by-side deployment on a shared server. It must not manage, restart, prune,
rename, reconfigure, or reuse resources belonging to another application. PostgreSQL,
Redis, and Mailpit have no host-published ports. Only the staging web and API processes
publish loopback ports, and the host Nginx site is the public edge.

## Protected host material

The following paths are intentionally outside Git:

- Environment file: `/srv/webhost-billing-staging/.env.staging`
- Runtime secrets: `/srv/webhost-billing-staging/secrets`
- Staging logins: `/srv/webhost-billing-staging/STAGING_LOGIN_CREDENTIALS.txt`
- Encrypted backups: `/srv/webhost-billing-staging/backups`
- Nginx rollback archive: `/srv/webhost-billing-staging/rollback`

Do not print secret values in shell history, logs, tickets, or reports. Keep the staging
login file and backup artifacts at mode `0600`, the backup passphrase at mode `0400`,
and their parent directories accessible only to root. Container-readable Compose bind
secrets use the minimum host permissions supported by this deployment and remain inside
the root-only secret directory.

## Routine inspection

Run commands from the release selected by the `current` symlink:

```bash
cd /srv/webhost-billing-staging/current
docker compose \
  --env-file /srv/webhost-billing-staging/.env.staging \
  -f deploy/production/compose.production.yaml \
  -f deploy/staging/compose.staging.yaml \
  ps
curl --fail --silent --show-error https://my.speedhost.bd/health
curl --fail --silent --show-error https://my.speedhost.bd/ready
nginx -t
```

Verify that the browser bundle was built for the staging API origin. The API-only smoke is
not sufficient because it can pass even when the Next.js client bundle contains a placeholder
or different origin:

```bash
node deploy/staging/verify-web-origin.cjs \
  https://my.speedhost.bd \
  https://my.speedhost.bd
```

Run this check after every web-image build and deployment. It validates both the CSP and the
JavaScript assets and fails if `api.billing.example.com` appears. `NEXT_PUBLIC_API_URL` is a
Next.js build input; changing only the runtime environment cannot repair an already-built
client bundle.

Inspect logs only for this project:

```bash
cd /srv/webhost-billing-staging/current
docker compose \
  --env-file /srv/webhost-billing-staging/.env.staging \
  -f deploy/production/compose.production.yaml \
  -f deploy/staging/compose.staging.yaml \
  logs --since=30m api web worker scheduler
```

Never use host-wide `docker compose down`, `docker stop $(docker ps -q)`, Docker prune,
firewall replacement, or a global Nginx restart for this application.

## Controlled start and stop

Start only the seven staging services:

```bash
cd /srv/webhost-billing-staging/current
docker compose \
  --env-file /srv/webhost-billing-staging/.env.staging \
  -f deploy/production/compose.production.yaml \
  -f deploy/staging/compose.staging.yaml \
  up -d --wait postgres redis mailpit api web worker scheduler
```

Stop only this project while preserving its volumes:

```bash
cd /srv/webhost-billing-staging/current
docker compose \
  --env-file /srv/webhost-billing-staging/.env.staging \
  -f deploy/production/compose.production.yaml \
  -f deploy/staging/compose.staging.yaml \
  stop api web worker scheduler mailpit redis postgres
```

Do not use `down --volumes` during normal operation or rollback.

## Migration boundary

Migrations are a reviewed, one-shot action. Do not run them as part of API startup and do
not run a down migration. Before applying a future migration, create and verify a current
encrypted backup, record the old image/release, review the migration list, then run the
production migration image exactly once. A schema-incompatible rollback requires restoring
the verified pre-migration backup into a separate database and an explicit connection
cutover; it must never overwrite the active database.

## TLS renewal and Mailpit

Host Nginx reads the Let's Encrypt certificate directly. Staging Mailpit reads a protected
copy because its internal SMTP endpoint requires STARTTLS. After Certbot renews the
certificate, copy the renewed certificate and key into the two existing secret files,
preserve their permissions, and recreate only `mailpit`, `worker`, and `scheduler`. Validate
Mailpit delivery and all health checks afterward. Do not reload unrelated containers.

## Rollback

Application rollback is release-based:

1. Confirm the target prior release directory and image tag.
2. Confirm that its database schema is compatible with the current database.
3. Atomically repoint `/srv/webhost-billing-staging/current` to that explicit release.
4. Set the explicit prior `IMAGE_TAG` in `.env.staging`.
5. Recreate only `api`, `web`, `worker`, and `scheduler` with `--no-deps`.
6. Verify `/health`, `/ready`, HTTPS login, both roles, authorization, queue processing,
   email delivery, and that exactly one scheduler is running.

If Nginx rollback is required, inspect the timestamped archive in
`/srv/webhost-billing-staging/rollback`, restore only the files added or changed for
`my.speedhost.bd`, run `nginx -t`, and use a graceful reload. Do not replace the complete
Nginx configuration without a separate shared-host review.

### 2026-10-11 staging deployment and currency hold

The owner requested deployment of completed changes and stopped further currency
development. This updates the established fictional-data staging installation only.
It does not authorize production promotion, WHMCS import, real providers or currency
activation. Command 117 and later currency work remain on hold.

The switch completed at **23:06:28 Asia/Dhaka on 2026-10-11**
(`2026-10-11T17:06:28Z`). Application feature source is
`5445877b8b4a64cd8b70bf7f41a84c609568a7ba`, whose first-attempt
[CI](https://github.com/ebit101/webhost-billing/actions/runs/38148091306)
and [CodeQL](https://github.com/ebit101/webhost-billing/actions/runs/38148091304)
passed: all 29 Validate steps and all eight CodeQL steps. Dependency review was
skipped on the main push, not passed. The source-delivery commit containing the
deployment repairs requires its own full-history scan and exact-head hosted gates;
base-source success does not certify that new commit.

Clean Git archives supplied the source, with the separately approved Speed Host logo
kept outside Git. Two small, separately identified deployment repairs were required:

- Generate existing Prisma client types before the web container's ordinary build.
  The first clean build compiled successfully but failed TypeScript because those
  generated types were absent. The corrected recipe retains frozen dependencies and
  TypeScript validation; compilation, TypeScript and all 30 static pages then passed.
- Add only `/staff` to the staging API-prefix allowlist. A regression checks both
  `/staff` and its children without intercepting administrator pages or `/staffing`.
  The deployed site changed by that single prefix, passed full `nginx -t`, and was
  gracefully reloaded. The master PID and every other Nginx file hash were unchanged.

The API, worker and migration images use clean base feature source. The web image
uses the same source with the corrected Dockerfile. The server source directory
includes both repairs. Do not describe the entire deployed directory as an unmodified
base archive. The overlay SHA-256 is
`f981105883c7c097e19ce0ac83512eadd2301f2c6fbf483a037996cfb053633c`;
corrected Dockerfile SHA-256 is
`98cb17752ce429d1facdcbf5c674b251339ba472fe8538fb2a9f1a9559668ae3`.

All four Linux/amd64 images use UID/GID `10001:10001`, Node `v24.21.0`, and the
declared base resolved to
`node:24-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20`.
Installed dependency inventories matched the source lockfile with no unknown versions:
migration 167, API 309, worker 281 and standalone web 14. Local and remote image
index IDs matched exactly:

- API: `sha256:9198ac0fa0fba11c8eb5de24ec0121110bbdc23efdf53680d02d171766361945`
- Web: `sha256:4e901fe8321bfb8a5b4e94940b69d29cfb6912bb9081f685526b589c0b9c9ebe`
- Worker/scheduler: `sha256:456c6c8e2c2f63579b499f313602b0dedbdf663e6378d9711432289c721cf35b`
- Migration: `sha256:2c002edf7ef2f6872a6b9d900bc075dbe54861a3f4b0436f4e9126930ef38c40`

Images were streamed through gzip directly to the protected server artifact directory,
without a large local image-export file. The 407,362,260-byte transfer passed matching
local/remote SHA-256
`2e9bcdb14cc3d12322f30abf1b995531b429b696a51bf386942b665c55dc4ff3`.
The operator paused for a PC reboot after builds and before transfer; the old portal
remained active throughout the pause.

#### Backup, migration and rollback evidence

Immediately before stopping writers, a fresh encrypted backup passed checksum,
OpenPGP integrity, PostgreSQL archive structure and required-table checks:

- Backup: `/srv/webhost-billing-staging/backups/webhost-billing-webhost_billing_staging-20261011T170528Z.dump.gpg`
- SHA-256: `7e0de16ed708f7d4ce6aa7dd694b392f5b5c4e1df3b25b007c50f48fffe125b2`
- Prior release/tag: `6085629`, with its images retained
- Protected rollback directory: `/srv/webhost-billing-staging/rollback/deploy-5445877`
- Prior environment: `.env.prior` in that directory, mode `0600`
- Prior owned site: `my.speedhost.bd.conf.prior` in that directory
- Protected backup path, service inventories and row fingerprints are retained there

Backup metadata reports application commit `unknown` because the source directory is
a Git archive without `.git`; the independently recorded prior source is
`608562903cd2adbd3b70b8ace5c92259c2ba4c4b`. Do not interpret `unknown` as a verified SHA.

The staging API, worker and scheduler were stopped before the one-shot migration;
PostgreSQL, Redis and Mailpit were not recreated. Seven reviewed additive migrations
advanced completed inventory from 21 to 28 with no unfinished migration. Existing
administrators received the full-administrator role. No seed, reset, currency
initialization, history backfill or import ran. All seven currency tables remain
empty, with closed/unselected behavior retained. All 29 legacy-table row fingerprints
were unchanged after migration, excluding only the new administrator-role column.

Only API, web, worker and scheduler were recreated using `--no-deps`. Their health
checks passed with zero restarts. All three staging infrastructure IDs and all 21
unrelated running-container IDs were unchanged. Exactly one scheduler remains active.

Application rollback requires restoring the protected prior environment, atomically
repointing `current` to the retained `6085629` directory, and recreating only those
four services with `--no-deps`, followed by the role/origin/browser/email checks. If
necessary restore only the protected prior staging site, run `nginx -t`, then gracefully
reload Nginx. The reviewed additive schema can remain for application rollback; do
not run down migrations or overwrite the active database. A database restore or
connection cutover needs separate explicit authorization.

#### Operational acceptance and failed attempts

- CSP/client API-origin verification passed for `https://my.speedhost.bd`.
- Both fixture roles logged in; customer access to admin customer/staff APIs was
  denied. Anonymous `/staff` returned 401. Legacy staff listing returned 200 with
  full-administrator roles; invitation controls remain MFA-gated, without staff writes.
- Owned invoice detail/PDF and support detail, dashboard/customer reads, logout and
  revoked-session rejection passed. No financial mutation was performed.
- Packaged fake payment/hosting adapters passed their contracts. Real payment
  gateways remained disabled; no hosting credential or real provider was contacted.
- A fictional password-reset message was queued, sent by the worker over the existing
  required STARTTLS path, and received with Speed Host branding in isolated Mailpit.
  This is sandbox delivery, not public SMTP acceptance. No credentials or message/reset
  payloads were printed.
- Clean Chromium checks passed storefront/logo, preserved plan selection through
  sign-in, 375 px hosting layout, nine administrator routes and five customer routes.
  There were zero page, console or failed-request errors.
- Final fingerprints of 15 customer/catalogue/order/invoice/payment/service/support/
  settings/hosting-operation tables matched the pre-migration baseline. Expected auth,
  audit and sandbox email activity is not classified as a financial write. All four
  applications had zero error-level log lines and zero restarts; health/readiness passed.
- A first switch attempt stopped at a read-only inventory check because Docker rejects
  `label!=` on `docker ps`. No backup, writer stop or migration began in that attempt.
  It was corrected to explicit label-field filtering; prior attempt artifacts remain
  protected separately. The corrected switch exited zero.
- A smoke container initially resolved the public domain to Mailpit's existing private
  SMTP alias and failed before authentication. The retry mapped only that temporary
  test container's public hostname to the verified server address, retained TLS
  verification, and passed. No runtime network, SMTP alias or DNS change was made.
- One local Docker build retry reported a closed engine pipe; a later retry passed
  without changing resource limits, restarting services or pruning data. No root cause
  is claimed. Earlier test-runner path assumptions were corrected without weakening
  assertions. The pre-existing unrelated Nginx IPv6 warning remains outside scope.

Fresh tooling-security tests passed all 15 cases. The production dependency audit
had no known findings; the full development audit still exits one for braces high
`GHSA-vfj7-8cjw-p6xm` and sprintf-js moderate `GHSA-hp3w-g68c-fv3c`. Existing mitigations
remain; no waiver, dependency upgrade or suppression is claimed. The server retained
76 GiB available after deployment; local C:/D: retained approximately 19.44/7.64 GiB.
No Docker, cache or disk cleanup was performed.

Production remains no-go: remaining operating inputs, actual catalogue/payment/provider
acceptance, protected WHMCS rehearsal, off-site recovery evidence and final owner launch
approval are still required. Next request: **Review Speed Host staging deployment and
define one bounded WHMCS migration rehearsal**. Do not resume currency work automatically.

### 2026-10-05 prior-main staging deployment

Source `608562903cd2adbd3b70b8ace5c92259c2ba4c4b` was the prior isolated staging
release. It includes all implemented work through Command 90 and the Command 91
definition only. The user's request to deploy all changes updated the existing
staging installation; it did not authorize production promotion or real providers.
Exact-source CI run `37322118344` and CodeQL run `37322118370` passed before rollout.

Clean pinned Git archives supplied both the new source directory and sequential
Linux/amd64 builds. All four images use UID/GID `10001:10001`; local/remote image
IDs matched. Packaged dependency-version inventories matched the source lockfile:
migration 165, API 309, worker 281 and standalone web 14. Frozen install and
supply-chain checks passed; slow registry retries and image-copy/export stages
extended the build time without changing dependency versions or policies.
Web compilation, TypeScript and static generation passed with
`NEXT_PUBLIC_API_URL=https://my.speedhost.bd`.

- API image ID: `sha256:f6a6db61143708d4acb8d62849af363d3f31287db688ff1620e87b1c3c643e2e`
- Web image ID: `sha256:4c41f68a449a367be88e11f52e29a9b11a43e1d44f8684788f9b9e4ca5e462e6`
- Worker/scheduler image ID: `sha256:c867928a9c09be530205c2cb55a0a4338adef949863344efb66f415db1b3e823`
- Migration image ID: `sha256:fccf06afc5ba005d162fa59a355632b96c88062297602c2ca368eac0c91913bd`

Candidate Compose validation, entrypoint shell syntax and read-only Prisma status
passed: all 21 migrations were already applied. No migration, seed, reset or
business-record write was needed. Immediately before the switch, a fresh encrypted
backup passed checksum, OpenPGP integrity, archive-structure and required-table checks:

- Backup: `/srv/webhost-billing-staging/backups/webhost-billing-webhost_billing_staging-20261005T154456Z.dump.gpg`
- SHA-256: `3b78a7c42d0c389caa0b5a91dac8480e190ec0ba9c81e1f03cc98e9ba13af450`
- Protected prior environment: `/srv/webhost-billing-staging/rollback/.env.staging-pre-6085629`
- Prior release/tag: `71558a8`, retained with its images for schema-compatible application rollback
- Protected inventories/business fingerprints: `/srv/webhost-billing-staging/rollback/deploy-6085629-*`

Only the old staging worker/scheduler were stopped before atomically switching the
release/tag and recreating API, web, worker and scheduler with `--no-deps`. All four
became healthy with zero restarts; exactly one scheduler remains. PostgreSQL, Redis,
Mailpit and every unrelated running container retained their IDs/images. Counts and
row fingerprints of 15 business tables matched the fresh pre-switch baseline.
The host retained about 83 GB free. No Nginx edit/reload, daemon restart, prune,
volume deletion, SSH configuration change or unrelated application change occurred.

Post-deployment checks passed for public health/readiness, browser API origin/CSP,
both roles, customer denial of administrator APIs, owned invoice/PDF/support,
logout/session rejection, disabled credentialed payment gateways, fake payment and
hosting contracts, and administrator settings in clean Chromium. A fresh fictional
password-reset email reached `SENT` via staging SMTP with a `PUBLISHED` outbox event;
Mailpit retained the sandbox message. Authentication/audit/email side effects were
expected; financial, service, support and settings records were unchanged.

Clean-browser checks passed for the public hosting-plan CTA, plan selection through
customer sign-in, and all six administrator/customer invoice/order/service ledgers:
search, page size 100, reload/back/forward, clear filters, keyboard and 375px filter
layout. Ledger browsing emitted no mutations or browser errors. Temporary operator
runner mistakes (old checkout selector, premature administrator navigation, exact
select-label matching and link/button roles) were corrected against repository
source/tests; successful administrator and customer runs provide the evidence.
No application change or rate-limit reset/bypass was made. The fake-provider runner
initially failed resolving piped `/dev/stdin`; rerunning Node with `-` passed.

The existing unrelated Nginx IPv6 protocol-options warning remains, with syntax
validation successful. Same-host backup/passphrase storage is not off-site recovery.
Production remains **NO-GO**; provider, public SMTP, monitoring, off-site immutable
recovery, policy/infrastructure and operator-pilot gates remain separate. Command 91
still requires explicit authorization.

### 2026-10-03 prior-main staging deployment

Commit `71558a8` was the isolated staging release before the 2026-10-05 rollout. It contains all application work
through the Commands 76–78 phase review plus a deployment correction that normalizes the
shared shell entrypoint inside both the migration and worker images. The correction was
required because a Windows checkout supplied CRLF line endings and the first one-shot
migration candidate stopped at `bash\r` before connecting to PostgreSQL. The corrected
image passed an in-container line-ending and shell-syntax check before migration was retried.

The deployed images and verified image IDs are:

- `webhost-billing-migration:71558a8` — `sha256:9b2975396a5b...`
- `webhost-billing-api:71558a8` — `sha256:a663d5d16a7a...`
- `webhost-billing-web:71558a8` — `sha256:45cb210ab321...`
- `webhost-billing-worker:71558a8` — `sha256:4d82c8ffab7c...`; used by exactly one
  worker and one scheduler

Before the switch, the deployment created and fully verified this encrypted PostgreSQL
backup:

`/srv/webhost-billing-staging/backups/webhost-billing-webhost_billing_staging-20261003T143421Z.dump.gpg`

Its SHA-256 is
`bfaa3c4e897812c2d6eca3361bafbbadea9b5388b6c8eb03531f9bb78ba668ba`.
Checksum, OpenPGP integrity, archive structure, required tables, PostgreSQL 18.6, and all
21 completed non-rolled-back migrations passed. The final one-shot migration reported
21 migrations and no pending migration.

The protected final-switch environment backup is
`/srv/webhost-billing-staging/rollback/.env.staging-pre-71558a8-20261003T154242Z`.
Because the prior state used mixed historical image tags, the executable rollback
environment is
`/srv/webhost-billing-staging/rollback/.env.staging-rollback-pre-a0a7354`; it is mode
`0600` and resolves the prior API, web, worker, and scheduler images through the verified
`rollback-pre-a0a7354` aliases. Roll back only after confirming schema compatibility:

1. Atomically repoint `current` to `/srv/webhost-billing-staging/releases/b2b2d61`.
2. Install the executable rollback environment as `.env.staging`, preserving mode `0600`.
3. Recreate only `api`, `web`, `worker`, and `scheduler` with `--no-deps --wait`.
4. Rerun health, origin, both-role, authorization, provider-safety, email, browser, and
   single-scheduler checks.

Post-deployment verification passed `/health`, `/ready`, public storefront and live plan
selection in clean Chromium, staging API-origin bundle inspection, administrator settings
in clean Chromium, both credentialed roles, ownership and administrator authorization,
invoice detail/PDF, support detail, password-reset queue and Mailpit delivery, fake payment
and hosting-panel contracts, all four application health checks with zero restarts, exactly
one scheduler, 21 applied migrations, and zero error-level application logs. Host Nginx
configuration validation passed; Nginx was not changed or reloaded. The unrelated
NodeWatch, RemotePilot, MessageDock, and Travel Mate containers remained running, and the
NodeWatch and RemotePilot public endpoints returned valid redirects.

No production environment or real payment, hosting-panel, registrar, or public SMTP
provider was contacted or enabled. Production remains `NO-GO`.

### 2026-08-26 login-origin hotfix

The original `b2b2d61` web image was built with the production example API origin even though
the staging API and Nginx route were healthy. Browsers displayed `Failed to fetch` because
the bundle requested `https://api.billing.example.com`. The replacement
`webhost-billing-web:72ef8ee-login-hotfix1` was built with
`NEXT_PUBLIC_API_URL=https://my.speedhost.bd`; its image ID begins `sha256:2e9a2476f59e`.

Only the Webhost Billing web container was recreated. The protected environment-file backup
is `/srv/webhost-billing-staging/rollback/env-staging-pre-login-hotfix-20260826T103700Z`.
Rollback requires exact image/config review, restoring only the prior `IMAGE_TAG`, recreating
only `web`, and rerunning the browser-origin and credentialed smokes. Do not roll back to the
known-bad web image merely because it is available.

### 2026-08-26 separate entry routes

Web commit `5ee6e7b` removed the public root landing page and established these entry rules:

- `/` returns 307 to `/login`;
- `/login` is the customer sign-in page;
- `/admin` is the administrator sign-in page when no valid session exists;
- anonymous `/admin/*` subpages return to `/admin`, while anonymous `/portal/*` pages return
  to `/login`.

The deployed image is `webhost-billing-web:5ee6e7b-entry-routes`; its image ID begins
`sha256:d27cea3afc5b`. Only `webhost-billing-staging-web-1` was recreated. All non-web
container IDs remained unchanged, and the web container became healthy with zero restarts.
The protected pre-change environment backup is
`/srv/webhost-billing-staging/rollback/env-staging-pre-entry-routes-20260826T111104Z` at mode
`0600`.

Rollback requires restoring only the prior `IMAGE_TAG` after confirming the previous web
image, recreating only `web`, and rerunning the browser-origin, route, and credentialed role
smokes. No schema or data change belongs to this web-only deployment.

### 2026-08-26 settings browser-bundle hotfix

The administrator settings page failed in the browser because the shared CommonJS root
exported Node-only observability code alongside a runtime settings constant. The client chunk
therefore attempted to load `node:async_hooks`. Commit `3bedc40` moved structured logging to
the explicit `@webhost-billing/shared/observability` server subpath and added a package-boundary
regression test.

The deployed image is `webhost-billing-web:3bedc40-settings-hotfix1`; its image ID begins
`sha256:00e328c5184c`. Only `webhost-billing-staging-web-1` was recreated. Every non-web
container retained its ID, and the replacement became healthy with zero restarts. The
protected pre-change environment backup is
`/srv/webhost-billing-staging/rollback/env-staging-pre-settings-hotfix-20260826T115804Z` at
mode `0600`.

Run the clean Chromium regression from the trusted operator workspace without placing the
password in arguments, files or output:

```bash
ssh <strict-pinned-staging-ssh-options> root@my.speedhost.bd \
  'cat /srv/webhost-billing-staging/secrets/staging_admin_password' | \
  NODE_PATH=apps/web/node_modules \
  node deploy/staging/verify-settings-browser.cjs https://my.speedhost.bd
```

Rollback requires restoring only the prior `IMAGE_TAG`, recreating only `web`, and rerunning
the browser settings, browser-origin and credentialed role smokes. No schema, settings value,
API, worker, scheduler or unrelated-service change belongs to this hotfix.

## Provider posture

- Payment: internal fake-adapter contracts passed; bKash and SSLCOMMERZ remain disabled
  because no sandbox credentials were supplied.
- Hosting: the fake hosting-panel contract passed; cPanel/WHM remains disabled because no
  development credentials were supplied.
- Email: staging Mailpit accepted a password-reset message over required STARTTLS. It is
  sandbox delivery, not proof of public SMTP reputation or delivery.
- Registrar: UK2Group remains outside this release and was not contacted.

Credentialed provider testing needs separate authorization, least-privilege sandbox or
development credentials, disposable records, and reviewed mutation limits. Permanent
hosting termination remains a separately confirmed administrator action.

## Backup status

Command 31 created an encrypted PostgreSQL custom-format backup and verified its checksum,
OpenPGP integrity, archive structure, required tables, PostgreSQL version, and all 21
migrations. The backup and passphrase are currently on the same server. This is rollback
evidence, not an off-site or immutable backup. Production remains blocked until an approved
off-site destination and a timed restore drill on production-like hardware are complete.
