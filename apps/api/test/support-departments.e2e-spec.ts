import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Test, type TestingModule } from '@nestjs/testing';
import {
  parseApiEnvironment,
  parseWorkerEnvironment,
} from '@webhost-billing/config';
import type { PrismaClient } from '@webhost-billing/database';
import {
  defaultSupportDepartmentId,
  ticketListQuerySchema,
  type SaveSupportDepartment,
  type BackgroundJobData,
} from '@webhost-billing/shared';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PRISMA_CLIENT } from '../src/infrastructure/database/database.module';
import { API_ENVIRONMENT } from '../src/infrastructure/environment/environment.module';
import { CustomerService } from '../src/modules/customers/customer.service';
import { TicketService } from '../src/modules/tickets/ticket.service';
import type { AuthRequestContext } from '../src/modules/auth/auth.types';
import { TotpService } from '../src/modules/auth/services/totp.service';
import { PasswordHasherService } from '../src/modules/auth/services/password-hasher.service';
import { EmailMessageResolver } from '../../worker/src/email/email-message.resolver';
import { EmailTemplateCatalog } from '../../worker/src/email/email-template.catalog';

jest.setTimeout(60_000);
const context = { ipAddressHash: 'fictional-command216' };
const password = 'fictional department password';

describe('Command 216 departments and routing', () => {
  let module: TestingModule;
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let tickets: TicketService;
  let owner: AuthRequestContext;
  let member: AuthRequestContext;
  let outsider: AuthRequestContext;
  let billing: AuthRequestContext;
  let customer: AuthRequestContext;
  let otherCustomer: AuthRequestContext;
  const userIds: string[] = [];
  const departmentIds: string[] = [];
  const ticketIds: string[] = [];
  let passwordHash: string;
  beforeAll(async () => {
    module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(API_ENVIRONMENT)
      .useValue(
        parseApiEnvironment({
          ...process.env,
          NODE_ENV: 'test',
          PORT: '3001',
          AUTH_RATE_LIMIT_NAMESPACE: `c216-${randomUUID()}`,
        }),
      )
      .compile();
    app = module.createNestApplication();
    await app.init();
    prisma = module.get(PRISMA_CLIENT);
    tickets = module.get(TicketService);
    passwordHash = await module.get(PasswordHasherService).hash(password);
    owner = await staff('FULL_ADMINISTRATOR');
    member = await staff('SUPPORT_OPERATOR');
    outsider = await staff('SUPPORT_OPERATOR');
    billing = await staff('BILLING_OPERATOR');
    customer = await client();
    otherCustomer = await client();
  });
  afterAll(async () => {
    if (prisma) {
      await prisma.emailLog.deleteMany({
        where: { ticketId: { in: ticketIds } },
      });
      await prisma.outboxEvent.deleteMany({
        where: { aggregateId: { in: ticketIds } },
      });
      await prisma.activityLog.deleteMany({
        where: { actorUserId: { in: userIds } },
      });
      await prisma.ticketMessage.deleteMany({
        where: { ticketId: { in: ticketIds } },
      });
      await prisma.ticket.deleteMany({ where: { id: { in: ticketIds } } });
      await prisma.supportDepartmentMember.deleteMany({
        where: { departmentId: { in: departmentIds } },
      });
      await prisma.supportDepartment.deleteMany({
        where: { id: { in: departmentIds } },
      });
      await prisma.authSession.deleteMany({
        where: { userId: { in: userIds } },
      });
      await prisma.customer.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.adminTotpCredential.deleteMany({
        where: { userId: { in: userIds } },
      });
      await prisma.adminProfile.deleteMany({
        where: { userId: { in: userIds } },
      });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    if (app) await app.close();
  });

  it('migrates existing ticket identity, owner, assignment and messages unchanged', async () => {
    const schema = `c216_migration_${randomUUID().replaceAll('-', '')}`;
    const sql = readFileSync(
      resolve(
        '../../packages/database/prisma/migrations/20261105000600_support_departments/migration.sql',
      ),
      'utf8',
    );
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
      await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`);
      await tx.$executeRawUnsafe('CREATE TABLE users (id UUID PRIMARY KEY)');
      await tx.$executeRawUnsafe(
        'CREATE TABLE tickets (id UUID PRIMARY KEY, customer_id UUID, assigned_admin_id UUID, status TEXT)',
      );
      await tx.$executeRawUnsafe(
        'CREATE TABLE ticket_messages (id UUID PRIMARY KEY, ticket_id UUID, body TEXT)',
      );
      const id = randomUUID();
      await tx.$executeRaw`INSERT INTO tickets VALUES (${id}::uuid, ${id}::uuid, ${id}::uuid, 'OPEN')`;
      await tx.$executeRaw`INSERT INTO ticket_messages VALUES (${id}::uuid, ${id}::uuid, 'Retained fictional history')`;
      for (const statement of sql
        .split(';')
        .map((value) => value.trim())
        .filter(Boolean))
        await tx.$executeRawUnsafe(statement);
      expect(await tx.$queryRaw`SELECT * FROM tickets`).toEqual([
        {
          id,
          customer_id: id,
          assigned_admin_id: id,
          status: 'OPEN',
          department_id: defaultSupportDepartmentId,
        },
      ]);
      expect(await tx.$queryRaw`SELECT body FROM ticket_messages`).toEqual([
        { body: 'Retained fictional history' },
      ]);
      await tx.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    });
  });

  it('routes public tickets and preserves the legacy default and retry identity', async () => {
    const department = await departmentFixture();
    const input = {
      submissionKey: randomUUID(),
      departmentId: department.id,
      subject: 'Fictional request',
      body: 'Please help with a fictional account.',
    };
    ticketIds.push(input.submissionKey);
    const ticket = await tickets.create(input, customer, context);
    expect(ticket.department.id).toBe(department.id);
    expect((await tickets.create(input, customer, context)).id).toBe(ticket.id);
    expect(await prisma.ticket.count({ where: { id: ticket.id } })).toBe(1);
    expect(
      await prisma.outboxEvent.count({
        where: { idempotencyKey: `email:ticket-created:${ticket.id}` },
      }),
    ).toBe(1);
    const legacy = await newTicket();
    expect(legacy.department.id).toBe(defaultSupportDepartmentId);
  });

  it('exposes only enabled public choices and rejects forged hidden or disabled routing', async () => {
    const hidden = await departmentFixture({ customerVisible: false });
    const disabled = await departmentFixture({ enabled: false });
    const visible = await tickets.departments(customer);
    expect(visible.map((value) => value.id)).not.toEqual(
      expect.arrayContaining([hidden.id, disabled.id]),
    );
    expect(JSON.stringify(visible)).not.toContain('memberUserIds');
    for (const id of [hidden.id, disabled.id, randomUUID()])
      await expect(newTicket(id)).rejects.toThrow();
  });

  it('enforces customer ownership even across department choices and hides private system messages', async () => {
    const ticket = await newTicket();
    await prisma.ticketMessage.create({
      data: {
        ticketId: ticket.id,
        authorUserId: owner.identity.userId,
        kind: 'SYSTEM',
        body: 'Private staff context',
      },
    });
    expect(
      JSON.stringify(await tickets.get(ticket.id, customer)),
    ).not.toContain('Private staff context');
    expect((await tickets.get(ticket.id, owner)).messages).toHaveLength(2);
    await expect(tickets.get(ticket.id, otherCustomer)).rejects.toThrow();
    await expect(
      tickets.update(ticket.id, { priority: 'URGENT' }, customer, context),
    ).rejects.toThrow();
    await expect(tickets.setupOptions(customer)).rejects.toThrow();
    await expect(
      tickets.reply(
        ticket.id,
        { submissionKey: randomUUID(), body: 'Foreign reply' },
        otherCustomer,
        context,
      ),
    ).rejects.toThrow();
    expect(
      (
        await tickets.list(
          ticketListQuerySchema.parse({
            customerId:
              customer.identity.role === 'CUSTOMER'
                ? customer.identity.customerId
                : '',
          }),
          otherCustomer,
        )
      ).data,
    ).toHaveLength(0);
  });

  it('enforces restricted department access for list, detail, reply and update', async () => {
    const department = await departmentFixture({
      restricted: true,
      memberUserIds: [member.identity.userId],
    });
    const ticket = await newTicket(department.id);
    expect((await tickets.get(ticket.id, member)).id).toBe(ticket.id);
    expect(
      (
        await tickets.list(
          ticketListQuerySchema.parse({ departmentId: department.id }),
          member,
        )
      ).data,
    ).toHaveLength(1);
    expect(
      (
        await tickets.list(
          ticketListQuerySchema.parse({ departmentId: department.id }),
          outsider,
        )
      ).data,
    ).toHaveLength(0);
    await expect(
      tickets.list(ticketListQuerySchema.parse({}), billing),
    ).rejects.toThrow();
    for (const actor of [outsider, billing]) {
      await expect(tickets.get(ticket.id, actor)).rejects.toThrow();
      await expect(
        tickets.reply(
          ticket.id,
          { submissionKey: randomUUID(), body: 'Unauthorized reply' },
          actor,
          context,
        ),
      ).rejects.toThrow();
      await expect(
        tickets.update(ticket.id, { priority: 'URGENT' }, actor, context),
      ).rejects.toThrow();
    }
    await tickets.reply(
      ticket.id,
      { submissionKey: randomUUID(), body: 'Authorized support reply' },
      member,
      context,
    );
    expect((await tickets.get(ticket.id, customer)).messages).toHaveLength(2);
  });

  it('filters linked ticket summaries and counts on customer records as well as the ticket queue', async () => {
    const department = await departmentFixture({
      restricted: true,
      memberUserIds: [member.identity.userId],
    });
    const ticket = await newTicket(department.id);
    const customers = module.get(CustomerService);
    const customerId = ticket.customer.id;
    expect(
      (await customers.getById(customerId, owner)).linked.tickets.map(
        (value) => value.id,
      ),
    ).toContain(ticket.id);
    expect(
      (await customers.getById(customerId, member)).linked.tickets.map(
        (value) => value.id,
      ),
    ).toContain(ticket.id);
    expect(
      (await customers.getById(customerId, outsider)).linked.tickets.map(
        (value) => value.id,
      ),
    ).not.toContain(ticket.id);
    expect(
      (await customers.getById(customerId, billing)).linked.tickets,
    ).toHaveLength(0);
    expect(
      (await customers.getById(customerId, billing)).linked.counts.tickets,
    ).toBe(0);
  });

  it('requires an audited reason and eligible assignee when routing; clears stale assignment', async () => {
    const department = await departmentFixture({
      restricted: true,
      memberUserIds: [member.identity.userId],
    });
    const ticket = await newTicket();
    await tickets.update(
      ticket.id,
      { assignedAdminId: outsider.identity.userId },
      owner,
      context,
    );
    await expect(
      tickets.update(
        ticket.id,
        { departmentId: department.id },
        owner,
        context,
      ),
    ).rejects.toThrow();
    await expect(
      tickets.update(
        ticket.id,
        {
          departmentId: department.id,
          routingReason: 'Fictional handoff',
          assignedAdminId: outsider.identity.userId,
        },
        owner,
        context,
      ),
    ).rejects.toThrow();
    await expect(
      tickets.update(
        ticket.id,
        { departmentId: department.id, routingReason: 'Unauthorized handoff' },
        outsider,
        context,
      ),
    ).rejects.toThrow();
    const routed = await tickets.update(
      ticket.id,
      { departmentId: department.id, routingReason: 'Fictional handoff' },
      owner,
      context,
    );
    expect(routed.assignee).toBeNull();
    expect(routed.id).toBe(ticket.id);
    expect(routed.messages).toEqual(ticket.messages);
    const log = await prisma.activityLog.findFirstOrThrow({
      where: { entityId: ticket.id, action: 'TICKET_UPDATED_BY_ADMIN' },
      orderBy: { createdAt: 'desc' },
    });
    expect(log.metadata).toMatchObject({
      previousDepartmentId: defaultSupportDepartmentId,
      departmentId: department.id,
      routingReason: 'Fictional handoff',
    });
  });

  it('keeps existing conversations accessible after disabling but rejects new routing', async () => {
    const department = await departmentFixture();
    const ticket = await newTicket(department.id);
    await tickets.saveDepartment(
      department.id,
      {
        ...departmentInput(),
        name: department.name,
        enabled: false,
        revision: department.revision,
      },
      owner,
      context,
    );
    await expect(newTicket(department.id)).rejects.toThrow();
    const source = await newTicket();
    await expect(
      tickets.update(
        source.id,
        { departmentId: department.id, routingReason: 'Disabled routing' },
        owner,
        context,
      ),
    ).rejects.toThrow();
    await tickets.reply(
      ticket.id,
      { submissionKey: randomUUID(), body: 'Existing customer conversation' },
      customer,
      context,
    );
    expect((await tickets.get(ticket.id, member)).id).toBe(ticket.id);
  });

  it('revokes membership immediately and rejects stale configuration or ineligible members', async () => {
    const department = await departmentFixture({
      restricted: true,
      memberUserIds: [member.identity.userId],
    });
    const ticket = await newTicket(department.id);
    const update = {
      ...departmentInput(),
      name: department.name,
      restricted: true,
      revision: department.revision,
    };
    await tickets.saveDepartment(department.id, update, owner, context);
    await expect(tickets.get(ticket.id, member)).rejects.toThrow();
    await expect(
      tickets.saveDepartment(department.id, update, owner, context),
    ).rejects.toThrow();
    await expect(
      departmentFixture({ memberUserIds: [billing.identity.userId] }),
    ).rejects.toThrow();
    await expect(
      departmentFixture({ memberUserIds: [customer.identity.userId] }),
    ).rejects.toThrow();
    await expect(
      tickets.saveDepartment(undefined, departmentInput(), member, context),
    ).rejects.toThrow();
    if (owner.identity.role !== 'ADMIN')
      throw new Error('Expected administrator fixture');
    await expect(
      tickets.saveDepartment(
        undefined,
        departmentInput(),
        { ...owner, identity: { ...owner.identity, twoFactorEnabled: false } },
        context,
      ),
    ).rejects.toThrow();
    expect(
      await prisma.activityLog.count({
        where: {
          entityId: department.id,
          action: 'SUPPORT_DEPARTMENT_UPDATED',
        },
      }),
    ).toBe(1);
  });

  it('resolves queued staff mail against current department access and never emails private messages', async () => {
    const department = await departmentFixture({
      restricted: true,
      memberUserIds: [member.identity.userId],
    });
    const ticket = await newTicket(department.id);
    await tickets.update(
      ticket.id,
      { assignedAdminId: member.identity.userId },
      owner,
      context,
    );
    const event = await prisma.outboxEvent.findFirstOrThrow({
      where: { aggregateId: ticket.id, eventType: 'EMAIL_TICKET_REPLY' },
    });
    await prisma.outboxEvent.update({
      where: { id: event.id },
      data: { status: 'PUBLISHED', publishedAt: new Date() },
    });
    const resolver = new EmailMessageResolver(
      prisma,
      parseWorkerEnvironment({ ...process.env, NODE_ENV: 'test' }),
      new EmailTemplateCatalog(),
    );
    const job: BackgroundJobData = {
      schemaVersion: 1,
      outboxEventId: event.id,
      aggregateId: ticket.id,
      aggregateType: 'TICKET',
      eventType: 'EMAIL_TICKET_REPLY',
      correlationId: event.id,
    };
    expect((await resolver.resolve(job)).recipientEmail).toBe(
      member.identity.email,
    );
    await prisma.adminTotpCredential.update({
      where: { userId: member.identity.userId },
      data: { enabledAt: null },
    });
    expect((await resolver.resolve(job)).recipientEmail).not.toBe(
      member.identity.email,
    );
    await expect(tickets.get(ticket.id, member)).rejects.toThrow();
    await expect(
      tickets.update(
        ticket.id,
        { assignedAdminId: member.identity.userId },
        owner,
        context,
      ),
    ).rejects.toThrow();
    await prisma.adminTotpCredential.update({
      where: { userId: member.identity.userId },
      data: { enabledAt: new Date() },
    });

    await tickets.saveDepartment(
      department.id,
      {
        ...departmentInput(),
        name: department.name,
        restricted: true,
        revision: department.revision,
      },
      owner,
      context,
    );
    expect((await resolver.resolve(job)).recipientEmail).not.toBe(
      member.identity.email,
    );
    const privateMessage = await prisma.ticketMessage.create({
      data: {
        ticketId: ticket.id,
        authorUserId: owner.identity.userId,
        kind: 'SYSTEM',
        body: 'Private context',
      },
    });
    await prisma.outboxEvent.update({
      where: { id: event.id },
      data: {
        payload: {
          schemaVersion: 1,
          ticketId: ticket.id,
          messageId: privateMessage.id,
        },
      },
    });
    await expect(resolver.resolve(job)).rejects.toMatchObject({
      code: 'EMAIL_PRIVATE_TICKET_MESSAGE',
      kind: 'PERMANENT',
    });
  });

  it('protects department management routes from support staff and customers', async () => {
    for (const actor of [member, billing, customer]) {
      const token = randomBytes(32).toString('hex');
      await prisma.authSession.create({
        data: {
          userId: actor.identity.userId,
          tokenHash: createHash('sha256').update(token).digest('hex'),
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 3600000),
          twoFactorVerifiedAt:
            actor.identity.role === 'ADMIN' && actor.identity.twoFactorEnabled
              ? new Date()
              : null,
        },
      });
      const agent = request.agent(app.getHttpServer());
      agent.set('Cookie', `webhost_session=${token}`);
      const csrfResult = await agent.get('/auth/csrf').expect(200);
      const csrf = String(
        (csrfResult.body as { data: { csrfToken: string } }).data.csrfToken,
      );
      await agent
        .post('/tickets/departments')
        .set('X-CSRF-Token', csrf)
        .send(departmentInput())
        .expect(403);
    }
  });

  function departmentInput(): SaveSupportDepartment {
    return {
      name: `Fictional ${randomUUID()}`,
      enabled: true,
      customerVisible: true,
      restricted: false,
      memberUserIds: [],
      reason: 'Fictional routing configuration',
    };
  }
  async function departmentFixture(
    overrides: Partial<SaveSupportDepartment> = {},
  ) {
    const value = await tickets.saveDepartment(
      undefined,
      { ...departmentInput(), ...overrides },
      owner,
      context,
    );
    departmentIds.push(value.id);
    return value;
  }
  async function newTicket(departmentId?: string) {
    const submissionKey = randomUUID();
    ticketIds.push(submissionKey);
    return tickets.create(
      {
        submissionKey,
        ...(departmentId ? { departmentId } : {}),
        subject: 'Fictional department request',
        body: 'Fictional customer question',
      },
      customer,
      context,
    );
  }
  async function staff(
    staffRole: 'FULL_ADMINISTRATOR' | 'SUPPORT_OPERATOR' | 'BILLING_OPERATOR',
  ): Promise<AuthRequestContext> {
    const user = await prisma.user.create({
      data: {
        email: `c216-${randomUUID()}@example.test`,
        passwordHash,
        role: 'ADMIN',
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
        adminProfile: { create: { displayName: 'Fictional staff', staffRole } },
      },
      include: { adminProfile: true },
    });
    if (staffRole !== 'BILLING_OPERATOR') {
      const totp = module.get(TotpService);
      await prisma.adminTotpCredential.create({
        data: {
          userId: user.id,
          secretCiphertext: totp.encryptSecret(totp.generateSecret()),
          keyVersion: 'mfa-v1',
          createdAt: new Date(),
          enabledAt: new Date(),
        },
      });
    }
    userIds.push(user.id);
    return {
      sessionId: randomUUID(),
      identity: {
        userId: user.id,
        email: user.email,
        role: 'ADMIN',
        staffRole,
        adminProfileId: user.adminProfile!.id,
        twoFactorEnabled: staffRole !== 'BILLING_OPERATOR',
      },
    };
  }
  async function client(): Promise<AuthRequestContext> {
    const user = await prisma.user.create({
      data: {
        email: `c216-${randomUUID()}@example.test`,
        passwordHash,
        role: 'CUSTOMER',
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
        customer: {
          create: {
            customerNumber: `C216-${randomUUID().slice(0, 8)}`,
            firstName: 'Fictional',
            lastName: 'Customer',
            addressLine1: '216 Fictional Road',
            city: 'Dhaka',
            countryCode: 'BD',
          },
        },
      },
      include: { customer: true },
    });
    userIds.push(user.id);
    return {
      sessionId: randomUUID(),
      identity: {
        userId: user.id,
        email: user.email,
        role: 'CUSTOMER',
        customerId: user.customer!.id,
      },
    };
  }
});
