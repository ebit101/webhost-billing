import { createServer } from 'node:net';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { PassThrough } from 'node:stream';
import type { Request } from 'express';
import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import {
  parseApiEnvironment,
  apiEnvironmentSchema,
  type ApiEnvironment,
} from '@webhost-billing/config';
import {
  purgeExpiredTicketAttachments,
  type PrismaClient,
} from '@webhost-billing/database';
import { defaultSupportDepartmentId } from '@webhost-billing/shared';
import request from 'supertest';
import type { App } from 'supertest/types';
import sharp from 'sharp';
import { AppModule } from '../src/app.module';
import { PRISMA_CLIENT } from '../src/infrastructure/database/database.module';
import { API_ENVIRONMENT } from '../src/infrastructure/environment/environment.module';
import { TicketService } from '../src/modules/tickets/ticket.service';
import { TicketAttachmentService } from '../src/modules/tickets/ticket-attachment.service';
import { claimTicketAttachments } from '../src/modules/tickets/ticket-attachment-claims';
import { TotpService } from '../src/modules/auth/services/totp.service';
import type { AuthRequestContext } from '../src/modules/auth/auth.types';

jest.setTimeout(60000);
const context = { ipAddressHash: 'fictional-command217' };
const evidence = Buffer.from(
  'Fictional support evidence, with no customer information.',
);

