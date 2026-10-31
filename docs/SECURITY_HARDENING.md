# Security Hardening

## Command 24 outcome

Command 24 completed a repository-wide hardening pass over the private billing application. The review covered authentication/session handling, CSRF, role and object authorization, validation, injection and XSS boundaries, rate limits, payment proof/replay handling, external-request and redirect safety, credential storage, logging, dependencies, headers/CORS, administrator MFA, file handling, and audit coverage.

This document records implemented controls and remaining operational duties. It is not a penetration-test certificate or a substitute for deployment review.

## Authentication and sessions

- Passwords use Argon2id. Opaque session/action/challenge tokens are generated with 256 bits of randomness and stored only as SHA-256 hashes.
- Browser sessions use HttpOnly, path-root, `SameSite=Lax` cookies. Production uses `Secure` and the `__Host-` prefix.
- Customer sessions have an absolute configured expiry and a one-hour idle expiry. Administrator sessions have a renewable 365-day expiry and no idle cutoff; the workspace refreshes their cookie while visible. Explicit sign out, revocation, password reset and MFA enforcement remain in effect. Idle customer sessions and administrator sessions missing a newly required second factor are revoked with an audit reason.
- Password reset is single-use, expires, and revokes every active session. It does not remove or bypass administrator MFA.
- Public registration cannot create administrators. Registration, verification, login, MFA login, and password-reset entry points have Redis-backed limits which fail closed.

## Administrator TOTP MFA

Administrators can enroll from `/account`. Enrollment requires the current password and one valid six-digit TOTP before activation.

- TOTP follows RFC 6238 with a random 160-bit base32 secret, SHA-1 compatibility mode, six digits, a 30-second period, and a one-step clock window.
- Secrets use purpose-derived AES-256-GCM authenticated encryption. The API returns the secret only during pending setup; it is never logged or included in audit metadata.
- An enrolled administrator receives a five-minute opaque login challenge after password verification. The challenge is hashed at rest, bound to the keyed source-address hash, limited to five attempts, and consumed once.
- Accepted TOTP time steps are updated atomically. A previously accepted code cannot create another session.
- Ten random 80-bit recovery codes are generated. Only keyed hashes are stored; codes are single-use and can be replaced only with the current password plus a valid TOTP/recovery code.
- Enabling MFA revokes other sessions. Disabling MFA requires password reauthentication plus a second factor, revokes every session, and forces a new login.

MFA is available but not silently forced onto an existing administrator. Enroll every production administrator before exposing the application publicly, store recovery codes offline, and monitor remaining-code count.

## Browser and HTTP boundary

- Unsafe browser requests require the signed double-submit CSRF token in the cookie and `X-CSRF-Token`. Cookie/header equality and the HMAC signature use constant-time comparisons.
- Foreign `Origin` and `Sec-Fetch-Site: cross-site` unsafe requests are rejected. Provider callbacks deliberately skip browser CSRF only where provider-specific server authentication/validation applies.
- API CORS permits exactly `WEB_ORIGIN`, credentials, a fixed method/header set, and a bounded preflight cache. Production public origins must be credential-free HTTPS origins without path/query/fragment.
- The API trusts forwarded addresses only from loopback reverse proxies. Configure the production proxy to replace, not append untrusted forwarding headers.
- Helmet supplies API security headers. The web application supplies CSP, clickjacking, MIME-sniffing, referrer, permissions, opener, and production HSTS headers. The static Next.js CSP retains framework-required inline script/style support; it blocks third-party script, object, frame, base, and form destinations.
- Authenticated API responses and security-token responses are non-cacheable.

## Authorization, validation, injection, and files

- Authentication is default-on. Administrator routes require the server-resolved role; customer resources use the authenticated customer ID and service-layer ownership checks. URL UUIDs and body fields never select another authenticated identity.
- All external request bodies/queries use strict bounded Zod contracts. Provider responses are narrowed before use and capped at the HTTP boundary.
- Database access uses Prisma and parameterized tagged queries. No unsafe raw-query API is used.
- React renders stored/customer text as text. Ticket contracts reject HTML-like markup, email templates independently escape content, and CSV exports neutralize spreadsheet formulas.
- There are no upload or attachment endpoints in the release. File-shaped ticket/payment input is rejected. Adding uploads requires separately authorized private storage, authenticated retrieval, signature/MIME allowlists, size/count limits, filename normalization, malware scanning, retention, and audit controls.

## Payments and external integrations

