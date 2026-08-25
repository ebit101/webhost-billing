import { randomUUID } from 'node:crypto';
import {
  loadEnvironmentFiles,
  parseWorkerEnvironment,
} from '@webhost-billing/config';
import {
  createPrismaClient,
  OutboxStatus,
  TicketMessageKind,
  UserRole,
  UserStatus,
} from '@webhost-billing/database';
import type { BackgroundJobData } from '@webhost-billing/shared';
import { EmailMessageResolver } from './email-message.resolver';
import { EmailTemplateCatalog } from './email-template.catalog';

loadEnvironmentFiles();
const environment = parseWorkerEnvironment(process.env);
const prisma = createPrismaClient(environment.DATABASE_URL);

describe('ticket reply email resolution', () => {
  const ids = {
    admin: randomUUID(),
    customerUser: randomUUID(),
    customer: randomUUID(),
    ticket: randomUUID(),
    customerMessage: randomUUID(),
    adminMessage: randomUUID(),
    customerOutbox: randomUUID(),
    adminOutbox: randomUUID(),
  };
  const adminEmail = `command20-admin-${ids.admin}@example.test`;
  const customerEmail = `command20-customer-${ids.customer}@example.test`;

  beforeAll(async () => {
    await prisma.user.create({
      data: {
        id: ids.admin,
        email: adminEmail,
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
        adminProfile: { create: { displayName: 'Ticket Administrator' } },
      },
    });
    await prisma.user.create({
      data: {
        id: ids.customerUser,
        email: customerEmail,
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
        customer: {
          create: {
            id: ids.customer,
            customerNumber: `C20-${ids.customer.slice(0, 8)}`,
            firstName: 'Ticket',
            lastName: 'Customer',
            addressLine1: '20 Fictional Road',
            city: 'Dhaka',
            countryCode: 'BD',
          },
        },
      },
    });
    await prisma.ticket.create({
      data: {
        id: ids.ticket,
        ticketNumber: `TKT-C20-${ids.ticket.slice(0, 8)}`,
        customerId: ids.customer,
        assignedAdminId: ids.admin,
        subject: 'Fictional ticket <subject>',
        messages: {
          create: [
            {
              id: ids.customerMessage,
              authorUserId: ids.customerUser,
              kind: TicketMessageKind.CUSTOMER,
              body: 'Customer text with <script>alert(1)</script>.',
            },
            {
              id: ids.adminMessage,
              authorUserId: ids.admin,
              kind: TicketMessageKind.ADMIN,
              body: 'Administrator plain-text reply.',
            },
          ],
        },
      },
    });
    await prisma.outboxEvent.createMany({
      data: [
        {
          id: ids.customerOutbox,
          aggregateType: 'TICKET',
          aggregateId: ids.ticket,
          eventType: 'EMAIL_TICKET_REPLY',
          idempotencyKey: `command20:${ids.customerOutbox}`,
          payload: {
            schemaVersion: 1,
            ticketId: ids.ticket,
            messageId: ids.customerMessage,
          },
          status: OutboxStatus.PUBLISHED,
          publishedAt: new Date(),
        },
        {
          id: ids.adminOutbox,
          aggregateType: 'TICKET',
          aggregateId: ids.ticket,
          eventType: 'EMAIL_TICKET_REPLY',
          idempotencyKey: `command20:${ids.adminOutbox}`,
          payload: {
            schemaVersion: 1,
            ticketId: ids.ticket,
            messageId: ids.adminMessage,
          },
          status: OutboxStatus.PUBLISHED,
          publishedAt: new Date(),
        },
      ],
    });
  });

  afterAll(async () => {
    await prisma.outboxEvent.deleteMany({
      where: { id: { in: [ids.customerOutbox, ids.adminOutbox] } },
    });
    await prisma.ticketMessage.deleteMany({ where: { ticketId: ids.ticket } });
    await prisma.ticket.deleteMany({ where: { id: ids.ticket } });
    await prisma.customer.deleteMany({ where: { id: ids.customer } });
    await prisma.adminProfile.deleteMany({ where: { userId: ids.admin } });
    await prisma.user.deleteMany({
      where: { id: { in: [ids.admin, ids.customerUser] } },
    });
    await prisma.$disconnect();
  });

  it('notifies the opposite side and escapes durable ticket text', async () => {
    const resolver = new EmailMessageResolver(
      prisma,
      environment,
      new EmailTemplateCatalog(),
    );
    const staffMessage = await resolver.resolve(
      job(ids.customerOutbox, ids.ticket),
    );
    expect(staffMessage.recipientEmail).toBe(adminEmail);
    expect(staffMessage.html).toContain('/admin/support');
    expect(staffMessage.html).toContain(
      '&lt;script&gt;alert(1)&lt;/script&gt;',
    );
    expect(staffMessage.html).not.toContain('<script>');

    await prisma.ticket.update({
      where: { id: ids.ticket },
      data: { assignedAdminId: null },
    });
    const fallbackAdmin = await prisma.user.findFirstOrThrow({
      where: {
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        deletedAt: null,
        adminProfile: { isNot: null },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const fallbackStaffMessage = await resolver.resolve(
      job(ids.customerOutbox, ids.ticket),
    );
    expect(fallbackStaffMessage.recipientEmail).toBe(fallbackAdmin.email);

    const customerMessage = await resolver.resolve(
      job(ids.adminOutbox, ids.ticket),
    );
    expect(customerMessage.recipientEmail).toBe(customerEmail);
    expect(customerMessage.html).toContain('/portal/support');
    expect(customerMessage.ticketId).toBe(ids.ticket);
  });
});

function job(outboxEventId: string, ticketId: string): BackgroundJobData {
  return {
    schemaVersion: 1,
    outboxEventId,
    aggregateType: 'TICKET',
    aggregateId: ticketId,
    eventType: 'EMAIL_TICKET_REPLY',
    correlationId: outboxEventId,
  };
}
