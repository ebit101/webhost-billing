# Webhost Billing Authentication

## Scope

Command 5 implements customer registration, email verification, login, logout, password reset, role and ownership enforcement, and session management. Command 24 adds administrator TOTP MFA, idle expiry, broader public-route limits, origin/fetch-metadata CSRF defense, and automatic session-revocation audit. The API is the authority for authentication and authorization. The Next.js application only calls these endpoints with browser cookies; it does not persist authentication tokens in `localStorage` or `sessionStorage`.

## Security model

- Passwords are hashed with Argon2id using 19,456 KiB memory, two iterations, and one degree of parallelism. Plaintext passwords are never stored.
- Session tokens and action tokens are 256-bit random values. PostgreSQL stores only their SHA-256 hashes.
- The session token is carried in an HttpOnly, `SameSite=Lax`, path-root cookie. Production uses `Secure` and the `__Host-` prefix.
- Every unsafe request (`POST`, `PUT`, `PATCH`, and `DELETE`) must include the signed CSRF value in both the CSRF cookie and `X-CSRF-Token` header. Cookie/header and signature comparisons are constant-time. Foreign browser origins and cross-site fetch metadata are rejected.
- API CORS accepts the configured `WEB_ORIGIN` and credentials. Production must use the exact HTTPS web origin.
- Authentication is required by default. Routes must be deliberately marked public.
- Redis-backed fixed-window limits protect registration, verification, login, MFA login, password-reset, payment-callback, ticket-create, and ticket-reply routes. The limiter fails closed if Redis is unavailable.
- IP addresses are represented in audit data and rate-limit fingerprints by keyed hashes rather than plaintext.

Development cookie names are `webhost_session` and `webhost_csrf`. Production cookie names are `__Host-webhost_session` and `__Host-webhost_csrf`.

## Account lifecycle

### Customer registration and verification

`POST /auth/register` creates a `CUSTOMER` user in `PENDING_VERIFICATION`, its customer profile, a single-use verification-token record, a pending outbox event, and an audit event in one database transaction. Public registration can never create an administrator.

The raw verification token is encrypted with AES-256-GCM for future email delivery and is not placed in the outbox payload. The database stores a hash for lookup. `POST /auth/verify-email` consumes a valid unexpired token once and activates the user.

An email worker/provider is not part of Command 5. Until that provider is implemented, the outbox structure is ready but no real verification email is delivered.

### Login and sessions

`POST /auth/login` uses a generic invalid-credentials response and performs password work even when the account is absent. Pending-verification, inactive, deleted, expired-session, and revoked-session states do not produce authenticated access.

Successful login creates a database-backed session and sets the HttpOnly cookie. Session activity is refreshed at a bounded interval rather than on every request. A session expires at its absolute configured expiry or after one hour without activity. Users can inspect sessions, revoke an individual session, sign out the current session, or revoke all sessions. A completed password reset also revokes all existing sessions.

### Administrator two-factor authentication

An administrator enrolls from `/account` by re-entering the current password, adding the random 160-bit base32 secret to a TOTP authenticator, and proving one six-digit code. The secret uses purpose-derived AES-256-GCM encryption. Enabling MFA records the accepted 30-second time step, creates ten single-use keyed-hash recovery codes, marks the current session verified, and revokes other sessions.

Later password login returns a five-minute opaque MFA challenge instead of a session. The challenge is hashed at rest, bound to the keyed source-address hash, limited to five failures, and consumed atomically with one accepted TOTP time step or recovery code. Replays cannot create another session. Password reset leaves MFA enabled.

Recovery-code rotation and MFA disable both require the current password plus an authenticator/recovery code. Disable revokes every session and forces login. Recovery codes are shown only at creation/rotation and must be stored offline.

### Password reset

`POST /auth/password-reset/request` always returns the same accepted response, whether or not the account exists. A new request supersedes earlier unused reset tokens. The raw token follows the same hash-plus-encrypted-delivery design as verification tokens.

`POST /auth/password-reset/confirm` atomically consumes one unexpired token, updates the Argon2id password hash, and revokes all active sessions. Used, superseded, invalid, and expired tokens return the same stable `INVALID_OR_EXPIRED_TOKEN` error.

## Authorization

The supported roles are `ADMIN` and `CUSTOMER`.

- A narrowly matched Next.js Proxy redirects `/admin/**` and `/portal/**` requests without a recognized session cookie to `/login` before route rendering. The workspace server layouts then validate any presented HttpOnly session against `GET /auth/me` before rendering their shells. Expired sessions redirect to `/login`; a valid user who opens the other role's workspace is redirected to their own workspace.
- The server-rendering guard forwards only the recognized session cookie, disables fetch caching, validates the API response through the shared runtime identity schema, and fails closed if authentication cannot be verified. It complements rather than replaces API role and ownership enforcement.
- The global session guard protects routes unless `@Public()` is explicitly present.
- `@Roles('ADMIN')` protects administrator-only endpoints.
- `@RequireCustomerOwnership('customerId')` requires a customer to own the referenced customer resource; administrators may pass the ownership boundary.
- Ownership is resolved from the authenticated server-side identity, never from a role or customer identifier supplied by the browser.

