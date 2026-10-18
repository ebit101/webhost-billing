# Shared-hosting test catalogue and order flow

Command 124 uses the [public Speed Host shared-hosting page](https://www.speedhost.com.bd/shared-hosting/) as its catalogue reference, checked on 2026-10-18. The WHMCS screenshot shows different packages, so it is a layout reference only.

| Public plan | Annual BDT price | Storage        | Websites | Email accounts | Monthly transfer |
| ----------- | ---------------: | -------------- | -------: | -------------: | ---------------: |
| Starter     |            1,500 | 1 GB NVMe SSD  |        1 |              5 |           100 GB |
| Standard    |            3,500 | 5 GB NVMe SSD  |        3 |             10 |           300 GB |
| Premium     |            5,000 | 10 GB NVMe SSD |        5 |             15 |           500 GB |
| Maximum     |            8,000 | 20 GB NVMe SSD |       10 |      Unlimited |         1,000 GB |

These are reference values for **fictional local test products**. Run `pnpm --filter @webhost-billing/database db:seed:shared-hosting` after local migrations to add them to the local development catalogue. The guarded script requires the loopback `webhost_billing` database, disabled live payment and registrar flags, and an active fake-panel server. It preserves products with the same slugs on repeat runs and hides only the untouched legacy starter seed card. Confirm current public prices before configuring real products. The storefront displays only BDT prices from the active database catalogue and revalidates the selected price; it never manufactures orderable prices in the browser.

For a local fake-provider test:

1. Start local PostgreSQL and Redis, apply committed migrations with `pnpm db:migrate:deploy`, and run `pnpm --filter @webhost-billing/database db:seed:shared-hosting`.
2. For the new-domain path, a full administrator with two-factor authentication enables the simulated registrar in the domain manager and sets a fictional annual BDT test price. This creates the simulated `.com` and `.net` offers; do not configure live registrar credentials.
3. Open `/shared-hosting` or `/hosting`, select an active annual plan, and continue to customer checkout.
4. Choose **Use an existing domain** to order hosting without a registration charge, or **Register a new domain** to enter fictional registrant details and request a simulated `.com` or `.net` quote.
5. For a new domain, check that the hosting and domain appear as two order items on one unpaid invoice. Verify payment through the existing test workflow. Domain registration still needs administrator approval, and the order completes only after the domain is registered in the simulation and the hosting service is active.

Only fake providers belong in this local test. No live registrar, WHM, payment provider or deployment action is part of Command 124. BDT is the only currency for a combined hosting and domain order; domain transfers and further currency work remain held.
