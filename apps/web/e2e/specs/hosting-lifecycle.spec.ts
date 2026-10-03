import { createHmac, randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import {
  applyRenewalPaymentAndUnsuspend,
  createRenewalInvoice,
  customerVerificationToken,
  e2ePrisma,
  lifecycleRecord,
  suspendOverdueService,
} from '../database';
import { E2E_API_ORIGIN, E2E_ENCRYPTION_KEY } from '../environment';
import { E2E_ADMIN, E2E_CUSTOMER, E2E_PRODUCT } from '../fixtures';

test('complete hosting customer and administrator lifecycle', async ({
  page,
  context,
}) => {
  let invoiceId = '';
  let renewalInvoiceId = '';
  let serviceId = '';
  let customerId = '';

  await test.step('public entry has truthful local navigation and protected workspaces', async () => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/$/);
    await expect(
      page.getByRole('heading', {
        name: 'Hosting that keeps service and billing in view.',
      }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Why us' })).toHaveAttribute(
      'href',
      '/#why-us',
    );
    await page.getByRole('link', { name: 'Why us' }).click();
    await expect(page).toHaveURL(/\/#why-us$/);
    await expect(
      page.getByRole('heading', {
        name: 'The essential hosting journey, without hidden steps.',
      }),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Support', exact: true }).click();
    await expect(page).toHaveURL(/\/#support$/);
    await expect(
      page.getByRole('heading', {
        name: 'Support starts with your account context.',
      }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Create customer account' }),
    ).toHaveAttribute('href', '/register');
    await expect(
      page.getByRole('link', { name: 'Sign in to your portal' }),
    ).toHaveAttribute('href', '/login');
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/admin$/);
    await expect(
      page.getByRole('heading', { name: 'Administrator sign in' }),
    ).toBeVisible();
    await page.goto('/admin/customers');
    await expect(page).toHaveURL(/\/admin$/);
    await page.goto('/portal');
    await expect(page).toHaveURL(/\/login$/);
  });

  await test.step('customer browses the available plans', async () => {
    await page.goto('/hosting');
    await expect(
      page.getByRole('heading', { name: E2E_PRODUCT.name }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Monthly' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(
      page.getByRole('link', { name: `Choose ${E2E_PRODUCT.name}` }),
    ).toHaveAttribute(
      'href',
      `/portal/checkout?productId=${E2E_PRODUCT.id}&priceId=${E2E_PRODUCT.priceId}`,
    );
  });

  await test.step('customer registers, verifies, and signs in', async () => {
    await page.goto('/register');
    await page.getByLabel('First name').fill(E2E_CUSTOMER.firstName);
    await page.getByLabel('Last name').fill(E2E_CUSTOMER.lastName);
    await page.getByLabel('Email address').fill(E2E_CUSTOMER.email);
    await page
      .getByLabel('Password (at least 12 characters)')
      .fill(E2E_CUSTOMER.password);
    await page
      .getByRole('textbox', { name: 'Address', exact: true })
      .fill('26 Fictional Browser Road');
    await page.getByLabel('City').fill('Dhaka');
    await page.getByLabel('Country code').fill('BD');
    await page.getByRole('button', { name: 'Create customer account' }).click();
    await expect(page.getByRole('status')).toContainText(/verify your email/i);

    const token = await customerVerificationToken();
    await page.goto(`/verify-email?token=${encodeURIComponent(token)}`);
    await expect(page.getByRole('status')).toContainText(/verified/i);
    await login(page, E2E_CUSTOMER.email, E2E_CUSTOMER.password, '/portal');
  });

  await test.step('authenticated catalogue selection opens checkout without placing an order', async () => {
    await page.goto('/hosting');
    await page
      .getByRole('link', { name: `Choose ${E2E_PRODUCT.name}` })
      .click();
    await expect(page).toHaveURL(
      new RegExp(
        `/portal/checkout\\?productId=${E2E_PRODUCT.id}&priceId=${E2E_PRODUCT.priceId}$`,
      ),
    );
    await expect(page.getByLabel('Product')).toHaveValue(E2E_PRODUCT.id);
    await expect(page.getByLabel('Billing period')).toHaveValue(
      E2E_PRODUCT.priceId,
    );
    await expect(
      page.getByRole('button', { name: 'Place order' }),
    ).toBeVisible();
  });

  await test.step('customer role cannot open the administrator workspace', async () => {
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/portal$/);
    await page.goto(`/admin/customers/${E2E_ADMIN.userId}`);
    await expect(page).toHaveURL(/\/portal$/);
  });

  await test.step('customer places an order with server-authoritative pricing', async () => {
    await page.goto(
      `/portal/checkout?productId=${E2E_PRODUCT.id}&priceId=${E2E_PRODUCT.priceId}`,
    );
    await page.getByLabel('Domain').fill(E2E_PRODUCT.domain);
    await page.getByRole('button', { name: 'Place order' }).click();
    await expect(page.getByRole('heading', { name: /^ORD-/ })).toBeVisible();
    const lifecycle = await lifecycleRecord();
    customerId = lifecycle.customerId;
    invoiceId = lifecycle.invoices[0]?.id ?? '';
    expect(customerId).not.toBe('');
    expect(invoiceId).not.toBe('');
  });

  await test.step('verified fake gateway callback settles the initial invoice', async () => {
    await settleFakeGateway(page, invoiceId);
    await page.goto('/portal/orders');
    const orderRow = page.getByRole('row').filter({
      hasText: E2E_PRODUCT.domain,
    });
    await expect(orderRow).toContainText('PAID');
  });

  await test.step('administrator approves the paid order', async () => {
    await context.clearCookies();
    await login(page, E2E_ADMIN.email, E2E_ADMIN.password, '/admin');
    await page.goto('/portal');
    await expect(page).toHaveURL(/\/admin$/);
    await page.goto('/admin/orders');
    const orderRow = page.getByRole('row').filter({
      hasText: E2E_PRODUCT.domain,
    });
    await orderRow.getByRole('button', { name: 'Approve' }).click();
    await expect(page.getByRole('status')).toContainText(/processing/i);
    await expect(orderRow).toContainText('PROCESSING');
  });

  await test.step('administrator provisions through the fake hosting panel', async () => {
    await page.goto('/admin/services');
    await page.getByLabel('Paid order item').selectOption({ index: 1 });
    await page.getByLabel('Active server').selectOption({ index: 1 });
    await page.getByRole('button', { name: 'Create pending service' }).click();
    const serviceRow = page
      .getByRole('row')
      .filter({ hasText: E2E_PRODUCT.domain })
      .first();
    await expect(serviceRow).toContainText('PENDING');
    await serviceRow.getByRole('button', { name: 'Provision account' }).click();
    await expect(page.getByRole('status')).toContainText(/completed/i);
    await expect(serviceRow).toContainText('ACTIVE');
    const lifecycle = await lifecycleRecord();
    serviceId = lifecycle.items[0]?.service?.id ?? '';
    expect(serviceId).not.toBe('');
  });

  await test.step('customer sees the active hosting service', async () => {
    await context.clearCookies();
    await login(page, E2E_CUSTOMER.email, E2E_CUSTOMER.password, '/portal');
    await page.goto('/portal/services');
    const serviceCard = page.getByRole('link').filter({
      hasText: E2E_PRODUCT.domain,
    });
    await expect(serviceCard).toContainText('ACTIVE');
  });

  await test.step('renewal automation generates the next invoice', async () => {
    const renewal = await createRenewalInvoice(serviceId);
    renewalInvoiceId = renewal.id;
    await page.goto('/portal/invoices');
    await expect(
      page.getByRole('link', { name: renewal.invoiceNumber }),
    ).toBeVisible();
    const renewalRow = page.getByRole('row').filter({
      hasText: renewal.invoiceNumber,
    });
    await expect(renewalRow).toContainText('UNPAID');
  });

  await test.step('overdue automation suspends only for the renewal invoice', async () => {
    await suspendOverdueService(serviceId, renewalInvoiceId);
    await page.goto('/portal/services');
    const serviceCard = page.getByRole('link').filter({
      hasText: E2E_PRODUCT.domain,
    });
    await expect(serviceCard).toContainText('SUSPENDED');
  });

  await test.step('verified payment triggers safe automatic unsuspension', async () => {
    await settleFakeGateway(page, renewalInvoiceId);
    await applyRenewalPaymentAndUnsuspend(serviceId, renewalInvoiceId);
    await page.goto('/portal/services');
    const serviceCard = page.getByRole('link').filter({
      hasText: E2E_PRODUCT.domain,
    });
    await expect(serviceCard).toContainText('ACTIVE');
    const invoice = await e2ePrisma.invoice.findUniqueOrThrow({
      where: { id: renewalInvoiceId },
    });
    expect(invoice.status).toBe('PAID');
  });

  await test.step('customer opens a ticket and administrator replies', async () => {
    await page.goto('/portal/support');
    await page.getByRole('button', { name: 'Open ticket' }).click();
    await page.getByLabel('Subject').fill('Command 26 browser support');
    await page.getByLabel('Hosting service (optional)').selectOption({
      index: 1,
    });
    await page
      .getByLabel('What can we help with?')
      .fill('Please confirm this fictional hosting service is active.');
    await page.getByRole('button', { name: 'Open support ticket' }).click();
    await expect(page.getByRole('status')).toContainText(/opened/i);

    await context.clearCookies();
    await login(page, E2E_ADMIN.email, E2E_ADMIN.password, '/admin');
    await page.goto('/admin/support');
    await expect(
      page.getByRole('heading', { name: 'Command 26 browser support' }),
    ).toBeVisible();
    await page
      .getByLabel('Reply in plain text')
      .fill('The fictional account is active and verified.');
    await page.getByRole('button', { name: 'Send reply' }).click();
    await expect(page.getByRole('status')).toContainText(/reply added/i);

    await context.clearCookies();
    await login(page, E2E_CUSTOMER.email, E2E_CUSTOMER.password, '/portal');
    await page.goto('/portal/support');
    await expect(
      page.getByText('The fictional account is active and verified.'),
    ).toBeVisible();
  });

  await test.step('administrator follows actionable customer context without editing records', async () => {
    await context.clearCookies();
    await login(page, E2E_ADMIN.email, E2E_ADMIN.password, '/admin');
    await page.goto('/admin/customers');
    await page.getByLabel('Search customers').fill(E2E_CUSTOMER.email);
    await page.getByRole('button', { name: 'Search' }).click();
    await page
      .getByRole('link', {
        name: `${E2E_CUSTOMER.firstName} ${E2E_CUSTOMER.lastName}`,
      })
      .click();
    await expect(page).toHaveURL(new RegExp(`/admin/customers/${customerId}$`));
    await expect(
      page.getByRole('heading', { name: 'Operational context' }),
    ).toBeVisible();

    const invoiceLink = page.getByRole('link', { name: /^INV-/ }).first();
    const invoiceHref = await invoiceLink.getAttribute('href');
    expect(invoiceHref).toMatch(/^\/admin\/invoices\/[0-9a-f-]+$/i);
    await invoiceLink.click();
    await expect(page).toHaveURL(new RegExp(`${invoiceHref}$`));
    await expect(
      page.getByRole('button', { name: 'Download PDF' }),
    ).toBeVisible();

    await page.goto(`/admin/customers/${customerId}`);
    await page.getByRole('link', { name: /Orders\s+1/ }).click();
    await expect(page).toHaveURL(
      new RegExp(`/admin/orders\\?customerId=${customerId}$`),
    );
    await expect(page.getByLabel('Customer filter')).toContainText(
      `${E2E_CUSTOMER.firstName} ${E2E_CUSTOMER.lastName}`,
    );
    await expect(
      page.getByRole('row').filter({ hasText: E2E_PRODUCT.domain }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Clear customer filter' }),
    ).toHaveAttribute('href', '/admin/orders');
  });

  await test.step('administrator termination requires the exact confirmation', async () => {
    await context.clearCookies();
    await login(page, E2E_ADMIN.email, E2E_ADMIN.password, '/admin');
    await page.goto('/admin/services');
    const serviceRow = page
      .getByRole('row')
      .filter({ hasText: E2E_PRODUCT.domain })
      .first();
    await serviceRow.getByRole('button', { name: 'Terminate' }).click();
    await page
      .getByLabel('Reason')
      .fill('Command 26 confirmed fictional cleanup');
    await page.getByLabel('Type TERMINATE to confirm').fill('WRONG');
    await page.getByRole('button', { name: 'Confirm terminated' }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: 'Request validation failed.' }),
    ).toBeVisible();
    expect(
      (await e2ePrisma.service.findUniqueOrThrow({ where: { id: serviceId } }))
        .status,
    ).toBe('ACTIVE');

    await page.getByLabel('Type TERMINATE to confirm').fill('TERMINATE');
    await page.getByRole('button', { name: 'Confirm terminated' }).click();
    await expect(page.getByRole('status')).toContainText(/terminated/i);
    await expect(serviceRow).toContainText('TERMINATED');
  });
});

test.afterAll(async () => {
  await e2ePrisma.$disconnect();
});

async function login(
  page: Page,
  email: string,
  password: string,
  expectedPath: '/admin' | '/portal',
) {
  await page.goto(expectedPath === '/admin' ? '/admin' : '/login');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect
    .poll(async () => {
      const cookies = await page.context().cookies(E2E_API_ORIGIN);
      return cookies.some(
        (cookie) =>
          cookie.name === 'webhost_session' ||
          cookie.name === '__Host-webhost_session',
      );
    })
    .toBe(true);
  await expect(page).toHaveURL(new RegExp(`${expectedPath}$`));
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeHidden();
}

async function settleFakeGateway(page: Page, invoiceId: string) {
  const csrfResponse = await page
    .context()
    .request.get(`${E2E_API_ORIGIN}/auth/csrf`, {
      headers: { Origin: 'http://127.0.0.1:3200' },
    });
  expect(csrfResponse.ok()).toBe(true);
  const csrfBody = (await csrfResponse.json()) as {
    data: { csrfToken: string };
  };
  const sessionResponse = await page
    .context()
    .request.post(`${E2E_API_ORIGIN}/payment-gateways/fake/sessions`, {
      headers: {
        Origin: 'http://127.0.0.1:3200',
        'X-CSRF-Token': csrfBody.data.csrfToken,
      },
      data: { invoiceId, submissionKey: randomUUID() },
    });
  expect(sessionResponse.ok()).toBe(true);
  const sessionBody = (await sessionResponse.json()) as {
    data: {
      paymentId: string;
      amount: { amount: string; currency: string };
    };
  };
  const payload = JSON.stringify({
    event_id: `command26-event-${randomUUID()}`,
    type: 'payment.succeeded',
    merchant_id: 'webhost-billing-fake',
    data: {
      payment_id: sessionBody.data.paymentId,
      invoice_id: invoiceId,
      amount: sessionBody.data.amount.amount,
      currency: sessionBody.data.amount.currency,
      transaction_id: `command26-transaction-${randomUUID()}`,
      occurred_at: new Date().toISOString(),
      failure_reason: null,
    },
  });
  const webhookKey = createHmac('sha256', E2E_ENCRYPTION_KEY)
    .update('webhost-billing:fake-payment-webhook:v1')
    .digest();
  const signature = `sha256=${createHmac('sha256', webhookKey)
    .update(payload)
    .digest('hex')}`;
  const callback = await page
    .context()
    .request.post(`${E2E_API_ORIGIN}/payment-gateways/fake/webhooks`, {
      headers: {
        'Content-Type': 'application/json',
        'X-Payment-Signature': signature,
      },
      data: payload,
    });
  expect(callback.status()).toBe(202);
}
