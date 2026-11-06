# Support replies by email

Command 218 extends existing ticket notifications with customer replies delivered
by a trusted, provider-neutral mail gateway. It does not connect a mailbox, run a
public SMTP server or activate a commercial inbound mail provider. Local
acceptance uses the existing private preview mail provider and a fictional signed
delivery adapter; no external email is sent.

## Customer flow and routing

When enabled, an outbound public staff reply to an active, verified customer has
an opaque `Reply-To` address. A route is bound to that ticket, source staff message,
customer user and a hash of the customer's email address. It expires after 30
days. Retries of the same notification reuse the route without extending expiry.
A new staff reply can supply a new route. Customer-message notifications sent to
staff and private system notes do not receive inbound reply routes.

The gateway delivers a customer's reply to the existing ticket's **current**
department. A subject, ticket number, ordinary department alias or arbitrary
recipient cannot open, move or authorize a ticket. No new-ticket-by-email or
staff-by-email submission is included. Customers can continue using the portal.
Existing conversations remain available in disabled/hidden departments, matching
[department policy](SUPPORT_DEPARTMENTS.md).

Before publication, recheck current ownership, verified email, active user and
customer, unchanged email binding and route expiry. Closed tickets remain closed;
staff must reopen them in the application. Forwarded messages, failed sender
verification and expired routes are refused rather than weakening ownership.
Rotating the dedicated secret invalidates previously issued reply addresses.

## Delivery and sender trust

Two independent conditions are required:

1. The exact delivery bytes carry a fresh HMAC signature from the configured mail
   gateway. The signature uses a dedicated secret, domain-separated from reply
   address generation. The timestamp window is five minutes in either direction.
2. Trusted gateway evidence reports DMARC pass, aligned DKIM and the verified
   author address matching both the normalized From address and the route's saved
   customer email hash. The unguessable reply address is also required.

