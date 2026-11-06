import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import type { Request } from 'express';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types';
import request from 'supertest';
import {
  parseApiEnvironment,
  parseWorkerEnvironment,
  type ApiEnvironment,
} from '@webhost-billing/config';
import {
  issueSupportReplyAddress,
  type PrismaClient,
} from '@webhost-billing/database';
import {
  signSupportDelivery,
  supportReplyAddress,
  type InboundSupportEmail,
} from '@webhost-billing/shared/support-email';
import { defaultSupportDepartmentId } from '@webhost-billing/shared';
import { AppModule } from '../src/app.module';
import { API_ENVIRONMENT } from '../src/infrastructure/environment/environment.module';
import { PRISMA_CLIENT } from '../src/infrastructure/database/database.module';
import { TicketService } from '../src/modules/tickets/ticket.service';
import { TicketAttachmentService } from '../src/modules/tickets/ticket-attachment.service';
import { SupportEmailService } from '../src/modules/tickets/support-email.service';
import * as fileContent from '../src/modules/tickets/ticket-attachment-content';
import { EmailMessageResolver } from '../../worker/dist/email/email-message.resolver';
import { EmailTemplateCatalog } from '../../worker/dist/email/email-template.catalog';
import { PreviewEmailAdapter } from '../../worker/dist/email/nodemailer-email.adapter';

jest.setTimeout(60000);
const secret = 'fictional-command218-local-delivery-secret-only';
const domain = 'replies.example.test';
const context = { ipAddressHash: 'fictional-command218' };

