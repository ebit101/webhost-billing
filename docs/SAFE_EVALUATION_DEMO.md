# Safe Evaluation Demo

The safe evaluation demo is the shortest supported way to inspect Webhost Billing.
It runs a production-built web/API pair with a separate local PostgreSQL database,
Redis, and same-origin gateway. Every record is fictional.

> [!WARNING]
> This remains an alpha technical preview and is not fit for live use. Do not enter
> real customer data, credentials, payment evidence, email addresses, domains, or
> provider secrets. The demo is not a staging or production deployment.

## Start with one command

Requirements: Node.js 24 with Corepack, Docker Engine or Docker Desktop, and Docker
Compose v2. Port `3100` on loopback must be available.

```bash
corepack pnpm demo:up
```

The first run builds the application images and can take several minutes. When the
health checks pass, the command prints:

- the local URL, `http://localhost:3100`;
- a generated password for `admin@example.test`; and
- a different generated password for `customer@example.test`.

The passwords and other random demo secrets live only in the Git-ignored
`.demo-runtime/demo.env` file. Show the same logins again with:

```bash
corepack pnpm demo:credentials
```

Do not publish that file, paste its values into an issue, or reuse its passwords.

## Five-minute walkthrough

1. Open `http://localhost:3100/hosting` and select **Monthly**. Inspect the public
   catalogue and its fictional Starter Hosting plan.
2. Sign in as `customer@example.test`. Open **Services**, **Invoices**, **Orders**,
   and **Support** to inspect the ownership-bound customer workflows and seeded
   records.
3. Sign out, then sign in as `admin@example.test`. Inspect the dashboard and the
   **Customers**, **Orders**, **Invoices**, **Payments**, **Services**, and
   **Support** areas.
4. Treat every action as disposable evaluation only. External email, payment, and
   hosting providers are not running in this stack.
5. Stop the demo when finished:

   ```bash
   corepack pnpm demo:down
   ```

`demo:down` stops containers but retains the isolated fictional volumes and generated
credentials, so the next `demo:up` is repeatable. It never targets the repository's
ordinary development or production Compose projects.

## Safety boundary

The demo has several independent safeguards:

- the gateway publishes only `127.0.0.1:3100`;
- application and data services use an internal Compose network; only the hardened
  gateway joins a separate ingress bridge so Docker can publish the loopback port;
- the gateway's outbound firewall permits only its internal web/API upstreams,
  Docker DNS, loopback traffic, and replies to evaluator requests;
- bKash and SSLCOMMERZ are explicitly disabled, and no cPanel, SMTP, worker, or
  scheduler process runs;
- PostgreSQL and Redis have dedicated named volumes and no host-published ports;
- the initializer refuses to bootstrap users unless `DEMO_MODE=fictional-only` and
  the database host/name exactly match the demo database;
- passwords and service secrets are randomly generated, remain outside Git, and are
  not baked into images; and
- the gateway sends `X-Robots-Tag: noindex, nofollow, noarchive`.

The local gateway uses HTTP because it is loopback-only evaluation. The documented
production topology still requires HTTPS, protected secrets, external controls, and
all acceptance gates. Running this demo does not change production `NO-GO`.

## Demo commands

| Command                          | Purpose                                             |
| -------------------------------- | --------------------------------------------------- |
| `corepack pnpm demo:up`          | Build, initialize, start, and health-check the demo |
| `corepack pnpm demo:credentials` | Reprint the generated fictional logins              |
| `corepack pnpm demo:status`      | Show container state and health                     |
| `corepack pnpm demo:logs`        | Follow bounded local demo logs                      |
| `corepack pnpm demo:screenshots` | Recreate the reviewed evaluator screenshots         |
| `corepack pnpm demo:down`        | Stop the demo and retain its fictional state        |

## Screenshots

![Fictional hosting catalogue](assets/demo/hosting-catalog.png)

![Administrator dashboard](assets/demo/admin-dashboard.png)

![Customer portal](assets/demo/customer-portal.png)

The screenshots are generated from the safe demo with Playwright. They are examples,
not proof of production readiness. The customer portal overview still contains
clearly fictional presentation fixtures; the detailed services, invoices, orders,
profile, and support screens use authenticated application APIs.

## Troubleshooting

- If Docker is unavailable, start Docker Engine/Desktop and rerun `demo:up`.
- If port `3100` is already in use, stop the conflicting local process. The fixed
  port is intentional so cookie and origin checks remain deterministic.
- If startup fails, run `corepack pnpm demo:status` and
  `corepack pnpm demo:logs`. Redact generated credentials before sharing output.
- If Chromium is missing, `demo:screenshots` installs the repository-pinned browser
  before capture. Normal evaluation does not require Playwright.
- First-run image compilation is much slower than later cached starts. Do not bypass
  a failed health check or connect directly to the database to make the UI appear
  ready.

See [`CAPABILITY_MATRIX.md`](CAPABILITY_MATRIX.md) for the exact implemented,
demo-visible, disabled, and out-of-scope boundaries.