describe('Command 217 private ticket attachments', () => {
  let module: TestingModule;
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let tickets: TicketService;
  let files: TicketAttachmentService;
  let env: ApiEnvironment;
  let customer: AuthRequestContext;
  let other: AuthRequestContext;
  let owner: AuthRequestContext;
  let support: AuthRequestContext;
  let billing: AuthRequestContext;
  const users: string[] = [];
  const departments: string[] = [];
  const clients = new Map<
    string,
    { agent: ReturnType<typeof request.agent>; csrf: string }
  >();

  beforeAll(async () => {
    env = parseApiEnvironment({
      ...process.env,
      NODE_ENV: 'test',
      PORT: '3001',
      TICKET_ATTACHMENT_SCANNER: 'fake',
      AUTH_RATE_LIMIT_NAMESPACE: `attachments-${randomUUID()}`,
    });
    module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(API_ENVIRONMENT)
      .useValue(env)
      .compile();
    app = module.createNestApplication();
    await app.init();
    prisma = module.get(PRISMA_CLIENT);
    tickets = module.get(TicketService);
    files = module.get(TicketAttachmentService);
    customer = await actor('CUSTOMER');
    other = await actor('CUSTOMER');
    owner = await actor('FULL_ADMINISTRATOR');
    support = await actor('SUPPORT_OPERATOR');
    billing = await actor('BILLING_OPERATOR');
  });
  afterAll(async () => {
    if (prisma) {
      const attachments = await prisma.ticketAttachment.findMany({
        where: { uploaderUserId: { in: users } },
        select: { blobId: true },
      });
      const owned = await prisma.ticket.findMany({
        where: { customer: { userId: { in: users } } },
        select: { id: true },
      });
      const ids = owned.map((value) => value.id);
      await prisma.ticketAttachment.deleteMany({
        where: { uploaderUserId: { in: users } },
      });
      await prisma.ticketAttachmentBlob.deleteMany({
        where: {
          id: {
            in: attachments.flatMap((value) =>
              value.blobId ? [value.blobId] : [],
            ),
          },
        },
      });
      await prisma.activityLog.deleteMany({
        where: { actorUserId: { in: users } },
      });
      await prisma.outboxEvent.deleteMany({
        where: { aggregateId: { in: ids } },
      });
      await prisma.ticketMessage.deleteMany({
        where: { ticketId: { in: ids } },
      });
      await prisma.ticket.deleteMany({ where: { id: { in: ids } } });
      await prisma.supportDepartmentMember.deleteMany({
        where: { departmentId: { in: departments } },
      });
      await prisma.supportDepartment.deleteMany({
        where: { id: { in: departments } },
      });
      await prisma.authSession.deleteMany({ where: { userId: { in: users } } });
      await prisma.adminTotpCredential.deleteMany({
        where: { userId: { in: users } },
      });
      await prisma.adminProfile.deleteMany({
        where: { userId: { in: users } },
      });
      await prisma.customer.deleteMany({ where: { userId: { in: users } } });
      await prisma.user.deleteMany({ where: { id: { in: users } } });
    }
    if (app) await app.close();
  });

  it('accepts an initial text attachment, binds it atomically and preserves exact retry identity', async () => {
    const key = randomUUID();
    const file = await intent(customer, key);
    const client = http(customer);
    const response = await client.agent
      .put(`/tickets/attachment-uploads/${file.id}/content`)
      .set('X-CSRF-Token', client.csrf)
      .set('Content-Type', 'application/octet-stream')
      .send(evidence)
      .expect(200);
    expect(JSON.stringify(response.body)).not.toContain(evidence.toString());
    expect(
      Object.keys((response.body as { data: object }).data).sort(),
    ).toEqual([
      'expiresAt',
      'filename',
      'id',
      'mediaType',
      'sizeBytes',
      'status',
    ]);
    const input = {
      submissionKey: key,
      departmentId: defaultSupportDepartmentId,
      subject: 'Fictional attached request',
      body: 'Please review the fictional log.',
      attachmentIds: [file.id],
    };
    const ticket = await tickets.create(input, customer, context);
    expect(ticket.messages[0]?.attachments?.[0]?.id).toBe(file.id);
    expect((await tickets.create(input, customer, context)).id).toBe(ticket.id);
    const retried = await files.create(
      {
        submissionKey: file.id,
        messageSubmissionKey: key,
        departmentId: defaultSupportDepartmentId,
        filename: file.filename,
        mediaType: 'text/plain',
        sizeBytes: evidence.length,
      },
      customer,
      context,
    );
    expect(retried.status).toBe('ATTACHED');
    await expect(
      tickets.create({ ...input, attachmentIds: [] }, customer, context),
    ).rejects.toThrow();
    const download = await client.agent
      .get(`/tickets/attachments/${file.id}/download`)
      .expect(200);
    expect(download.body).toEqual(evidence);
    expect(download.headers['content-disposition']).toBe(
      'attachment; filename="fictional.log"',
    );
    expect(download.headers['content-type']).toContain(
      'application/octet-stream',
    );
    expect(download.headers['cache-control']).toBe('private, no-store');
    expect(download.headers['x-content-type-options']).toBe('nosniff');
    expect(download.headers['content-security-policy']).toContain('sandbox');
    expect(
      (
        await prisma.ticketAttachment.findUniqueOrThrow({
          where: { id: file.id },
        })
      ).blobId,
    ).not.toContain('fictional');
  });

  it('decodes and normalizes valid PNG and JPEG files before private storage', async () => {
    for (const format of ['png', 'jpeg'] as const) {
      const image = sharp({
        create: { width: 2, height: 2, channels: 3, background: 'white' },
      });
      const bytes = await (
        format === 'png' ? image.png() : image.jpeg()
      ).toBuffer();
      const file = await intent(
        customer,
        randomUUID(),
        undefined,
        bytes,
        `fictional.${format}`,
        `image/${format}`,
      );
      await put(file.id, customer, bytes).expect(200);
      const stored = await prisma.ticketAttachment.findUniqueOrThrow({
        where: { id: file.id },
        include: { blob: true },
      });
      expect(
        (await sharp(Buffer.from(stored.blob!.content)).metadata()).format,
      ).toBe(format);
    }
  });

  it('rejects traversal and active-content extensions before creating storage', async () => {
    const client = http(customer);
    for (const filename of ['../evidence.txt', 'shell.php'])
      await client.agent
        .post('/tickets/attachment-uploads')
        .set('X-CSRF-Token', client.csrf)
        .send({
          submissionKey: randomUUID(),
          messageSubmissionKey: randomUUID(),
          filename,
          mediaType: 'text/plain',
          sizeBytes: 10,
        })
        .expect(400);
  });

  it('rejects MIME mismatches, markup and executable content without retaining bytes', async () => {
    for (const [name, mime, bytes] of [
      ['spoof.png', 'image/png', evidence],
      [
        'spoof.txt',
        'text/plain',
        Buffer.from('<svg><script>fictional</script></svg>'),
      ],
      ['spoof.log', 'text/plain', Buffer.from([77, 90, 0, 1, 2])],
    ] as const) {
      const file = await intent(
        other,
        randomUUID(),
        undefined,
        bytes,
        name,
        mime,
      );
      await put(file.id, other, bytes).expect(422);
      expect(
        await prisma.ticketAttachment.findUnique({
          where: { id: file.id },
          select: { status: true, blobId: true },
        }),
      ).toEqual({ status: 'REJECTED', blobId: null });
    }
  });

  it('rejects oversized declarations and mismatched streaming lengths', async () => {
    const client = http(other);
    await client.agent
      .post('/tickets/attachment-uploads')
      .set('X-CSRF-Token', client.csrf)
      .send({
        submissionKey: randomUUID(),
        messageSubmissionKey: randomUUID(),
        filename: 'large.log',
        mediaType: 'text/plain',
        sizeBytes: 2097153,
      })
      .expect(400);
    const file = await intent(other, randomUUID());
    await put(
      file.id,
      other,
      Buffer.concat([evidence, Buffer.from('x')]),
    ).expect(413);
    const large = await intent(
      other,
      randomUUID(),
      undefined,
      Buffer.alloc(2097152),
    );
    const stream = Object.assign(new PassThrough(), {
      headers: { 'content-type': 'application/octet-stream' },
      aborted: false,
    });
    const uploading = files.upload(
      large.id,
      stream as unknown as Request,
      other,
      context,
    );
    const rejected = expect(uploading).rejects.toThrow('exceeds');
    await untilUploading(large.id);
    stream.end(Buffer.alloc(2097153));
    await rejected;
    expect(
      (
        await prisma.ticketAttachment.findUniqueOrThrow({
          where: { id: large.id },
        })
      ).blobId,
    ).toBeNull();
    expect(
      (
        await prisma.ticketAttachment.findUniqueOrThrow({
          where: { id: file.id },
        })
      ).blobId,
    ).toBeNull();
  });

  it('keeps malware and unavailable screening out of messages and downloads', async () => {
    for (const [marker, status, response] of [
      ['FICTIONAL_INFECTED_ATTACHMENT', 'REJECTED', 422],
      ['FICTIONAL_SCANNER_UNAVAILABLE', 'QUARANTINED', 503],
    ] as const) {
      const bytes = Buffer.from(marker);
      const key = randomUUID();
      const file = await intent(other, key, undefined, bytes);
      await put(file.id, other, bytes).expect(response);
      expect(
        await prisma.ticketAttachment.findUnique({
          where: { id: file.id },
          select: { status: true, blobId: true },
        }),
      ).toEqual({ status, blobId: null });
      await expect(
        tickets.create(
          {
            submissionKey: key,
            subject: 'Unclean fictional request',
            body: 'This must not be sent.',
            attachmentIds: [file.id],
          },
          other,
          context,
        ),
      ).rejects.toThrow();
      expect(await prisma.ticket.count({ where: { id: key } })).toBe(0);
      await http(other)
        .agent.get(`/tickets/attachments/${file.id}/download`)
        .expect(404);
    }
  });

  it('rejects malware detected on normalized output by the local ClamAV protocol fixture', async () => {
    let scans = 0;
    const server = createServer((socket) => {
      let accumulated = Buffer.alloc(0);
      socket.on('data', (chunk) => {
        accumulated = Buffer.concat([accumulated, chunk]);
        let offset = Buffer.byteLength('zINSTREAM\0');
        while (offset + 4 <= accumulated.length) {
          const size = accumulated.readUInt32BE(offset);
          offset += 4;
          if (!size) {
            scans++;
            socket.end(
              scans === 1
                ? 'stream: OK\0'
                : 'stream: Fictional.Normalized FOUND\0',
            );
            return;
          }
          if (offset + size > accumulated.length) return;
          offset += size;
        }
      });
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    const address = server.address();
    if (!address || typeof address === 'string')
      throw new Error('Missing fictional scanner port');
    const scanner = new TicketAttachmentService(
      prisma,
      {
        ...env,
        TICKET_ATTACHMENT_SCANNER: 'clamav',
        TICKET_ATTACHMENT_CLAMAV_HOST: '127.0.0.1',
        TICKET_ATTACHMENT_CLAMAV_PORT: address.port,
      },
      tickets,
    );
    const file = await intent(other, randomUUID());
    const stream = streamRequest();
    try {
      const uploading = scanner.upload(
        file.id,
        stream as unknown as Request,
        other,
        context,
      );
      const rejected = expect(uploading).rejects.toThrow('normalized');
      await untilUploading(file.id);
      stream.end(evidence);
      await rejected;
      expect(scans).toBe(2);
      expect(
        await prisma.ticketAttachment.findUnique({
          where: { id: file.id },
          select: { status: true, blobId: true },
        }),
      ).toEqual({ status: 'REJECTED', blobId: null });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('enforces uploader ownership and message binding during final submission', async () => {
    const key = randomUUID();
    const file = await intent(customer, key);
    await put(file.id, other, evidence).expect(404);
    await put(file.id, customer, evidence).expect(200);
    await expect(
      tickets.create(
        {
          submissionKey: key,
          subject: 'Foreign fictional attachment',
          body: 'Must fail.',
          attachmentIds: [file.id],
        },
        other,
        context,
      ),
    ).rejects.toThrow();
    await expect(
      tickets.create(
        {
          submissionKey: randomUUID(),
          subject: 'Wrong fictional message',
          body: 'Must fail.',
          attachmentIds: [file.id],
        },
        customer,
        context,
      ),
    ).rejects.toThrow();
    await expect(
      prisma.$transaction((tx) =>
        claimTicketAttachments(
          tx,
          [file.id],
          customer.identity.userId,
          key,
          key,
          randomUUID(),
          defaultSupportDepartmentId,
          true,
          true,
        ),
      ),
    ).rejects.toThrow();
  });

  it('permits one concurrent publication and refuses unbound downloads', async () => {
    const file = await intent(customer, randomUUID());
    const results = await Promise.all([
      put(file.id, customer, evidence),
      put(file.id, customer, evidence),
    ]);
    expect(results.map((value) => value.status).sort()).toEqual([200, 409]);
    expect(
      (
        await prisma.ticketAttachment.findUniqueOrThrow({
          where: { id: file.id },
        })
      ).status,
    ).toBe('READY');
    await http(customer)
      .agent.get(`/tickets/attachments/${file.id}/download`)
      .expect(404);
  });

  it('recovers an interrupted stream without partial blobs and fences stale publishers', async () => {
    const file = await intent(other, randomUUID());
    const stream = streamRequest();
    const upload = files.upload(
      file.id,
      stream as unknown as Request,
      other,
      context,
    );
    const outcome = expect(upload).rejects.toThrow();
    await untilUploading(file.id);
    stream.destroy(new Error('Fictional interrupted upload'));
    await outcome;
    expect(
      await prisma.ticketAttachment.findUnique({
        where: { id: file.id },
        select: { status: true, blobId: true },
      }),
    ).toEqual({ status: 'QUARANTINED', blobId: null });
    await put(file.id, other, evidence).expect(200);
    const stale = await intent(other, randomUUID());
    const delayed = streamRequest();
    const pending = files.upload(
      stale.id,
      delayed as unknown as Request,
      other,
      context,
    );
    const failed = expect(pending).rejects.toThrow();
    await untilUploading(stale.id);
    const replacement = randomUUID();
    await prisma.ticketAttachment.update({
      where: { id: stale.id },
      data: { claimToken: replacement },
    });
    delayed.end(evidence);
    await failed;
    const state = await prisma.ticketAttachment.findUniqueOrThrow({
      where: { id: stale.id },
    });
    expect(state.blobId).toBeNull();
    expect(state.claimToken).toBe(replacement);
  });

  it('checks current ticket ownership, department membership and staff role on downloads', async () => {
    const department = await prisma.supportDepartment.create({
      data: {
        name: `Fictional ${randomUUID()}`,
        restricted: true,
        members: { create: { userId: support.identity.userId } },
      },
    });
    departments.push(department.id);
    const ticket = await tickets.create(
      {
        submissionKey: randomUUID(),
        departmentId: department.id,
        subject: 'Restricted fictional request',
        body: 'Fictional thread.',
      },
      customer,
      context,
    );
    const key = randomUUID();
    const file = await intent(support, key, ticket.id);
    await put(file.id, support, evidence).expect(200);
    const reply = {
      submissionKey: key,
      body: 'A fictional staff attachment.',
      attachmentIds: [file.id],
    };
    await tickets.reply(ticket.id, reply, support, context);
    expect(
      (await tickets.reply(ticket.id, reply, support, context)).messages,
    ).toHaveLength(2);
    await expect(
      tickets.reply(
        ticket.id,
        { ...reply, attachmentIds: [] },
        support,
        context,
      ),
    ).rejects.toThrow();
    await http(customer)
      .agent.get(`/tickets/attachments/${file.id}/download`)
      .expect(200);
    await http(other)
      .agent.get(`/tickets/attachments/${file.id}/download`)
      .expect(403);
    await http(billing)
      .agent.get(`/tickets/attachments/${file.id}/download`)
      .expect(403);
    await prisma.supportDepartmentMember.deleteMany({
      where: { departmentId: department.id },
    });
    await http(support)
      .agent.get(`/tickets/attachments/${file.id}/download`)
      .expect(403);
    await prisma.ticketMessage.update({
      where: { id: key },
      data: { kind: 'SYSTEM' },
    });
    await http(customer)
      .agent.get(`/tickets/attachments/${file.id}/download`)
      .expect(404);
    expect((await tickets.get(ticket.id, customer)).messages).toHaveLength(1);
    await http(owner)
      .agent.get(`/tickets/attachments/${file.id}/download`)
      .expect(200);
  });

  it('rechecks department access before publishing an in-flight upload', async () => {
    const department = await prisma.supportDepartment.create({
      data: {
        name: `Fictional ${randomUUID()}`,
        restricted: true,
        members: { create: { userId: support.identity.userId } },
      },
    });
    departments.push(department.id);
    const ticket = await tickets.create(
      {
        submissionKey: randomUUID(),
        departmentId: department.id,
        subject: 'Revoked fictional upload',
        body: 'Fictional request.',
      },
      customer,
      context,
    );
    const file = await intent(support, randomUUID(), ticket.id);
    const stream = streamRequest();
    const uploading = files.upload(
      file.id,
      stream as unknown as Request,
      support,
      context,
    );
    const denied = expect(uploading).rejects.toThrow();
    await untilUploading(file.id);
    await prisma.supportDepartmentMember.deleteMany({
      where: { departmentId: department.id },
    });
    stream.end(evidence);
    await denied;
    expect(
      (
        await prisma.ticketAttachment.findUniqueOrThrow({
          where: { id: file.id },
        })
      ).blobId,
    ).toBeNull();
  });

  it('expires and purges private bytes but preserves message attachment history', async () => {
    const key = randomUUID();
    const file = await intent(customer, key);
    await put(file.id, customer, evidence).expect(200);
    const ticket = await tickets.create(
      {
        submissionKey: key,
        subject: 'Expiry fictional request',
        body: 'Retain history.',
        attachmentIds: [file.id],
      },
      customer,
      context,
    );
    const row = await prisma.ticketAttachment.update({
      where: { id: file.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await http(customer)
      .agent.get(`/tickets/attachments/${file.id}/download`)
      .expect(410);
    expect(await purgeExpiredTicketAttachments(prisma)).toBeGreaterThanOrEqual(
      1,
    );
    expect(
      await prisma.ticketAttachmentBlob.count({ where: { id: row.blobId! } }),
    ).toBe(0);
    expect(
      (await tickets.get(ticket.id, customer)).messages[0]?.attachments?.[0]
        ?.status,
    ).toBe('EXPIRED');
  });

  it('refuses corrupt storage, simulated production files and support-session writes', async () => {
    const key = randomUUID();
    const file = await intent(customer, key);
    await put(file.id, customer, evidence).expect(200);
    const ticket = await tickets.create(
      {
        submissionKey: key,
        subject: 'Integrity fictional request',
        body: 'Retain integrity.',
        attachmentIds: [file.id],
      },
      customer,
      context,
    );
    const production = new TicketAttachmentService(
      prisma,
      { ...env, NODE_ENV: 'production' },
      tickets,
    );
    await expect(
      production.download(file.id, customer, context),
    ).rejects.toThrow();
    const row = await prisma.ticketAttachment.findUniqueOrThrow({
      where: { id: file.id },
    });
    await prisma.ticketAttachmentBlob.update({
      where: { id: row.blobId! },
      data: { content: new Uint8Array(Buffer.from('Corrupt fictional bytes')) },
    });
    await http(customer)
      .agent.get(`/tickets/attachments/${file.id}/download`)
      .expect(410);
    await expect(
      files.create(
        {
          submissionKey: randomUUID(),
          messageSubmissionKey: randomUUID(),
          ticketId: ticket.id,
          filename: 'support.log',
          mediaType: 'text/plain',
          sizeBytes: 10,
        },
        { ...customer, supportAdministratorId: owner.identity.userId },
        context,
      ),
    ).rejects.toThrow();
    const invalid = apiEnvironmentSchema.safeParse({
      ...process.env,
      NODE_ENV: 'production',
      PORT: '3001',
      TICKET_ATTACHMENT_SCANNER: 'fake',
    });
    expect(invalid.success).toBe(false);
    if (!invalid.success)
      expect(
        invalid.error.issues.some(
          (issue) => issue.path[0] === 'TICKET_ATTACHMENT_SCANNER',
        ),
      ).toBe(true);
    const audit = await prisma.activityLog.findMany({
      where: { entityType: 'TICKET_ATTACHMENT', actorUserId: { in: users } },
    });
    expect(audit.length).toBeGreaterThan(0);
    expect(JSON.stringify(audit)).not.toContain(evidence.toString());
  });

  function streamRequest() {
    const stream = new PassThrough();
    return Object.assign(stream, {
      headers: {
        'content-type': 'application/octet-stream',
        'content-length': String(evidence.length),
      },
      aborted: false,
    });
  }
  async function untilUploading(id: string) {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (
        (await prisma.ticketAttachment.findUniqueOrThrow({ where: { id } }))
          .status === 'UPLOADING'
      )
        return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error('Fictional upload did not start');
  }
  async function intent(
    who: AuthRequestContext,
    key: string,
    ticketId?: string,
    bytes = evidence,
    filename = 'fictional.log',
    mediaType: 'text/plain' | 'image/png' | 'image/jpeg' = 'text/plain',
  ) {
    return files.create(
      {
        submissionKey: randomUUID(),
        messageSubmissionKey: key,
        ...(ticketId
          ? { ticketId }
          : { departmentId: defaultSupportDepartmentId }),
        filename,
        mediaType,
        sizeBytes: bytes.length,
      },
      who,
      context,
    );
  }
  function put(id: string, who: AuthRequestContext, bytes: Buffer) {
    const client = clients.get(who.identity.userId)!;
    return client.agent
      .put(`/tickets/attachment-uploads/${id}/content`)
      .set('X-CSRF-Token', client.csrf)
      .set('Content-Type', 'application/octet-stream')
      .send(bytes);
  }
  function http(who: AuthRequestContext) {
    return clients.get(who.identity.userId)!;
  }
  async function actor(
    role:
      | 'CUSTOMER'
      | 'FULL_ADMINISTRATOR'
      | 'SUPPORT_OPERATOR'
      | 'BILLING_OPERATOR',
  ): Promise<AuthRequestContext> {
    const totp = module.get(TotpService);
    const mfa = role === 'FULL_ADMINISTRATOR' || role === 'SUPPORT_OPERATOR';
    const user = await prisma.user.create({
      data: {
        email: `c217-${randomUUID()}@example.test`,
        role: role === 'CUSTOMER' ? 'CUSTOMER' : 'ADMIN',
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
        ...(role === 'CUSTOMER'
          ? {
              customer: {
                create: {
                  customerNumber: `C217-${randomUUID().slice(0, 8)}`,
                  firstName: 'Fictional',
                  lastName: 'Attachment customer',
                  addressLine1: '217 Fictional Road',
                  city: 'Dhaka',
                  countryCode: 'BD',
                },
              },
            }
          : {
              adminProfile: {
                create: {
                  displayName: 'Fictional attachment staff',
                  staffRole: role,
                },
              },
            }),
        ...(mfa
          ? {
              adminTotpCredential: {
                create: {
                  secretCiphertext: totp.encryptSecret(totp.generateSecret()),
                  keyVersion: 'test',
                  createdAt: new Date(),
                  enabledAt: new Date(),
                },
              },
            }
          : {}),
      },
      include: { customer: true, adminProfile: true },
    });
    users.push(user.id);
    const token = randomBytes(32).toString('hex');
    const now = new Date();
    const session = await prisma.authSession.create({
      data: {
        userId: user.id,
        createdAt: now,
        tokenHash: createHash('sha256').update(token).digest('hex'),
        expiresAt: new Date(Date.now() + 3600000),
        twoFactorVerifiedAt: mfa ? now : null,
      },
    });
    const agent = request.agent(app.getHttpServer());
    agent.set('Cookie', `webhost_session=${token}`);
    const response = await agent.get('/auth/csrf').expect(200);
    const csrf = (response.body as { data: { csrfToken: string } }).data
      .csrfToken;
    clients.set(user.id, { agent, csrf });
    return {
      sessionId: session.id,
      identity:
        role === 'CUSTOMER'
          ? {
              userId: user.id,
              email: user.email,
              role: 'CUSTOMER',
              customerId: user.customer!.id,
            }
          : {
              userId: user.id,
              email: user.email,
              role: 'ADMIN',
              adminProfileId: user.adminProfile!.id,
              staffRole: role,
              twoFactorEnabled: mfa,
            },
    };
  }
});
