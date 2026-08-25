import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import {
  parseApiEnvironment,
  type ApiEnvironment,
} from '@webhost-billing/config';
import {
  BillingPeriod,
  ProductStatus,
  ServerStatus,
  ServiceStatus,
  UserRole,
  UserStatus,
  type PrismaClient,
} from '@webhost-billing/database';
import {
  apiErrorResponseSchema,
  apiSuccessResponseSchema,
  paginatedApiSuccessResponseSchema,
  ticketDetailSchema,
  ticketSetupOptionsSchema,
  ticketSummarySchema,
} from '@webhost-billing/shared';
import request from 'supertest';
import type { App } from 'supertest/types';
import { z } from 'zod';
import { AppModule } from '../src/app.module';
import { PRISMA_CLIENT } from '../src/infrastructure/database/database.module';
import { API_ENVIRONMENT } from '../src/infrastructure/environment/environment.module';
import { PasswordHasherService } from '../src/modules/auth/services/password-hasher.service';

const ADMIN_EMAIL = 'command20-admin@example.test';
const CUSTOMER_EMAIL = 'command20-customer@example.test';
const OTHER_EMAIL = 'command20-other@example.test';
const PASSWORD = 'command twenty secure password';

describe('Support tickets (e2e)', () => {
  let app: INestApplication<App>;
  let moduleFixture: TestingModule;
  let prisma: PrismaClient;
  let adminId = '';
  let customerId = '';
  let serviceId = '';
  let ticketId = '';
  let customerReplyId = '';

  beforeAll(async () => {
    moduleFixture = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(API_ENVIRONMENT)
      .useValue(loadTestEnvironment())
      .compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = moduleFixture.get(PRISMA_CLIENT);
    await cleanup();

    const passwordHash = await moduleFixture
      .get(PasswordHasherService)
      .hash(PASSWORD);
    const admin = await prisma.user.create({
      data: {
        email: ADMIN_EMAIL,
        passwordHash,
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
        adminProfile: {
          create: { displayName: 'Command Twenty Administrator' },
        },
      },
    });
    adminId = admin.id;
    const customer = await prisma.user.create({
      data: {
        email: CUSTOMER_EMAIL,
        passwordHash,
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
        customer: {
          create: {
            customerNumber: `C20-${randomUUID().slice(0, 8)}`,
            firstName: 'Command Twenty',
            lastName: 'Customer',
            addressLine1: '20 Fictional Road',
            city: 'Dhaka',
            countryCode: 'BD',
          },
        },
      },
      include: { customer: true },
    });
    customerId = customer.customer!.id;
    await prisma.user.create({
      data: {
        email: OTHER_EMAIL,
        passwordHash,
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
        customer: {
          create: {
            customerNumber: `C20-${randomUUID().slice(0, 8)}`,
            firstName: 'Other',
            lastName: 'Customer',
            addressLine1: '21 Fictional Road',
            city: 'Dhaka',
            countryCode: 'BD',
          },
        },
      },
      include: { customer: true },
    });

    const product = await prisma.product.create({
      data: {
        slug: `command20-${randomUUID()}`,
        name: 'Command Twenty Hosting',
        status: ProductStatus.ACTIVE,
        publicVisible: false,
      },
    });
    const price = await prisma.productPrice.create({
      data: {
        productId: product.id,
        billingPeriod: BillingPeriod.MONTHLY,
        currency: 'BDT',
        amount: 12000n,
      },
    });
    const server = await prisma.server.create({
      data: {
        name: 'Command Twenty Server',
        hostname: `command20-${randomUUID()}.example.test`,
        adapterKey: 'fake-panel',
        status: ServerStatus.ACTIVE,
      },
    });
    const now = new Date();
    const service = await prisma.service.create({
      data: {
        customerId,
        productId: product.id,
        productPriceId: price.id,
        serverId: server.id,
        status: ServiceStatus.ACTIVE,
        domain: 'command20-customer.example.test',
        controlPanelUsername: 'command20customer',
        externalAccountId: `command20-${randomUUID()}`,
        productNameSnapshot: product.name,
        billingPeriod: BillingPeriod.MONTHLY,
        recurringAmount: price.amount,
        currency: price.currency,
        startedAt: now,
        nextDueAt: new Date(now.getTime() + 30 * 86_400_000),
        activatedAt: now,
      },
    });
    serviceId = service.id;
  });

  afterAll(async () => {
    if (prisma) await cleanup();
    if (app) await app.close();
  });

  it('creates a plain-text service-associated ticket idempotently', async () => {
    const customer = request.agent(app.getHttpServer());
    const csrf = await authenticate(customer, CUSTOMER_EMAIL);
    ticketId = randomUUID();
    const body = {
      submissionKey: ticketId,
      subject: 'Fictional hosting account is unavailable',
      body: 'Please check the development-only hosting account.',
      serviceId,
    };
    const created = await customer
      .post('/tickets')
      .set('X-CSRF-Token', csrf)
      .send(body)
      .expect(201);
    const ticket = apiSuccessResponseSchema(ticketDetailSchema).parse(
      created.body,
    ).data;
    expect(ticket.id).toBe(ticketId);
    expect(ticket.status).toBe('OPEN');
    expect(ticket.priority).toBe('NORMAL');
    expect(ticket.service?.id).toBe(serviceId);
    expect(ticket.messages).toHaveLength(1);
    expect(ticket.messages[0]?.kind).toBe('CUSTOMER');

    const repeated = await customer
      .post('/tickets')
      .set('X-CSRF-Token', csrf)
      .send(body)
      .expect(201);
    expect(
      apiSuccessResponseSchema(ticketDetailSchema).parse(repeated.body).data
        .messages,
    ).toHaveLength(1);
    expect(await prisma.ticket.count({ where: { id: ticketId } })).toBe(1);
  });

  it('rejects unsafe markup, attachment-shaped input, and foreign services', async () => {
    const customer = request.agent(app.getHttpServer());
    const csrf = await authenticate(customer, CUSTOMER_EMAIL);
    await customer
      .post('/tickets')
      .set('X-CSRF-Token', csrf)
      .send({
        submissionKey: randomUUID(),
        subject: '<script>alert(1)</script>',
        body: 'Unsafe test.',
      })
      .expect(400);
    await customer
      .post('/tickets')
      .set('X-CSRF-Token', csrf)
      .send({
        submissionKey: randomUUID(),
        subject: 'Attachment attempt',
        body: 'File-shaped input must be rejected.',
        attachments: [{ filename: 'unsafe.html' }],
      })
      .expect(400);
    await customer
      .post('/tickets')
      .set('X-CSRF-Token', csrf)
      .send({
        submissionKey: randomUUID(),
        subject: 'Foreign service attempt',
        body: 'A random service does not belong to this customer.',
        serviceId: randomUUID(),
      })
      .expect(422);
  });

  it('enforces customer ownership for lists, detail, and replies', async () => {
    const customer = request.agent(app.getHttpServer());
    const csrf = await authenticate(customer, CUSTOMER_EMAIL);
    const list = await customer
      .get('/tickets/my?status=OPEN&pageSize=10')
      .expect(200);
    const parsed = paginatedApiSuccessResponseSchema(ticketSummarySchema).parse(
      list.body,
    );
    expect(parsed.data.map((ticket) => ticket.id)).toContain(ticketId);
    await customer.get(`/tickets/${ticketId}`).expect(200);
    await customer.get('/tickets').expect(403);

    const other = request.agent(app.getHttpServer());
    const otherCsrf = await authenticate(other, OTHER_EMAIL);
    await other.get(`/tickets/${ticketId}`).expect(403);
    await other
      .post(`/tickets/${ticketId}/replies`)
      .set('X-CSRF-Token', otherCsrf)
      .send({ submissionKey: randomUUID(), body: 'Cross-customer reply.' })
      .expect(403);

    customerReplyId = randomUUID();
    const reply = await customer
      .post(`/tickets/${ticketId}/replies`)
      .set('X-CSRF-Token', csrf)
      .send({
        submissionKey: customerReplyId,
        body: 'This is a customer follow-up.',
      })
      .expect(201);
    expect(
      apiSuccessResponseSchema(ticketDetailSchema).parse(reply.body).data
        .status,
    ).toBe('WAITING_FOR_STAFF');
    await customer
      .post(`/tickets/${ticketId}/replies`)
      .set('X-CSRF-Token', csrf)
      .send({
        submissionKey: customerReplyId,
        body: 'This is a customer follow-up.',
      })
      .expect(201);
    expect(
      await prisma.ticketMessage.count({ where: { id: customerReplyId } }),
    ).toBe(1);
    expect(
      await prisma.outboxEvent.count({
        where: { idempotencyKey: `email:ticket-reply:${customerReplyId}` },
      }),
    ).toBe(1);
  });

  it('lets administrators filter, assign, prioritize, reply, and close with audit evidence', async () => {
    const admin = request.agent(app.getHttpServer());
    const csrf = await authenticate(admin, ADMIN_EMAIL);
    const optionsResponse = await admin
      .get('/tickets/setup-options')
      .expect(200);
    const options = apiSuccessResponseSchema(ticketSetupOptionsSchema).parse(
      optionsResponse.body,
    ).data;
    expect(options.admins).toContainEqual({
      userId: adminId,
      displayName: 'Command Twenty Administrator',
    });

    const list = await admin
      .get(
        '/tickets?status=WAITING_FOR_STAFF&priority=NORMAL&unassigned=true&search=fictional&pageSize=10',
      )
      .expect(200);
    expect(
      paginatedApiSuccessResponseSchema(ticketSummarySchema).parse(list.body)
        .data,
    ).toHaveLength(1);

    const updated = await admin
      .patch(`/tickets/${ticketId}`)
      .set('X-CSRF-Token', csrf)
      .send({ assignedAdminId: adminId, priority: 'HIGH', status: 'OPEN' })
      .expect(200);
    const assigned = apiSuccessResponseSchema(ticketDetailSchema).parse(
      updated.body,
    ).data;
    expect(assigned.assignee?.userId).toBe(adminId);
    expect(assigned.priority).toBe('HIGH');

    const adminReplyId = randomUUID();
    const replied = await admin
      .post(`/tickets/${ticketId}/replies`)
      .set('X-CSRF-Token', csrf)
      .send({
        submissionKey: adminReplyId,
        body: 'The fictional account is reachable again.',
      })
      .expect(201);
    expect(
      apiSuccessResponseSchema(ticketDetailSchema).parse(replied.body).data
        .status,
    ).toBe('WAITING_FOR_CUSTOMER');
    expect(
      await prisma.outboxEvent.count({
        where: { idempotencyKey: `email:ticket-reply:${adminReplyId}` },
      }),
    ).toBe(1);

    const closed = await admin
      .patch(`/tickets/${ticketId}`)
      .set('X-CSRF-Token', csrf)
      .send({ status: 'CLOSED' })
      .expect(200);
    expect(
      apiSuccessResponseSchema(ticketDetailSchema).parse(closed.body).data
        .closedAt,
    ).not.toBeNull();
    await admin
      .post(`/tickets/${ticketId}/replies`)
      .set('X-CSRF-Token', csrf)
      .send({ submissionKey: randomUUID(), body: 'Closed reply attempt.' })
      .expect(422);

    const logs = await prisma.activityLog.findMany({
      where: { entityType: 'TICKET', entityId: ticketId },
      select: { action: true, metadata: true },
    });
    expect(logs.map((log) => log.action)).toEqual(
      expect.arrayContaining([
        'TICKET_CREATED_BY_CUSTOMER',
        'TICKET_REPLIED_BY_CUSTOMER',
        'TICKET_UPDATED_BY_ADMIN',
        'TICKET_REPLIED_BY_ADMIN',
      ]),
    );
    expect(JSON.stringify(logs)).not.toContain(
      'The fictional account is reachable again.',
    );
  });

  it('shows staff replies to the owning customer without exposing another customer', async () => {
    const customer = request.agent(app.getHttpServer());
    await authenticate(customer, CUSTOMER_EMAIL);
    const detail = await customer.get(`/tickets/${ticketId}`).expect(200);
    const ticket = apiSuccessResponseSchema(ticketDetailSchema).parse(
      detail.body,
    ).data;
    expect(ticket.messages.some((message) => message.kind === 'ADMIN')).toBe(
      true,
    );

    const other = request.agent(app.getHttpServer());
    await authenticate(other, OTHER_EMAIL);
    const forbidden = await other.get(`/tickets/${ticketId}`).expect(403);
    expect(apiErrorResponseSchema.parse(forbidden.body).error.code).toBe(
      'FORBIDDEN',
    );
  });

  async function authenticate(
    agent: ReturnType<typeof request.agent>,
    email: string,
  ) {
    const csrfResponse = await agent.get('/auth/csrf').expect(200);
    const csrf = apiSuccessResponseSchema(
      z.object({ csrfToken: z.string().min(32) }).strict(),
    ).parse(csrfResponse.body).data.csrfToken;
    await agent
      .post('/auth/login')
      .set('X-CSRF-Token', csrf)
      .send({ email, password: PASSWORD })
      .expect(200);
    return csrf;
  }

  async function cleanup() {
    if (!prisma) return;
    const users = await prisma.user.findMany({
      where: { email: { in: [ADMIN_EMAIL, CUSTOMER_EMAIL, OTHER_EMAIL] } },
      select: { id: true, customer: { select: { id: true } } },
    });
    const userIds = users.map((user) => user.id);
    const customerIds = users.flatMap((user) =>
      user.customer ? [user.customer.id] : [],
    );
    const tickets = await prisma.ticket.findMany({
      where: { customerId: { in: customerIds } },
      select: { id: true },
    });
    const ticketIds = tickets.map((ticket) => ticket.id);
    const services = await prisma.service.findMany({
      where: { customerId: { in: customerIds } },
      select: {
        id: true,
        productId: true,
        productPriceId: true,
        serverId: true,
      },
    });
    const serviceIds = services.map((service) => service.id);
    const products = await prisma.product.findMany({
      where: { slug: { startsWith: 'command20-' } },
      select: { id: true },
    });
    const productIds = products.map((product) => product.id);
    const servers = await prisma.server.findMany({
      where: { name: 'Command Twenty Server' },
      select: { id: true },
    });
    const serverIds = servers.map((server) => server.id);
    await prisma.emailAttempt.deleteMany({
      where: { emailLog: { ticketId: { in: ticketIds } } },
    });
    await prisma.emailLog.deleteMany({
      where: { ticketId: { in: ticketIds } },
    });
    await prisma.outboxEvent.deleteMany({
      where: { aggregateId: { in: ticketIds } },
    });
    await prisma.activityLog.deleteMany({
      where: {
        OR: [
          { actorUserId: { in: userIds } },
          { entityId: { in: [...ticketIds, ...customerIds] } },
        ],
      },
    });
    await prisma.ticketMessage.deleteMany({
      where: { ticketId: { in: ticketIds } },
    });
    await prisma.ticket.deleteMany({ where: { id: { in: ticketIds } } });
    await prisma.service.deleteMany({ where: { id: { in: serviceIds } } });
    await prisma.productPrice.deleteMany({
      where: {
        OR: [
          { id: { in: services.map((service) => service.productPriceId) } },
          { productId: { in: productIds } },
        ],
      },
    });
    await prisma.product.deleteMany({
      where: { id: { in: productIds } },
    });
    await prisma.server.deleteMany({
      where: { id: { in: serverIds } },
    });
    await prisma.authSession.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.adminProfile.deleteMany({
      where: { userId: { in: userIds } },
    });
    await prisma.customer.deleteMany({ where: { id: { in: customerIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }

  function loadTestEnvironment(): ApiEnvironment {
    return parseApiEnvironment({
      ...process.env,
      PORT: process.env.API_PORT ?? '3001',
      NODE_ENV: 'test',
      AUTH_RATE_LIMIT_NAMESPACE: `tickets-e2e-${randomUUID()}`,
      BULLMQ_PREFIX: `tickets-e2e-${randomUUID().replaceAll('-', '')}`,
    });
  }
});
