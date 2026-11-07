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
   git clone --branch v0.1.0-alpha.5 --depth 1 https://github.com/ebit101/webhost-billing.git
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

Installation help is available on request, with pricing by quote. Ask for
a guided local setup, help with Docker or startup errors, or a walkthrough
of the administrator and customer views.

Email [speedhost09@gmail.com](mailto:speedhost09@gmail.com?subject=Webhost%20Billing%20installation%20help)
or message [+8801782391434 on WhatsApp](https://wa.me/8801782391434) for a quote. Include your operating system, the step you reached, and any
error message with credentials and customer information removed.

## Ask about managed hosting

Managed hosting for evaluation is available on request, with pricing by
quote. Try an isolated instance without running Docker on your computer.

Email [speedhost09@gmail.com](mailto:speedhost09@gmail.com?subject=Webhost%20Billing%20managed%20hosting)
or message [+8801782391434 on WhatsApp](https://wa.me/8801782391434) for a quote. Include how long you want to evaluate the app and what help
you need. Confirm the hosting scope, upgrades, backups, and support before
booking.
