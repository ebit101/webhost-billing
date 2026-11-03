# Install Webhost Billing

Choose a local installation if you want to try the app on your own computer.
If you prefer help setting it up or want someone else to run the server, see
the service options below.

## Install the local evaluation

You'll need Git, Node.js 24 with Corepack, and a running Docker Engine or
Docker Desktop with Docker Compose v2. Local port `3100` must be available.
Run the following in a terminal.

1. Get the tagged evaluation release.

   ```bash
   git clone --branch v0.1.0-alpha.2 --depth 1 https://github.com/ebit101/webhost-billing.git
   cd webhost-billing
   ```

2. Check the prerequisites, then start the app.

   ```bash
   corepack pnpm demo:doctor
   corepack pnpm demo:up
   ```

   If the preflight reports a problem, resolve it before starting. The first
   start builds the app images and can take several minutes.

3. Open `http://localhost:3100`. Sign in with the generated administrator or
   customer credentials printed by the startup command. Use
   `corepack pnpm demo:credentials` to retrieve them on your own computer.
   Keep those credentials private.

4. When finished, run `corepack pnpm demo:down`. This stops the app and
   retains the fictional records so you can resume later.

If startup stalls, run `corepack pnpm demo:status` to see which services
are ready. For troubleshooting and a walkthrough of the administrator and
customer views, see the [safe evaluation guide](SAFE_EVALUATION_DEMO.md).

## Get installation help

Installation help can cover a guided local setup, troubleshooting Docker or
startup errors, and a walkthrough of the administrator and customer views.
When requesting help, include your operating system, the step you reached,
and the error message with credentials and customer information removed.

## Ask about managed hosting

A managed evaluation can give you an isolated instance to try without running
Docker on your computer. Ask what the offer includes, who handles upgrades and
backups, what support is available, and what it costs before booking.

The current alpha is for evaluation with fictional data. Keep real customer
records, provider credentials, and live transactions out of both local and
hosted evaluations. Production hosting depends on the
[production launch requirements](PRODUCTION_LAUNCH_RUNBOOK.md).