describe('Command 218 locally delivered support email', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let env: ApiEnvironment;
  let tickets: TicketService;
  let files: TicketAttachmentService;
  let ingress: SupportEmailService;
  let adminId: string;

  beforeAll(async () => {
    env = parseApiEnvironment({
      ...process.env,
      NODE_ENV: 'test',
      PORT: '3001',
      SUPPORT_EMAIL_MODE: 'local',
      SUPPORT_EMAIL_SECRET: secret,
      SUPPORT_EMAIL_DOMAIN: domain,
      TICKET_ATTACHMENT_SCANNER: 'fake',
      AUTH_RATE_LIMIT_NAMESPACE: `supportmail-${randomUUID()}`,
    });
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(API_ENVIRONMENT)
      .useValue(env)
      .compile();
    app = module.createNestApplication();
    await app.init();
    prisma = module.get(PRISMA_CLIENT);
    tickets = module.get(TicketService);
    files = module.get(TicketAttachmentService);
    ingress = module.get(SupportEmailService);
    adminId = (
      await prisma.user.create({
        data: {
          email: `c218-staff-${randomUUID()}@example.test`,
          role: 'ADMIN',
          status: 'ACTIVE',
          emailVerifiedAt: new Date(),
          adminProfile: { create: { displayName: 'Fictional mail staff' } },
        },
      })
    ).id;
  });
  afterAll(async () => {
    if (app) await app.close();
  });

  it('delivers an outbound message to the local preview mailbox and imports its threaded reply once', async () => {
    const fixture = await thread();
    const output = await mkdtemp(join(tmpdir(), 'webhost-command218-'));
    const workerEnv = parseWorkerEnvironment({
      ...process.env,
      NODE_ENV: 'test',
      SUPPORT_EMAIL_MODE: 'local',
      SUPPORT_EMAIL_SECRET: secret,
      SUPPORT_EMAIL_DOMAIN: domain,
      EMAIL_TRANSPORT: 'preview',
      EMAIL_PREVIEW_DIRECTORY: output,
    });
    const resolver = new EmailMessageResolver(
      prisma,
      workerEnv,
      new EmailTemplateCatalog(),
    );
    const event = await prisma.outboxEvent.create({
      data: {
        aggregateType: 'TICKET',
        aggregateId: fixture.ticket.id,
        eventType: 'EMAIL_TICKET_REPLY',
        idempotencyKey: `c218:${randomUUID()}`,
        status: 'PUBLISHED',
        publishedAt: new Date(),
        payload: {
          schemaVersion: 1,
          ticketId: fixture.ticket.id,
          messageId: fixture.source.id,
        },
      },
    });
    const outbound = await resolver.resolve({
      schemaVersion: 1,
      eventType: 'EMAIL_TICKET_REPLY',
      aggregateType: 'TICKET',
      aggregateId: fixture.ticket.id,
      outboxEventId: event.id,
      correlationId: event.id,
    });
    const provider = new PreviewEmailAdapter(workerEnv);
    try {
      expect(outbound.replyToAddress).toBe(fixture.recipient);
      await provider.send({
        ...outbound,
        messageId: `<fictional-c218-${event.id}@example.test>`,
      });
      const names = await readdir(output);
      expect(names).toHaveLength(1);
      const delivered = await readFile(join(output, names[0]), 'utf8');
      expect(delivered).toContain(fixture.recipient);
      expect(delivered).toContain('Auto-Submitted: auto-generated');
      const mail = incoming(fixture);
      await deliver(mail)
        .expect(201)
        .expect({ received: true, outcome: 'ACCEPTED' });
      const detail = await tickets.get(fixture.ticket.id, fixture.actor);
      expect(detail.messages.at(-1)?.body).toBe(mail.text);
      expect(detail.status).toBe('WAITING_FOR_STAFF');
      const queued = await prisma.outboxEvent.findMany({
        where: { aggregateId: fixture.ticket.id, id: { not: event.id } },
      });
      expect(queued).toHaveLength(1);
      expect(JSON.stringify(queued)).not.toContain(mail.text);
      const notice = queued[0];
      await prisma.outboxEvent.update({
        where: { id: notice.id },
        data: { status: 'PUBLISHED', publishedAt: new Date() },
      });
      const staffMail = await resolver.resolve({
        schemaVersion: 1,
        eventType: 'EMAIL_TICKET_REPLY',
        aggregateType: 'TICKET',
        aggregateId: fixture.ticket.id,
        outboxEventId: notice.id,
        correlationId: notice.id,
      });
      expect(staffMail.recipientEmail).not.toBe(fixture.user.email);
      expect(staffMail.replyToAddress ?? '').not.toContain('r-');
    } finally {
      await provider.close();
      await rm(output, { recursive: true, force: true });
    }
  });

  it('refuses untrusted, tampered and stale deliveries and remains disabled by default', async () => {
    const fixture = await thread();
    const mail = incoming(fixture);
    await deliver(mail, '0'.repeat(64)).expect(401);
    await deliver(mail, undefined, String(Date.now() - 3600000)).expect(401);
    const bytes = Buffer.from(JSON.stringify(mail));
    const timestamp = String(Date.now());
    await request(app.getHttpServer())
      .post('/support-email/deliveries')
      .set('Content-Type', 'application/octet-stream')
      .set('X-Support-Timestamp', timestamp)
      .set(
        'X-Support-Signature',
        signSupportDelivery(
          Buffer.concat([bytes, Buffer.from('x')]),
          timestamp,
          secret,
        ),
      )
      .send(bytes)
      .expect(401);
    env.SUPPORT_EMAIL_MODE = 'disabled';
    try {
      await deliver(mail).expect(503);
    } finally {
      env.SUPPORT_EMAIL_MODE = 'local';
    }
    expect(
      await prisma.ticketMessage.count({
        where: { ticketId: fixture.ticket.id },
      }),
    ).toBe(1);
  });

  it('refuses cross-customer spoofing, unsigned sender evidence and invalid routing tokens', async () => {
    const fixture = await thread();
    const other = await thread();
    await deliver({
      ...incoming(fixture),
      from: other.user.email,
      senderVerification: {
        dmarc: 'pass',
        alignedDkim: true,
        verifiedAddress: other.user.email,
      },
    })
      .expect(201)
      .expect({ received: true, outcome: 'REJECTED' });
    await deliver({
      ...incoming(fixture),
      senderVerification: {
        dmarc: 'fail',
        alignedDkim: false,
        verifiedAddress: fixture.user.email,
      },
    })
      .expect(201)
      .expect({ received: true, outcome: 'REJECTED' });
    await deliver({
      ...incoming(fixture),
      recipient: supportReplyAddress(randomUUID(), secret, domain),
    })
      .expect(201)
      .expect({ received: true, outcome: 'REJECTED' });
    await deliver({
      ...incoming(fixture),
      recipient: fixture.recipient.replace(/\.[^.]+@/, '.invalid@'),
    })
      .expect(201)
      .expect({ received: true, outcome: 'REJECTED' });
    expect(
      await prisma.ticketMessage.count({
        where: { ticketId: fixture.ticket.id },
      }),
    ).toBe(1);
  });

  it('serializes concurrent duplicates, refuses changed replays and deduplicates Message-IDs across valid routes', async () => {
    const fixture = await thread();
    const mail = incoming(fixture);
    const results = await Promise.all([deliver(mail), deliver(mail)]);
    expect(results.map((result) => result.status)).toEqual([201, 201]);
    expect(
      await prisma.ticketMessage.count({
        where: { ticketId: fixture.ticket.id },
      }),
    ).toBe(2);
    await deliver({ ...mail, text: 'Changed replay' }).expect(409);
    const next = await thread();
    await deliver({ ...incoming(next), messageId: mail.messageId })
      .expect(201)
      .expect({ received: true, outcome: 'IGNORED' });
    expect(
      await prisma.ticketMessage.count({ where: { ticketId: next.ticket.id } }),
    ).toBe(1);
  });

  it('converts HTML to plain text and discards scripts, remote images and quoted history', async () => {
    const fixture = await thread();
    const mail = incoming(fixture);
    delete mail.text;
    mail.html =
      '<html><head><style>secret-css</style></head><body><script>malicious-code</script><p>Fictional update &amp; thanks</p><img src="https://example.test/track"></body></html>';
    await deliver(mail).expect(201);
    const detail = await tickets.get(fixture.ticket.id, fixture.actor);
    expect(detail.messages.at(-1)?.body).toBe('Fictional update & thanks');
    const next = incoming(fixture);
    next.text = 'New reply\n> Previous secret excerpt';
    await deliver(next).expect(201);
    expect(
      (await tickets.get(fixture.ticket.id, fixture.actor)).messages.at(-1)
        ?.body,
    ).toBe('New reply');
  });

  it('screens a private attachment atomically with the reply and permits only authenticated owned downloads', async () => {
    const fixture = await thread();
    const mail = incoming(fixture);
    const bytes = Buffer.from('Fictional email attachment evidence');
    mail.attachments = [
      {
        filename: 'fictional-email.log',
        mediaType: 'text/plain',
        contentBase64: bytes.toString('base64'),
      },
    ];
    await deliver(mail).expect(201);
    const detail = await tickets.get(fixture.ticket.id, fixture.actor);
    const file = detail.messages.at(-1)!.attachments![0];
    const download = await files.download(file.id, fixture.actor, context);
    expect(download.content.equals(bytes)).toBe(true);
    const other = await thread();
    await expect(
      files.download(file.id, other.actor, context),
    ).rejects.toThrow();
    await deliver(mail).expect(201);
    expect(
      await prisma.ticketAttachment.count({
        where: { ticketId: fixture.ticket.id },
      }),
    ).toBe(1);
  });

  it('rejects infected or invalid attachments without importing a partial reply', async () => {
    const fixture = await thread();
    for (const content of [
      'FICTIONAL_INFECTED_ATTACHMENT',
      '<script>active</script>',
    ]) {
      const mail = incoming(fixture);
      mail.attachments = [
        {
          filename: 'fictional.log',
          mediaType: 'text/plain',
          contentBase64: Buffer.from(content).toString('base64'),
        },
      ];
      await deliver(mail)
        .expect(201)
        .expect({ received: true, outcome: 'REJECTED' });
    }
    expect(
      await prisma.ticketMessage.count({
        where: { ticketId: fixture.ticket.id },
      }),
    ).toBe(1);
    expect(
      await prisma.ticketAttachment.count({
        where: { ticketId: fixture.ticket.id },
      }),
    ).toBe(0);
  });

  it('retries unavailable screening without duplicate content or receipt publication', async () => {
    const fixture = await thread();
    const mail = incoming(fixture);
    mail.attachments = [
      {
        filename: 'fictional.log',
        mediaType: 'text/plain',
        contentBase64: Buffer.from('Fictional evidence').toString('base64'),
      },
    ];
    env.TICKET_ATTACHMENT_SCANNER = 'disabled';
    try {
      await deliver(mail).expect(503);
    } finally {
      env.TICKET_ATTACHMENT_SCANNER = 'fake';
    }
    expect(
      await prisma.ticketMessage.count({
        where: { ticketId: fixture.ticket.id },
      }),
    ).toBe(1);
    await deliver(mail)
      .expect(201)
      .expect({ received: true, outcome: 'ACCEPTED' });
    await deliver(mail).expect(201);
    expect(
      await prisma.ticketMessage.count({
        where: { ticketId: fixture.ticket.id },
      }),
    ).toBe(2);
  });

  it('ignores bounces, autoresponders, bulk mail and delivery reports without an email loop', async () => {
    const fixture = await thread();
    const variants = [
      { envelopeFrom: null },
      { autoSubmitted: 'auto-replied' as const },
      { bulk: true },
      { deliveryReport: true },
    ];
    for (const change of variants)
      await deliver({ ...incoming(fixture), ...change })
        .expect(201)
        .expect({ received: true, outcome: 'IGNORED' });
    expect(
      await prisma.outboxEvent.count({
        where: { aggregateId: fixture.ticket.id },
      }),
    ).toBe(0);
  });

  it('keeps a closed ticket closed and does not issue routes for private notes or customer messages', async () => {
    const fixture = await thread();
    const note = await prisma.ticketMessage.create({
      data: {
        ticketId: fixture.ticket.id,
        authorUserId: adminId,
        kind: 'SYSTEM',
        body: 'Fictional private staff note',
      },
    });
    expect(
      await issueSupportReplyAddress(
        prisma,
        fixture.ticket.id,
        note.id,
        secret,
        domain,
      ),
    ).toBeUndefined();
    await prisma.ticket.update({
      where: { id: fixture.ticket.id },
      data: { status: 'CLOSED', closedAt: new Date() },
    });
    expect(
      await issueSupportReplyAddress(
        prisma,
        fixture.ticket.id,
        fixture.source.id,
        secret,
        domain,
      ),
    ).toBeUndefined();
    await deliver(incoming(fixture))
      .expect(201)
      .expect({ received: true, outcome: 'REJECTED' });
    expect(
      (await tickets.get(fixture.ticket.id, fixture.actor)).messages.some(
        (value) => value.body.includes('private staff'),
      ),
    ).toBe(false);
    expect(
      (
        await prisma.ticket.findUniqueOrThrow({
          where: { id: fixture.ticket.id },
        })
      ).status,
    ).toBe('CLOSED');
  });

  it('checks current account ownership, verification, email address and route expiry', async () => {
    for (const change of [
      'expired',
      'email',
      'inactive',
      'unverified',
      'owner',
    ]) {
      const fixture = await thread();
      const route = await prisma.supportEmailThread.findFirstOrThrow({
        where: { ticketId: fixture.ticket.id },
      });
      if (change === 'expired')
        await prisma.supportEmailThread.update({
          where: { id: route.id },
          data: { expiresAt: new Date(0) },
        });
      if (change === 'email')
        await prisma.user.update({
          where: { id: fixture.user.id },
          data: { email: `changed-${randomUUID()}@example.test` },
        });
      if (change === 'inactive')
        await prisma.user.update({
          where: { id: fixture.user.id },
          data: { status: 'DISABLED' },
        });
      if (change === 'unverified')
        await prisma.user.update({
          where: { id: fixture.user.id },
          data: { emailVerifiedAt: null },
        });
      if (change === 'owner') {
        const other = await thread();
        await prisma.ticket.update({
          where: { id: fixture.ticket.id },
          data: { customerId: other.user.customer!.id },
        });
      }
      await deliver(incoming(fixture))
        .expect(201)
        .expect({ received: true, outcome: 'REJECTED' });
    }
  });

  it('routes to the current department without trusting a subject, address alias or stale department', async () => {
    const fixture = await thread();
    const department = await prisma.supportDepartment.create({
      data: {
        name: `Fictional routing ${randomUUID()}`,
        restricted: true,
        customerVisible: false,
      },
    });
    await prisma.ticket.update({
      where: { id: fixture.ticket.id },
      data: { departmentId: department.id },
    });
    await deliver(incoming(fixture))
      .expect(201)
      .expect({ received: true, outcome: 'ACCEPTED' });
    const detail = await tickets.get(fixture.ticket.id, fixture.actor);
    expect(detail.department.id).toBe(department.id);
  });

  it('validates strict provider payloads and retains only safe receipt and audit metadata', async () => {
    const fixture = await thread();
    await deliver({
      ...incoming(fixture),
      headers: { 'Authentication-Results': 'forged pass' },
    }).expect(422);
    const mail = incoming(fixture);
    await deliver(mail).expect(201);
    const records = await prisma.supportEmailReceipt.findMany({
      where: { thread: { ticketId: fixture.ticket.id } },
    });
    const audits = await prisma.activityLog.findMany({
      where: { entityId: { in: records.map((record) => record.id) } },
    });
    const metadata = JSON.stringify([records, audits]);
    expect(metadata).not.toContain(mail.text);
    expect(metadata).not.toContain(fixture.recipient);
    expect(metadata).not.toContain(secret);
    expect(records).toHaveLength(1);
    expect(audits).toHaveLength(1);
  });

  it('bounds streaming intake and leaves no partial receipt on interruption or oversized content', async () => {
    const timestamp = String(Date.now());
    const stream = () =>
      Object.assign(new PassThrough(), {
        aborted: false,
        socket: { remoteAddress: '127.0.0.1' },
        get: (name: string) =>
          name === 'content-type'
            ? 'application/octet-stream'
            : name === 'x-support-timestamp'
              ? timestamp
              : 'a'.repeat(64),
      });
    const before = await prisma.supportEmailReceipt.count();
    const partial = stream();
    const interrupted = ingress.receive(partial as unknown as Request, context);
    partial.write(Buffer.from('partial'));
    partial.destroy(new Error('Fictional interrupted local delivery'));
    await expect(interrupted).rejects.toThrow(
      'Support email delivery could not be accepted.',
    );
    const large = stream();
    const oversized = ingress.receive(large as unknown as Request, context);
    large.end(Buffer.alloc(9 * 1024 * 1024 + 1));
    await expect(oversized).rejects.toMatchObject({ status: 413 });
    expect(await prisma.supportEmailReceipt.count()).toBe(before);
  });

  it('rechecks account eligibility after attachment screening before publishing any bytes or message', async () => {
    const fixture = await thread();
    const mail = incoming(fixture);
    mail.attachments = [
      {
        filename: 'fictional.log',
        mediaType: 'text/plain',
        contentBase64: Buffer.from('Fictional in-flight evidence').toString(
          'base64',
        ),
      },
    ];
    const scanner = jest
      .spyOn(fileContent, 'scanAttachment')
      .mockImplementationOnce(async () => {
        await prisma.user.update({
          where: { id: fixture.user.id },
          data: { status: 'DISABLED' },
        });
        return 'CLEAN';
      });
    try {
      await deliver(mail)
        .expect(201)
        .expect({ received: true, outcome: 'REJECTED' });
    } finally {
      scanner.mockRestore();
    }
    expect(
      await prisma.ticketMessage.count({
        where: { ticketId: fixture.ticket.id },
      }),
    ).toBe(1);
    expect(
      await prisma.ticketAttachment.count({
        where: { ticketId: fixture.ticket.id },
      }),
    ).toBe(0);
  });

  async function thread() {
    const user = await prisma.user.create({
      data: {
        email: `c218-${randomUUID()}@example.test`,
        role: 'CUSTOMER',
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
        customer: {
          create: {
            customerNumber: `C218-${randomUUID().slice(0, 8)}`,
            firstName: 'Fictional',
            lastName: 'Mail customer',
            addressLine1: '218 Fictional Road',
            city: 'Dhaka',
            countryCode: 'BD',
          },
        },
      },
      include: { customer: true },
    });
    const ticket = await prisma.ticket.create({
      data: {
        ticketNumber: `TKT218-${randomUUID().slice(0, 8)}`,
        customerId: user.customer!.id,
        departmentId: defaultSupportDepartmentId,
        subject: 'Fictional mail conversation',
      },
    });
    const source = await prisma.ticketMessage.create({
      data: {
        ticketId: ticket.id,
        authorUserId: adminId,
        kind: 'ADMIN',
        body: 'Fictional administrator reply',
      },
    });
    const recipient = await issueSupportReplyAddress(
      prisma,
      ticket.id,
      source.id,
      secret,
      domain,
    );
    expect(recipient).toBeDefined();
    return {
      user,
      ticket,
      source,
      recipient: recipient!,
      actor: {
        identity: {
          userId: user.id,
          role: 'CUSTOMER' as const,
          customerId: user.customer!.id,
          email: user.email,
        },
        sessionId: randomUUID(),
      },
    };
  }
  function incoming(
    fixture: Awaited<ReturnType<typeof thread>>,
  ): InboundSupportEmail {
    return {
      messageId: `<fictional-${randomUUID()}@example.test>`,
      recipient: fixture.recipient,
      from: fixture.user.email,
      envelopeFrom: fixture.user.email,
      senderVerification: {
        dmarc: 'pass',
        alignedDkim: true,
        verifiedAddress: fixture.user.email,
      },
      autoSubmitted: 'no',
      bulk: false,
      deliveryReport: false,
      text: 'Fictional customer reply via local mail provider',
      attachments: [],
    };
  }
  // Local normalized-mail provider boundary: sign bytes, never sender-supplied headers.
  function deliver(
    mail: unknown,
    signature?: string,
    timestamp = String(Date.now()),
  ) {
    const bytes = Buffer.from(JSON.stringify(mail));
    return request(app.getHttpServer())
      .post('/support-email/deliveries')
      .set('Content-Type', 'application/octet-stream')
      .set('X-Support-Timestamp', timestamp)
      .set(
        'X-Support-Signature',
        signature ?? signSupportDelivery(bytes, timestamp, secret),
      )
      .send(bytes);
  }
});
