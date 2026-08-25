# Settings and Secrets

Command 21 adds one administrator settings workspace at `/admin/settings` and an admin-only REST boundary at `/settings`. The design deliberately keeps validated ordinary configuration separate from encrypted credentials.

## Ordinary settings

Ordinary settings remain JSON values in the `settings` table. Every value is parsed through a strict shared Zod schema before use or update.

| Key                                   | Purpose                                                                  |
| ------------------------------------- | ------------------------------------------------------------------------ |
| `business.identity`                   | Legal name and billing contact/address snapshotted onto future invoices  |
| `business.localization`               | One operating currency and IANA business time zone                       |
| `billing.invoice-numbering`           | Prefix, zero-padding, and next sequential invoice number                 |
| `automation.renewal-policy`           | Renewal lead time, reminder schedule, grace period, and scheduler state  |
| `business.termination-policy`         | Fixed `ADMIN_CONFIRMATION_REQUIRED` policy with `TERMINATE` confirmation |
| `billing.manual-payments`             | Partial-payment policy                                                   |
| `billing.manual-payment-instructions` | Customer-visible bank/cash/mobile-payment instructions                   |
| `email.branding`                      | Brand name/color and sender/reply-to identity                            |
| `integration.active-providers`        | Active payment gateway and hosting-panel adapter                         |

The settings API updates the document transactionally and writes a security audit record containing setting keys and adapter names, not credentials. Customers cannot read the administrator settings document. They can read only the safe manual-payment instructions through `GET /payments/manual/instructions`.

Invoice allocation locks the numbering setting row, formats the configured prefix and padding, increments the counter in the same PostgreSQL transaction, and relies on the invoice-number unique constraint as an additional guard. Issued invoice snapshots and historical numbers are never rewritten.

The business time zone is also the renewal scheduler time zone. Saving either the settings page or the existing renewal-policy screen keeps both records aligned. Permanent termination remains manual and is never scheduled.

## Secret boundary

bKash and SSLCOMMERZ credential bundles are stored only in `integration_credentials`. The API encrypts the complete provider bundle with AES-256-GCM using a domain-separated key derived from deployment-provided `CREDENTIAL_ENCRYPTION_KEY`. The provider key is authenticated as additional data, so ciphertext cannot be moved between providers.

`PUT /settings/credentials` is administrator-only, CSRF-protected, requires the exact `REPLACE_CREDENTIALS` confirmation, validates a complete provider bundle, and replaces it atomically. Responses contain only:

- configured/not-configured state;
- a masked merchant identifier;
- the non-secret encryption format version;
- the update time and management location.

The endpoint never returns plaintext or ciphertext. Audit metadata records only the provider and key version. The settings interface clears credential inputs after a successful write.

cPanel/WHM tokens remain encrypted per `Server` record because different WHM servers can use different usernames and tokens. The settings overview reports only the number of configured WHM servers and their key-version state; token replacement remains in the hosting server manager. SMTP authentication remains a deployment-managed worker secret. Email branding and sender identity are ordinary settings, while SMTP passwords must stay outside the settings JSON.

Environment-based bKash/SSLCOMMERZ credentials remain a deployment fallback for existing installations. A database-encrypted credential bundle takes precedence. Never commit either form.

## Provider credential rotation

1. Obtain a new sandbox credential bundle through the provider's trusted control panel.
2. Keep the online gateway inactive or select manual payments during the change.
3. Enter the complete new bundle in `/admin/settings`; partial updates are rejected.
4. Confirm that the page shows the expected masked identifier and a new update time.
5. Activate the gateway and run a low-risk sandbox checkout plus callback/reconciliation check.
6. Revoke the old provider credential only after the new bundle succeeds.

bKash access tokens are tied to the stored credential revision, so replacing the bundle invalidates the application's cached token on its next provider call.

## Master encryption-key rotation

The initial release supports one active master key and does not attempt automatic dual-key migration. Treat master-key rotation as planned maintenance:

1. Take and verify a protected PostgreSQL backup, and retain the old key in the deployment secret manager for rollback.
2. Select manual payments, stop external automation, and inventory configured bKash, SSLCOMMERZ, and WHM entries using status only—not secret values.
3. Deploy a new independent high-entropy `CREDENTIAL_ENCRYPTION_KEY`.
4. Re-enter every payment credential bundle and every WHM server token. Replacement does not need to decrypt the old ciphertext.
5. Test each provider/WHM connection and resume automation only after every required entry is replaced.
6. Remove the old key only after the verification window and a tested rollback is no longer required.

Changing the key without re-entering every encrypted credential makes the old ciphertext unreadable. A database restore also requires the matching historical key. Do not rotate the session secret and encryption key in the same maintenance event.

## Recovery and logging

- Never paste credentials into tickets, payment evidence, logs, job payloads, screenshots, or audit notes.
- A `configured` status proves only that ciphertext exists; a provider connection test proves whether the current deployment key and provider credential are usable.
- If decryption fails, keep the provider inactive and replace its complete credential bundle.
- Restore settings and `integration_credentials` together with the rest of PostgreSQL; do not export plaintext credentials for backup.
