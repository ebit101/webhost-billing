import { createHmac } from 'node:crypto';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { ApiEnvironment } from '@webhost-billing/config';
import {
  HostingPanelErrorKind,
  HostingPanelOperationStatus,
  HostingPanelOperationType,
  OrderStatus,
  Prisma,
  ServiceStatus,
  type PrismaClient,
} from '@webhost-billing/database';
import {
  createPaginationMeta,
  hostingAccountSchema,
  hostingPanelLoginUrlSchema,
  hostingPanelOperationResultSchema,
  hostingPanelOperationSchema,
  type ExecuteHostingOperationRequest,
  type HostingAccount,
  type HostingPanelOperation,
  type HostingPanelOperationListQuery,
  type HostingPanelOperationResult,
  type PaginationMeta,
  type RetryHostingOperationRequest,
  type TestHostingConnectionRequest,
} from '@webhost-billing/shared';
import { z } from 'zod';
import { ApplicationException } from '../../common/errors/application.exception';
import type { SecurityRequestContext } from '../../common/http/request-context';
import { PRISMA_CLIENT } from '../../infrastructure/database/database.module';
import { API_ENVIRONMENT } from '../../infrastructure/environment/environment.module';
import type { AuthRequestContext } from '../auth/auth.types';
import {
  HostingPanelProviderError,
  normalizeHostingPanelError,
  withHostingPanelTimeout,
} from './hosting-panel.error';
import type {
  HostingAccountReference,
  HostingPanel,
  HostingPanelConnection,
} from './hosting-panel.interface';
import { HostingPanelRegistry } from './hosting-panel.registry';

const PANEL_TIMEOUT_MILLISECONDS = 5_000;
const MAX_MANUAL_ATTEMPTS = 5;

const operationInclude = {
  server: true,
} satisfies Prisma.HostingPanelOperationInclude;
type OperationRecord = Prisma.HostingPanelOperationGetPayload<{
  include: typeof operationInclude;
}>;

const serviceInclude = {
  server: true,
  customer: { include: { user: { select: { email: true } } } },
  orderItem: true,
} satisfies Prisma.ServiceInclude;
type ServiceRecord = Prisma.ServiceGetPayload<{
  include: typeof serviceInclude;
}>;

const provisioningSnapshotSchema = z
  .object({
    hostingPackageIdentifier: z.string().min(1).max(191).optional(),
    packageName: z.string().min(1).max(191).optional(),
  })
  .passthrough();

interface ExecutionOptions {
  retryOfOperationId?: string;
  attemptNumber?: number;
}

interface ProviderSuccess {
  account: HostingAccount | null;
  loginUrl: string | null;
  metadata: Prisma.InputJsonObject;
}

