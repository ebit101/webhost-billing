import { expect, test } from '@playwright/test';
import {
  order,
  invoice,
  payment,
  ticket,
  email,
} from '../../src/test/client-activity-fixtures';
import { hash } from 'argon2';
import { createPrismaClient } from '@webhost-billing/database';
import { E2E_DATABASE_URL, E2E_SCHEMA, E2E_API_ORIGIN } from '../environment';
import { assertBrowserDatabaseScope } from '../database-scope';
import {
  E2E_ADMIN,
  E2E_HEALTHY_CUSTOMER,
  E2E_PRODUCT,
  E2E_SERVER,
} from '../fixtures';
import {
  domain,
  domainId,
  serviceId,
  clientId,
} from '../../src/test/client-record-fixtures';
const prisma = createPrismaClient(E2E_DATABASE_URL);
const customerId = clientId;
const administratorEmail = 'client139-admin@example.test';
const root = `/admin/customers/${customerId}`;
const secondId = '13900000-0000-4000-8000-000000000006';
const secondServiceId = '13900000-0000-4000-8000-000000000007';
const domains = [
  { ...domain, customerId },
  {
    ...domain,
    id: secondId,
    customerId,
    domainName: 'fictional-second139.com',
  },
];
test.use({ trace: 'off', video: 'off' });
test.beforeAll(async () => {
  await assertBrowserDatabaseScope(prisma, E2E_DATABASE_URL, E2E_SCHEMA);
  // Keep these two sign-ins out of the shared lifecycle account's login budget.
  await prisma.user.create({
    data: {
      email: administratorEmail,
      passwordHash: await hash(E2E_ADMIN.password, {
        type: 2,
        memoryCost: 19456,
        timeCost: 2,
        parallelism: 1,
      }),
      role: 'ADMIN',
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      adminProfile: {
        create: {
          displayName: 'Fictional workspace administrator',
          staffRole: 'FULL_ADMINISTRATOR',
          isSuperAdmin: true,
        },
      },
    },
  });
  await prisma.user.create({
    data: {
      email: 'client139-browser@example.test',
      role: 'CUSTOMER',
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      customer: {
        create: {
          id: customerId,
          customerNumber: 'CUS-BROWSER-139',
          firstName: 'Fictional',
          lastName: 'Workspace client',
          status: 'ACTIVE',
          addressLine1: '1 Fictional Road',
          city: 'Dhaka',
          countryCode: 'BD',
        },
      },
    },
  });
  for (const [id, name] of [
    [serviceId, 'hosting139.example.test'],
    [secondServiceId, 'second139.example.test'],
  ]) {
    await prisma.service.create({
      data: {
        id,
        customerId,
        productId: E2E_PRODUCT.id,
        productPriceId: E2E_PRODUCT.priceId,
        serverId: E2E_SERVER.id,
        status: 'PENDING',
        domain: name,
        productNameSnapshot: 'Fictional client hosting',
        productDescriptionSnapshot: 'Saved fictional service.',
        billingPeriod: 'MONTHLY',
        recurringAmount: 12000n,
        currency: 'BDT',
        startedAt: new Date('2026-10-28T00:00:00Z'),
        nextDueAt: new Date('2026-11-28T00:00:00Z'),
      },
    });
  }
});
test.afterAll(async () => prisma.$disconnect());
for (const width of [1440, 375])
  test(`client profile retains domain and hosting context at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    // Real isolated authentication/customer/service reads. Only registrar record reads
    // are fictional UI fixtures; actual registrar ownership is covered by API tests.
    await page.route(E2E_API_ORIGIN + '/domains**', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (request.method() !== 'GET') {
        await route.abort();
        return;
      }
      const selected = domains.find(
        (row) => url.pathname === '/domains/' + row.id,
      );
      const scope = url.searchParams.get('customerId');
      const denied = Boolean(selected && scope && scope !== customerId);
      const data =
        url.pathname === '/domains'
          ? scope && scope !== customerId
            ? []
            : domains
          : (selected ?? []);
      await route.fulfill({
        status: denied ? 403 : 200,
        contentType: 'application/json',
        body: JSON.stringify(
          denied
            ? {
                success: false,
                error: {
                  code: 'FORBIDDEN',
                  message: 'Domain client context does not match.',
                },
              }
            : { success: true, data },
        ),
      });
    });
    await page.goto('/admin');
    await page.getByLabel('Email address').fill(administratorEmail);
    await page.getByLabel('Password', { exact: true }).fill(E2E_ADMIN.password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Business overview', exact: true }),
    ).toBeVisible();
    const before = await snapshot();
    const writes: string[] = [];
    page.on('request', (request) => {
      if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method()))
        writes.push(new URL(request.url()).pathname);
    });
    await page.goto('/admin/domains');
    const globalDomain = page.getByRole('link', {
      name: domain.domainName,
      exact: true,
    });
    await expect(globalDomain).toHaveAttribute(
      'href',
      `${root}/domains/${domainId}`,
    );
    await globalDomain.click();
    const nav = page.getByRole('navigation', {
      name: 'Client profile',
      exact: true,
    });
    await expect(
      nav.getByRole('link', { name: 'Domains', exact: true }),
    ).toHaveAttribute('aria-current', 'page');
    await expect(
      page.getByRole('heading', { name: domain.domainName, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('combobox', { name: 'Client', exact: true }),
    ).toHaveValue(customerId);
    await page.reload();
    await expect(
      page.getByRole('combobox', { name: 'Domains', exact: true }),
    ).toHaveValue(domainId);
    await page
      .getByRole('combobox', { name: 'Domains', exact: true })
      .selectOption(secondId);
    await expect(page).toHaveURL(`${root}/domains/${secondId}`);
    await expect(
      page.getByRole('heading', { name: domains[1].domainName, exact: true }),
    ).toBeVisible();
    await nav
      .getByRole('link', { name: 'Products/services', exact: true })
      .click();
    const serviceLink = page.getByRole('link', {
      name: 'hosting139.example.test',
      exact: true,
    });
    await expect(serviceLink).toHaveAttribute(
      'href',
      `${root}/services/${serviceId}`,
    );
    await expect(
      page.getByRole('button', { name: 'Clear customer scope', exact: true }),
    ).toHaveCount(0);
    await serviceLink.click();
    await expect(
      page.getByRole('heading', {
        name: 'hosting139.example.test',
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole('combobox', { name: 'Products/services', exact: true })
      .selectOption(secondServiceId);
    await expect(page).toHaveURL(`${root}/services/${secondServiceId}`);
    await expect(
      page.getByRole('heading', {
        name: 'second139.example.test',
        exact: true,
      }),
    ).toBeVisible();
    await page.goBack();
    await expect(
      page.getByRole('heading', {
        name: 'hosting139.example.test',
        exact: true,
      }),
    ).toBeVisible();
    await nav.getByRole('link', { name: 'Summary', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Operational context', exact: true }),
    ).toBeVisible();
    const { messages: _messages, ...ticketSummary } = ticket;
    void _messages; // Conversation messages belong only to the detail response.
    const activity = [
      {
        kind: 'orders',
        label: 'Orders',
        path: '/orders',
        row: order,
        detail: order,
        reference: order.orderNumber,
      },
      {
        kind: 'invoices',
        label: 'Invoices',
        path: '/invoices',
        row: invoice,
        detail: invoice,
        reference: invoice.invoiceNumber,
      },
      {
        kind: 'payments',
        label: 'Payments',
        path: '/payments',
        row: payment,
        detail: payment,
        reference: payment.reference,
      },
      {
        kind: 'support',
        label: 'Support',
        path: '/tickets',
        row: ticketSummary,
        detail: ticket,
        reference: ticket.ticketNumber,
      },
      {
        kind: 'email-history',
        label: 'Email history',
        path: '/email-notifications/customers/' + customerId,
        row: email,
        detail: email,
        reference: email.subject,
      },
    ];
    for (const item of activity) {
      await page.route(E2E_API_ORIGIN + item.path + '**', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        if (request.method() !== 'GET') {
          writes.push(request.method());
          await route.abort();
          return;
        }
        const scope = url.searchParams.get('customerId');
        expect(scope).toBe(item.kind === 'email-history' ? null : customerId);
        const detail = url.pathname === item.path + '/' + item.row.id;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(
            detail
              ? { success: true, data: item.detail }
              : {
                  success: true,
                  data: [item.row],
                  pagination: {
                    page: 1,
                    pageSize: 20,
                    totalItems: 1,
                    totalPages: 1,
                  },
                },
          ),
        });
      });
      await nav.getByRole('link', { name: item.label, exact: true }).click();
      await expect(page).toHaveURL(`${root}/${item.kind}`);
      await expect(
        nav.getByRole('link', { name: item.label, exact: true }),
      ).toHaveAttribute('aria-current', 'page');
      await expect(
        page.getByRole('combobox', { name: 'Client', exact: true }),
      ).toHaveValue(customerId);
      const record = page.getByRole('button', {
        name: item.reference,
        exact: true,
      });
      await expect(record).toBeVisible();
      const tableArea = page.getByRole('group', {
        name: `Client ${item.label.toLowerCase()} — scroll horizontally`,
        exact: true,
      });
      await expect(tableArea).toBeVisible();
      if (width === 375)
        expect(
          (await page
            .getByRole('textbox', { name: 'Search', exact: true })
            .boundingBox())!.width,
        ).toBeGreaterThanOrEqual(192);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
      if (width === 375)
        expect(
          await tableArea.evaluate(
            (element) => element.scrollWidth > element.clientWidth,
          ),
        ).toBe(true);
      await record.click();
      const dialog = page.getByRole('dialog', {
        name: item.label + ' record',
        exact: true,
      });
      await expect(dialog).toBeVisible();
      if (item.kind === 'orders')
        await expect(
          dialog.getByText(order.orderNumber, { exact: true }),
        ).toBeVisible();
      if (item.kind === 'payments')
        await expect(
          dialog.getByRole('heading', { name: payment.reference, exact: true }),
        ).toBeVisible();
      await expect(
        dialog.getByText('Loading record details', { exact: true }),
      ).toHaveCount(0);
      if (item.kind === 'support')
        await expect(
          dialog.getByText(ticket.messages[0]!.body, { exact: true }),
        ).toBeVisible();
      if (item.kind === 'invoices')
        await expect(
          dialog.getByText(invoice.businessIdentity.name, { exact: true }),
        ).toBeVisible();
      await expect(
        dialog.getByRole('button', {
          name: /Send reply|Issue invoice|Record payment|Resend/,
        }),
      ).toHaveCount(0);
      await page.keyboard.press('Escape');
      await expect(dialog).not.toBeVisible();
      await expect(record).toBeFocused();
      if (item.kind === 'email-history')
        await page.screenshot({
          path: `../../release-artifacts/command141-email-history-${width}.png`,
          fullPage: true,
        });
    }
    expect(writes).toEqual([]);
    await nav.getByRole('link', { name: 'Domains', exact: true }).click();
    await expect(
      page.getByRole('link', { name: domain.domainName, exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: `../../release-artifacts/command139-client-domains-${width}.png`,
      fullPage: true,
    });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await page
      .getByRole('combobox', { name: 'Client', exact: true })
      .selectOption(E2E_HEALTHY_CUSTOMER.customerId);
    await expect(page).toHaveURL(
      `/admin/customers/${E2E_HEALTHY_CUSTOMER.customerId}/domains`,
    );
    await expect(
      page.getByRole('heading', { name: 'Healthy Customer', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: domain.domainName, exact: true }),
    ).toHaveCount(0);
    await page.goto(
      `/admin/customers/${E2E_HEALTHY_CUSTOMER.customerId}/domains/${domainId}`,
    );
    await expect(
      page.getByText('Domain client context does not match.', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: domain.domainName, exact: true }),
    ).toHaveCount(0);
    expect(writes).toEqual([]);
    expect(await snapshot()).toEqual(before);
  });
async function snapshot() {
  return {
    services: await prisma.service.findMany({ orderBy: { id: 'asc' } }),
    counts: await Promise.all([
      prisma.customer.count(),
      prisma.domain.count(),
      prisma.invoice.count(),
      prisma.payment.count(),
      prisma.order.count(),
      prisma.hostingPanelOperation.count(),
      prisma.registrarOperation.count(),
      prisma.outboxEvent.count(),
    ]),
  };
}
