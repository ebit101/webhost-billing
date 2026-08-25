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
  OrderStatus,
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
