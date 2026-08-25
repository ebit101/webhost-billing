# Shared API Contracts and Error Handling

The `@webhost-billing/shared` package is the application boundary for reusable runtime schemas, inferred TypeScript types, response envelopes, and safe serialization helpers. Applications import contracts from the package root rather than duplicating state or response definitions.

## Runtime validation

Zod schemas validate data that crosses an application boundary. Callers must parse untrusted request, session, job, provider, or persisted JSON data before using its inferred type. The shared package currently provides schemas for:

- money and ISO-style currency codes;
- pagination queries and response metadata;
- authenticated administrator and customer identities;
- roles and the separate order, invoice, payment, service, and ticket states;
- reference-only background job envelopes, queue names, failure visibility, and confirmed retry requests;
- email event payloads, the twelve active template identifiers, and safe administrator delivery summaries;
- success, paginated-success, and error response envelopes.

Compile-time TypeScript types are inferred from the matching schemas where possible. A TypeScript assertion alone is not boundary validation.

## Email notification administration

`GET /email-notifications` is administrator-only and returns the latest 100 delivery logs, newest first. Each entry contains the recipient, immutable subject snapshot, template identifier, normalized delivery state, provider key, attempt count, timestamps, and attempt summaries with fixed failure classifications. The template identifier is a bounded string in this historical response so a retired or renamed template cannot break delivery-history visibility.

The endpoint never returns rendered bodies, action tokens, raw provider errors, `lastError`, provider message identifiers, credentials, or outbox payloads. Customers receive `FORBIDDEN`. Business endpoints only commit versioned reference payloads to the transactional outbox; SMTP activity occurs asynchronously after the business transaction succeeds.

## Money

Money is represented internally as integer minor units with `bigint`. JSON cannot safely carry arbitrary `bigint` values, so API money uses a canonical decimal string:

```json
{
  "amount": "9007199254740993",
  "currency": "BDT"
}
```

`serializeMoney` validates the currency and PostgreSQL `BIGINT` range before producing JSON-safe data. `parseMoney` performs runtime validation and returns a `bigint`. Amount strings must be non-negative canonical integers; refunds and reversals remain separate positive financial transactions.

## Pagination

List endpoints accept `page` and `pageSize`. Defaults are page 1 and 20 items, and the maximum page size is 100. Paginated responses include `page`, `pageSize`, `totalItems`, and `totalPages`:

```json
{
  "success": true,
  "data": [],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "totalItems": 0,
    "totalPages": 0
  }
}
```

## Success and error envelopes

Successful non-list responses use:

```json
{
  "success": true,
  "data": {}
}
```

Failures use a stable machine-readable code and safe public message:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed.",
    "issues": [
      {
        "field": "email",
        "message": "Invalid email address."
      }
    ]
  }
}
```

The optional `issues` collection is reserved for safe field-level details. Supported stable codes are:

- `BAD_REQUEST`
- `VALIDATION_ERROR`
- `AUTHENTICATION_REQUIRED`
- `FORBIDDEN`
- `RESOURCE_NOT_FOUND`
- `CONFLICT`
- `RATE_LIMITED`
- `UNPROCESSABLE_ENTITY`
- `INTERNAL_ERROR`
- `SERVICE_UNAVAILABLE`

Clients branch on `error.code`, not on the human-readable message.

## NestJS exception boundary

`ApiExceptionFilter` is registered globally through `APP_FILTER`. Expected client failures use `ApplicationException` with a stable code, HTTP status, public message, and optional safe issues. Framework exceptions are mapped to generic public definitions by status. Unknown and server-side failures become `INTERNAL_ERROR` responses.

The filter deliberately ignores original framework exception bodies and unknown error messages. Stack traces, SQL or database errors, credentials, internal provider responses, and secret-bearing exception content are never serialized to clients. Its server-error log message is also generic and does not interpolate the original exception.

## Renewal automation

Administrator-only renewal endpoints use the strict `RenewalAutomationPolicy` contract. Reminder offsets must be unique and earlier than invoice generation, numerical limits are bounded, and the timezone must be accepted by the runtime as an IANA timezone. Automation-run responses contain safe counts/status/error summaries only; job payloads, credentials, and provider responses are excluded. See `docs/RENEWAL_AUTOMATION.md`.
