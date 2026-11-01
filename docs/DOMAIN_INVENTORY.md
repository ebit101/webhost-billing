# Administrator domain inventory

Command 160 adds the canonical administrator inventory at `GET /domains/inventory`
and the compact table at `/admin/domains`. It reads saved billing records only.
Browsing never verifies current registrar ownership, refreshes expiry, enables a
connection, registers, renews or changes a domain.

## Query and response

The authenticated endpoint retains the full-administrator grant. Customers, billing
operators and support operators cannot use it. Sensitive domain detail and provider
action authorization/MFA remain on their existing endpoints.

Supported query fields:

| Field        | Meaning                                                                                                                             |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `page`       | One-based page; defaults to 1, with a bounded PostgreSQL offset                                                                     |
| `pageSize`   | 1–100 rows per page; defaults to 20                                                                                                 |
| `search`     | At most 200 characters; literal case-insensitive substring matching against domain, client name, email, company or client reference |
| `state`      | One of the six existing domain states                                                                                               |
| `origin`     | `REGISTRATION` or `EXISTING`                                                                                                        |
| `customerId` | One exact validated client UUID, applied in the database                                                                            |

Unknown fields, duplicate scalar fields, malformed IDs, noncanonical page strings
and excessive offsets fail validation. `%`, `_` and SQL-looking search text are
literal text, not wildcards or executable SQL. All values use bound parameters.

The response contains `success`, `data`, `pagination` and `summary`. Pagination
reports the complete matching count and page count. The six summary counts cover
the same applied filters, including any client scope; they do not count only the
visible rows. Empty and out-of-range pages retain their honest totals.

Rows contain only domain/client identification, registrar display name and mode,
origin/state, saved requested/expiry dates and a nullable invoice summary. The
balance is the associated invoice's balance, including a combined invoice when
applicable, rather than a newly calculated domain price. Money remains an exact
minor-unit string. Linked domains with initial billing use their existing billing
association; unbilled links show no billing record.

An awaiting-payment registration whose invoice is Paid is displayed and filtered
as Awaiting approval, matching the existing detail behavior. This does not rewrite
the stored domain state or authorize registration. Registered is a stored state,
not proof of fresh expiry, paid renewal or current provider acceptance.

## Read consistency and boundaries

Two bounded SQL projections run in a read-only Repeatable Read transaction: one
page and grouped counts. Ordering is requested time descending, then UUID
descending. No full-detail fan-out, contact decryption or registrar call occurs.
Registrant contact snapshots, credential/evidence ciphertext, remote provider IDs, native costs and
operation payloads are absent from the list response.

Each response is internally consistent. Records may change between separate page
reads; this is an offset-based operational list, not an immutable export snapshot.
Page size bounds returned rows, not the database work needed to search/count all
matching records. Existing transaction deadlines remain enforced.

The administrator table uses URL filters, search submission, status/origin filters,
page size and previous/next controls. Reload and browser history restore selection.
Invalid filters cause no inventory read; clear retains any validated client scope.
Failed/malformed responses show a retry state rather than a partial result count.
Late responses are aborted/ignored. Rapid filter changes compose from the latest pending selection instead of stale URL props. Domain and View links retain the owning client
profile; client links open that profile. Wide tables scroll inside their own area.

The legacy `GET /domains` full-detail array remains bounded for compatibility with
existing portal/client selectors. It is not the complete global inventory contract.
Existing individual detail, ownership checks, linking and provider operations are
unchanged. No schema, migration, financial history or provider configuration changes.

## Acceptance and installed state

Use fictional data and closed provider gates. The API workload models 200 clients
with one to five domains and services each, 600 of each, and two administrators.
These are acceptance assumptions, not an approved production capacity limit.
The [command report](PROGRESS.md) records actual checks, results and constraints.

Command 161 installed this read model on staging at
`e2c207a72511b13578dba84e63979ea794449455`. Read-only installed checks and signed-in
Speed acceptance enumerate the two actual saved domains, with matching pagination,
search/filter counts and client-owned links. No records or provider operations were
created. The larger fictional workload is separate from this staging smoke.
Keep SMTP active there and payment, hosting, registrar and WhatsApp disabled.
Production remains NO-GO under the
[readiness review](PRODUCTION_READINESS_REVIEW.md).
