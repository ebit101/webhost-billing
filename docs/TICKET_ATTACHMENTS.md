# Private ticket attachments

Command 217 adds attachments to new customer tickets and customer/staff replies.
Existing messages and ticket IDs remain unchanged. Files are downloaded through
the authenticated API; there is no public bucket, static upload directory or
shareable download token.

## File policy

| Rule              | Initial policy                                                                                            |
| ----------------- | --------------------------------------------------------------------------------------------------------- |
| Formats           | Single-frame PNG/JPEG screenshots and UTF-8 `.txt` or `.log` files                                        |
| Per-file size     | 1 byte to 2 MiB, checked against the declared size and actual stream                                      |
| Per-message limit | Three distinct accepted attachments                                                                       |
| Image limits      | Four million decoded pixels; decode and re-encode, removing metadata                                      |
| Filenames         | Simple ASCII names, at most 120 characters; reject paths, control characters and reserved device names    |
| Draft limits      | Ten unfinished candidates per uploader; each expires after 24 hours                                       |
| Account capacity  | Fifty unexpired accepted/reserved files per uploader, at most 100 MiB of content                          |
| Processing limits | Four simultaneous uploads per API process; 30-second stream deadline, bounded scans and raster processing |
| Retention         | Sent files expire 365 days after attachment to a message                                                  |

PDF, SVG, HTML, office documents, archives and executable formats are not accepted
in this phase. The server validates file content, MIME and extension together.
Text rejects invalid UTF-8, binary control characters, markup and executable
headers. Raster inputs must have valid signatures and endings and pass decoding.
The original and normalized bytes must pass malware screening. Screening reduces
risk; it cannot prove that every file is harmless.

## Upload, send and retry

The client reserves an opaque upload ID bound to the authenticated uploader,
ticket/department and message submission key. A bounded binary upload obtains a
lease; no partial file bytes are persisted. Validation and screening complete
before one private blob is saved under a server-generated UUID storage key.
Original filenames are display/download metadata and never filesystem paths.

Sending a ticket or reply atomically claims its ready files. Foreign, expired,
unscanned, duplicate or wrong-message IDs roll back the message transaction.
Replaying the same message and manifest returns its existing result. The browser
retains draft identities during a retry and reuses already accepted uploads.
Changed access or target eligibility can require refreshing the ticket and
starting a new draft; stale access is never retained to finish a send.

An interrupted upload or unavailable scanner leaves a quarantined metadata record
without a blob. It may be retried while its draft is valid. Malware or invalid
content is rejected without storing bytes. Expired leases can be reclaimed; a
late publisher cannot overwrite a newer lease. Pending, quarantined, rejected and
unbound ready files cannot be downloaded.

## Access and delivery

Uploads and downloads use the current customer ownership and department/staff
rules from [Command 216](SUPPORT_DEPARTMENTS.md). Support-session mutations are
refused. A customer cannot download a staff-only system-message attachment.
Membership or MFA removal revokes support-operator access, including during an
in-flight upload. Every accepted upload, rejection/quarantine and download has an
audit entry containing identifiers rather than file contents.

Downloads verify the saved SHA-256 digest and return `application/octet-stream`,
attachment disposition, `nosniff`, private/no-store caching and a sandbox content
security policy. The UI fetches the bytes with session credentials before starting
a local browser download. File bytes are absent from logs, job payloads and email
messages. Existing email notifications link to the portal conversation.

## Storage and expiry

Content lives in the separate private PostgreSQL `ticket_attachment_blobs` table;
only attachment metadata is serialized in message responses. Keep the database
and backups private and encrypted and plan capacity for retained content. This
initial storage adapter uses database blobs, not object storage or a public web
directory. Antivirus processing and downloads have a small, bounded in-memory
copy of the bytes.

The existing dedicated scheduler runs retention independently of renewal billing.
Every minute it removes up to 100 expired blobs, using row locks and skip-locked
batching so multiple schedulers do not duplicate work. Message/attachment metadata
and audits remain for history. Access stops at expiry even if the scheduler is
down. Restore and backup-retention procedures still apply to backup copies and
database storage pages; SQL deletion is not a promise of physical secure erasure.
Monitor `ticket_attachment_retention_failed` and keep the scheduler running.

## Production scanner and proxy setup

Uploads default to `TICKET_ATTACHMENT_SCANNER=disabled`; text tickets and replies
remain available. Before enabling uploads, provision an isolated ClamAV daemon,
current signature updates, private API-to-scanner connectivity and monitoring.
Set `TICKET_ATTACHMENT_SCANNER=clamav`, `TICKET_ATTACHMENT_CLAMAV_HOST` and
`TICKET_ATTACHMENT_CLAMAV_PORT` in the installation environment. In containers,
use the private scanner service hostname; `127.0.0.1` means the API container
itself. No scanner container, networking change or production activation is
performed by this command.

The adapter uses the [ClamAV INSTREAM protocol](https://docs.clamav.net/manual/Usage/ClamdProtocol.html).
Configure `StreamMaxLength` above 2 MiB and enable the daemon's size/scan limits.
Keep this unauthenticated TCP protocol on an isolated private network; do not
expose its port publicly. Socket failures, oversized/unknown responses, timeouts
and scanner errors fail closed. The application does not independently verify
signature freshness: monitor updates and disable intake if that readiness fails.

The simulated scanner is for fictional development/test content and is forbidden
by production configuration, publication and download checks. A local protocol test
server exercises framing and responses; real-engine detection/signature readiness
has not been accepted by these fictional checks.

The supplied production and demo Nginx configurations allow 2 MiB only under the
upload route, disable request buffering there, and allow time for scanning. Other
routes keep their existing body limit. Downloads disable upstream buffering.
Custom proxies must preserve binary bodies, cookies and CSRF headers and support
these limits. See [Nginx request buffering](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_request_buffering)
and [sharp input limits](https://sharp.pixelplumbing.com/api-constructor/).

## Acceptance and next command

Focused tests cover upload/download ownership, restricted staff and private
messages, MIME/content mismatch, oversized and traversal input, simulated malware,
unavailable scanning, interrupted/stale/concurrent uploads, manifest replay,
expiry, byte removal and production fake-provider refusal. The browser journey
exchanges fictional customer and staff attachments and verifies authenticated
download bytes. See [the progress log](PROGRESS.md) for executed check results.

Recommended next command: **Command 218 — Receive support replies by email**.
It requires separate owner authorization.