@Injectable()
export class HostingPanelService {
  private readonly fingerprintKey: string;

  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    @Inject(API_ENVIRONMENT) environment: ApiEnvironment,
    private readonly registry: HostingPanelRegistry,
  ) {
    this.fingerprintKey = environment.CREDENTIAL_ENCRYPTION_KEY;
  }

  async list(query: HostingPanelOperationListQuery): Promise<{
    data: HostingPanelOperation[];
    pagination: PaginationMeta;
  }> {
    const where: Prisma.HostingPanelOperationWhereInput = {
      ...(query.serviceId ? { serviceId: query.serviceId } : {}),
      ...(query.serverId ? { serverId: query.serverId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.type ? { type: query.type } : {}),
    };
    const [records, totalItems] = await this.prisma.$transaction([
      this.prisma.hostingPanelOperation.findMany({
        where,
        include: operationInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.hostingPanelOperation.count({ where }),
    ]);
    return {
      data: records.map((record) => this.toOperation(record)),
      pagination: createPaginationMeta(query.page, query.pageSize, totalItems),
    };
  }

  execute(
    serviceId: string,
    input: ExecuteHostingOperationRequest,
    actor: AuthRequestContext,
    context: SecurityRequestContext,
  ): Promise<HostingPanelOperationResult> {
    if (actor.identity.role !== 'ADMIN') {
      throw this.forbidden('Only administrators can run hosting operations.');
    }
    return this.executeServiceOperation(serviceId, input, actor, context, {});
  }

  async generateCustomerLogin(
    serviceId: string,
    submissionKey: string,
    actor: AuthRequestContext,
    context: SecurityRequestContext,
  ): Promise<HostingPanelOperationResult> {
    if (
      actor.identity.role !== 'CUSTOMER' ||
      actor.identity.customerId !==
        (
          await this.prisma.service.findUnique({
            where: { id: serviceId },
            select: { customerId: true },
          })
        )?.customerId
    ) {
      throw this.forbidden('You do not have access to this service.');
    }
    return this.executeServiceOperation(
      serviceId,
      { type: 'GENERATE_LOGIN_URL', submissionKey },
      actor,
      context,
      {},
    );
  }

  async testConnection(
    serverId: string,
    input: TestHostingConnectionRequest,
    actor: AuthRequestContext,
    context: SecurityRequestContext,
  ): Promise<HostingPanelOperationResult> {
    return this.executeConnectionTest(serverId, input, actor, context, {});
  }

  private async executeConnectionTest(
    serverId: string,
    input: TestHostingConnectionRequest,
    actor: AuthRequestContext,
    context: SecurityRequestContext,
    options: ExecutionOptions,
  ): Promise<HostingPanelOperationResult> {
    if (actor.identity.role !== 'ADMIN') {
      throw this.forbidden('Only administrators can test panel connections.');
    }
    const server = await this.prisma.server.findFirst({
      where: { id: serverId, deletedAt: null },
    });
    if (!server) throw this.notFound('Server was not found.');
    const fingerprint = this.fingerprint({ serverId, type: 'TEST_CONNECTION' });
    const idempotencyKey = `hosting-operation:${input.submissionKey}`;
    const duplicate = await this.findDuplicate(idempotencyKey, fingerprint);
    if (duplicate) return this.result(duplicate, true, null);
    let operation: OperationRecord;
    try {
      operation = await this.createOperation({
        serviceId: null,
        serverId,
        requestedByUserId: actor.identity.userId,
        type: HostingPanelOperationType.TEST_CONNECTION,
        adapterKey: server.adapterKey,
        idempotencyKey,
        requestFingerprint: fingerprint,
        attemptNumber: options.attemptNumber ?? 1,
        retryOfOperationId: options.retryOfOperationId,
        requestMetadata: {},
        context,
      });
    } catch (error) {
      if (!this.isUniqueConstraintError(error)) throw error;
      const raced = await this.findDuplicate(idempotencyKey, fingerprint);
      if (raced) return this.result(raced, true, null);
      throw this.conflict('The connection test could not be created safely.');
    }
    let providerResult: Awaited<ReturnType<HostingPanel['testConnection']>>;
    try {
      const panel = this.registry.get(server.adapterKey);
      providerResult = await withHostingPanelTimeout(
        panel.testConnection(this.connection(server)),
        PANEL_TIMEOUT_MILLISECONDS,
        false,
      );
    } catch (error) {
      const completed = await this.completeFailure(
        operation.id,
        normalizeHostingPanelError(error, false),
        actor,
        context,
      );
      return this.result(completed, false, null);
    }
    const completed = await this.completeSuccess(operation.id, actor, context, {
      account: null,
      loginUrl: null,
      metadata: {
        providerVersion: providerResult.providerVersion,
        capabilities: providerResult.capabilities,
      },
    });
    return this.result(completed, false, null);
  }

  async retry(
    operationId: string,
    input: RetryHostingOperationRequest,
    actor: AuthRequestContext,
    context: SecurityRequestContext,
  ): Promise<HostingPanelOperationResult> {
    if (actor.identity.role !== 'ADMIN') {
      throw this.forbidden('Only administrators can retry hosting operations.');
    }
    const original = await this.prisma.hostingPanelOperation.findUnique({
      where: { id: operationId },
      include: operationInclude,
    });
    if (!original) throw this.notFound('Hosting operation was not found.');
    if (
      original.status !== HostingPanelOperationStatus.FAILED ||
      !original.retryable
    ) {
      throw this.invalid(
        'Only a safely retryable failed hosting operation can be retried.',
      );
    }
    if (original.attemptNumber >= MAX_MANUAL_ATTEMPTS) {
      throw this.invalid('The manual retry limit has been reached.');
    }
    if (!original.serviceId) {
      const fingerprint = this.fingerprint({
        serverId: original.serverId,
        type: 'TEST_CONNECTION',
      });
      const duplicate = await this.findDuplicate(
        `hosting-operation:${input.submissionKey}`,
        fingerprint,
      );
      if (duplicate) return this.result(duplicate, true, null);
      await this.assertNotAlreadyRetried(original.id);
      return this.executeConnectionTest(
        original.serverId,
        { submissionKey: input.submissionKey },
        actor,
        context,
        {
          retryOfOperationId: original.id,
          attemptNumber: original.attemptNumber + 1,
        },
      );
    }
    const reconstructed = this.reconstruct(original, input);
    const duplicate = await this.findDuplicate(
      `hosting-operation:${reconstructed.submissionKey}`,
      this.fingerprint({ serviceId: original.serviceId, ...reconstructed }),
    );
    if (duplicate) return this.result(duplicate, true, null);
    await this.assertNotAlreadyRetried(original.id);
    return this.executeServiceOperation(
      original.serviceId,
      reconstructed,
      actor,
      context,
      {
        retryOfOperationId: original.id,
        attemptNumber: original.attemptNumber + 1,
      },
    );
  }

  private async executeServiceOperation(
    serviceId: string,
    input: ExecuteHostingOperationRequest,
    actor: AuthRequestContext,
    context: SecurityRequestContext,
    options: ExecutionOptions,
  ): Promise<HostingPanelOperationResult> {
    const safeMetadata = this.safeRequestMetadata(input);
    const fingerprint = this.fingerprint({ serviceId, ...input });
    const idempotencyKey = `hosting-operation:${input.submissionKey}`;
    const duplicate = await this.findDuplicate(idempotencyKey, fingerprint);
    if (duplicate) return this.result(duplicate, true, null);

    const prepared = await this.prisma
      .$transaction(async (transaction) => {
        await transaction.$queryRaw`
        SELECT "id" FROM "services"
        WHERE "id" = ${serviceId}::uuid FOR UPDATE
      `;
        const concurrentDuplicate =
          await transaction.hostingPanelOperation.findUnique({
            where: { idempotencyKey },
            include: operationInclude,
          });
        if (concurrentDuplicate) {
          if (concurrentDuplicate.requestFingerprint !== fingerprint) {
            throw this.conflict(
              'The submission key was already used for another request.',
            );
          }
          return { duplicate: concurrentDuplicate } as const;
        }
        const service = await transaction.service.findUnique({
          where: { id: serviceId },
          include: serviceInclude,
        });
        if (!service) throw this.notFound('Service was not found.');
        this.validateAction(service, input);
        const running = await transaction.hostingPanelOperation.findFirst({
          where: { serviceId, status: HostingPanelOperationStatus.RUNNING },
        });
        if (running) {
          throw this.conflict('Another hosting operation is already running.');
        }
        const operation = await transaction.hostingPanelOperation.create({
          data: {
            serviceId,
            serverId: service.serverId,
            requestedByUserId: actor.identity.userId,
            retryOfOperationId: options.retryOfOperationId,
            type: input.type,
            adapterKey: service.server.adapterKey,
            idempotencyKey,
            requestFingerprint: fingerprint,
            attemptNumber: options.attemptNumber ?? 1,
            requestMetadata: safeMetadata,
          },
          include: operationInclude,
        });
        if (input.type === 'CREATE_ACCOUNT') {
          await transaction.service.update({
            where: { id: serviceId },
            data: {
              status: ServiceStatus.PROVISIONING,
              provisioningFailureReason: null,
            },
          });
        }
        await transaction.activityLog.create({
          data: {
            actorUserId: actor.identity.userId,
            action: 'HOSTING_PANEL_OPERATION_STARTED',
            entityType: 'SERVICE',
            entityId: serviceId,
            correlationId: operation.id,
            ipAddressHash: context.ipAddressHash,
            metadata: {
              operationType: input.type,
              adapterKey: service.server.adapterKey,
              attemptNumber: operation.attemptNumber,
            },
          },
        });
        return { duplicate: null, operation, service } as const;
      })
      .catch(async (error: unknown) => {
        if (!this.isUniqueConstraintError(error)) throw error;
        const raced = await this.findDuplicate(idempotencyKey, fingerprint);
        if (raced) return { duplicate: raced } as const;
        throw this.conflict(
          'The hosting operation could not be created safely.',
        );
      });

    if (prepared.duplicate) {
      return this.result(prepared.duplicate, true, null);
    }

    let providerResult: ProviderSuccess;
    try {
      const panel = this.registry.get(prepared.service.server.adapterKey);
      providerResult = await this.callProvider(
        panel,
        prepared.service,
        input,
        idempotencyKey,
      );
      this.validateProviderResult(
        prepared.service,
        input.type,
        providerResult.account,
      );
    } catch (error) {
      const normalized = normalizeHostingPanelError(
        error,
        this.isMutation(input.type),
      );
      const completed = await this.completeFailure(
        prepared.operation.id,
        normalized,
        actor,
        context,
      );
      return this.result(completed, false, null);
    }
    const completed = await this.completeSuccess(
      prepared.operation.id,
      actor,
      context,
      providerResult,
      input,
    );
    return this.result(completed, false, providerResult.loginUrl);
  }

  private async callProvider(
    panel: HostingPanel,
    service: ServiceRecord,
    input: ExecuteHostingOperationRequest,
    idempotencyKey: string,
  ): Promise<ProviderSuccess> {
    const connection = this.connection(service.server);
    if (input.type === 'CREATE_ACCOUNT') {
      const created = await withHostingPanelTimeout(
        panel.createAccount(connection, {
          serviceReference: service.id,
          domain: service.domain ?? '',
          packageIdentifier: this.packageIdentifier(
            service.provisioningSnapshot,
          ),
          contactEmail: service.customer.user.email,
          idempotencyKey,
        }),
        PANEL_TIMEOUT_MILLISECONDS,
        true,
      );
      return {
        account: created.account,
        loginUrl: null,
        metadata: { account: created.account, created: created.created },
      };
    }
    const reference = this.reference(service);
    let account: HostingAccount | null = null;
    let loginUrl: string | null = null;
    let metadata: Prisma.InputJsonObject = {};
    if (input.type === 'GET_ACCOUNT') {
      account = await withHostingPanelTimeout(
        panel.getAccount(connection, reference),
        PANEL_TIMEOUT_MILLISECONDS,
        false,
      );
      metadata = { account };
    } else if (input.type === 'SUSPEND_ACCOUNT') {
      account = await withHostingPanelTimeout(
        panel.suspendAccount(connection, reference, input.reason),
        PANEL_TIMEOUT_MILLISECONDS,
        true,
      );
      metadata = { account };
    } else if (input.type === 'UNSUSPEND_ACCOUNT') {
      account = await withHostingPanelTimeout(
        panel.unsuspendAccount(connection, reference),
        PANEL_TIMEOUT_MILLISECONDS,
        true,
      );
      metadata = { account };
    } else if (input.type === 'CHANGE_PACKAGE') {
      account = await withHostingPanelTimeout(
        panel.changePackage(connection, reference, input.packageIdentifier),
        PANEL_TIMEOUT_MILLISECONDS,
        true,
      );
      metadata = { account };
    } else if (input.type === 'CHANGE_PASSWORD') {
      account = await withHostingPanelTimeout(
        panel.changePassword(connection, reference, input.newPassword),
        PANEL_TIMEOUT_MILLISECONDS,
        true,
      );
      metadata = { account };
    } else if (input.type === 'GENERATE_LOGIN_URL') {
      const login = await withHostingPanelTimeout(
        panel.generateLoginUrl(connection, reference),
        PANEL_TIMEOUT_MILLISECONDS,
        false,
      );
      loginUrl = hostingPanelLoginUrlSchema.parse(login.url);
      metadata = { loginExpiresAt: login.expiresAt.toISOString() };
    } else {
      await withHostingPanelTimeout(
        panel.terminateAccount(connection, reference, input.reason),
        PANEL_TIMEOUT_MILLISECONDS,
        true,
      );
      metadata = { terminated: true };
    }
    return { account, loginUrl, metadata };
  }

  private async completeSuccess(
    operationId: string,
    actor: AuthRequestContext,
    context: SecurityRequestContext,
    providerResult: ProviderSuccess,
    input?: ExecuteHostingOperationRequest,
  ): Promise<OperationRecord> {
    return this.prisma.$transaction(async (transaction) => {
      const now = new Date();
      const current = await transaction.hostingPanelOperation.findUniqueOrThrow(
        {
          where: { id: operationId },
        },
      );
      if (current.serviceId) {
        await transaction.$queryRaw`
          SELECT "id" FROM "services"
          WHERE "id" = ${current.serviceId}::uuid FOR UPDATE
        `;
        await this.applyServiceSuccess(
          transaction,
          current.serviceId,
          input?.type,
          input,
          providerResult.account,
          actor.identity.userId,
          now,
        );
      }
      const operation = await transaction.hostingPanelOperation.update({
        where: { id: operationId },
        data: {
          status: HostingPanelOperationStatus.SUCCEEDED,
          completedAt: now,
          resultMetadata: providerResult.metadata,
        },
        include: operationInclude,
      });
      await transaction.activityLog.create({
        data: {
          actorUserId: actor.identity.userId,
          action: 'HOSTING_PANEL_OPERATION_SUCCEEDED',
          entityType: current.serviceId ? 'SERVICE' : 'SERVER',
          entityId: current.serviceId ?? current.serverId,
          correlationId: operationId,
          ipAddressHash: context.ipAddressHash,
          metadata: {
            operationType: current.type,
            adapterKey: current.adapterKey,
            attemptNumber: current.attemptNumber,
          },
        },
      });
      return operation;
    });
  }

  private async completeFailure(
    operationId: string,
    error: HostingPanelProviderError,
    actor: AuthRequestContext,
    context: SecurityRequestContext,
  ): Promise<OperationRecord> {
    return this.prisma.$transaction(async (transaction) => {
      const current = await transaction.hostingPanelOperation.findUniqueOrThrow(
        {
          where: { id: operationId },
        },
      );
      const now = new Date();
      if (current.serviceId && current.type === 'CREATE_ACCOUNT') {
        await transaction.service.update({
          where: { id: current.serviceId },
          data: {
            status: ServiceStatus.PROVISION_FAILED,
            provisioningFailureReason: error.message,
          },
        });
      }
      const retryable = error.kind === HostingPanelErrorKind.TEMPORARY;
      const operation = await transaction.hostingPanelOperation.update({
        where: { id: operationId },
        data: {
          status:
            error.kind === HostingPanelErrorKind.INCONSISTENT
              ? HostingPanelOperationStatus.INCONSISTENT
              : HostingPanelOperationStatus.FAILED,
          retryable,
          errorKind: error.kind,
          errorCode: error.code,
          errorMessage: error.message,
          completedAt: now,
        },
        include: operationInclude,
      });
      await transaction.activityLog.create({
        data: {
          actorUserId: actor.identity.userId,
          action: 'HOSTING_PANEL_OPERATION_FAILED',
          entityType: current.serviceId ? 'SERVICE' : 'SERVER',
          entityId: current.serviceId ?? current.serverId,
          correlationId: operationId,
          ipAddressHash: context.ipAddressHash,
          metadata: {
            operationType: current.type,
            adapterKey: current.adapterKey,
            errorKind: error.kind,
            errorCode: error.code,
            retryable,
            attemptNumber: current.attemptNumber,
          },
        },
      });
      return operation;
    });
  }

  private async applyServiceSuccess(
    transaction: Prisma.TransactionClient,
    serviceId: string,
    type: ExecuteHostingOperationRequest['type'] | undefined,
    input: ExecuteHostingOperationRequest | undefined,
    account: HostingAccount | null,
    actorUserId: string,
    now: Date,
  ): Promise<void> {
    if (type === 'CREATE_ACCOUNT' && account) {
      const service = await transaction.service.update({
        where: { id: serviceId },
        data: {
          status: ServiceStatus.ACTIVE,
          externalAccountId: account.externalAccountId,
          controlPanelUsername: account.username,
          activatedAt: now,
          provisioningFailureReason: null,
        },
        include: { orderItem: true },
      });
      if (service.orderItem) {
        const remaining = await transaction.orderItem.count({
          where: {
            orderId: service.orderItem.orderId,
            OR: [
              { service: { is: null } },
              { service: { is: { status: { not: ServiceStatus.ACTIVE } } } },
            ],
          },
        });
        if (remaining === 0) {
          await transaction.order.updateMany({
            where: {
              id: service.orderItem.orderId,
              status: OrderStatus.PROCESSING,
            },
            data: { status: OrderStatus.COMPLETED, completedAt: now },
          });
        }
      }
    } else if (
      type === 'SUSPEND_ACCOUNT' &&
      input?.type === 'SUSPEND_ACCOUNT'
    ) {
      await transaction.service.update({
        where: { id: serviceId },
        data: {
          status: ServiceStatus.SUSPENDED,
          suspendedAt: now,
          suspensionReason: input.reason,
        },
      });
    } else if (type === 'UNSUSPEND_ACCOUNT') {
      await transaction.service.update({
        where: { id: serviceId },
        data: { status: ServiceStatus.ACTIVE },
      });
    } else if (
      type === 'TERMINATE_ACCOUNT' &&
      input?.type === 'TERMINATE_ACCOUNT'
    ) {
      await transaction.service.update({
        where: { id: serviceId },
        data: {
          status: ServiceStatus.TERMINATED,
          terminatedAt: now,
          terminationReason: input.reason,
          terminatedBy: { connect: { id: actorUserId } },
        },
      });
    }
  }

  private validateAction(
    service: ServiceRecord,
    input: ExecuteHostingOperationRequest,
  ): void {
    if (service.server.status !== 'ACTIVE' || service.server.deletedAt) {
      throw this.invalid('The assigned server is not active.');
    }
    if (input.type === 'CREATE_ACCOUNT') {
      if (
        service.status !== ServiceStatus.PENDING &&
        service.status !== ServiceStatus.PROVISION_FAILED
      ) {
        throw this.invalid(
          'Only a pending or failed service can be provisioned.',
        );
      }
      if (!service.domain) throw this.invalid('The service has no domain.');
      this.packageIdentifier(service.provisioningSnapshot);
      return;
    }
    this.reference(service);
    if (
      input.type === 'SUSPEND_ACCOUNT' &&
      service.status !== ServiceStatus.ACTIVE
    ) {
      throw this.invalid('Only an active service can be suspended.');
    }
    if (
      input.type === 'UNSUSPEND_ACCOUNT' &&
      service.status !== ServiceStatus.SUSPENDED
    ) {
      throw this.invalid('Only a suspended service can be unsuspended.');
    }
    if (
      ['GET_ACCOUNT', 'CHANGE_PACKAGE', 'CHANGE_PASSWORD'].includes(
        input.type,
      ) &&
      !this.isActiveOrSuspended(service.status)
    ) {
      throw this.invalid(
        'The service does not have a manageable panel account.',
      );
    }
    if (
      input.type === 'GENERATE_LOGIN_URL' &&
      service.status !== ServiceStatus.ACTIVE
    ) {
      throw this.invalid('Panel login is available only for active services.');
    }
    if (
      input.type === 'TERMINATE_ACCOUNT' &&
      !this.isActiveOrSuspended(service.status)
    ) {
      throw this.invalid(
        'Only an active or suspended service can be terminated.',
      );
    }
  }

  private validateProviderResult(
    service: ServiceRecord,
    type: ExecuteHostingOperationRequest['type'],
    account: HostingAccount | null,
  ): void {
    if (type === 'GENERATE_LOGIN_URL' || type === 'TERMINATE_ACCOUNT') return;
    if (!account) throw this.inconsistent('PANEL_ACCOUNT_RESULT_MISSING');
    hostingAccountSchema.parse(account);
    if (account.domain !== service.domain) {
      throw this.inconsistent('PANEL_ACCOUNT_DOMAIN_MISMATCH');
    }
    if (type !== 'CREATE_ACCOUNT') {
      if (
        account.externalAccountId !== service.externalAccountId ||
        account.username !== service.controlPanelUsername
      ) {
        throw this.inconsistent('PANEL_ACCOUNT_IDENTITY_MISMATCH');
      }
    }
    const expectedState =
      type === 'SUSPEND_ACCOUNT'
        ? 'SUSPENDED'
        : type === 'UNSUSPEND_ACCOUNT' || type === 'CREATE_ACCOUNT'
          ? 'ACTIVE'
          : service.status;
    if (
      (expectedState === ServiceStatus.ACTIVE && account.state !== 'ACTIVE') ||
      (expectedState === ServiceStatus.SUSPENDED &&
        account.state !== 'SUSPENDED')
    ) {
      throw this.inconsistent('PANEL_ACCOUNT_STATE_MISMATCH');
    }
  }

  private reconstruct(
    original: OperationRecord,
    input: RetryHostingOperationRequest,
  ): ExecuteHostingOperationRequest {
    const metadata = this.metadataObject(original.requestMetadata);
    if (
      original.type === 'CREATE_ACCOUNT' ||
      original.type === 'GET_ACCOUNT' ||
      original.type === 'UNSUSPEND_ACCOUNT' ||
      original.type === 'GENERATE_LOGIN_URL'
    ) {
      return { type: original.type, submissionKey: input.submissionKey };
    }
    if (original.type === 'SUSPEND_ACCOUNT') {
      return {
        type: 'SUSPEND_ACCOUNT',
        submissionKey: input.submissionKey,
        reason: this.metadataString(metadata, 'reason'),
      };
    }
    if (original.type === 'CHANGE_PACKAGE') {
      return {
        type: 'CHANGE_PACKAGE',
        submissionKey: input.submissionKey,
        packageIdentifier: this.metadataString(metadata, 'packageIdentifier'),
      };
    }
    if (original.type === 'CHANGE_PASSWORD') {
      if (!input.newPassword) {
        throw this.invalid(
          'A new password is required to retry this operation.',
        );
      }
      return {
        type: 'CHANGE_PASSWORD',
        submissionKey: input.submissionKey,
        newPassword: input.newPassword,
      };
    }
    if (original.type === 'TERMINATE_ACCOUNT') {
      if (input.confirmation !== 'TERMINATE') {
        throw this.invalid('Termination confirmation is required again.');
      }
      return {
        type: 'TERMINATE_ACCOUNT',
        submissionKey: input.submissionKey,
        reason: this.metadataString(metadata, 'reason'),
        confirmation: 'TERMINATE',
      };
    }
    throw this.invalid('This operation cannot be retried.');
  }

  private safeRequestMetadata(
    input: ExecuteHostingOperationRequest,
  ): Prisma.InputJsonObject {
    if (
      input.type === 'SUSPEND_ACCOUNT' ||
      input.type === 'TERMINATE_ACCOUNT'
    ) {
      return { reason: input.reason };
    }
    if (input.type === 'CHANGE_PACKAGE') {
      return { packageIdentifier: input.packageIdentifier };
    }
    if (input.type === 'CHANGE_PASSWORD') {
      return { secretInput: 'REDACTED' };
    }
    return {};
  }

  private async createOperation(input: {
    serviceId: string | null;
    serverId: string;
    requestedByUserId: string;
    type: HostingPanelOperationType;
    adapterKey: string;
    idempotencyKey: string;
    requestFingerprint: string;
    attemptNumber: number;
    retryOfOperationId?: string;
    requestMetadata: Prisma.InputJsonObject;
    context: SecurityRequestContext;
  }): Promise<OperationRecord> {
    return this.prisma.$transaction(async (transaction) => {
      const operation = await transaction.hostingPanelOperation.create({
        data: {
          serviceId: input.serviceId,
          serverId: input.serverId,
          requestedByUserId: input.requestedByUserId,
          retryOfOperationId: input.retryOfOperationId,
          type: input.type,
          adapterKey: input.adapterKey,
          idempotencyKey: input.idempotencyKey,
          requestFingerprint: input.requestFingerprint,
          attemptNumber: input.attemptNumber,
          requestMetadata: input.requestMetadata,
        },
        include: operationInclude,
      });
      await transaction.activityLog.create({
        data: {
          actorUserId: input.requestedByUserId,
          action: 'HOSTING_PANEL_OPERATION_STARTED',
          entityType: 'SERVER',
          entityId: input.serverId,
          correlationId: operation.id,
          ipAddressHash: input.context.ipAddressHash,
          metadata: {
            operationType: input.type,
            adapterKey: input.adapterKey,
            attemptNumber: input.attemptNumber,
          },
        },
      });
      return operation;
    });
  }

  private async findDuplicate(
    idempotencyKey: string,
    fingerprint: string,
  ): Promise<OperationRecord | null> {
    const duplicate = await this.prisma.hostingPanelOperation.findUnique({
      where: { idempotencyKey },
      include: operationInclude,
    });
    if (!duplicate) return null;
    if (duplicate.requestFingerprint !== fingerprint) {
      throw this.conflict(
        'The submission key was already used for another request.',
      );
    }
    return duplicate;
  }

  private async assertNotAlreadyRetried(operationId: string): Promise<void> {
    const existingRetry = await this.prisma.hostingPanelOperation.findFirst({
      where: { retryOfOperationId: operationId },
      select: { id: true },
    });
    if (existingRetry) {
      throw this.conflict('This hosting operation already has a manual retry.');
    }
  }

  private result(
    operation: OperationRecord,
    duplicate: boolean,
    loginUrl: string | null,
  ): HostingPanelOperationResult {
    return hostingPanelOperationResultSchema.parse({
      operation: this.toOperation(operation),
      duplicate,
      loginUrl,
    });
  }

  private toOperation(operation: OperationRecord): HostingPanelOperation {
    const result = this.metadataObject(operation.resultMetadata);
    const accountResult = result.account;
    return hostingPanelOperationSchema.parse({
      id: operation.id,
      serviceId: operation.serviceId,
      server: {
        id: operation.server.id,
        name: operation.server.name,
        hostname: operation.server.hostname,
        status: operation.server.status,
        adapterKey: operation.server.adapterKey,
      },
      requestedByUserId: operation.requestedByUserId,
      retryOfOperationId: operation.retryOfOperationId,
      type: operation.type,
      status: operation.status,
      adapterKey: operation.adapterKey,
      attemptNumber: operation.attemptNumber,
      retryable: operation.retryable,
      errorKind: operation.errorKind,
      errorCode: operation.errorCode,
      errorMessage: operation.errorMessage,
      account:
        accountResult === undefined
          ? null
          : (hostingAccountSchema.safeParse(accountResult).data ?? null),
      startedAt: operation.startedAt.toISOString(),
      completedAt: operation.completedAt?.toISOString() ?? null,
      createdAt: operation.createdAt.toISOString(),
    });
  }

  private connection(server: {
    id: string;
    hostname: string;
    port: number;
    useTls: boolean;
    apiUsername: string | null;
  }): HostingPanelConnection {
    return {
      serverId: server.id,
      hostname: server.hostname,
      port: server.port,
      useTls: server.useTls,
      apiUsername: server.apiUsername,
      credential: null,
    };
  }

  private reference(service: {
    externalAccountId: string | null;
    controlPanelUsername: string | null;
    domain: string | null;
    provisioningSnapshot: Prisma.JsonValue | null;
  }): HostingAccountReference {
    if (
      !service.externalAccountId ||
      !service.controlPanelUsername ||
      !service.domain
    ) {
      throw this.invalid('The service has no external panel account identity.');
    }
    return {
      externalAccountId: service.externalAccountId,
      username: service.controlPanelUsername,
      domain: service.domain,
      packageIdentifier: this.packageIdentifier(service.provisioningSnapshot),
    };
  }

  private packageIdentifier(value: Prisma.JsonValue | null): string {
    const parsed = provisioningSnapshotSchema.safeParse(value);
    const identifier =
      parsed.success &&
      (parsed.data.hostingPackageIdentifier ?? parsed.data.packageName);
    if (!identifier) {
      throw this.invalid('The service has no hosting package identifier.');
    }
    return identifier;
  }

  private isMutation(type: ExecuteHostingOperationRequest['type']): boolean {
    return !['GET_ACCOUNT', 'GENERATE_LOGIN_URL'].includes(type);
  }

  private isActiveOrSuspended(status: ServiceStatus): boolean {
    return (
      status === ServiceStatus.ACTIVE || status === ServiceStatus.SUSPENDED
    );
  }

  private fingerprint(value: unknown): string {
    return createHmac('sha256', this.fingerprintKey)
      .update(JSON.stringify(value))
      .digest('hex');
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    );
  }

  private metadataObject(
    value: Prisma.JsonValue | null,
  ): Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? value
      : {};
  }

  private metadataString(
    metadata: Record<string, unknown>,
    key: string,
  ): string {
    const value = metadata[key];
    if (typeof value !== 'string') {
      throw this.invalid('The retry metadata is incomplete.');
    }
    return value;
  }

  private inconsistent(code: string): HostingPanelProviderError {
    return new HostingPanelProviderError(
      'INCONSISTENT',
      code,
      'The hosting panel account does not match the service record. Reconciliation is required.',
    );
  }

  private forbidden(message: string): ApplicationException {
    return new ApplicationException({
      status: HttpStatus.FORBIDDEN,
      code: 'FORBIDDEN',
      message,
    });
  }

  private notFound(message: string): ApplicationException {
    return new ApplicationException({
      status: HttpStatus.NOT_FOUND,
      code: 'RESOURCE_NOT_FOUND',
      message,
    });
  }

  private invalid(message: string): ApplicationException {
    return new ApplicationException({
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      code: 'UNPROCESSABLE_ENTITY',
      message,
    });
  }

  private conflict(message: string): ApplicationException {
    return new ApplicationException({
      status: HttpStatus.CONFLICT,
      code: 'CONFLICT',
      message,
    });
  }
}
