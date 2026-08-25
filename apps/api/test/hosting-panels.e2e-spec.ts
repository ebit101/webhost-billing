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
  ServiceStatus,
  UserRole,
  UserStatus,
  type PrismaClient,
} from '@webhost-billing/database';
import {
  apiSuccessResponseSchema,
  hostingPanelOperationResultSchema,
  paginatedApiSuccessResponseSchema,
  hostingPanelOperationSchema,
} from '@webhost-billing/shared';
import request from 'supertest';
import type { App } from 'supertest/types';
import { z } from 'zod';
import { AppModule } from '../src/app.module';
import { PRISMA_CLIENT } from '../src/infrastructure/database/database.module';
import { API_ENVIRONMENT } from '../src/infrastructure/environment/environment.module';
import { PasswordHasherService } from '../src/modules/auth/services/password-hasher.service';
import { FakeHostingPanel } from '../src/modules/hosting-panels/fake-hosting-panel';

const ADMIN_EMAIL = 'command15-admin@example.test';
const CUSTOMER_EMAIL = 'command15-customer@example.test';
const OTHER_EMAIL = 'command15-other@example.test';
const PASSWORD = 'command fifteen secure password';
const PRODUCT_SLUG = 'command-fifteen-hosting';
const SERVER_HOSTNAME = 'command15-whm.example.test';