- A redirect is never payment proof. Payment processing validates provider authentication, merchant, payment/invoice identity, exact integer amount, currency, transaction uniqueness, invoice state, and event replay identity before settlement.
- bKash browser returns trigger authenticated execute/query. SSLCOMMERZ IPNs require authoritative validation. Callback processing and retryable operations are idempotent.
- Provider API requests reject redirects, have bounded timeouts/response parsing, and use pinned sandbox API endpoints.
- Provider-returned customer checkout URLs must be credential-free HTTPS and match pinned bKash or SSLCOMMERZ sandbox hosts before storage or browser navigation.
- cPanel calls require HTTPS on port 2087/443, a valid hostname, certificate validation, redirect rejection, bounded responses, and a DNS preflight in which every resolved address is public. Login URLs must use the configured hostname, HTTPS, no URL credentials, and port 443/2083.
- DNS preflight does not replace network egress policy. Production should restrict API/worker egress to the approved cPanel and payment destinations to reduce DNS-rebinding and future integration risk.

## Secrets, logs, and audit

Command 158 dependency checkpoint, 2026-10-31: the production audit identified
[GHSA-6pq8-jhm2-2vcw](https://github.com/advisories/GHSA-6pq8-jhm2-2vcw), a moderate
qs comma-serialization denial-of-service issue. The existing workspace override
now pins the [upstream fixed 6.16.1 release](https://github.com/ljharb/qs/releases/tag/v6.16.1).
Actual Express/body-parser consumers resolve that version; new regression cases
exercise hostile/null-prototype objects and ordinary query compatibility. All
18 installed tooling/runtime security cases, frozen install and `pnpm audit --prod`
pass, with no known production dependency advisories at this checkpoint. This does
not claim every development advisory is absent or the installed staging images are
updated. Existing exact-version tooling patches remain mandatory and tested.
Production remains NO-GO under the [current gate register](PRODUCTION_READINESS_REVIEW.md).

The separate full dependency audit at this checkpoint reports 11 development/build
findings (2 high, 7 moderate, 2 low). The high paths are Vite and a transitive lint
tool's older Zod; runtime shared Zod is already 4.6.6. These findings still require
compatible remediation and complete toolchain regression validation. Existing
targeted patches do not waive unrelated advisories, and production-only audit
clearance does not imply the full graph is clear. Keep development servers private.

Command 159 follow-up, 2026-10-31: reviewed upstream tooling updates and a mandatory
exact-version deepmerge patch pass 28 installed security/compatibility cases. The
raw full audit now reports 0 high, 1 moderate and 1 low findings; it still exits
nonzero. Retained legacy minimatch lacks the reported amplification routine, and
the deepmerge warning identifies the version containing the enforced source patch.
No scanner warning is ignored or waived. See the
[remediation register](TOOLCHAIN_SECURITY_REMEDIATION.md) for actual-consumer probes,
source applicability and full acceptance results. This does not update staging or
close unrelated production operating gates.

- Payment bundles, WHM tokens, action-delivery tokens, and MFA secrets use provider/purpose-bound authenticated encryption. Configuration responses expose only safe status/masking data.
- Production session and encryption secrets must be distinct non-placeholder values of at least 48 characters. Store them outside Git and rotate using the documented maintenance procedures.
- Errors use stable safe messages. Unknown exceptions, raw provider responses, credentials, passwords, action tokens, MFA secrets/codes, session tokens, ticket bodies, and IP addresses are excluded from logs and API errors.
- Security activity includes registration/verification, successful and failed login, MFA challenge/failure/setup/enable/disable/recovery rotation, resets, logout/revocation, authorization denials, settings/credential changes, payment verification, exports, support changes, and automatic session revocation.

## Dependency and verification evidence

The known `deepmerge-ts <8.0.0` Prisma-tooling advisory was remediated with a workspace override to `8.0.0`, after which Prisma generation, migration, validation, structural verification, builds, and all tests passed. `pnpm audit --prod` reports no known vulnerabilities as of 2026-08-26.

Validation included repository lint/format/type checks, production builds, Prisma schema/migration verification, Docker Compose validation, dependency audit, 168 unit/component tests, and 61 PostgreSQL/Redis-backed API E2E tests. Regression coverage includes MFA/recovery replay, foreign-origin CSRF, ownership/role boundaries, unsafe payment redirects, private-address cPanel resolution, password/token cryptography, webhook invariants, and file-shaped/markup input rejection.

## Production checklist

1. Use a real HTTPS domain for both web and API origins; terminate TLS at the reviewed reverse proxy and preserve exact Host/forwarding policy.
2. Generate distinct high-entropy session/encryption/database/Redis/SMTP/provider secrets and keep them in a managed secret store.
3. Enroll administrator MFA and secure recovery codes before public exposure.
4. Restrict database/Redis to private interfaces, set Redis authentication/no-eviction/durability, and permit API proxy traffic only from expected sources.
5. Apply outbound firewall/allowlist controls for approved payment, SMTP, and cPanel destinations.
6. Configure least-privilege, IP-restricted, expiring WHM and provider sandbox credentials; keep production payment endpoints disabled until separately authorized.
7. Monitor rate-limit failures, automatic session revocations, MFA failures, payment rejections/replays, hosting inconsistencies, queue failures, and credential changes.
8. Re-run locked install, `pnpm audit --prod`, lint, typecheck, tests, E2E tests, builds, migration status, and schema verification for every release.
