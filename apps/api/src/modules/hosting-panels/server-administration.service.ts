import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { Prisma, type PrismaClient } from '@webhost-billing/database';
import {
  managedServerSchema,
  createCpanelServerRequestSchema,
  serverAdapterKeys,
  type CreateServerRequest,
  type UpdateServerRequest,
  type ManagedServer,
} from '@webhost-billing/shared';
import { randomUUID } from 'node:crypto';
import { ApplicationException } from '../../common/errors/application.exception';
import type { SecurityRequestContext } from '../../common/http/request-context';
import { PRISMA_CLIENT } from '../../infrastructure/database/database.module';
import type { AuthRequestContext } from '../auth/auth.types';
import { CpanelCredentialCipher } from './cpanel-credential-cipher';
import { HostingPanelService } from './hosting-panel.service';

const otherAdapters = ['virtualizor', 'vultr', 'shoutcast'];
const include = { _count: { select: { services: true } } } as const;
type ServerRecord = Prisma.ServerGetPayload<{ include: typeof include }>;

@Injectable()
export class ServerAdministrationService {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    private readonly panels: HostingPanelService,
    private readonly cipher: CpanelCredentialCipher,
  ) {}

  async list(actor: AuthRequestContext): Promise<ManagedServer[]> {
    this.authorize(actor);
    const [cpanel, others] = await Promise.all([
      this.panels.listServers(actor),
      this.prisma.server.findMany({
        where: { deletedAt: null, adapterKey: { in: otherAdapters } },
        include,
      }),
    ]);
    return [...cpanel, ...others.map((server) => this.serialize(server))].sort(
      (a, b) =>
        a.server.name.localeCompare(b.server.name) ||
        a.server.id.localeCompare(b.server.id),
    );
  }

  async create(
    input: CreateServerRequest,
    actor: AuthRequestContext,
    context: SecurityRequestContext,
  ): Promise<ManagedServer> {
    this.authorize(actor);
    if (!('credentials' in input)) {
      const cpanel = createCpanelServerRequestSchema.parse({
        name: input.name,
        hostname: input.hostname,
        port: input.port,
        apiUsername: input.apiUsername,
        apiToken: input.apiToken,
        maxAccounts: input.maxAccounts,
      });
      return this.panels.createServer(cpanel, actor, context);
    }
    const adapterKey = serverAdapterKeys[input.serverType];
    return this.unique(async () =>
      this.prisma.$transaction(async (tx) => {
        const id = randomUUID();
        const record = await tx.server.create({
          data: {
            id,
            name: input.name,
            hostname: input.hostname,
            port: input.port,
            adapterKey,
            status: 'DISABLED',
            useTls: true,
            apiUsername: null,
            maxAccounts: input.maxAccounts,
            credentialsCiphertext: this.cipher.encrypt(
              id,
              JSON.stringify(input.credentials),
            ),
            credentialKeyVersion: this.cipher.keyVersion,
          },
          include,
        });
        await this.audit(tx, id, 'SERVER_CREATED', actor, context, {
          adapterKey,
          status: 'DISABLED',
        });
        return this.serialize(record);
      }),
    );
  }

  async update(
    id: string,
    input: UpdateServerRequest,
    actor: AuthRequestContext,
    context: SecurityRequestContext,
  ): Promise<ManagedServer> {
    this.authorize(actor);
    if (!('serverType' in input))
      return this.panels.updateServer(id, input, actor, context);
    return this.unique(async () =>
      this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "servers" WHERE "id" = ${id}::uuid FOR UPDATE`;
        const current = await tx.server.findFirst({
          where: { id, deletedAt: null },
          include,
        });
        if (
          !current ||
          current.adapterKey !== serverAdapterKeys[input.serverType]
        )
          this.fail(
            'Server type cannot be changed. Add a separate server.',
            HttpStatus.CONFLICT,
          );
        const connectionChanged =
          (input.hostname !== undefined &&
            input.hostname !== current.hostname) ||
          (input.port !== undefined && input.port !== current.port);
        const unresolved = await tx.hostingPanelOperation.count({
          where: { serverId: id, status: { in: ['RUNNING', 'INCONSISTENT'] } },
        });
        if (unresolved || current._count.services > 0)
          this.fail(
            'Resolve assigned services and outstanding operations before editing this connection.',
            HttpStatus.CONFLICT,
          );
        if (connectionChanged && !input.credentials)
          this.fail(
            'Enter new credentials when changing the server connection.',
          );
        const record = await tx.server.update({
          where: { id },
          data: {
            name: input.name,
            hostname: input.hostname,
            port: input.port,
            maxAccounts: input.maxAccounts,
            status: 'DISABLED',
            ...(input.credentials
              ? {
                  credentialsCiphertext: this.cipher.encrypt(
                    id,
                    JSON.stringify(input.credentials),
                  ),
                  credentialKeyVersion: this.cipher.keyVersion,
                }
              : {}),
          },
          include,
        });
        await this.audit(tx, id, 'SERVER_UPDATED', actor, context, {
          adapterKey: current.adapterKey,
          credentialsRotated: Boolean(input.credentials),
          changedFields: Object.keys(input).filter(
            (key) => key !== 'credentials',
          ),
        });
        return this.serialize(record);
      }),
    );
  }

  async remove(
    id: string,
    actor: AuthRequestContext,
    context: SecurityRequestContext,
  ): Promise<{ removed: true }> {
    this.authorize(actor);
    const server = await this.prisma.server.findFirst({
      where: { id, deletedAt: null },
    });
    if (server?.adapterKey === 'cpanel-whm')
      return this.panels.removeServer(id, actor, context);
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "servers" WHERE "id" = ${id}::uuid FOR UPDATE`;
      const current = await tx.server.findFirst({
        where: { id, deletedAt: null, adapterKey: { in: otherAdapters } },
        include,
      });
      if (!current) this.fail('Server was not found.', HttpStatus.NOT_FOUND);
      const unresolved = await tx.hostingPanelOperation.count({
        where: { serverId: id, status: { in: ['RUNNING', 'INCONSISTENT'] } },
      });
      const liveServices = await tx.service.count({
        where: { serverId: id, status: { notIn: ['TERMINATED', 'CANCELLED'] } },
      });
      if (unresolved || liveServices)
        this.fail(
          'Resolve assigned services and uncertain operations before removing this server.',
          HttpStatus.CONFLICT,
        );
      await tx.server.update({
        where: { id },
        data: {
          status: 'DISABLED',
          deletedAt: new Date(),
          credentialsCiphertext: null,
          credentialKeyVersion: null,
          apiUsername: null,
        },
      });
      await this.audit(tx, id, 'SERVER_REMOVED', actor, context, {
        historicalServiceCount: current._count.services,
      });
    });
    return { removed: true };
  }

  private serialize(record: ServerRecord): ManagedServer {
    return managedServerSchema.parse({
      server: {
        id: record.id,
        name: record.name,
        hostname: record.hostname,
        status: record.status,
        adapterKey: record.adapterKey,
      },
      port: record.port,
      useTls: record.useTls,
      apiUsername: null,
      credentialConfigured: Boolean(record.credentialsCiphertext),
      credentialKeyVersion: record.credentialKeyVersion,
      maxAccounts: record.maxAccounts,
      assignedServiceCount: record._count.services,
    });
  }

  private authorize(actor: AuthRequestContext) {
    if (actor.identity.role !== 'ADMIN')
      this.fail(
        'Only administrators can manage servers.',
        HttpStatus.FORBIDDEN,
      );
  }
  private fail(
    message: string,
    status: HttpStatus = HttpStatus.UNPROCESSABLE_ENTITY,
  ): never {
    throw new ApplicationException({
      status,
      code:
        status === HttpStatus.FORBIDDEN
          ? 'FORBIDDEN'
          : status === HttpStatus.NOT_FOUND
            ? 'RESOURCE_NOT_FOUND'
            : status === HttpStatus.CONFLICT
              ? 'CONFLICT'
              : 'VALIDATION_ERROR',
      message,
    });
  }
  private async unique<T>(action: () => Promise<T>): Promise<T> {
    try {
      return await action();
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        this.fail(
          'A server with this name or hostname already exists.',
          HttpStatus.CONFLICT,
        );
      throw error;
    }
  }
  private audit(
    tx: Prisma.TransactionClient,
    id: string,
    action: string,
    actor: AuthRequestContext,
    context: SecurityRequestContext,
    metadata: Prisma.InputJsonObject,
  ) {
    return tx.activityLog.create({
      data: {
        actorUserId: actor.identity.userId,
        action,
        entityType: 'SERVER',
        entityId: id,
        ipAddressHash: context.ipAddressHash,
        metadata,
      },
    });
  }
}
