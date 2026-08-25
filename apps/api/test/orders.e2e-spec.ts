import { randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import {
  parseApiEnvironment,
  type ApiEnvironment,
} from '@webhost-billing/config';
import {
  BillingPeriod,
  CustomerStatus,
  ProductStatus,
  UserRole,
  UserStatus,
  type PrismaClient,
} from '@webhost-billing/database';
import {
  apiErrorResponseSchema,
  apiSuccessResponseSchema,
  orderCreationResultSchema,
  orderSchema,
  paginatedApiSuccessResponseSchema,
} from '@webhost-billing/shared';
import request from 'supertest';
import type { App } from 'supertest/types';
import { z } from 'zod';
import { AppModule } from '../src/app.module';
import { PRISMA_CLIENT } from '../src/infrastructure/database/database.module';
import { API_ENVIRONMENT } from '../src/infrastructure/environment/environment.module';
import { PasswordHasherService } from '../src/modules/auth/services/password-hasher.service';

const ADMIN_EMAIL = 'command9-admin@example.test';
const CUSTOMER_EMAIL = 'command9-customer@example.test';
const OTHER_CUSTOMER_EMAIL = 'command9-other@example.test';
const PASSWORD = 'command nine secure password';
const PRODUCT_SLUG = 'command-nine-hosting';

describe('Order creation (e2e)', () => {
  let app: INestApplication<App>;
  let moduleFixture: TestingModule;
  let prisma: PrismaClient;
  let passwords: PasswordHasherService;
  let customerId = '';
  let productId = '';
  let activePriceId = '';
  let archivedPriceId = '';
  let orderId = '';

  beforeAll(async () => {
    moduleFixture = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(API_ENVIRONMENT)
      .useValue(loadTestEnvironment())
      .compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = moduleFixture.get(PRISMA_CLIENT);
    passwords = moduleFixture.get(PasswordHasherService);
    await cleanup();
    const passwordHash = await passwords.hash(PASSWORD);
    await prisma.user.create({
      data: {
        email: ADMIN_EMAIL,
        passwordHash,
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
        adminProfile: {
          create: { displayName: 'Command Nine Admin', isSuperAdmin: true },
        },
      },
    });
    const customerUser = await prisma.user.create({
      data: {
        email: CUSTOMER_EMAIL,
        passwordHash,
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
        customer: {
          create: {
            customerNumber: 'CMD9-CUST',
            status: CustomerStatus.ACTIVE,
            firstName: 'Command',
            lastName: 'Nine',
            addressLine1: '9 Test Avenue',
            city: 'Dhaka',
            countryCode: 'BD',
          },
        },
      },
      include: { customer: true },
    });
    customerId = customerUser.customer?.id ?? '';
    await prisma.user.create({
      data: {
        email: OTHER_CUSTOMER_EMAIL,
        passwordHash,
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
        customer: {
          create: {
            customerNumber: 'CMD9-OTHER',
            status: CustomerStatus.ACTIVE,
            firstName: 'Other',
            lastName: 'Customer',
            addressLine1: '19 Test Avenue',
            city: 'Dhaka',
            countryCode: 'BD',
          },
        },
      },
    });
    const product = await prisma.product.create({
      data: {
        slug: PRODUCT_SLUG,
        name: 'Command Nine Hosting',
        description: 'Historical description for Command Nine.',
        status: ProductStatus.ACTIVE,
        publicVisible: true,
        hostingPackageIdentifier: 'cmd9_package',
        storageFeature: '10 GB SSD',
        websiteFeature: '1 website',
        emailFeature: '10 email accounts',
        bandwidthFeature: '100 GB monthly',
        prices: {
          create: [
            {
              billingPeriod: BillingPeriod.MONTHLY,
              currency: 'BDT',
              amount: 12_000n,
              setupFee: 500n,
              isActive: true,
              validFrom: new Date(Date.now() - 60_000),
            },
            {
              billingPeriod: BillingPeriod.ANNUAL,
              currency: 'BDT',
              amount: 120_000n,
              isActive: false,
              validUntil: new Date(Date.now() - 60_000),
            },
          ],
        },
      },
      include: { prices: true },
    });
    productId = product.id;
    activePriceId = product.prices.find((price) => price.isActive)?.id ?? '';
    archivedPriceId = product.prices.find((price) => !price.isActive)?.id ?? '';
  });

  it('creates a server-priced customer order and unpaid invoice atomically', async () => {
    const customer = request.agent(app.getHttpServer());
    const csrf = await csrfToken(customer);
    await login(customer, csrf, CUSTOMER_EMAIL);
    const response = await customer
      .post('/orders/checkout')
      .set('X-CSRF-Token', csrf)
      .send({
        productId,
        priceId: activePriceId,
        requestedDomain: 'Customer-Site.Example.Test',
        submissionKey: randomUUID(),
      })
      .expect(201);
    const result = apiSuccessResponseSchema(orderCreationResultSchema).parse(
      response.body,
    ).data;
    orderId = result.order.id;
    expect(result.duplicate).toBe(false);
    expect(result.order.orderNumber).toMatch(/^ORD-\d{8}-[0-9A-F]{16}$/);
    expect(result.order.status).toBe('AWAITING_PAYMENT');
    expect(result.order.subtotal.amount).toBe('12000');
    expect(result.order.setupTotal.amount).toBe('500');
    expect(result.order.total.amount).toBe('12500');
    expect(result.order.items[0]).toMatchObject({
      productName: 'Command Nine Hosting',
      requestedDomain: 'customer-site.example.test',
      unitAmount: { amount: '12000', currency: 'BDT' },
      setupFee: { amount: '500', currency: 'BDT' },
    });
    expect(result.order.invoice.status).toBe('UNPAID');
    expect(result.order.invoice.balanceDue.amount).toBe('12500');

    const stored = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { items: true, invoices: { include: { items: true } } },
    });
    expect(stored.total).toBe(12_500n);
    expect(stored.invoices).toHaveLength(1);
    expect(stored.invoices[0]?.items).toHaveLength(2);
    expect(
      await prisma.outboxEvent.findMany({
        where: {
          OR: [
            { aggregateType: 'ORDER', aggregateId: orderId },
            {
              aggregateType: 'INVOICE',
              aggregateId: result.order.invoice.id,
            },
          ],
        },
        select: { eventType: true },
      }),
    ).toEqual(
      expect.arrayContaining([
        { eventType: 'EMAIL_ORDER_RECEIVED' },
        { eventType: 'EMAIL_INVOICE_CREATED' },
      ]),
    );

    await prisma.product.update({
      where: { id: productId },
      data: { name: 'Renamed after order', description: 'Changed later.' },
    });
    const detail = await customer.get(`/orders/${orderId}`).expect(200);
    expect(
      apiSuccessResponseSchema(orderSchema).parse(detail.body).data.items[0]
        ?.productName,
    ).toBe('Command Nine Hosting');
  });

  it('returns the original order for duplicate submissions', async () => {
    const customer = request.agent(app.getHttpServer());
    const csrf = await csrfToken(customer);
    await login(customer, csrf, CUSTOMER_EMAIL);
    const submissionKey = randomUUID();
    const body = {
      productId,
      priceId: activePriceId,
      requestedDomain: 'retry.example.test',
      submissionKey,
    };
    const first = await customer
      .post('/orders/checkout')
      .set('X-CSRF-Token', csrf)
      .send(body)
      .expect(201);
    const second = await customer
      .post('/orders/checkout')
      .set('X-CSRF-Token', csrf)
      .send(body)
      .expect(201);
    const firstResult = apiSuccessResponseSchema(
      orderCreationResultSchema,
    ).parse(first.body).data;
    const secondResult = apiSuccessResponseSchema(
      orderCreationResultSchema,
    ).parse(second.body).data;
    expect(secondResult.duplicate).toBe(true);
    expect(secondResult.order.id).toBe(firstResult.order.id);
    expect(await prisma.order.count({ where: { submissionKey } })).toBe(1);
    expect(
      await prisma.invoice.count({ where: { orderId: firstResult.order.id } }),
    ).toBe(1);
  });

  it('rejects invalid products, archived prices, and browser totals', async () => {
    const customer = request.agent(app.getHttpServer());
    const csrf = await csrfToken(customer);
    await login(customer, csrf, CUSTOMER_EMAIL);
    const unavailable = await customer
      .post('/orders/checkout')
      .set('X-CSRF-Token', csrf)
      .send({
        productId,
        priceId: archivedPriceId,
        requestedDomain: 'archived.example.test',
        submissionKey: randomUUID(),
      })
      .expect(422);
    expect(apiErrorResponseSchema.parse(unavailable.body).error.code).toBe(
      'UNPROCESSABLE_ENTITY',
    );
    await customer
      .post('/orders/checkout')
      .set('X-CSRF-Token', csrf)
      .send({
        productId: randomUUID(),
        priceId: activePriceId,
        requestedDomain: 'invalid.example.test',
        submissionKey: randomUUID(),
      })
      .expect(422);
    const submittedTotal = await customer
      .post('/orders/checkout')
      .set('X-CSRF-Token', csrf)
      .send({
        productId,
        priceId: activePriceId,
        requestedDomain: 'free.example.test',
        submissionKey: randomUUID(),
        total: '0',
      })
      .expect(400);
    expect(apiErrorResponseSchema.parse(submittedTotal.body).error.code).toBe(
      'VALIDATION_ERROR',
    );
  });

  it('enforces customer ownership and permits administrator-created orders', async () => {
    await request(app.getHttpServer()).get(`/orders/${orderId}`).expect(401);
    const otherCustomer = request.agent(app.getHttpServer());
    const otherCsrf = await csrfToken(otherCustomer);
    await login(otherCustomer, otherCsrf, OTHER_CUSTOMER_EMAIL);
    await otherCustomer.get(`/orders/${orderId}`).expect(403);
    await otherCustomer.get('/orders').expect(403);

    const admin = request.agent(app.getHttpServer());
    const adminCsrf = await csrfToken(admin);
    await login(admin, adminCsrf, ADMIN_EMAIL);
    const created = await admin
      .post('/orders/admin')
      .set('X-CSRF-Token', adminCsrf)
      .send({
        customerId,
        productId,
        priceId: activePriceId,
        requestedDomain: 'admin-created.example.test',
        submissionKey: randomUUID(),
        notes: 'Created after an offline customer request.',
      })
      .expect(201);
    const adminOrder = apiSuccessResponseSchema(
      orderCreationResultSchema,
    ).parse(created.body).data.order;
    const cancelled = await admin
      .patch(`/orders/${adminOrder.id}/status`)
      .set('X-CSRF-Token', adminCsrf)
      .send({ status: 'CANCELLED' })
      .expect(200);
    expect(
      apiSuccessResponseSchema(orderSchema).parse(cancelled.body).data,
    ).toMatchObject({
      status: 'CANCELLED',
      invoice: { status: 'CANCELLED' },
    });
    await prisma.order.update({
      where: { id: orderId },
      data: { status: 'PAID' },
    });
    await admin
      .patch(`/orders/${orderId}/status`)
      .set('X-CSRF-Token', adminCsrf)
      .send({ status: 'PROCESSING' })
      .expect(200);
    expect(
      await prisma.outboxEvent.count({
        where: {
          aggregateId: orderId,
          eventType: 'EMAIL_ORDER_APPROVED',
        },
      }),
    ).toBe(1);
    await admin
      .patch(`/orders/${orderId}/status`)
      .set('X-CSRF-Token', adminCsrf)
      .send({ status: 'PAID' })
      .expect(422);
    const list = await admin.get('/orders?pageSize=100').expect(200);
    expect(
      paginatedApiSuccessResponseSchema(orderSchema).parse(list.body).data
        .length,
    ).toBeGreaterThanOrEqual(3);
    const audit = await prisma.activityLog.findMany({
      where: {
        action: {
          in: [
            'ORDER_CREATED_BY_CUSTOMER',
            'ORDER_CREATED_BY_ADMIN',
            'ORDER_STATUS_CHANGED_BY_ADMIN',
          ],
        },
        entityType: 'ORDER',
      },
    });
    expect(audit.some((entry) => entry.entityId === orderId)).toBe(true);
    expect(audit.some((entry) => entry.entityId === adminOrder.id)).toBe(true);
  });

  afterAll(async () => {
    if (prisma) await cleanup();
    if (app) await app.close();
  });

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

  async function cleanup() {
    const users = await prisma.user.findMany({
      where: {
        email: { in: [ADMIN_EMAIL, CUSTOMER_EMAIL, OTHER_CUSTOMER_EMAIL] },
      },
      select: { id: true, customer: { select: { id: true } } },
    });
    const userIds = users.map((user) => user.id);
    const customerIds = users.flatMap((user) =>
      user.customer ? [user.customer.id] : [],
    );
    const orders = customerIds.length
      ? await prisma.order.findMany({
          where: { customerId: { in: customerIds } },
          select: { id: true },
        })
      : [];
    const orderIds = orders.map((order) => order.id);
    if (orderIds.length) {
      const invoices = await prisma.invoice.findMany({
        where: { orderId: { in: orderIds } },
        select: { id: true },
      });
      const invoiceIds = invoices.map((invoice) => invoice.id);
      await prisma.outboxEvent.deleteMany({
        where: {
          OR: [
            { aggregateType: 'ORDER', aggregateId: { in: orderIds } },
            { aggregateType: 'INVOICE', aggregateId: { in: invoiceIds } },
          ],
        },
      });
      await prisma.invoiceItem.deleteMany({
        where: { invoiceId: { in: invoiceIds } },
      });
      await prisma.invoice.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.orderItem.deleteMany({
        where: { orderId: { in: orderIds } },
      });
      await prisma.activityLog.deleteMany({
        where: { entityType: 'ORDER', entityId: { in: orderIds } },
      });
      await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    }
    const product = await prisma.product.findUnique({
      where: { slug: PRODUCT_SLUG },
      select: { id: true },
    });
    if (product) {
      await prisma.productPrice.deleteMany({
        where: { productId: product.id },
      });
      await prisma.product.delete({ where: { id: product.id } });
    }
    if (userIds.length) {
      await prisma.activityLog.deleteMany({
        where: { actorUserId: { in: userIds } },
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
  }

  function loadTestEnvironment(): ApiEnvironment {
    return parseApiEnvironment({
      ...process.env,
      PORT: process.env.API_PORT ?? '3001',
      NODE_ENV: 'test',
      AUTH_RATE_LIMIT_NAMESPACE: `order-e2e-${randomUUID()}`,
    });
  }
});
