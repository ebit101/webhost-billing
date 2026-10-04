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
  InvoiceStatus,
  OrderStatus,
  PaymentKind,
  PaymentStatus,
  ProductStatus,
  ServerStatus,
  UserRole,
  UserStatus,
  type PrismaClient,
} from '@webhost-billing/database';
import {
  apiSuccessResponseSchema,
  paginatedApiSuccessResponseSchema,
  serviceCreationResultSchema,
  serviceSchema,
  serviceSetupOptionsSchema,
} from '@webhost-billing/shared';
import request from 'supertest';
import type { App } from 'supertest/types';
import { z } from 'zod';
import { AppModule } from '../src/app.module';
import { PRISMA_CLIENT } from '../src/infrastructure/database/database.module';
import { API_ENVIRONMENT } from '../src/infrastructure/environment/environment.module';
import { PasswordHasherService } from '../src/modules/auth/services/password-hasher.service';

const ADMIN_EMAIL = 'command14-admin@example.test';
const CUSTOMER_EMAIL = 'command14-customer@example.test';
const OTHER_EMAIL = 'command14-other@example.test';
const PASSWORD = 'command fourteen secure password';
const PRODUCT_SLUG = 'command-fourteen-hosting';
const SERVER_HOSTNAME = 'command14-server.example.test';