`GET /auth/admin-check` and `GET /auth/customer-profile/:customerId` are intentionally small authorization probes for Command 5. Feature modules must apply the same service/API-layer checks when their routes are introduced.

Administrator accounts are not publicly registrable. They must be provisioned through a trusted operational process; the fictional development seed remains non-authenticating because it has no password.

## API endpoints

| Method   | Endpoint                             | Access                     | Purpose                              |
| -------- | ------------------------------------ | -------------------------- | ------------------------------------ |
| `GET`    | `/auth/csrf`                         | Public                     | Issue a signed CSRF token and cookie |
| `POST`   | `/auth/register`                     | Public + CSRF              | Register a customer                  |
| `POST`   | `/auth/verify-email`                 | Public + CSRF              | Consume an email-verification token  |
| `POST`   | `/auth/login`                        | Public + CSRF + rate limit | Password login or MFA challenge      |
| `POST`   | `/auth/login/two-factor`             | Public + CSRF + rate limit | Complete an administrator challenge  |
| `POST`   | `/auth/password-reset/request`       | Public + CSRF + rate limit | Queue reset instructions generically |
| `POST`   | `/auth/password-reset/confirm`       | Public + CSRF + rate limit | Set a new password once              |
| `GET`    | `/auth/me`                           | Authenticated              | Return the server-resolved identity  |
| `GET`    | `/auth/sessions`                     | Authenticated              | List active sessions                 |
| `DELETE` | `/auth/sessions/:sessionId`          | Authenticated + CSRF       | Revoke one owned session             |
| `POST`   | `/auth/logout`                       | Authenticated + CSRF       | Revoke the current session           |
| `POST`   | `/auth/logout-all`                   | Authenticated + CSRF       | Revoke all user sessions             |
| `GET`    | `/auth/two-factor`                   | Administrator              | Read safe enrollment status          |
| `POST`   | `/auth/two-factor/setup`             | Administrator + CSRF       | Start password-confirmed enrollment  |
| `POST`   | `/auth/two-factor/enable`            | Administrator + CSRF       | Verify TOTP and enable MFA           |
| `POST`   | `/auth/two-factor/recovery-codes`    | Administrator + CSRF       | Replace recovery codes with reauth   |
| `DELETE` | `/auth/two-factor`                   | Administrator + CSRF       | Disable with reauth and revoke all   |
| `GET`    | `/auth/admin-check`                  | Administrator              | Verify role enforcement              |
| `GET`    | `/auth/customer-profile/:customerId` | Owner or administrator     | Verify resource ownership            |

## Rate limits

- Login: five attempts per 15 minutes for the keyed IP/email fingerprint.
- Administrator MFA login: five attempts per 15 minutes for the keyed source fingerprint; each challenge also permits at most five failures.
- Registration: five attempts per hour for the keyed IP/email fingerprint.
- Email verification: ten attempts per 15 minutes for the keyed source fingerprint.
- Password-reset request: three attempts per hour for the keyed IP/email fingerprint.
- Password-reset confirmation: five attempts per 15 minutes for the keyed request fingerprint.

The `AUTH_RATE_LIMIT_NAMESPACE` isolates counters between environments and test runs. Production deployments should share the same namespace only among instances of the same environment.

## Audit and delivery records

Security-sensitive actions append activity records for registration, verification, successful and failed login, MFA challenge/failure/setup/enable/disable/recovery rotation, reset request/completion, logout, logout-all, individual session revocation, and automatic idle/MFA revocation. Failed-login metadata does not contain a password, code, recovery code, challenge, or session token.

Verification and reset delivery work is represented by idempotent `OutboxEvent` rows. Payloads include the recipient, purpose, and token-record identifier, but never the raw token. A future trusted email worker must decrypt the token immediately before rendering the message and must never log or retain it.

## Required configuration

The API validates:

- `WEB_ORIGIN` (an exact credential-free origin; HTTPS outside loopback in production)
- `SESSION_SECRET` (at least 32 characters; distinct random 48+ characters in production)
- `CREDENTIAL_ENCRYPTION_KEY` (at least 32 characters; distinct random 48+ characters in production)
- `SESSION_TTL_SECONDS`
- `PASSWORD_RESET_TTL_SECONDS`
- `EMAIL_VERIFICATION_TTL_SECONDS`
- `AUTH_RATE_LIMIT_NAMESPACE`
- `DATABASE_URL` and `REDIS_URL`

Rotate secrets through a planned operational procedure. Rotating `SESSION_SECRET` invalidates CSRF signatures and changes audit/rate-limit hashes; changing the credential encryption key without a key-migration plan makes undelivered encrypted tokens unreadable.

## Verification

With PostgreSQL and Redis healthy:

```bash
pnpm --filter @webhost-billing/api test:e2e
```

The authentication suite uses isolated fictional `.test` accounts and cleans only those test identities. It covers successful registration, verification and login; generic invalid credentials; foreign-origin CSRF; expired and reused tokens; role denial; cross-customer access denial; session revocation after password reset; logout-all; administrator authorization; MFA enrollment; encrypted-secret storage; password-to-MFA login; and single-use recovery-code replay rejection.