describe('Hosting panel operations (e2e)', () => {
  let app: INestApplication<App>;
  let moduleFixture: TestingModule;
  let prisma: PrismaClient;
  let fakePanel: FakeHostingPanel;
  let passwords: PasswordHasherService;
  let customerId = '';
  let productId = '';
  let productPriceId = '';
  let serverId = '';
  let primaryServiceId = '';

  beforeAll(async () => {
    moduleFixture = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(API_ENVIRONMENT)
      .useValue(loadTestEnvironment())
      .compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = moduleFixture.get(PRISMA_CLIENT);
    passwords = moduleFixture.get(PasswordHasherService);
    fakePanel = moduleFixture.get(FakeHostingPanel);
    await cleanup();
    fakePanel.reset();
    const passwordHash = await passwords.hash(PASSWORD);
    await prisma.user.create({
      data: {
        email: ADMIN_EMAIL,
        passwordHash,
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
        adminProfile: {
          create: { displayName: 'Command Fifteen Admin', isSuperAdmin: true },
        },
      },
    });
    const customer = await createCustomer(
      CUSTOMER_EMAIL,
      'CMD15-CUSTOMER',
      passwordHash,
    );
    customerId = customer.customer?.id ?? '';
    await createCustomer(OTHER_EMAIL, 'CMD15-OTHER', passwordHash);
    const product = await prisma.product.create({
      data: {
        slug: PRODUCT_SLUG,
        name: 'Command Fifteen Hosting',
        status: ProductStatus.ACTIVE,
        hostingPackageIdentifier: 'cmd15_package',
        prices: {
          create: {
            billingPeriod: BillingPeriod.MONTHLY,
            currency: 'BDT',
            amount: 15_000n,
          },
        },
      },
      include: { prices: true },
    });
    productId = product.id;
    productPriceId = product.prices[0]?.id ?? '';
    const server = await prisma.server.create({
      data: {
        name: 'Command Fifteen Fake WHM',
        hostname: SERVER_HOSTNAME,
        status: ServerStatus.ACTIVE,
        adapterKey: 'fake-panel',
        maxAccounts: 20,
      },
    });
    serverId = server.id;
    primaryServiceId = await createPendingService('panel-one.example.test');
  });

  it('tests the server and provisions exactly one account idempotently', async () => {
    const admin = request.agent(app.getHttpServer());
    const csrf = await authenticate(admin, ADMIN_EMAIL);
    const connection = await postResult(
      admin,
      csrf,
      `/hosting-panel/servers/${serverId}/test`,
      { submissionKey: randomUUID() },
    );
    expect(connection.operation).toMatchObject({
      type: 'TEST_CONNECTION',
      status: 'SUCCEEDED',
      adapterKey: 'fake-panel',
    });

    const submissionKey = randomUUID();
    const provisioned = await postResult(
      admin,
      csrf,
      `/hosting-panel/services/${primaryServiceId}/operations`,
      { type: 'CREATE_ACCOUNT', submissionKey },
    );
    expect(provisioned).toMatchObject({
      duplicate: false,
      operation: {
        type: 'CREATE_ACCOUNT',
        status: 'SUCCEEDED',
        account: { state: 'ACTIVE', packageIdentifier: 'cmd15_package' },
      },
    });
    const service = await prisma.service.findUniqueOrThrow({
      where: { id: primaryServiceId },
      include: { orderItem: { include: { order: true } } },
    });
    expect(service).toMatchObject({
      status: ServiceStatus.ACTIVE,
      externalAccountId: provisioned.operation.account?.externalAccountId,
      controlPanelUsername: provisioned.operation.account?.username,
    });
    expect(service.orderItem?.order.status).toBe(OrderStatus.COMPLETED);

    const replay = await postResult(
      admin,
      csrf,
      `/hosting-panel/services/${primaryServiceId}/operations`,
      { type: 'CREATE_ACCOUNT', submissionKey },
    );
    expect(replay).toMatchObject({
      duplicate: true,
      operation: { id: provisioned.operation.id },
    });
    expect(
      await prisma.hostingPanelOperation.count({
        where: { serviceId: primaryServiceId, type: 'CREATE_ACCOUNT' },
      }),
    ).toBe(1);
    await admin
      .post(`/hosting-panel/services/${primaryServiceId}/operations`)
      .set('X-CSRF-Token', csrf)
      .send({ type: 'GET_ACCOUNT', submissionKey })
      .expect(409);
  });

  it('runs account management, protects login ownership, and confirms termination', async () => {
    const admin = request.agent(app.getHttpServer());
    const csrf = await authenticate(admin, ADMIN_EMAIL);
    const run = (body: Record<string, unknown>) =>
      postResult(
        admin,
        csrf,
        `/hosting-panel/services/${primaryServiceId}/operations`,
        { submissionKey: randomUUID(), ...body },
      );
    expect((await run({ type: 'GET_ACCOUNT' })).operation.status).toBe(
      'SUCCEEDED',
    );
    expect(
      (await run({ type: 'CHANGE_PACKAGE', packageIdentifier: 'business_pkg' }))
        .operation.account?.packageIdentifier,
    ).toBe('business_pkg');
    const passwordChange = await run({
      type: 'CHANGE_PASSWORD',
      newPassword: 'new-fake-password-123',
    });
    expect(passwordChange.operation.status).toBe('SUCCEEDED');
    expect(
      JSON.stringify(
        await prisma.hostingPanelOperation.findUniqueOrThrow({
          where: { id: passwordChange.operation.id },
        }),
      ),
    ).not.toContain('new-fake-password-123');
    await run({ type: 'SUSPEND_ACCOUNT', reason: 'Command 15 test.' });
    expect(
      (
        await prisma.service.findUniqueOrThrow({
          where: { id: primaryServiceId },
        })
      ).status,
    ).toBe(ServiceStatus.SUSPENDED);
    await run({ type: 'UNSUSPEND_ACCOUNT' });

    const customer = request.agent(app.getHttpServer());
    const customerCsrf = await authenticate(customer, CUSTOMER_EMAIL);
    const login = await postResult(
      customer,
      customerCsrf,
      `/hosting-panel/services/${primaryServiceId}/login-url`,
      { submissionKey: randomUUID() },
    );
    expect(login.loginUrl).toMatch(/^https:\/\/command15-whm\.example\.test\//);
    const other = request.agent(app.getHttpServer());
    const otherCsrf = await authenticate(other, OTHER_EMAIL);
    await other
      .post(`/hosting-panel/services/${primaryServiceId}/login-url`)
      .set('X-CSRF-Token', otherCsrf)
      .send({ submissionKey: randomUUID() })
      .expect(403);
    await customer
      .post(`/hosting-panel/services/${primaryServiceId}/operations`)
      .set('X-CSRF-Token', customerCsrf)
      .send({ type: 'GET_ACCOUNT', submissionKey: randomUUID() })
      .expect(403);

    await admin
      .post(`/hosting-panel/services/${primaryServiceId}/operations`)
      .set('X-CSRF-Token', csrf)
      .send({
        type: 'TERMINATE_ACCOUNT',
        submissionKey: randomUUID(),
        reason: 'Missing confirmation.',
      })
      .expect(400);
    const terminated = await run({
      type: 'TERMINATE_ACCOUNT',
      reason: 'Administrator-confirmed fake termination.',
      confirmation: 'TERMINATE',
    });
    expect(terminated.operation.status).toBe('SUCCEEDED');
    expect(
      await prisma.service.findUniqueOrThrow({
        where: { id: primaryServiceId },
      }),
    ).toMatchObject({
      status: ServiceStatus.TERMINATED,
      terminationReason: 'Administrator-confirmed fake termination.',
    });
  });

  it('allows a bounded manual retry only after a temporary failure', async () => {
    const serviceId = await createPendingService('retry-panel.example.test');
    const admin = request.agent(app.getHttpServer());
    const csrf = await authenticate(admin, ADMIN_EMAIL);
    fakePanel.failNext('TEMPORARY', 'FAKE_NETWORK_BUSY');
    const failed = await postResult(
      admin,
      csrf,
      `/hosting-panel/services/${serviceId}/operations`,
      { type: 'CREATE_ACCOUNT', submissionKey: randomUUID() },
    );
    expect(failed.operation).toMatchObject({
      status: 'FAILED',
      errorKind: 'TEMPORARY',
      errorCode: 'FAKE_NETWORK_BUSY',
      retryable: true,
    });
    expect(
      await prisma.service.findUniqueOrThrow({ where: { id: serviceId } }),
    ).toMatchObject({ status: ServiceStatus.PROVISION_FAILED });
    const retrySubmissionKey = randomUUID();
    const retried = await postResult(
      admin,
      csrf,
      `/hosting-panel/operations/${failed.operation.id}/retry`,
      { submissionKey: retrySubmissionKey },
    );
    expect(retried.operation).toMatchObject({
      status: 'SUCCEEDED',
      attemptNumber: 2,
      retryOfOperationId: failed.operation.id,
    });
    expect(
      await postResult(
        admin,
        csrf,
        `/hosting-panel/operations/${failed.operation.id}/retry`,
        { submissionKey: retrySubmissionKey },
      ),
    ).toMatchObject({
      duplicate: true,
      operation: { id: retried.operation.id },
    });
    await admin
      .post(`/hosting-panel/operations/${failed.operation.id}/retry`)
      .set('X-CSRF-Token', csrf)
      .send({ submissionKey: randomUUID() })
      .expect(409);
  });

  it('holds provider inconsistency and refuses unsafe retry', async () => {
    const serviceId = await createPendingService('inconsistent.example.test');
    const admin = request.agent(app.getHttpServer());
    const csrf = await authenticate(admin, ADMIN_EMAIL);
    fakePanel.failNext('INCONSISTENT', 'FAKE_ACCOUNT_MISMATCH');
    const held = await postResult(
      admin,
      csrf,
      `/hosting-panel/services/${serviceId}/operations`,
      { type: 'CREATE_ACCOUNT', submissionKey: randomUUID() },
    );
    expect(held.operation).toMatchObject({
      status: 'INCONSISTENT',
      retryable: false,
      errorCode: 'FAKE_ACCOUNT_MISMATCH',
    });
    await admin
      .post(`/hosting-panel/operations/${held.operation.id}/retry`)
      .set('X-CSRF-Token', csrf)
      .send({ submissionKey: randomUUID() })
      .expect(422);
    const list = await admin
      .get('/hosting-panel/operations?pageSize=100')
      .expect(200);
    const operations = paginatedApiSuccessResponseSchema(
      hostingPanelOperationSchema,
    ).parse(list.body).data;
    expect(
      operations.some((operation) => operation.id === held.operation.id),
    ).toBe(true);
    expect(JSON.stringify(operations)).not.toContain('credentialsCiphertext');
  });

  afterAll(async () => {
    if (prisma) await cleanup();
    fakePanel?.reset();
    if (app) await app.close();
  });

  async function createPendingService(domain: string): Promise<string> {
    const startedAt = new Date();
    const nextDueAt = new Date(startedAt);
    nextDueAt.setUTCMonth(nextDueAt.getUTCMonth() + 1);
    const order = await prisma.order.create({
      data: {
        orderNumber: `CMD15-${randomUUID().slice(0, 8).toUpperCase()}`,
        submissionKey: `command15:${randomUUID()}`,
        customerId,
        status: OrderStatus.PROCESSING,
        currency: 'BDT',
        subtotal: 15_000n,
        total: 15_000n,
        customerEmailSnapshot: CUSTOMER_EMAIL,
        items: {
          create: {
            productId,
            productPriceId,
            productNameSnapshot: 'Command Fifteen Hosting',
            billingPeriod: BillingPeriod.MONTHLY,
            currency: 'BDT',
            unitAmount: 15_000n,
            lineTotal: 15_000n,
            requestedDomain: domain,
            provisioningSnapshot: {
              hostingPackageIdentifier: 'cmd15_package',
            },
          },
        },
      },
      include: { items: true },
    });
    return (
      await prisma.service.create({
        data: {
          customerId,
          orderItemId: order.items[0]?.id,
          productId,
          productPriceId,
          serverId,
          status: ServiceStatus.PENDING,
          domain,
          productNameSnapshot: 'Command Fifteen Hosting',
          provisioningSnapshot: {
            hostingPackageIdentifier: 'cmd15_package',
          },
          billingPeriod: BillingPeriod.MONTHLY,
          recurringAmount: 15_000n,
          currency: 'BDT',
          startedAt,
          nextDueAt,
        },
      })
    ).id;
  }

  async function createCustomer(
    email: string,
    customerNumber: string,
    passwordHash: string,
  ) {
    return prisma.user.create({
      data: {
        email,
        passwordHash,
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
        customer: {
          create: {
            customerNumber,
            status: CustomerStatus.ACTIVE,
            firstName: 'Panel',
            lastName: 'Customer',
            addressLine1: '15 Panel Road',
            city: 'Dhaka',
            countryCode: 'BD',
          },
        },
      },
      include: { customer: true },
    });
  }

  async function postResult(
    agent: ReturnType<typeof request.agent>,
    csrf: string,
    path: string,
    body: Record<string, unknown>,
  ) {
    const response = await agent
      .post(path)
      .set('X-CSRF-Token', csrf)
      .send(body)
      .expect(201);
    return apiSuccessResponseSchema(hostingPanelOperationResultSchema).parse(
      response.body,
    ).data;
  }

  async function authenticate(
    agent: ReturnType<typeof request.agent>,
    email: string,
  ) {
    const response = await agent.get('/auth/csrf').expect(200);
    const csrf = apiSuccessResponseSchema(
      z.object({ csrfToken: z.string().min(32) }).strict(),
    ).parse(response.body).data.csrfToken;
    await agent
      .post('/auth/login')
      .set('X-CSRF-Token', csrf)
      .send({ email, password: PASSWORD })
      .expect(200);
    return csrf;
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
    await prisma.hostingPanelOperation.deleteMany({
      where: {
        OR: [
          { requestedByUserId: { in: userIds } },
          { server: { hostname: SERVER_HOSTNAME } },
        ],
      },
    });
    const services = await prisma.service.findMany({
      where: { customerId: { in: customerIds } },
      select: { id: true },
    });
    const serviceIds = services.map(({ id }) => id);
    await prisma.activityLog.deleteMany({
      where: {
        OR: [
          { actorUserId: { in: userIds } },
          { entityId: { in: [...serviceIds, serverId].filter(Boolean) } },
        ],
      },
    });
    await prisma.service.deleteMany({ where: { id: { in: serviceIds } } });
    const orders = await prisma.order.findMany({
      where: { customerId: { in: customerIds } },
      select: { id: true },
    });
    const orderIds = orders.map(({ id }) => id);
    await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    await prisma.server.deleteMany({ where: { hostname: SERVER_HOSTNAME } });
    const product = await prisma.product.findUnique({
      where: { slug: PRODUCT_SLUG },
    });
    if (product) {
      await prisma.productPrice.deleteMany({
        where: { productId: product.id },
      });
      await prisma.product.delete({ where: { id: product.id } });
    }
    await prisma.authSession.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.adminProfile.deleteMany({
      where: { userId: { in: userIds } },
    });
    await prisma.customer.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }

  function loadTestEnvironment(): ApiEnvironment {
    return parseApiEnvironment({
      ...process.env,
      PORT: process.env.API_PORT ?? '3001',
      NODE_ENV: 'test',
      AUTH_RATE_LIMIT_NAMESPACE: `hosting-panel-e2e-${randomUUID()}`,
    });
  }
});
