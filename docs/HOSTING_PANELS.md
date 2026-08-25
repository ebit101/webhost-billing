# Hosting-Panel Integration

## Selected provider boundary

Webhost Billing supports **cPanel/WHM only** for hosting-account management. The `cpanel-whm` adapter implements the real WHM API boundary; `FakeHostingPanel` remains available outside production for local development and automated tests.

**UK2Group is a separate domain registrar integration.** Registrar contacts, availability, registration, renewal, transfer, nameservers, and domain expiry are different business workflows from a WHM hosting account. UK2Group reseller/API credentials must use a separate adapter, settings namespace, encryption context, authorization boundary, operation history, and test-mode configuration. No value visible in the supplied screenshot was copied into code or documentation.

Before implementing UK2Group, its current official API identity and documentation must be confirmed. The screenshot suggests a reseller/API-key control panel and test mode, but it is not treated as an API specification or as authorization to use credentials.

## HostingPanel contract

The internal `HostingPanel` interface supports:

- connection testing;
- idempotent account creation;
- account lookup and normalized state;
- suspension and unsuspension;
- package and password changes;
- short-lived login URL generation;
- confirmed permanent account termination.

Every call receives a server connection object and strict operation-specific input. Provider responses are normalized into a safe account containing only external account ID, username, domain, package identifier, and `ACTIVE`, `SUSPENDED`, or `MISSING` state.

`FakeHostingPanel` uses the server adapter key `fake-panel` and is available only outside production. It performs no network request and stores only in-memory fictional accounts.

## cPanel/WHM API contract

The real adapter uses WHM API 1 through `https://<hostname>:2087/json-api/<function>` or the documented secure service-subdomain port `443`. Every request includes `api.version=1`, rejects redirects, and authenticates with a WHM API token in the `Authorization: whm username:token` header. Password and access-hash authentication are not supported by this application. See cPanel's official [WHM API token](https://api.docs.cpanel.net/whm/tokens), [authentication](https://api.docs.cpanel.net/guides/guide-to-api-authentication), and [WHM API 1](https://api.docs.cpanel.net/whm/introduction) documentation.

| Internal operation    | Official WHM API 1 function |
| --------------------- | --------------------------- |
| Connection test       | `get_current_users_count`   |
| Create account        | `createacct`                |
| Account status        | `accountsummary`            |
| Suspend               | `suspendacct`               |
| Unsuspend             | `unsuspendacct`             |
| Change package        | `changepackage`             |
| Change password       | `passwd`                    |
| Temporary cPanel link | `create_user_session`       |
| Terminate             | `removeacct`                |

