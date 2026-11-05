import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { expect, test, type BrowserContext } from '@playwright/test';
import { parseApiEnvironment } from '@webhost-billing/config';
import { RegistrarProcessor } from '@webhost-billing/database/registrar';
import { TotpService } from '../../../api/dist/modules/auth/services/totp.service';
import { e2ePrisma } from '../database';
import { assertBrowserDatabaseScope } from '../database-scope';
import {
  E2E_DATABASE_URL,
  E2E_SCHEMA,
  E2E_WEB_ORIGIN,
  E2E_API_ORIGIN,
  E2E_ENCRYPTION_KEY,
  e2eApiEnvironment,
} from '../environment';
test.use({ trace: 'off', video: 'off', screenshot: 'off' });
test.afterAll(async () => e2ePrisma.$disconnect());
test('an administrator synchronizes fictional registrar facts and the customer reads the saved result only', async ({
  browser,
}, info) => {
  test.setTimeout(180_000);
  await assertBrowserDatabaseScope(e2ePrisma, E2E_DATABASE_URL, E2E_SCHEMA);
  const administrator = await browser.newContext();
  const customer = await browser.newContext();
  async function session(context: BrowserContext, admin: boolean) {
    const at = new Date();
    const totp = new TotpService(
      parseApiEnvironment({ ...e2eApiEnvironment, PORT: '3201' }),
    );
    const user = await e2ePrisma.user.create({
      data: {
        email: `facts-browser-${randomUUID()}@example.test`,
        role: admin ? 'ADMIN' : 'CUSTOMER',
        status: 'ACTIVE',
        emailVerifiedAt: at,
        ...(admin
          ? {
              adminProfile: {
                create: {
                  displayName: 'Fictional facts administrator',
                  staffRole: 'FULL_ADMINISTRATOR',
                },
              },
              adminTotpCredential: {
                create: {
                  secretCiphertext: totp.encryptSecret(totp.generateSecret()),
                  keyVersion: 'mfa-v1',
                  createdAt: at,
                  enabledAt: at,
                },
              },
            }
          : {
              customer: {
                create: {
                  customerNumber: `FACTS-${randomUUID().slice(0, 20)}`,
                  firstName: 'Fictional',
                  lastName: 'Registrant',
                  addressLine1: '213 Test Road',
                  city: 'Dhaka',
                  countryCode: 'BD',
                },
              },
            }),
      },
      include: { customer: true },
    });
    const token = randomBytes(32).toString('hex');
    await e2ePrisma.authSession.create({
      data: {
        userId: user.id,
        tokenHash: createHash('sha256').update(token).digest('hex'),
        createdAt: at,
        expiresAt: new Date(at.getTime() + 3_600_000),
        twoFactorVerifiedAt: admin ? at : null,
      },
    });
    await context.addCookies([
      {
        name: 'webhost_session',
        value: token,
        url: E2E_WEB_ORIGIN,
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);
    return user;
  }
  async function mutation(
    context: BrowserContext,
    path: string,
    data: unknown,
  ) {
    const csrf = await context.request.get(`${E2E_API_ORIGIN}/auth/csrf`);
    const body: unknown = await csrf.json();
    if (
      !body ||
      typeof body !== 'object' ||
      !('data' in body) ||
      !body.data ||
      typeof body.data !== 'object' ||
      !('csrfToken' in body.data) ||
      typeof body.data.csrfToken !== 'string'
    )
      throw new Error('Missing fictional CSRF token');
    const response = await context.request.post(`${E2E_API_ORIGIN}${path}`, {
      data,
      headers: { 'X-CSRF-Token': body.data.csrfToken },
    });
    expect(response.ok(), `${path}: ${await response.text()}`).toBe(true);
    return response;
  }
  try {
    await session(administrator, true);
    const buyer = await session(customer, false);
    await mutation(administrator, '/domains/registrar', {
      confirmation: 'Enable simulated registrar',
      sellingAmount: '150000',
    });
    const offer = await e2ePrisma.domainOffer.findFirstOrThrow({
      where: { tld: 'com' },
    });
    const name = `facts-${randomUUID()}.com`;
    await mutation(customer, '/domains/quotes', {
      offerId: offer.id,
      domainName: name,
      agreement: 'fictional-registration-v1',
      consent: true,
      contact: {
        name: 'Fictional registrant',
        company: 'Fictional company',
        address: '213 Test Road',
        city: 'Dhaka',
        region: 'Dhaka',
        postalCode: '1212',
        country: 'BD',
        email: 'fictional@example.test',
        phoneCountryCode: '880',
        phone: '1700000000',
      },
    });
    const quote = await e2ePrisma.domainQuote.findFirstOrThrow({
      where: { domainName: name },
    });
    await mutation(customer, '/domains/orders', {
      quoteId: quote.id,
      submissionKey: randomUUID(),
    });
    const ordered = await e2ePrisma.domain.findUniqueOrThrow({
      where: { domainName: name },
    });
    await mutation(administrator, '/payments/manual/admin', {
      invoiceId: ordered.invoiceId,
      amount: '150000',
      submissionKey: randomUUID(),
      proof: {
        method: 'BANK_TRANSFER',
        reference: `FICTIONAL-213-${randomUUID()}`,
      },
    });
    await mutation(administrator, `/domains/${ordered.id}/approve`, {
      confirmation: name,
      costCeiling: '1000',
      costCurrency: 'USD',
    });
    const op = await e2ePrisma.registrarOperation.findUniqueOrThrow({
      where: { domainId: ordered.id },
    });
    await new RegistrarProcessor(e2ePrisma, E2E_ENCRYPTION_KEY).process(op.id);
    const registered = await e2ePrisma.domain.findUniqueOrThrow({
      where: { id: ordered.id },
    });
    expect(registered.state).toBe('REGISTERED');
    const expiry = new Date(registered.expiresAt!.getTime() + 365 * 86_400_000);
    await e2ePrisma.fakeRegistrarRegistration.update({
      where: { id: registered.providerOrderId! },
      data: { expiresAt: expiry },
    });
    const invoiceBefore = await e2ePrisma.invoice.findUniqueOrThrow({
      where: { id: registered.invoiceId! },
      include: { items: true, payments: true },
    });
    const admin = await administrator.newPage();
    await admin.goto(
      `/admin/customers/${buyer.customer!.id}/domains/${registered.id}`,
    );
    const facts = admin.getByRole('region', { name: 'Registrar facts' });
    await facts
      .getByRole('button', { name: 'Synchronize registrar facts' })
      .click();
    const dialog = admin.getByRole('dialog', {
      name: 'Synchronize registrar facts',
    });
    await expect(
      dialog.getByRole('button', { name: 'Check registrar facts' }),
    ).toBeDisabled();
    await dialog.getByLabel('Confirm domain name').fill(name);
    await dialog.getByRole('button', { name: 'Check registrar facts' }).click();
    await expect(facts).toContainText('Latest check: Succeeded');
    expect(
      (
        await e2ePrisma.domain.findUniqueOrThrow({
          where: { id: registered.id },
        })
      ).expiresAt,
    ).toEqual(expiry);
    const portal = await customer.newPage();
    const writes: string[] = [];
    portal.on('request', (request) => {
      if (
        request.url().includes('/registrar-facts') &&
        request.method() !== 'GET'
      )
        writes.push(request.method());
    });
    await portal.goto(`/portal/domains/${registered.id}`);
    const saved = portal.getByRole('region', { name: 'Registrar facts' });
    await expect(saved).toContainText('Latest check: Succeeded');
    await expect(
      saved.getByRole('button', { name: 'Synchronize registrar facts' }),
    ).toHaveCount(0);
    await saved.getByRole('button', { name: 'Refresh saved facts' }).click();
    await expect(saved).toContainText('Source freshness: Fresh');
    expect(writes).toEqual([]);
    expect(
      await e2ePrisma.invoice.findUniqueOrThrow({
        where: { id: registered.invoiceId! },
        include: { items: true, payments: true },
      }),
    ).toEqual(invoiceBefore);
    expect(
      await e2ePrisma.domainAction.count({
        where: { domainId: registered.id },
      }),
    ).toBe(0);
    expect(
      await e2ePrisma.domainFactSync.count({
        where: { domainId: registered.id },
      }),
    ).toBe(1);
    await portal.screenshot({
      path: info.outputPath('saved-registrar-facts.png'),
      fullPage: true,
    });
  } finally {
    await Promise.all([administrator.close(), customer.close()]);
  }
});
