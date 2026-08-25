import { randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import {
  parseApiEnvironment,
  type ApiEnvironment,
} from '@webhost-billing/config';
import {
  CustomerStatus,
  InvoiceStatus,
  UserRole,
  UserStatus,
  type Prisma,
  type PrismaClient,
} from '@webhost-billing/database';
import {
  apiErrorResponseSchema,
  apiSuccessResponseSchema,
  businessIdentitySchema,
  invoiceCreationResultSchema,
  invoiceSchema,
  paginatedApiSuccessResponseSchema,
} from '@webhost-billing/shared';
import request from 'supertest';
import type { App } from 'supertest/types';
import { z } from 'zod';
import { AppModule } from '../src/app.module';
import { PRISMA_CLIENT } from '../src/infrastructure/database/database.module';
import { API_ENVIRONMENT } from '../src/infrastructure/environment/environment.module';
import { PasswordHasherService } from '../src/modules/auth/services/password-hasher.service';

const ADMIN_EMAIL = 'command10-admin@example.test';
const CUSTOMER_EMAIL = 'command10-customer@example.test';
const OTHER_EMAIL = 'command10-other@example.test';
const PASSWORD = 'command ten secure password';

describe('Invoice management (e2e)', () => {
  let app: INestApplication<App>;
  let moduleFixture: TestingModule;
  let prisma: PrismaClient;
  let passwords: PasswordHasherService;
  let customerId = '';
  let invoiceId = '';
  let previousBusinessSetting: {
    value: Prisma.InputJsonValue;
    updatedByUserId: string | null;
  } | null = null;

  beforeAll(async () => {
    moduleFixture = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(API_ENVIRONMENT)
      .useValue(loadTestEnvironment())
      .compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = moduleFixture.get(PRISMA_CLIENT);
    passwords = moduleFixture.get(PasswordHasherService);
    const existingBusinessSetting = await prisma.setting.findUnique({
      where: { key: 'business.identity' },
      select: { value: true, updatedByUserId: true },
    });
    previousBusinessSetting =
      existingBusinessSetting?.value === null || !existingBusinessSetting
        ? null
        : {
            value: existingBusinessSetting.value as Prisma.InputJsonValue,
            updatedByUserId: existingBusinessSetting.updatedByUserId,
          };
    await cleanup(false);
    const passwordHash = await passwords.hash(PASSWORD);
    await prisma.user.create({
      data: {
        email: ADMIN_EMAIL,
        passwordHash,
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
        adminProfile: {
          create: { displayName: 'Command Ten Admin', isSuperAdmin: true },
        },
      },
    });
    const customer = await prisma.user.create({
      data: {
        email: CUSTOMER_EMAIL,
        passwordHash,
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
        customer: {
          create: {
            customerNumber: 'CMD10-CUST',
            status: CustomerStatus.ACTIVE,
            firstName: 'Invoice',
            lastName: 'Customer',
            companyName: 'Original Customer Ltd',
            addressLine1: '10 Billing Road',
            city: 'Dhaka',
            countryCode: 'BD',
            taxIdentifier: 'CUST-TAX-10',
          },
        },
      },
      include: { customer: true },
    });
    customerId = customer.customer?.id ?? '';
    await prisma.user.create({
      data: {
        email: OTHER_EMAIL,
        passwordHash,
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
        customer: {
          create: {
            customerNumber: 'CMD10-OTHER',
            status: CustomerStatus.ACTIVE,
            firstName: 'Other',
            lastName: 'Customer',
            addressLine1: '20 Billing Road',
            city: 'Dhaka',
            countryCode: 'BD',
          },
        },
      },
    });
  });

  it('configures business identity and creates a calculated draft idempotently', async () => {
    const admin = request.agent(app.getHttpServer());
    const csrf = await csrfToken(admin);
    await login(admin, csrf, ADMIN_EMAIL);
    const identityResponse = await admin
      .patch('/invoices/settings/business-identity')
      .set('X-CSRF-Token', csrf)
      .send({
        name: 'Fictional Hosting Ltd',
        addressLine1: '100 Example Avenue',
        city: 'Dhaka',
        countryCode: 'BD',
        email: 'billing@example.test',
        taxIdentifier: 'BUSINESS-TAX-10',
      })
      .expect(200);
    expect(
      apiSuccessResponseSchema(businessIdentitySchema).parse(
        identityResponse.body,
      ).data.name,
    ).toBe('Fictional Hosting Ltd');

    const submissionKey = randomUUID();
    const body = {
      customerId,
      currency: 'BDT',
      dueAt: futureDate(7),
      creditTotal: '2000',
      submissionKey,
      items: [
        {
          description: 'Managed hosting — September 2026',
          quantity: 2,
          unitAmount: '10000',
          discountAmount: '1000',
          taxAmount: '2850',
        },
        {
          description: 'Migration assistance',
          quantity: 1,
          unitAmount: '5000',
          discountAmount: '0',
          taxAmount: '750',
        },
      ],
    };
    const first = await admin
      .post('/invoices')
      .set('X-CSRF-Token', csrf)
      .send(body)
      .expect(201);
    const second = await admin
      .post('/invoices')
      .set('X-CSRF-Token', csrf)
      .send(body)
      .expect(201);
    const firstResult = apiSuccessResponseSchema(
      invoiceCreationResultSchema,
    ).parse(first.body).data;
    const secondResult = apiSuccessResponseSchema(
      invoiceCreationResultSchema,
    ).parse(second.body).data;
    invoiceId = firstResult.invoice.id;
    expect(firstResult.duplicate).toBe(false);
    expect(secondResult.duplicate).toBe(true);
    expect(secondResult.invoice.id).toBe(invoiceId);
    await admin
      .post('/invoices')
      .set('X-CSRF-Token', csrf)
      .send({ ...body, items: [...body.items].reverse() })
      .expect(409);
    expect(firstResult.invoice.invoiceNumber).toMatch(
      /^INV-\d{8}-[0-9A-F]{16}$/,
    );
    expect(firstResult.invoice).toMatchObject({
      status: 'DRAFT',
      subtotal: { amount: '25000', currency: 'BDT' },
      discountTotal: { amount: '1000', currency: 'BDT' },
      taxTotal: { amount: '3600', currency: 'BDT' },
      total: { amount: '27600', currency: 'BDT' },
      creditTotal: { amount: '2000', currency: 'BDT' },
      amountPaid: { amount: '0', currency: 'BDT' },
      balanceDue: { amount: '25600', currency: 'BDT' },
      customerName: 'Original Customer Ltd',
      businessIdentity: { name: 'Fictional Hosting Ltd' },
      taxIdentity: { taxIdentifier: 'CUST-TAX-10' },
    });
    expect(await prisma.invoice.count({ where: { submissionKey } })).toBe(1);
    expect(
      firstResult.invoice.items.map((item) => item.lineTotal.amount),
    ).toEqual(['21850', '5750']);
  });

  it('edits only drafts, issues immutable snapshots, and exposes owned detail', async () => {
    const admin = request.agent(app.getHttpServer());
    const adminCsrf = await csrfToken(admin);
    await login(admin, adminCsrf, ADMIN_EMAIL);
    const edited = await admin
      .patch(`/invoices/${invoiceId}/draft`)
      .set('X-CSRF-Token', adminCsrf)
      .send({
        currency: 'BDT',
        dueAt: futureDate(10),
        creditTotal: '500',
        items: [
          {
            description: 'Final historical hosting description',
            quantity: 3,
            unitAmount: '10000',
            discountAmount: '1500',
            taxAmount: '4275',
          },
        ],
      })
      .expect(200);
    expect(
      apiSuccessResponseSchema(invoiceSchema).parse(edited.body).data,
    ).toMatchObject({
      subtotal: { amount: '30000' },
      discountTotal: { amount: '1500' },
      taxTotal: { amount: '4275' },
      total: { amount: '32775' },
      creditTotal: { amount: '500' },
      balanceDue: { amount: '32275' },
    });

    await admin
      .patch(`/invoices/${invoiceId}/action`)
      .set('X-CSRF-Token', adminCsrf)
      .send({ action: 'ISSUE' })
      .expect(200);
    expect(
      await prisma.outboxEvent.count({
        where: { aggregateId: invoiceId, eventType: 'EMAIL_INVOICE_CREATED' },
      }),
    ).toBe(1);
    await admin
      .patch(`/invoices/${invoiceId}/draft`)
      .set('X-CSRF-Token', adminCsrf)
      .send({
        currency: 'BDT',
        dueAt: futureDate(20),
        creditTotal: '0',
        items: [
          {
            description: 'Forbidden rewrite',
            quantity: 1,
            unitAmount: '1',
            discountAmount: '0',
            taxAmount: '0',
          },
        ],
      })
      .expect(422);

    await prisma.customer.update({
      where: { id: customerId },
      data: {
        companyName: 'Changed Customer Ltd',
        addressLine1: 'New Address',
      },
    });
    await admin
      .patch('/invoices/settings/business-identity')
      .set('X-CSRF-Token', adminCsrf)
      .send({ name: 'Changed Future Business' })
      .expect(200);

    const customer = request.agent(app.getHttpServer());
    const customerCsrf = await csrfToken(customer);
    await login(customer, customerCsrf, CUSTOMER_EMAIL);
    const detail = await customer.get(`/invoices/${invoiceId}`).expect(200);
    const invoice = apiSuccessResponseSchema(invoiceSchema).parse(
      detail.body,
    ).data;
    expect(invoice.status).toBe('UNPAID');
    expect(invoice.customerName).toBe('Original Customer Ltd');
    expect(invoice.customerAddress.line1).toBe('10 Billing Road');
    expect(invoice.businessIdentity.name).toBe('Fictional Hosting Ltd');
    expect(invoice.items[0]?.description).toBe(
      'Final historical hosting description',
    );
    const list = await customer.get('/invoices/my?pageSize=100').expect(200);
    expect(
      paginatedApiSuccessResponseSchema(invoiceSchema)
        .parse(list.body)
        .data.some((item) => item.id === invoiceId),
    ).toBe(true);
  });

  it('enforces ownership, cancellation rules, and non-deletion of issued history', async () => {
    const other = request.agent(app.getHttpServer());
    const otherCsrf = await csrfToken(other);
    await login(other, otherCsrf, OTHER_EMAIL);
    await other.get(`/invoices/${invoiceId}`).expect(403);
    await other.get('/invoices').expect(403);

    const admin = request.agent(app.getHttpServer());
    const csrf = await csrfToken(admin);
    await login(admin, csrf, ADMIN_EMAIL);
    const cancelled = await admin
      .patch(`/invoices/${invoiceId}/action`)
      .set('X-CSRF-Token', csrf)
      .send({ action: 'CANCEL' })
      .expect(200);
    expect(
      apiSuccessResponseSchema(invoiceSchema).parse(cancelled.body).data.status,
    ).toBe('CANCELLED');
    await admin
      .patch(`/invoices/${invoiceId}/action`)
      .set('X-CSRF-Token', csrf)
      .send({ action: 'ISSUE' })
      .expect(422);
    await admin
      .delete(`/invoices/${invoiceId}`)
      .set('X-CSRF-Token', csrf)
      .expect(404);
    expect(await prisma.invoice.count({ where: { id: invoiceId } })).toBe(1);
  });

  it('settles zero-value invoices on issue and marks eligible invoices overdue', async () => {
    const admin = request.agent(app.getHttpServer());
    const csrf = await csrfToken(admin);
    await login(admin, csrf, ADMIN_EMAIL);
    const zero = await createDraft(admin, csrf, {
      description: 'No-charge adjustment document',
      unitAmount: '0',
    });
    const issuedZero = await admin
      .patch(`/invoices/${zero.id}/action`)
      .set('X-CSRF-Token', csrf)
      .send({ action: 'ISSUE' })
      .expect(200);
    expect(
      apiSuccessResponseSchema(invoiceSchema).parse(issuedZero.body).data,
    ).toMatchObject({
      status: 'PAID',
      total: { amount: '0' },
      balanceDue: { amount: '0' },
    });
    await admin
      .patch(`/invoices/${zero.id}/action`)
      .set('X-CSRF-Token', csrf)
      .send({ action: 'CANCEL' })
      .expect(422);

    const pastIssuedAt = new Date(Date.now() - 172_800_000);
    const pastDueAt = new Date(Date.now() - 86_400_000);
    const overdueCandidate = await prisma.invoice.create({
      data: {
        invoiceNumber: `TEST-INV-${randomUUID().slice(0, 8)}`,
        submissionKey: `test:overdue:${randomUUID()}`,
        customerId,
        status: InvoiceStatus.UNPAID,
        currency: 'BDT',
        subtotal: 100n,
        total: 100n,
        balanceDue: 100n,
        customerNameSnapshot: 'Original Customer Ltd',
        customerEmailSnapshot: CUSTOMER_EMAIL,
        customerAddressSnapshot: {
          line1: '10 Billing Road',
          line2: null,
          city: 'Dhaka',
          region: null,
          postalCode: null,
          countryCode: 'BD',
        },
        businessIdentitySnapshot: { name: 'Fictional Hosting Ltd' },
        issuedAt: pastIssuedAt,
        dueAt: pastDueAt,
        items: {
          create: {
            linePosition: 1,
            descriptionSnapshot: 'Past-due test line',
            currency: 'BDT',
            quantity: 1,
            unitAmount: 100n,
            lineTotal: 100n,
          },
        },
      },
    });
    const overdue = await admin
      .patch(`/invoices/${overdueCandidate.id}/action`)
      .set('X-CSRF-Token', csrf)
      .send({ action: 'MARK_OVERDUE' })
      .expect(200);
    expect(
      apiSuccessResponseSchema(invoiceSchema).parse(overdue.body).data.status,
    ).toBe('OVERDUE');
    expect(
      await prisma.outboxEvent.count({
        where: {
          aggregateId: overdueCandidate.id,
          eventType: 'EMAIL_OVERDUE_NOTICE',
        },
      }),
    ).toBe(1);
  });

  it('rejects invalid calculations and audits administrator actions', async () => {
    const admin = request.agent(app.getHttpServer());
    const csrf = await csrfToken(admin);
    await login(admin, csrf, ADMIN_EMAIL);
    const response = await admin
      .post('/invoices')
      .set('X-CSRF-Token', csrf)
      .send({
        customerId,
        currency: 'BDT',
        dueAt: futureDate(7),
        creditTotal: '101',
        submissionKey: randomUUID(),
        items: [
          {
            description: 'Invalid credit',
            quantity: 1,
            unitAmount: '100',
            discountAmount: '0',
            taxAmount: '0',
          },
        ],
      })
      .expect(422);
    expect(apiErrorResponseSchema.parse(response.body).error.code).toBe(
      'UNPROCESSABLE_ENTITY',
    );
    const actions = await prisma.activityLog.findMany({
      where: {
        entityType: { in: ['INVOICE', 'SETTING'] },
        action: { startsWith: 'INVOICE_' },
      },
      select: { action: true },
    });
    expect(
      actions.some(
        (entry) => entry.action === 'INVOICE_DRAFT_CREATED_BY_ADMIN',
      ),
    ).toBe(true);
    expect(
      actions.some((entry) => entry.action === 'INVOICE_ISSUED_BY_ADMIN'),
    ).toBe(true);
    expect(
      actions.some((entry) => entry.action === 'INVOICE_CANCELLED_BY_ADMIN'),
    ).toBe(true);
    expect(
      actions.some(
        (entry) => entry.action === 'INVOICE_MARKED_OVERDUE_BY_ADMIN',
      ),
    ).toBe(true);
  });

  afterAll(async () => {
    if (prisma) await cleanup(true);
    if (app) await app.close();
  });

  async function createDraft(
    admin: ReturnType<typeof request.agent>,
    csrf: string,
    item: { description: string; unitAmount: string },
  ) {
    const response = await admin
      .post('/invoices')
      .set('X-CSRF-Token', csrf)
      .send({
        customerId,
        currency: 'BDT',
        dueAt: futureDate(7),
        creditTotal: '0',
        submissionKey: randomUUID(),
        items: [
          {
            ...item,
            quantity: 1,
            discountAmount: '0',
            taxAmount: '0',
          },
        ],
      })
      .expect(201);
    return apiSuccessResponseSchema(invoiceCreationResultSchema).parse(
      response.body,
    ).data.invoice;
  }

  async function csrfToken(agent: ReturnType<typeof request.agent>) {
    const response = await agent.get('/auth/csrf').expect(200);
    return apiSuccessResponseSchema(
      z.object({ csrfToken: z.string().min(32) }).strict(),
    ).parse(response.body).data.csrfToken;
  }

  async function login(
    agent: ReturnType<typeof request.agent>,
    csrf: string,
    email: string,
  ) {
    await agent
      .post('/auth/login')
      .set('X-CSRF-Token', csrf)
      .send({ email, password: PASSWORD })
      .expect(200);
  }

  async function cleanup(restoreSetting: boolean) {
    const users = await prisma.user.findMany({
      where: { email: { in: [ADMIN_EMAIL, CUSTOMER_EMAIL, OTHER_EMAIL] } },
      select: { id: true, customer: { select: { id: true } } },
    });
    const userIds = users.map((user) => user.id);
    const customerIds = users.flatMap((user) =>
      user.customer ? [user.customer.id] : [],
    );
    if (customerIds.length) {
      const invoices = await prisma.invoice.findMany({
        where: { customerId: { in: customerIds } },
        select: { id: true },
      });
      const ids = invoices.map((invoice) => invoice.id);
      await prisma.outboxEvent.deleteMany({
        where: { aggregateType: 'INVOICE', aggregateId: { in: ids } },
      });
      await prisma.invoiceItem.deleteMany({
        where: { invoiceId: { in: ids } },
      });
      await prisma.activityLog.deleteMany({
        where: { entityType: 'INVOICE', entityId: { in: ids } },
      });
      await prisma.invoice.deleteMany({ where: { id: { in: ids } } });
    }
    if (userIds.length) {
      await prisma.activityLog.deleteMany({
        where: { actorUserId: { in: userIds } },
      });
      await prisma.setting.deleteMany({
        where: { key: 'business.identity', updatedByUserId: { in: userIds } },
      });
      await prisma.authSession.deleteMany({
        where: { userId: { in: userIds } },
      });
      await prisma.adminProfile.deleteMany({
        where: { userId: { in: userIds } },
      });
      await prisma.customer.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    if (restoreSetting && previousBusinessSetting) {
      await prisma.setting.upsert({
        where: { key: 'business.identity' },
        update: previousBusinessSetting,
        create: {
          key: 'business.identity',
          category: 'BUSINESS',
          value: previousBusinessSetting.value,
          updatedByUserId: previousBusinessSetting.updatedByUserId,
        },
      });
    }
  }

  function futureDate(days: number) {
    return new Date(Date.now() + days * 86_400_000).toISOString();
  }

  function loadTestEnvironment(): ApiEnvironment {
    return parseApiEnvironment({
      ...process.env,
      PORT: process.env.API_PORT ?? '3001',
      NODE_ENV: 'test',
      AUTH_RATE_LIMIT_NAMESPACE: `invoice-e2e-${randomUUID()}`,
    });
  }
});