The implementation follows the official [account creation](https://api.docs.cpanel.net/specifications/whm.openapi/account-creation), [account management](https://api.docs.cpanel.net/specifications/whm.openapi/account-management), [suspension](https://api.docs.cpanel.net/specifications/whm.openapi/suspensions/suspendacct), [password](https://api.docs.cpanel.net/specifications/whm.openapi/passwords), and [temporary session](https://api.docs.cpanel.net/specifications/whm.openapi/session/create_user_session) contracts. cPanel documents `removeacct` as the account-deletion function in its [official support procedure](https://support.cpanel.net/hc/en-us/articles/4402603305495-How-to-Delete-cPanel-account-using-WHM-API).

Account creation derives a stable 16-character lowercase username from the service UUID. It first queries by username and domain. An exact existing username/domain/package is an idempotent replay; any conflicting account is held as inconsistent. The adapter requests `showpass=n` and lets cPanel generate the initial password. Every successful mutation is followed by `accountsummary`; failure to prove the resulting state is inconsistent rather than safely retryable.

Temporary login URLs must be HTTPS, contain no URL credentials, and use the configured server hostname. cPanel reports that `create_user_session` sessions expire after 15 minutes of inactivity. The URL is returned only to the authorized request and is never stored.

## Credential configuration

Administrators configure a server through `POST /hosting-panel/servers/:serverId/cpanel-configuration` or the hosting-panel connection form. The request requires:

- a fully qualified hostname;
- secure port `2087` or `443`;
- a WHM root or reseller username;
- a newly entered WHM API token; and
- exact `CONFIGURE_CPANEL` confirmation.

The token is encrypted with AES-256-GCM under a cPanel-specific, versioned key derivation and authenticated additional data bound to the server UUID. PostgreSQL stores only the ciphertext and `cpanel-token-v1` key version. The API and interface return only `credentialConfigured`; neither ciphertext nor plaintext is returned. Submitting a new token rotates the stored ciphertext and creates a `CPANEL_SERVER_CONFIGURED` activity record without the token, hostname, or response data.

`CREDENTIAL_ENCRYPTION_KEY` must be backed up and managed outside Git. Losing or changing it without a rotation plan makes existing tokens unreadable. Re-enter the token through the configuration form to recover an unreadable or revoked credential.

## Durable operation workflow

Every attempt has a `hosting_panel_operations` row with:

- service/server and requesting administrator;
- operation and adapter snapshot;
- HMAC request fingerprint and unique submission key;
- attempt number and optional retry parent;
- `RUNNING`, `SUCCEEDED`, `FAILED`, or `INCONSISTENT` status;
- safe temporary/permanent/inconsistent error classification;
- explicitly safe request/result metadata; and
- UTC start/completion timestamps.

Passwords, credentials, raw provider responses, and generated login URLs are never persisted. A repeated matching submission returns the original operation. Reusing its UUID for another payload conflicts. One running operation per service is allowed by the application orchestration lock.

All provider calls use the bounded `HOSTING_PANEL_TIMEOUT_MS` setting (10 seconds by default, permitted range 1–30 seconds). A read timeout is temporarily retryable. A mutation timeout, network failure, provider `5xx`, oversized response, or malformed mutation response is `INCONSISTENT` because the upstream change may have succeeded; it must be reconciled before another mutation. There is no automatic provider retry.

Temporary failures may be retried manually, creating a new child operation. The application caps a retry chain at five attempts. Password changes require a newly entered password, and termination requires `TERMINATE` confirmation again. Permanent failures and inconsistent results cannot use the retry endpoint.

## Service coordination

- `CREATE_ACCOUNT` is allowed for `PENDING` or `PROVISION_FAILED` services. It first records `PROVISIONING`; only a validated active provider account supplies the external ID/username and activates the service.
- Provisioning failure leaves the payment and order history intact and moves the service to `PROVISION_FAILED` with a safe reason.
- `SUSPEND_ACCOUNT` and `UNSUSPEND_ACCOUNT` update service state only after the adapter returns the expected matching account.
- Account lookup compares external ID, username, domain, and expected state. A mismatch is held for reconciliation.
- Termination is allowed only for active/suspended services, requires an administrator reason plus exact confirmation, and updates service termination metadata only after provider success.
- A processing order completes only after every purchased service is active.

## API and authorization

| Method | Route                                                   | Access          | Purpose                                        |
| ------ | ------------------------------------------------------- | --------------- | ---------------------------------------------- |
| `GET`  | `/hosting-panel/operations`                             | Administrator   | Filtered durable operation history             |
| `POST` | `/hosting-panel/servers/:serverId/test`                 | Administrator   | Idempotent adapter connection test             |
| `POST` | `/hosting-panel/servers/:serverId/cpanel-configuration` | Administrator   | Encrypt and rotate WHM API-token configuration |
| `POST` | `/hosting-panel/services/:serviceId/operations`         | Administrator   | Run a validated hosting action                 |
| `POST` | `/hosting-panel/operations/:operationId/retry`          | Administrator   | Deliberate retry of a safe temporary failure   |
| `POST` | `/hosting-panel/services/:serviceId/login-url`          | Owning customer | Generate an ephemeral panel login URL          |

Customer ownership is checked at the service layer. Customers cannot run account mutations or access another customer's login URL. Administrator and customer interfaces display safe normalized failures only.

## Least-privilege token

Prefer a dedicated reseller identity limited to the accounts and packages managed by this application. Based on cPanel's official [ACL reference](https://api.docs.cpanel.net/guides/guide-to-whm-plugins/guide-to-whm-plugins-acl-reference-chart), the complete feature set needs `list-accts`, `acct-summary`, `create-acct`, `suspend-acct`, `upgrade-account`, `passwd`, `create-user-session`, and `kill-acct`. Restrict the token to the billing application's outbound IP where operationally possible.

`passwd`, `create-user-session`, and `kill-acct` are high-risk privileges. cPanel warns that Create User Session can bypass restrictions on an API token. Omit capabilities the business does not need, and expect their related application operations to fail safely. Never grant `all` merely to make a connection test pass.

## Manual development-server verification checklist

This checklist is documentation, not authorization. Do not perform it until the owner explicitly approves the exact server, account, package, domain, and mutation sequence.

1. Confirm the WHM hostname and certificate identity. Use HTTPS port `2087` or approved service-subdomain port `443`; do not disable TLS verification.
2. Create a dedicated development reseller/token with only the required ACLs, an expiry, and an outbound-IP restriction. Record the token only in the encrypted configuration form.
3. Create two clearly disposable development packages: the initial package and a package-change target. Confirm neither is used by a real customer.
4. Select a disposable development domain/account, confirm a usable backup exists, and record the owner-approved termination target separately.
5. Configure the server in the administrator interface. Verify the response exposes only `credentialConfigured` and the key version.
6. Authorize and run the read-only connection test. Stop on hostname, TLS, authentication, privilege, or response-shape failure.
7. Under a separately approved mutation window, provision exactly one disposable account. Repeat the same local submission key and confirm no second account is created.
8. Query identity, domain, package, and state. Then test suspension, unsuspension, package change, password change, and temporary login in that order, reconciling after each result.
9. Perform termination only if the exact disposable username is rechecked and the owner explicitly approves `TERMINATE`. Confirm `accountsummary` reports the account absent.
10. Export safe operation/audit evidence, revoke or narrow the test token, and record any cPanel-version differences. Never copy raw provider responses or session URLs into the report.

Abort immediately if the target identity differs, a real-customer account appears, a result is uncertain, TLS validation fails, or the requested function exceeds the approved scope.

## Command 16 boundary

Command 16 implements and validates the adapter entirely with mocks. No cPanel credential was configured, no development-server request was sent, and no live mutation was attempted during automated development.

UK2Group domain integration is not part of Command 16. It requires a separately authorized registrar command and domain-specific data/workflow design.