The application does not perform DNS, DKIM or mailbox verification itself. DMARC
authenticates a domain, not an individual mailbox; it is insufficient on its own.
The gateway must derive its evidence from its own verification, not copy a sender's
`Authentication-Results` header. See the
[DMARC specification](https://www.rfc-editor.org/rfc/rfc9989) for that distinction.
The local provider explicitly simulates evidence for fictional accounts; these
tests do not establish real sender or production gateway trust.

An authorized production gateway must reject ambiguous/multiple From addresses,
conflicting Message-ID headers and malformed MIME; normalize and bound decoded
parts; distinguish SMTP envelope sender/recipient from display headers; verify
the complete message and aligned author domain; and reliably report automation,
bulk/list and delivery-report indicators. Never sign arbitrary public JSON or
offer an unauthenticated signing endpoint. Keep the secret in private runtime
configuration and redact reply addresses, signatures, headers and bodies from
gateway, reverse-proxy and application request logs.

## Adapter contract

The provider-neutral boundary is `POST /support-email/deliveries` with an
`application/octet-stream` body containing strict UTF-8 JSON matching
`inboundSupportEmailSchema` in the shared package's `support-email` subpath.
Do not send raw RFC 5322 messages or browser form data to this route.

The normalized envelope contains:

- `messageId`, the original bracketed Message-ID;
- `recipient`, the original case-sensitive opaque SMTP recipient;
- `from`, `envelopeFrom` (null for an empty return path), and trusted
  `senderVerification` with `dmarc`, `alignedDkim` and `verifiedAddress`;
- explicit `autoSubmitted`, `bulk` and `deliveryReport` facts;
- optional decoded `text`/`html` parts and an `attachments` array of at most three
  filename, media type and canonical base64 content objects.

Use a 13-digit millisecond `X-Support-Timestamp` header. `X-Support-Signature` is
lowercase hexadecimal HMAC-SHA-256 over
`support-delivery:v1:<timestamp>:` followed by the exact bytes. The shared
`signSupportDelivery` helper defines the contract. A retry signs the same envelope
again with a fresh timestamp; it does not generate another Message-ID.

The API returns HTTP 201 with `received: true` and `outcome` of `ACCEPTED`,
`REJECTED` or `IGNORED` for terminal authenticated envelopes. Stop retries for
those outcomes. Retry transient network failures, HTTP 429/503 or an unknown
commit outcome with the original envelope and bounded backoff. A changed replay
returns 409; malformed envelopes and invalid authentication are not retryable
without correction. Persist and alert on terminal refusals in the private gateway
inbox; the app sends no refusal email or bounce to an unverified sender.

## Content, duplicate handling and loops

Prefer the decoded authored plain-text part. For HTML-only mail discard active
blocks, comments and tags and retain plain text only. Do not fetch remote images,
styles or links. Remove conventional quoted lines/history; this is deliberately
conservative and not a complete email-client quotation parser. Apply the existing
10,000-character ticket-body rules; empty or invalid contributions are refused.
No incoming HTML is stored or rendered as HTML.

Attachments reuse the [private file policy](TICKET_ATTACHMENTS.md), including
filename/content validation, PNG/JPEG normalization, original and normalized
malware scans, three files/2 MiB each, current account capacity and private
authenticated downloads. An unavailable scanner produces a retryable 503 without
publication. An invalid/infected file rejects the entire contribution. No partial
message or clean subset is silently imported. Published bytes inherit the existing
365-day expiry and scheduler cleanup. Scanning remains separately disabled until
an operator configures it.

Import the customer message, private blobs, metadata, waiting-for-staff state,
one normal staff-notification outbox event and durable receipt atomically. The
original ticket, private notes and financial records are unchanged. Hash the
Message-ID for global accepted-message deduplication; serialize concurrent
deliveries under the ticket lock. Exact replays return the saved outcome and do
not create another message, attachment, notification or audit. Changed manifests
cannot overwrite a receipt. Receipts and audits retain hashes, IDs and safe outcome
codes; only the owned ticket message/file stores its accepted content.

Ignore empty return paths, delivery reports, bulk/list indicators and
`Auto-Submitted` values other than `no`. Generated outbound mail carries
`Auto-Submitted: auto-generated` and `X-Auto-Response-Suppress: All`, following
[automatic-response guidance](https://www.rfc-editor.org/rfc/rfc3834). Imported
customer replies notify eligible staff through existing routing; they do not echo
an automatic acknowledgement back to that customer. Staff replies require the
portal. Receipt metadata is retained as import/audit history; no raw MIME archive
or public mailbox viewer is introduced.

## Configuration and bounds

- `SUPPORT_EMAIL_MODE=disabled` is the default for API and worker. Text support in
  the portal remains available.
- `local` requires an immediate loopback peer and is forbidden in production.
- `gateway` requires separate operator readiness and authorized real-provider
  acceptance before enabling it. It does not open an outbound network connection.
- API and email worker need the same private `SUPPORT_EMAIL_SECRET` (at least 32
  characters) and lowercase `SUPPORT_EMAIL_DOMAIN`. The domain is a dedicated
  gateway-routed reply domain, not an ordinary unrestricted catch-all.
- The route streams at most 9 MiB with a 30-second read deadline and at most two
  active imports per API process. Scans keep Command 217's independent bounded
  deadlines. The supplied demo/production proxies allow 9 MiB and a 120-second
  response timeout only on this route, with request buffering disabled.
- Ingress is rate-limited to 60 requests/minute per effective source IP and 20
  successful/terminal eligible-route attempts per hour per route. Configure trusted
  proxies correctly; also apply gateway quotas, backoff and private source access.
  Multiple replicas have independent memory/concurrency budgets.

There is no automatic activation or vendor credential setup. Real mailbox routing,
transport/TLS, MIME parsing/verification, gateway retry storage, DNS, reputation,
signature freshness, scanner readiness and private storage/backup requirements
remain operator acceptance items. No real provider or production trust is implied
by local verification. See [the progress log](PROGRESS.md) for executed results.

Recommended next command: **Command 219 — Review online payment production
readiness**, subject to separate authorization. It does not authorize activation.
