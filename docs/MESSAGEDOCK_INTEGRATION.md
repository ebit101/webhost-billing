# MessageDock customer context integration

This optional, read-only API is disabled unless `MESSAGEDOCK_READ_TOKEN` is set on
the Webhost Billing API process. Configure a unique random secret of at least 32
characters. Give the same secret only to the isolated Speed Host MessageDock web
process as `WEBHOST_BILLING_READ_TOKEN`, with this API's credential-free HTTPS
origin in `WEBHOST_BILLING_API_ORIGIN`. Do not put the token in a browser,
repository, URL, log, or shared customer deployment.

For the isolated Speed Host staging deployment, store the token in
`/srv/webhost-billing-staging/secrets/messagedock_read_token`. The staging
Compose override mounts it only in the API container; the entrypoint loads it
from the file. The host Nginx site routes only
`/integrations/messagedock/` to the API. Keep other deployments without this
staging override and token.

`GET /integrations/messagedock/customers?q=...` searches up to ten customer
identities; terms must have 3–100 characters. `GET
/integrations/messagedock/customers/:customerId/context` returns that customer's
identity and up to 20 services, invoices, and ticket headers. Both require
`Authorization: Bearer <token>` and are unavailable when the token is absent.
No credentials, payment evidence, ticket messages, addresses, or tax IDs are
returned. The API has no write method. Its invoice balances are serialized as
integer minor-unit strings; MessageDock does not calculate money.

The existing cookie-authenticated customer and staff endpoints remain separate.
MessageDock stores only an explicit staff-selected customer UUID link in its own
database. A phone number, imported contact name, or profile email is never
automatically treated as billing identity. Agents must verify identity before
discussing private account details. Disconnecting this integration does not
change billing, hosting, or ticket state.

The isolated Speed Host staging rollout on 2026-10-18 deployed only the API
image from source `1985d84105c5663278c897cb02cacf1645b2d0e7` and added
the integration path to that hostname's Nginx site. The other staging service
containers remained on their earlier images. The API rejected an unauthenticated
lookup with 401 and returned 200 with no customers for a fictional authenticated
query. The registrar flag stayed off. No billing migration, billing write,
customer link, payment change, or live registrar action occurred.

Rollback copies of the previous staging environment and Nginx site are in
`/srv/webhost-billing-staging/rollback/messagedock-1985d84105c5663278c897cb02cacf1645b2d0e7/`.
The previous API image tag `a516f6ea5d1279abe27f1131899d490cdb8c4cb1`
is retained. Remove only this integration route and secret if the isolated
integration is retired.