describe('Hosting services (e2e)', () => {
  let app: INestApplication<App>;
  let moduleFixture: TestingModule;
  let prisma: PrismaClient;
  let passwords: PasswordHasherService;
  let customerId = '';
  let productId = '';
  let productPriceId = '';
  let serverId = '';
  let primaryOrderItemId = '';
  let serviceId = '';

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
          create: { displayName: 'Command Fourteen Admin', isSuperAdmin: true },
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
            customerNumber: 'CMD14-CUSTOMER',
            status: CustomerStatus.ACTIVE,
            firstName: 'Service',
            lastName: 'Customer',
            addressLine1: '14 Hosting Road',
            city: 'Dhaka',
            countryCode: 'BD',
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
            customerNumber: 'CMD14-OTHER',
            status: CustomerStatus.ACTIVE,
            firstName: 'Other',
            lastName: 'Customer',
            addressLine1: '15 Hosting Road',
            city: 'Dhaka',
            countryCode: 'BD',
          },
        },
      },
    });
    const product = await prisma.product.create({
      data: {
        slug: PRODUCT_SLUG,
        name: 'Command Fourteen Hosting',
        description: 'Historical service product snapshot.',
        status: ProductStatus.ACTIVE,
        publicVisible: true,
        hostingPackageIdentifier: 'cmd14_package',
        prices: {
          create: {
            billingPeriod: BillingPeriod.MONTHLY,
            currency: 'BDT',
            amount: 14_000n,
            isActive: true,
          },
        },
      },
      include: { prices: true },
    });
    productId = product.id;
    productPriceId = product.prices[0]?.id ?? '';
    const server = await prisma.server.create({
      data: {
        name: 'Command Fourteen Server',
        hostname: SERVER_HOSTNAME,
        status: ServerStatus.ACTIVE,
        adapterKey: 'fake-panel',
        maxAccounts: 20,
      },
    });
    serverId = server.id;
    primaryOrderItemId = await createPaidOrder('service-one.example.test');
  });

  it('creates one pending service only from a paid order item', async () => {
    const admin = request.agent(app.getHttpServer());
    const csrf = await csrfToken(admin);
    await login(admin, csrf, ADMIN_EMAIL);
    const optionsResponse = await admin
      .get('/services/setup-options')
      .expect(200);
    const options = apiSuccessResponseSchema(serviceSetupOptionsSchema).parse(
      optionsResponse.body,
    ).data;
    expect(options.servers.some((server) => server.id === serverId)).toBe(true);
    expect(
      options.orderItems.some(
        (item) => item.orderItemId === primaryOrderItemId,
      ),
    ).toBe(true);

    const createdResponse = await admin
      .post('/services')
      .set('X-CSRF-Token', csrf)
      .send({ orderItemId: primaryOrderItemId, serverId })
      .expect(201);
    const created = apiSuccessResponseSchema(serviceCreationResultSchema).parse(
      createdResponse.body,
    ).data;
    serviceId = created.service.id;
    expect(created).toMatchObject({
      duplicate: false,
      service: {
        status: 'PENDING',
        productName: 'Command Fourteen Hosting',
        productPriceId,
        domain: 'service-one.example.test',
        server: { id: serverId },
      },
    });
    expect(new Date(created.service.nextDueAt).getTime()).toBeGreaterThan(
      new Date(created.service.startedAt).getTime(),
    );
    const order = await prisma.orderItem.findUniqueOrThrow({
      where: { id: primaryOrderItemId },
      include: { order: true },
    });
    expect(order.order.status).toBe(OrderStatus.PROCESSING);

    const replay = await admin
      .post('/services')
      .set('X-CSRF-Token', csrf)
      .send({ orderItemId: primaryOrderItemId, serverId })
      .expect(201);
    expect(
      apiSuccessResponseSchema(serviceCreationResultSchema).parse(replay.body)
        .data,
    ).toMatchObject({ duplicate: true, service: { id: serviceId } });
    expect(
      await prisma.service.count({
        where: { orderItemId: primaryOrderItemId },
      }),
    ).toBe(1);
  });

  it('enforces provisioning, activation, suspension, and termination evidence', async () => {
    const admin = request.agent(app.getHttpServer());
    const csrf = await csrfToken(admin);
    await login(admin, csrf, ADMIN_EMAIL);
    await admin
      .patch(`/services/${serviceId}/status`)
      .set('X-CSRF-Token', csrf)
      .send({
        status: 'ACTIVE',
        externalAccountId: 'account-one',
        controlPanelUsername: 'serviceone',
      })
      .expect(422);
    await transition(admin, csrf, serviceId, { status: 'PROVISIONING' });
    await admin
      .patch(`/services/${serviceId}/status`)
      .set('X-CSRF-Token', csrf)
      .send({ status: 'ACTIVE' })
      .expect(422);
    const active = await transition(admin, csrf, serviceId, {
      status: 'ACTIVE',
      externalAccountId: 'account-one',
      controlPanelUsername: 'serviceone',
    });
    expect(active.status).toBe('ACTIVE');
    expect(active.activatedAt).not.toBeNull();
    const linkedOrder = await prisma.orderItem.findUniqueOrThrow({
      where: { id: primaryOrderItemId },
      include: { order: true },
    });
    expect(linkedOrder.order.status).toBe(OrderStatus.COMPLETED);

    const suspended = await transition(admin, csrf, serviceId, {
      status: 'SUSPENDED',
      reason: 'Manual suspension for lifecycle testing.',
    });
    expect(suspended).toMatchObject({
      status: 'SUSPENDED',
      suspensionReason: 'Manual suspension for lifecycle testing.',
    });
    const reactivated = await transition(admin, csrf, serviceId, {
      status: 'ACTIVE',
    });
    expect(reactivated.status).toBe('ACTIVE');
    expect(
      (
        await prisma.outboxEvent.findMany({
          where: { aggregateType: 'SERVICE', aggregateId: serviceId },
          select: { eventType: true },
        })
      ).map(({ eventType }) => eventType),
    ).toEqual(
      expect.arrayContaining([
        'EMAIL_SERVICE_PROVISIONED',
        'EMAIL_SERVICE_SUSPENDED',
        'EMAIL_SERVICE_REACTIVATED',
      ]),
    );
    await admin
      .patch(`/services/${serviceId}/status`)
      .set('X-CSRF-Token', csrf)
      .send({ status: 'TERMINATED', reason: 'Missing confirmation.' })
      .expect(400);
    const terminated = await transition(admin, csrf, serviceId, {
      status: 'TERMINATED',
      reason: 'Administrator-confirmed permanent termination.',
      confirmation: 'TERMINATE',
    });
    expect(terminated).toMatchObject({
      status: 'TERMINATED',
      terminationReason: 'Administrator-confirmed permanent termination.',
    });
    expect(terminated.terminatedAt).not.toBeNull();
  });

  it('records provisioning failure and pre-activation cancellation separately', async () => {
    const orderItemId = await createPaidOrder('service-two.example.test');
    const orderItem = await prisma.orderItem.findUniqueOrThrow({
      where: { id: orderItemId },
    });
    const paidAt = new Date();
    const invoice = await prisma.invoice.create({
      data: {
        invoiceNumber: `CMD25-${randomUUID().slice(0, 12).toUpperCase()}`,
        submissionKey: `command25:paid-provisioning:${randomUUID()}`,
        customerId,
        orderId: orderItem.orderId,
        status: InvoiceStatus.PAID,
        currency: 'BDT',
        subtotal: 14_000n,
        total: 14_000n,
        amountPaid: 14_000n,
        balanceDue: 0n,
        customerNameSnapshot: 'Service Customer',
        customerEmailSnapshot: CUSTOMER_EMAIL,
        customerAddressSnapshot: {
          line1: '14 Hosting Road',
          city: 'Dhaka',
          countryCode: 'BD',
        },
        businessIdentitySnapshot: { name: 'Fictional Hosting Ltd' },
        issuedAt: paidAt,
        dueAt: paidAt,
        paidAt,
        items: {
          create: {
            linePosition: 1,
            orderItemId,
            descriptionSnapshot: 'Paid hosting awaiting provisioning',
            currency: 'BDT',
            quantity: 1,
            unitAmount: 14_000n,
            lineTotal: 14_000n,
          },
        },
      },
    });
    const payment = await prisma.payment.create({
      data: {
        invoiceId: invoice.id,
        kind: PaymentKind.CHARGE,
        status: PaymentStatus.SUCCEEDED,
        provider: 'fake-gateway',
        providerTransactionId: `cmd25-${randomUUID()}`,
        idempotencyKey: `command25:payment:${randomUUID()}`,
        amount: 14_000n,
        currency: 'BDT',
        receivedAt: paidAt,
        verifiedAt: paidAt,
      },
    });
    const admin = request.agent(app.getHttpServer());
    const csrf = await csrfToken(admin);
    await login(admin, csrf, ADMIN_EMAIL);
    const created = await admin
      .post('/services')
      .set('X-CSRF-Token', csrf)
      .send({ orderItemId, serverId })
      .expect(201);
    const id = apiSuccessResponseSchema(serviceCreationResultSchema).parse(
      created.body,
    ).data.service.id;
    await transition(admin, csrf, id, { status: 'PROVISIONING' });
    const failed = await transition(admin, csrf, id, {
      status: 'PROVISION_FAILED',
      reason: 'Fake panel rejected the fictional account.',
    });
    expect(failed.provisioningFailureReason).toContain('Fake panel');
    expect(
      await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } }),
    ).toMatchObject({
      status: InvoiceStatus.PAID,
      amountPaid: 14_000n,
      balanceDue: 0n,
    });
    expect(
      await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } }),
    ).toMatchObject({
      status: PaymentStatus.SUCCEEDED,
      amount: 14_000n,
    });
    await transition(admin, csrf, id, { status: 'PROVISIONING' });
    const cancelled = await transition(admin, csrf, id, {
      status: 'CANCELLED',
      reason: 'Customer requested cancellation before activation.',
    });
    expect(cancelled).toMatchObject({
      status: 'CANCELLED',
      cancellationReason: 'Customer requested cancellation before activation.',
    });
  });

  it('enforces customer ownership and exposes paid orders independently', async () => {
    const customer = request.agent(app.getHttpServer());
    const csrf = await csrfToken(customer);
    await login(customer, csrf, CUSTOMER_EMAIL);
    const list = await customer.get('/services/my?pageSize=100').expect(200);
    const services = paginatedApiSuccessResponseSchema(serviceSchema).parse(
      list.body,
    ).data;
    expect(services.some((service) => service.id === serviceId)).toBe(true);
    await customer.get(`/services/${serviceId}`).expect(200);
    await customer.get('/services').expect(403);
    await customer
      .post('/services')
      .set('X-CSRF-Token', csrf)
      .send({ orderItemId: primaryOrderItemId, serverId })
      .expect(403);

    const other = request.agent(app.getHttpServer());
    const otherCsrf = await csrfToken(other);
    await login(other, otherCsrf, OTHER_EMAIL);
    await other.get(`/services/${serviceId}`).expect(403);
    expect(
      paginatedApiSuccessResponseSchema(serviceSchema).parse(
        (await other.get('/services/my').expect(200)).body,
      ).data,
    ).toHaveLength(0);

    const paidWithoutService = await createPaidOrder(
      'paid-without-service.example.test',
    );
    expect(
      await prisma.service.count({
        where: { orderItemId: paidWithoutService },
      }),
    ).toBe(0);
  });

  it('lets administrators bind the service ledger to one customer', async () => {
    const admin = request.agent(app.getHttpServer());
    const csrf = await csrfToken(admin);
    await login(admin, csrf, ADMIN_EMAIL);

    const response = await admin
      .get(`/services?pageSize=100&customerId=${customerId}`)
      .expect(200);
    const services = paginatedApiSuccessResponseSchema(serviceSchema).parse(
      response.body,
    ).data;
    expect(services.length).toBeGreaterThan(0);
    expect(services.every((service) => service.customerId === customerId)).toBe(
      true,
    );
    const before = await Promise.all([
      prisma.service.findMany({ orderBy: { id: 'asc' } }),
      prisma.hostingPanelOperation.count(),
      prisma.invoice.count(),
      prisma.payment.count(),
      prisma.order.count(),
      prisma.activityLog.count(),
      prisma.outboxEvent.count(),
    ]);
    const detail = apiSuccessResponseSchema(serviceSchema).parse(
      (await admin.get(`/services/${serviceId}`).expect(200)).body,
    ).data;
    expect(detail).toMatchObject({ id: serviceId, customerId });
    expect(detail).toEqual(
      services.find((service) => service.id === serviceId),
    );
    for (const field of [
      'invoiceId',
      'paymentState',
      'orderStatus',
      'loginUrl',
    ])
      expect(detail).not.toHaveProperty(field);
    expect(Object.keys(detail.server)).toEqual([
      'id',
      'name',
      'hostname',
      'status',
      'adapterKey',
    ]);
    await admin
      .get('/services/86000000-0000-4000-8000-000000000086')
      .expect(404);
    await admin.get('/services/invalid').expect(400);
    await request(app.getHttpServer())
      .get(`/services/${serviceId}`)
      .expect(401);
    expect(
      await Promise.all([
        prisma.service.findMany({ orderBy: { id: 'asc' } }),
        prisma.hostingPanelOperation.count(),
        prisma.invoice.count(),
        prisma.payment.count(),
        prisma.order.count(),
        prisma.activityLog.count(),
        prisma.outboxEvent.count(),
      ]),
    ).toEqual(before);
  });

  it('searches older inventory with combined status/customer filters and deterministic count/order without writes', async () => {
    const other = await prisma.customer.findFirstOrThrow({
      where: { user: { email: OTHER_EMAIL } },
    });
    const data = Array.from({ length: 140 }, (_, index) => ({
      id: `87000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      customerId,
      productId,
      productPriceId,
      serverId,
      status:
        index % 2 ? ('CANCELLED' as const) : ('PROVISION_FAILED' as const),
      domain: `command87-ledger-${index}.example.test`,
      productNameSnapshot: 'Command87 Historical Plan',
      productDescriptionSnapshot: 'Fictional service inventory fixture',
      externalAccountId: `command87-account-${index}`,
      provisioningFailureReason:
        index % 2 ? null : 'Fictional inventory failure',
      cancelledAt: index % 2 ? new Date('2026-01-02T00:00:00.000Z') : null,
      cancellationReason: index % 2 ? 'Fictional inventory cancellation' : null,
      billingPeriod: BillingPeriod.MONTHLY,
      recurringAmount: 14000n,
      currency: 'BDT',
      startedAt: new Date('2026-01-01T00:00:00.000Z'),
      nextDueAt: new Date('2026-02-01T00:00:00.000Z'),
      createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, Math.floor(index / 2))),
    }));
    await prisma.service.createMany({
      data: [
        ...data,
        {
          ...data[0],
          id: '87000000-0000-4000-8000-000000000140',
          customerId: other.id,
          domain: 'command87-other.example.test',
          externalAccountId: 'command87-other-account',
        },
      ],
    });
    const admin = request.agent(app.getHttpServer());
    const csrf = await csrfToken(admin);
    await login(admin, csrf, ADMIN_EMAIL);
    const snapshot = () =>
      Promise.all([
        prisma.service.findMany({ orderBy: { id: 'asc' } }),
        prisma.hostingPanelOperation.findMany({ orderBy: { id: 'asc' } }),
        prisma.invoice.findMany({ orderBy: { id: 'asc' } }),
        prisma.payment.findMany({ orderBy: { id: 'asc' } }),
        prisma.activityLog.findMany({ orderBy: { id: 'asc' } }),
        prisma.outboxEvent.findMany({ orderBy: { id: 'asc' } }),
      ]);
    const before = await snapshot();
    const list = async (query: string) =>
      paginatedApiSuccessResponseSchema(serviceSchema).parse(
        (await admin.get('/services?' + query).expect(200)).body,
      );
    const base = `customerId=${customerId}&search=command87&pageSize=20`;
    const oldest = await list(base + '&page=7');
    expect(oldest.pagination).toEqual({
      page: 7,
      pageSize: 20,
      totalItems: 140,
      totalPages: 7,
    });
    expect(oldest.data.map((row) => row.id)).toEqual(
      data
        .slice(0, 20)
        .reverse()
        .map((row) => row.id),
    );
    const failed = await list(base + '&status=PROVISION_FAILED&page=4');
    expect(failed.pagination).toEqual({
      page: 4,
      pageSize: 20,
      totalItems: 70,
      totalPages: 4,
    });
    expect(failed.data.map((row) => row.id)).toEqual(
      data
        .filter((row) => row.status === 'PROVISION_FAILED')
        .slice(0, 10)
        .reverse()
        .map((row) => row.id),
    );
    expect(
      failed.data.every(
        (row) =>
          row.customerId === customerId && row.status === 'PROVISION_FAILED',
      ),
    ).toBe(true);
    const historical = await list(
      `customerId=${customerId}&search=COMMAND87%20HISTORICAL&pageSize=100`,
    );
    expect(historical.pagination.totalItems).toBe(140);
    const email = await list(
      `customerId=${customerId}&search=${CUSTOMER_EMAIL}&pageSize=100`,
    );
    expect(email.pagination.totalItems).toBe(142);
    const account = await list(
      `customerId=${customerId}&search=command87-account-139`,
    );
    expect(account.data.map((row) => row.id)).toEqual([data[139].id]);
    const domain = await list(
      `customerId=${customerId}&search=COMMAND87-LEDGER-139.EXAMPLE.TEST`,
    );
    expect(domain.data.map((row) => row.id)).toEqual([data[139].id]);
    const all = await list('search=Command87%20Historical&pageSize=100');
    expect(all.pagination.totalItems).toBe(141);
    const beyond = await list(base + '&page=8');
    expect(beyond.data).toEqual([]);
    expect(beyond.pagination.page).toBe(8);
    await admin.get('/services?pageSize=101').expect(400);
    await admin.get('/services?status=PAID').expect(400);
    expect(await snapshot()).toEqual(before);
  });

  afterAll(async () => {
    if (prisma) await cleanup();
    if (app) await app.close();
  });

  async function createPaidOrder(domain: string): Promise<string> {
    const order = await prisma.order.create({
      data: {
        orderNumber: `CMD14-${randomUUID().slice(0, 8).toUpperCase()}`,
        submissionKey: `command14:${randomUUID()}`,
        customerId,
        status: OrderStatus.PAID,
        currency: 'BDT',
        subtotal: 14_000n,
        total: 14_000n,
        customerEmailSnapshot: CUSTOMER_EMAIL,
        items: {
          create: {
            productId,
            productPriceId,
            productNameSnapshot: 'Command Fourteen Hosting',
            descriptionSnapshot: 'Historical service product snapshot.',
            billingPeriod: BillingPeriod.MONTHLY,
            currency: 'BDT',
            unitAmount: 14_000n,
            lineTotal: 14_000n,
            requestedDomain: domain,
            provisioningSnapshot: {
              hostingPackageIdentifier: 'cmd14_package',
            },
          },
        },
      },
      include: { items: true },
    });
    return order.items[0]?.id ?? '';
  }

  async function transition(
    agent: ReturnType<typeof request.agent>,
    csrf: string,
    id: string,
    body: Record<string, unknown>,
  ) {
    const response = await agent
      .patch(`/services/${id}/status`)
      .set('X-CSRF-Token', csrf)
      .send(body)
      .expect(200);
    return apiSuccessResponseSchema(serviceSchema).parse(response.body).data;
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

  async function cleanup() {
    const users = await prisma.user.findMany({
      where: { email: { in: [ADMIN_EMAIL, CUSTOMER_EMAIL, OTHER_EMAIL] } },
      select: { id: true, customer: { select: { id: true } } },
    });
    const userIds = users.map((user) => user.id);
    const customerIds = users.flatMap((user) =>
      user.customer ? [user.customer.id] : [],
    );
    const services = customerIds.length
      ? await prisma.service.findMany({
          where: { customerId: { in: customerIds } },
          select: { id: true },
        })
      : [];
    const serviceIds = services.map((service) => service.id);
    if (serviceIds.length) {
      await prisma.outboxEvent.deleteMany({
        where: { aggregateType: 'SERVICE', aggregateId: { in: serviceIds } },
      });
      await prisma.activityLog.deleteMany({
        where: { entityType: 'SERVICE', entityId: { in: serviceIds } },
      });
      await prisma.service.deleteMany({ where: { id: { in: serviceIds } } });
    }
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
      const invoiceIds = invoices.map(({ id }) => id);
      if (invoiceIds.length) {
        const payments = await prisma.payment.findMany({
          where: { invoiceId: { in: invoiceIds } },
          select: { id: true },
        });
        const paymentIds = payments.map(({ id }) => id);
        await prisma.paymentEvent.deleteMany({
          where: { paymentId: { in: paymentIds } },
        });
        await prisma.outboxEvent.deleteMany({
          where: {
            OR: [
              { aggregateType: 'PAYMENT', aggregateId: { in: paymentIds } },
              { aggregateType: 'INVOICE', aggregateId: { in: invoiceIds } },
            ],
          },
        });
        await prisma.payment.deleteMany({
          where: { invoiceId: { in: invoiceIds } },
        });
        await prisma.invoiceItem.deleteMany({
          where: { invoiceId: { in: invoiceIds } },
        });
        await prisma.invoice.deleteMany({ where: { id: { in: invoiceIds } } });
      }
      await prisma.orderItem.deleteMany({
        where: { orderId: { in: orderIds } },
      });
      await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    }
    await prisma.server.deleteMany({ where: { hostname: SERVER_HOSTNAME } });
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
      AUTH_RATE_LIMIT_NAMESPACE: `service-e2e-${randomUUID()}`,
    });
  }
});
