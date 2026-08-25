# Hosting-Panel Integration

## Selected provider boundary

Webhost Billing will support **cPanel/WHM only** for hosting-account management. Command 15 implements the provider-neutral contract and `FakeHostingPanel`; the real cPanel/WHM adapter, credential encryption/configuration, and any development-server request remain Command 16.

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

`FakeHostingPanel` uses the server adapter key `fake-panel` and is available only outside production. It behaves like the future cPanel/WHM boundary but performs no network request and stores only in-memory fictional accounts.

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

All provider calls have a five-second Command 15 timeout. A read timeout is temporarily retryable. A mutation timeout is `INCONSISTENT` because the upstream change may have succeeded; it must be reconciled before another mutation. There is no automatic provider retry.

Temporary failures may be retried manually, creating a new child operation. The application caps a retry chain at five attempts. Password changes require a newly entered password, and termination requires `TERMINATE` confirmation again. Permanent failures and inconsistent results cannot use the retry endpoint.

## Service coordination

- `CREATE_ACCOUNT` is allowed for `PENDING` or `PROVISION_FAILED` services. It first records `PROVISIONING`; only a validated active provider account supplies the external ID/username and activates the service.
- Provisioning failure leaves the payment and order history intact and moves the service to `PROVISION_FAILED` with a safe reason.
- `SUSPEND_ACCOUNT` and `UNSUSPEND_ACCOUNT` update service state only after the adapter returns the expected matching account.
- Account lookup compares external ID, username, domain, and expected state. A mismatch is held for reconciliation.
- Termination is allowed only for active/suspended services, requires an administrator reason plus exact confirmation, and updates service termination metadata only after provider success.
- A processing order completes only after every purchased service is active.

## API and authorization

| Method | Route                                           | Access          | Purpose                                      |
| ------ | ----------------------------------------------- | --------------- | -------------------------------------------- |
| `GET`  | `/hosting-panel/operations`                     | Administrator   | Filtered durable operation history           |
| `POST` | `/hosting-panel/servers/:serverId/test`         | Administrator   | Idempotent adapter connection test           |
| `POST` | `/hosting-panel/services/:serviceId/operations` | Administrator   | Run a validated hosting action               |
| `POST` | `/hosting-panel/operations/:operationId/retry`  | Administrator   | Deliberate retry of a safe temporary failure |
| `POST` | `/hosting-panel/services/:serviceId/login-url`  | Owning customer | Generate an ephemeral panel login URL        |

Customer ownership is checked at the service layer. Customers cannot run account mutations or access another customer's login URL. Administrator and customer interfaces display safe normalized failures only.

## Command 16 boundary

Command 16 must consult current official cPanel/WHM API documentation and implement the real `cpanel-whm` adapter. It must add independently encrypted credentials, connection configuration, mocked API contract tests, and a documented manual development-server checklist. No production credential, live server mutation, or permanent termination may occur without separate explicit authorization.

UK2Group domain integration is not part of Command 16. It requires a separately authorized registrar command and domain-specific data/workflow design.
