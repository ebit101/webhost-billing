# Production SMTP Acceptance

## Status

Command 38 is blocked before mutation. This record captures the safe read-only preflight
performed on 2026-08-26 at 12:58 UTC. It does not approve a provider, authorize DNS changes,
enable production email, or authorize messages to customers.

## Required owner inputs

Do not change DNS, install credentials, connect the application to an external relay, or send
an acceptance message until every item below has an owner-approved value.

| Input                     | Required evidence                                                                      | Current state |
| ------------------------- | -------------------------------------------------------------------------------------- | ------------- |
| SMTP provider and account | Legal/provider name, account or tenant identifier, and authorized operator             | Missing       |
| Cost approval             | Plan, quota, overage behavior, and approved monthly/transactional cost                 | Missing       |
| Sender identity           | Exact envelope sender, `From`, sender name, and optional `Reply-To`                    | Missing       |
| Sender domain control     | Provider verification state and owner of the DNS zone                                  | Missing       |
| Fictional test inboxes    | Controlled, deliverable test-only addresses with no real customer identity             | Missing       |
| DNS authorization         | Approved SPF/DKIM/DMARC records, change operator, window, and rollback values          | Missing       |
| Protected credentials     | SMTP username/password or an explicitly approved alternative authentication method     | Missing       |
| Reputation operations     | Bounce/complaint owner, suppression process, alert destination, and response time      | Missing       |
| Credential lifecycle      | Primary/backup custodian, rotation interval, revocation procedure, and escrow location | Missing       |
| Rollback/disable plan     | Named operator and exact method to stop the worker or restore the sandbox transport    | Missing       |

Credentials must be entered only into the approved protected production secret storage. Never
paste them into this document, Git, a command argument, a ticket, or application settings.

## Read-only evidence

### Application and host

- The only deployed namespace is `webhost-billing-staging`; no production Compose namespace or
  production worker exists.
- Staging sends to its private Mailpit container on port 1025 using required STARTTLS. Mailpit
  is not published on a host SMTP port and is not production delivery evidence.
- No Postfix, Exim, or Dovecot service is active on the host, and no host listener was found on
  ports 25, 465, 587, 1025, or 8025.
- SMTP username and password files are mounted read-only into the staging worker. They are
  sandbox credentials and must never be promoted or reused for production.
- The application already requires SMTP and HTTPS email links in production, validates TLS
  certificates with TLS 1.2 or newer, supports implicit TLS or mandatory STARTTLS, disables
  file/URL attachment access, and applies 10-second connection and 30-second socket defaults.
- Email jobs use a durable deterministic `Message-ID`, five bounded exponential attempts for
  temporary pre-submission failure, and terminal handling for permanent or uncertain outcomes.
  An uncertain result during SMTP `DATA` is not blindly resent.

### Public DNS

Both authoritative Cloudflare name servers returned the same records during the preflight:

| Check                | Observed state                                                                       | Acceptance impact                                                                                                           |
| -------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `speedhost.bd` MX    | `mx1.emaildesk.bd`, `mx2.emaildesk.bd`, and `mx3.emaildesk.bd`                       | Proves inbound routing only; it does not identify an authorized outbound SMTP account.                                      |
| `speedhost.bd` SPF   | `v=spf1 include:relay.mailchannels.net ~all`                                         | MailChannels is currently authorized with soft-fail, but the exact app relay and envelope-sender alignment remain unproved. |
| `speedhost.bd` DMARC | `p=none`, aggregate reports to `postmaster@speedhost.bd`, relaxed SPF/DKIM alignment | Monitoring-only policy; confirm the report mailbox and prove aligned SPF or DKIM before considering enforcement.            |
| DKIM                 | No selector was supplied                                                             | Cannot be verified by guessing selectors. Obtain the provider-issued selector and expected public key record.               |
| `my.speedhost.bd`    | Resolves to `46.250.239.221`; no separate MX, SPF, or TXT answer was present         | A sender at this subdomain needs an explicitly reviewed alignment strategy; parent SPF is not inherited by a subdomain.     |
| Host reverse DNS     | `vmi3398336.contaboserver.net`                                                       | Acceptable only if mail is relayed through the approved provider; do not send directly from this host.                      |

The existing staging value `billing@my.speedhost.bd` is a fictional sandbox identity, not an
approved production sender. The presence of EmailDesk and MailChannels records must not be
treated as permission to reuse another application's mail account.

## Acceptance procedure after inputs exist

1. Record the exact provider endpoints from its authenticated control panel or official
   documentation, including authentication mode, TLS port, quota, rate limit, privacy/log
   retention, bounce/complaint behavior, and credential-revocation path.
2. Stage the provider-issued DNS changes with captured prior values and TTLs. Verify the exact
   SPF authorization, DKIM selector/key, DMARC alignment, and monitored report destination from
   both authoritative name servers before changing application delivery.
3. Put credentials into protected production secret files with least privilege. Keep the
   non-secret sender, host, port, TLS mode, concurrency, and timeouts in deployment config.
4. Start no scheduler and no worker containing existing work. Use an empty, isolated
   production acceptance queue/database or an equivalent provider-safe harness.
5. Run certificate-validated connection/authentication checks without printing credentials.
   Stop on hostname mismatch, untrusted certificate, unexpected downgrade, account mismatch,
   quota/cost surprise, or provider uncertainty.
6. Send only to the approved fictional test inboxes. Exercise verification, password reset,
   invoice, renewal, service, and ticket content. Confirm responsive HTML, plain text, Bengali
   and Latin text, exact `From`/`Reply-To`, provider `Message-ID` evidence, inbox placement, and
   absence of secret/body data from logs.
7. Exercise one temporary rejection and one permanent rejection using provider-approved test
   controls. Simulate uncertain delivery only in an isolated harness; confirm it becomes
   `INCONSISTENT` and is not replayed.
8. Confirm bounce/complaint alerts, suppression ownership, quota alerts, provider audit logs,
   worker failure/inconsistent alerts, rotation, revocation, and the disable/rollback procedure.
9. Retain only redacted evidence: timestamps, provider/account identifier, DNS result hashes or
   record metadata, normalized outcome codes, and provider message identifiers. Do not retain
   bodies, tokens, credentials, or real recipient identities.

## Stop conditions

Stop and leave production email disabled if any required owner input is absent; TLS or
authentication is weaker than approved; sender/SPF/DKIM/DMARC alignment is unproved; the
provider cannot explain bounce, complaint, quota, or privacy behavior; a message reaches a real
customer; the outcome is uncertain; or rollback ownership is unavailable.
