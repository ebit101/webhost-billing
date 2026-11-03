import { createDecipheriv, createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { WorkerEnvironment } from '@webhost-billing/config';
import {
  HostingPanelErrorKind,
  HostingPanelOperationStatus,
  HostingPanelOperationType,
  InvoiceStatus,
  OutboxStatus,
  ServiceStatus,
  type Prisma,
  type PrismaClient,
} from '@webhost-billing/database';
import { BackgroundJobError } from '@webhost-billing/queue';
import {
  hostingAutomationPayloadSchema,
  hostingCancellationJobSchema,
  type BackgroundJobData,
  type HostingAutomationPayload,
  type HostingCancellationJob,
} from '@webhost-billing/shared';
import { WORKER_PRISMA } from '../infrastructure/database.module';
import { WORKER_ENVIRONMENT } from '../infrastructure/environment.module';
import { CLOCK, type Clock } from './clock';

type PanelState = 'ACTIVE' | 'SUSPENDED';
type AutomationAction = 'SUSPEND' | 'UNSUSPEND';
type AutomationPayload = HostingAutomationPayload | HostingCancellationJob;
const MAX_AUTOMATION_ATTEMPTS = 3;

class PanelAutomationError extends Error {
  constructor(
    readonly kind: 'TEMPORARY' | 'PERMANENT' | 'INCONSISTENT',
    readonly code: string,
  ) {
    super(code);
  }
}

@Injectable()
export class HostingAutomationService {
  constructor(
    @Inject(WORKER_PRISMA) private readonly prisma: PrismaClient,
    @Inject(WORKER_ENVIRONMENT) private readonly environment: WorkerEnvironment,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async process(data: BackgroundJobData): Promise<void> {
    const action = this.action(data.eventType);
    const payload = await this.payload(data);
    const prepared = await this.prepare(action, payload, data.outboxEventId);
    if (!prepared) return;
    const { operation } = prepared;
    if (operation.status === HostingPanelOperationStatus.SUCCEEDED) {
      return;
    }
    if (
      !prepared.fresh &&
      operation.status === HostingPanelOperationStatus.RUNNING
    ) {
      const uncertain = new PanelAutomationError(
        'INCONSISTENT',
        'HOSTING_AUTOMATION_RESULT_UNKNOWN',
      );
      await this.fail(operation.id, operation.attemptNumber, uncertain);
      throw this.jobError(uncertain.kind, uncertain.code);
    }
    if (operation.status !== HostingPanelOperationStatus.RUNNING) {
      if (
        operation.errorKind === HostingPanelErrorKind.TEMPORARY &&
        !operation.retryable
      ) {
        throw this.jobError(
          HostingPanelErrorKind.PERMANENT,
          'HOSTING_AUTOMATION_RETRY_LIMIT',
        );
      }
      throw this.jobError(
        operation.errorKind ?? HostingPanelErrorKind.PERMANENT,
        operation.errorCode ?? 'HOSTING_AUTOMATION_PREVIOUSLY_FAILED',
      );
    }
    let panelMutationVerified = false;
    try {
      const eligible = await this.eligible(action, payload);
      if (!eligible) {
        await this.completeSkipped(operation.id, action, payload);
        return;
      }
      const account = await this.mutatePanel(
        action,
        payload.serviceId,
        'cancellationId' in payload,
      );
      if (account.state !== (action === 'SUSPEND' ? 'SUSPENDED' : 'ACTIVE')) {
        throw new PanelAutomationError(
          'INCONSISTENT',
          'CPANEL_ACCOUNT_STATE_NOT_VERIFIED',
        );
      }
      panelMutationVerified = true;
      await this.complete(operation.id, action, payload, account);
    } catch (error) {
      const normalized =
        error instanceof PanelAutomationError
          ? error
          : panelMutationVerified
            ? new PanelAutomationError(
                'INCONSISTENT',
                'HOSTING_AUTOMATION_RESULT_UNKNOWN',
              )
            : new PanelAutomationError(
                'TEMPORARY',
                'HOSTING_AUTOMATION_TEMPORARILY_UNAVAILABLE',
              );
      await this.fail(operation.id, operation.attemptNumber, normalized);
      throw this.jobError(normalized.kind, normalized.code);
    }
  }

  private async payload(data: BackgroundJobData): Promise<AutomationPayload> {
    const event = await this.prisma.outboxEvent.findUnique({
      where: { id: data.outboxEventId },
    });
    const schema =
      data.eventType === 'HOSTING_CANCELLATION_SUSPENSION_REQUESTED'
        ? hostingCancellationJobSchema
        : hostingAutomationPayloadSchema;
    const parsed = schema.safeParse(event?.payload);
    if (
      !event ||
      event.status !== OutboxStatus.PUBLISHED ||
      event.eventType !== data.eventType ||
      event.aggregateType !== 'SERVICE' ||
      event.aggregateId !== data.aggregateId ||
      !parsed.success ||
      parsed.data.serviceId !== data.aggregateId
    ) {
      throw new BackgroundJobError(
        'PERMANENT',
        'HOSTING_AUTOMATION_OUTBOX_REFERENCE_INVALID',
        'Hosting automation cannot be processed.',
      );
    }
    return parsed.data;
  }

  private async prepare(
    action: AutomationAction,
    payload: AutomationPayload,
    outboxEventId: string,
  ) {
    const cancellation = 'cancellationId' in payload ? payload : undefined;
    const sourceId =
      'invoiceId' in payload ? payload.invoiceId : payload.cancellationId;
    const metadata = this.sourceMetadata(payload);
    const automationRunId =
      'automationRunId' in payload ? payload.automationRunId : undefined;
    const idempotencyKey = `automation:${action.toLowerCase()}:${payload.serviceId}:${sourceId}`;
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM services WHERE id = ${payload.serviceId}::uuid FOR UPDATE`;
      const existing = await tx.hostingPanelOperation.findFirst({
        where: { idempotencyKey: { startsWith: idempotencyKey } },
        orderBy: { attemptNumber: 'desc' },
      });
      if (
        !cancellation &&
        existing?.status === HostingPanelOperationStatus.SUCCEEDED
      ) {
        return { operation: existing, fresh: false };
      }
      const running = await tx.hostingPanelOperation.findFirst({
        where: {
          serviceId: payload.serviceId,
          status: 'RUNNING',
          ...(existing ? { id: { not: existing.id } } : {}),
        },
        select: { id: true },
      });
      if (running && !cancellation)
        throw this.jobError('TEMPORARY', 'HOSTING_OPERATION_IN_PROGRESS');
      const service = await tx.service.findUnique({
        where: { id: payload.serviceId },
        include: { server: true, customer: { select: { userId: true } } },
      });
      if (!service)
        throw this.jobError(
          'PERMANENT',
          'HOSTING_AUTOMATION_SERVICE_UNAVAILABLE',
        );
      if (cancellation) {
        const request = await tx.hostingCancellationRequest.findFirst({
          where: {
            id: cancellation.cancellationId,
            serviceId: service.id,
            status: 'OPEN',
          },
        });
        const now = this.clock.now();
        const due = request?.effectiveAt ?? request?.approvedAt;
        if (!request || !due || due > now) return null;
        if (running) {
          if (now.getTime() - due.getTime() >= 5 * 60_000)
            throw this.jobError('TEMPORARY', 'HOSTING_OPERATION_IN_PROGRESS');
          await this.deferCancellation(
            tx,
            cancellation,
            outboxEventId,
            new Date(now.getTime() + 60_000),
          );
          return null;
        }
        if (request.effectiveAt && service.nextDueAt > request.effectiveAt) {
          await tx.hostingCancellationRequest.update({
            where: { id: request.id },
            data: { effectiveAt: service.nextDueAt },
          });
          await this.deferCancellation(
            tx,
            cancellation,
            outboxEventId,
            service.nextDueAt,
          );
          await tx.activityLog.create({
            data: {
              action: 'HOSTING_CANCELLATION_RESCHEDULED',
              entityType: 'SERVICE',
              entityId: service.id,
              metadata: {
                cancellationId: request.id,
                effectiveAt: service.nextDueAt.toISOString(),
              },
            },
          });
          return null;
        }
        if (service.status === 'SUSPENDED' || service.status === 'TERMINATED') {
          if (service.suspensionInvoiceId)
            await tx.service.update({
              where: { id: service.id },
              data: { suspensionInvoiceId: null },
            });
          await this.finishCancellation(
            tx,
            service.id,
            cancellation.cancellationId,
            now,
          );
          return null;
        }
        if (service.status !== 'ACTIVE')
          throw this.jobError(
            'PERMANENT',
            'HOSTING_CANCELLATION_SERVICE_STATE_INVALID',
          );
      }
      if (
        existing?.status === HostingPanelOperationStatus.FAILED &&
        existing.errorKind === HostingPanelErrorKind.TEMPORARY &&
        existing.retryable &&
        existing.attemptNumber < MAX_AUTOMATION_ATTEMPTS
      ) {
        const retryKey = `${idempotencyKey}:retry:${existing.attemptNumber + 1}`;
        const operation = await tx.hostingPanelOperation.create({
          data: {
            serviceId: existing.serviceId,
            serverId: existing.serverId,
            automationRunId,
            requestedByUserId: existing.requestedByUserId,
            retryOfOperationId: existing.id,
            type: existing.type,
            adapterKey: existing.adapterKey,
            idempotencyKey: retryKey,
            requestFingerprint: existing.requestFingerprint,
            attemptNumber: existing.attemptNumber + 1,
            requestMetadata: metadata,
          },
        });
        return { operation, fresh: true };
      }
      if (existing) return { operation: existing, fresh: false };
      const operation = await tx.hostingPanelOperation.create({
        data: {
          serviceId: service.id,
          serverId: service.serverId,
          automationRunId,
          ...(cancellation
            ? { requestedByUserId: service.customer.userId }
            : {}),
          type:
            action === 'SUSPEND'
              ? HostingPanelOperationType.SUSPEND_ACCOUNT
              : HostingPanelOperationType.UNSUSPEND_ACCOUNT,
          adapterKey: service.server.adapterKey,
          idempotencyKey,
          requestFingerprint: createHash('sha256')
            .update(JSON.stringify(payload))
            .digest('hex'),
          requestMetadata: metadata,
        },
      });
      return { operation, fresh: true };
    });
  }

  private async eligible(
    action: AutomationAction,
    payload: AutomationPayload,
  ): Promise<boolean> {
    const service = await this.prisma.service.findUnique({
      where: { id: payload.serviceId },
    });
    if ('cancellationId' in payload)
      return service?.status === ServiceStatus.ACTIVE;
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: payload.invoiceId },
      include: {
        items: {
          where: { serviceId: payload.serviceId },
          select: { id: true },
        },
      },
    });
    if (!service || !invoice || invoice.items.length === 0) return false;
    if (
      action === 'UNSUSPEND' &&
      (await this.prisma.hostingCancellationRequest.findFirst({
        where: {
          serviceId: service.id,
          OR: [
            { status: 'COMPLETED' },
            { status: 'OPEN', approvedAt: { not: null } },
            { status: 'OPEN', effectiveAt: { lte: this.clock.now() } },
          ],
        },
        select: { id: true },
      }))
    )
      return false;
    return action === 'SUSPEND'
      ? service.status === ServiceStatus.ACTIVE &&
          invoice.status === InvoiceStatus.OVERDUE &&
          invoice.balanceDue > 0n
      : service.status === ServiceStatus.SUSPENDED &&
          service.suspensionInvoiceId === invoice.id &&
          invoice.status === InvoiceStatus.PAID &&
          invoice.balanceDue === 0n;
  }

  private async mutatePanel(
    action: AutomationAction,
    serviceId: string,
    cancellation: boolean,
  ): Promise<{
    externalAccountId: string;
    username: string;
    domain: string;
    state: PanelState;
  }> {
    const service = await this.prisma.service.findUnique({
      where: { id: serviceId },
      include: { server: true },
    });
    if (
      !service ||
      !service.controlPanelUsername ||
      !service.externalAccountId ||
      !service.domain
    ) {
      throw new PanelAutomationError(
        'PERMANENT',
        'HOSTING_ACCOUNT_IDENTITY_UNAVAILABLE',
      );
    }
    if (service.server.adapterKey === 'fake-panel') {
      return {
        externalAccountId: service.externalAccountId,
        username: service.controlPanelUsername,
        domain: service.domain.toLowerCase(),
        state: action === 'SUSPEND' ? 'SUSPENDED' : 'ACTIVE',
      };
    }
    if (service.server.adapterKey !== 'cpanel-whm') {
      throw new PanelAutomationError(
        'PERMANENT',
        'HOSTING_PANEL_ADAPTER_UNSUPPORTED',
      );
    }
    const token = this.decryptToken(service.server);
    await this.whmCall(
      service.server,
      token,
      action === 'SUSPEND' ? 'suspendacct' : 'unsuspendacct',
      action === 'SUSPEND'
        ? {
            user: service.controlPanelUsername,
            reason: cancellation
              ? 'Customer requested hosting cancellation.'
              : 'Renewal invoice overdue after grace period.',
            disallowun: '0',
          }
        : { user: service.controlPanelUsername },
      true,
    );
    try {
      const summary = await this.whmCall(
        service.server,
        token,
        'accountsummary',
        { user: service.controlPanelUsername },
        false,
      );
      const account = accountFromSummary(summary);
      if (
        !account ||
        account.username !== service.controlPanelUsername ||
        account.domain !== service.domain.toLowerCase()
      ) {
        throw new Error('ACCOUNT_IDENTITY_MISMATCH');
      }
      return { ...account, externalAccountId: service.externalAccountId };
    } catch {
      throw new PanelAutomationError(
        'INCONSISTENT',
        'CPANEL_MUTATION_NOT_VERIFIED',
      );
    }
  }

  private decryptToken(server: {
    id: string;
    credentialKeyVersion: string | null;
    credentialsCiphertext: string | null;
  }): string {
    if (
      server.credentialKeyVersion !== 'cpanel-token-v1' ||
      !server.credentialsCiphertext
    ) {
      throw new PanelAutomationError(
        'PERMANENT',
        'PANEL_CREDENTIAL_UNAVAILABLE',
      );
    }
    const [version, encodedIv, encodedTag, encodedCiphertext] =
      server.credentialsCiphertext.split('.');
    if (version !== 'v1' || !encodedIv || !encodedTag || !encodedCiphertext) {
      throw new PanelAutomationError(
        'PERMANENT',
        'PANEL_CREDENTIAL_UNAVAILABLE',
      );
    }
    try {
      const key = createHash('sha256')
        .update('webhost-billing:cpanel-credential:v1\0', 'utf8')
        .update(this.environment.CREDENTIAL_ENCRYPTION_KEY, 'utf8')
        .digest();
      const decipher = createDecipheriv(
        'aes-256-gcm',
        key,
        Buffer.from(encodedIv, 'base64url'),
      );
      decipher.setAAD(Buffer.from(`cpanel-token-v1:${server.id}`, 'utf8'));
      decipher.setAuthTag(Buffer.from(encodedTag, 'base64url'));
      return Buffer.concat([
        decipher.update(Buffer.from(encodedCiphertext, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new PanelAutomationError(
        'PERMANENT',
        'PANEL_CREDENTIAL_UNAVAILABLE',
      );
    }
  }

  private async whmCall(
    server: {
      hostname: string;
      port: number;
      useTls: boolean;
      apiUsername: string | null;
    },
    token: string,
    operation: string,
    parameters: Readonly<Record<string, string>>,
    mutation: boolean,
  ): Promise<unknown> {
    if (
      !server.useTls ||
      ![443, 2087].includes(server.port) ||
      !server.apiUsername ||
      !/^[A-Za-z][A-Za-z0-9_-]{0,127}$/.test(server.apiUsername) ||
      hasControlCharacters(token)
    ) {
      throw new PanelAutomationError(
        'PERMANENT',
        'CPANEL_CONFIGURATION_INVALID',
      );
    }
    const url = new URL(
      `/json-api/${encodeURIComponent(operation)}`,
      `https://${server.hostname}:${server.port}`,
    );
    url.searchParams.set('api.version', '1');
    for (const [key, value] of Object.entries(parameters)) {
      url.searchParams.set(key, value);
    }
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.environment.HOSTING_PANEL_TIMEOUT_MS,
    );
    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          accept: 'application/json',
          authorization: `whm ${server.apiUsername}:${token}`,
        },
        redirect: 'error',
        signal: controller.signal,
      });
    } catch {
      throw new PanelAutomationError(
        mutation ? 'INCONSISTENT' : 'TEMPORARY',
        mutation ? 'CPANEL_RESULT_UNKNOWN' : 'CPANEL_TEMPORARILY_UNAVAILABLE',
      );
    } finally {
      clearTimeout(timeout);
    }
    if (response.status === 401 || response.status === 403) {
      throw new PanelAutomationError(
        'PERMANENT',
        'CPANEL_AUTHENTICATION_FAILED',
      );
    }
    if (!response.ok) {
      throw new PanelAutomationError(
        mutation
          ? 'INCONSISTENT'
          : response.status >= 500
            ? 'TEMPORARY'
            : 'PERMANENT',
        mutation ? 'CPANEL_RESULT_UNKNOWN' : 'CPANEL_REQUEST_REJECTED',
      );
    }
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > 1_048_576) {
      throw new PanelAutomationError(
        mutation ? 'INCONSISTENT' : 'TEMPORARY',
        'CPANEL_RESPONSE_INVALID',
      );
    }
    let body: unknown;
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      throw new PanelAutomationError(
        mutation ? 'INCONSISTENT' : 'TEMPORARY',
        'CPANEL_RESPONSE_INVALID',
      );
    }
    if (!whmSucceeded(body)) {
      throw new PanelAutomationError(
        mutation ? 'PERMANENT' : 'TEMPORARY',
        'CPANEL_OPERATION_REJECTED',
      );
    }
    return body;
  }

  private async complete(
    operationId: string,
    action: AutomationAction,
    payload: AutomationPayload,
    account: {
      username: string;
      domain: string;
      state: PanelState;
      externalAccountId: string;
    },
  ): Promise<void> {
    const now = this.clock.now();
    const invoiceId = 'invoiceId' in payload ? payload.invoiceId : null;
    const cancellationId =
      'cancellationId' in payload ? payload.cancellationId : undefined;
    await this.prisma.$transaction(async (transaction) => {
      const changed = await transaction.service.updateMany({
        where:
          action === 'SUSPEND'
            ? { id: payload.serviceId, status: ServiceStatus.ACTIVE }
            : {
                id: payload.serviceId,
                status: ServiceStatus.SUSPENDED,
                suspensionInvoiceId: invoiceId,
              },
        data:
          action === 'SUSPEND'
            ? {
                status: ServiceStatus.SUSPENDED,
                suspendedAt: now,
                suspensionReason: cancellationId
                  ? 'Customer requested hosting cancellation.'
                  : 'Renewal invoice overdue after grace period.',
                suspensionInvoiceId: invoiceId,
              }
            : {
                status: ServiceStatus.ACTIVE,
                suspensionInvoiceId: null,
              },
      });
      if (changed.count !== 1) throw new Error('SERVICE_STATE_CHANGED');
      if (cancellationId)
        await this.finishCancellation(
          transaction,
          payload.serviceId,
          cancellationId,
          now,
        );
      await transaction.hostingPanelOperation.update({
        where: { id: operationId },
        data: {
          status: HostingPanelOperationStatus.SUCCEEDED,
          completedAt: now,
          resultMetadata: { account },
        },
      });
      await transaction.outboxEvent.create({
        data: {
          aggregateType: 'SERVICE',
          aggregateId: payload.serviceId,
          eventType:
            action === 'SUSPEND'
              ? 'EMAIL_SERVICE_SUSPENDED'
              : 'EMAIL_SERVICE_REACTIVATED',
          idempotencyKey: `email:service:${operationId}`,
          payload: { schemaVersion: 1, serviceId: payload.serviceId },
        },
      });
      if (!cancellationId)
        await transaction.activityLog.create({
          data: {
            action:
              action === 'SUSPEND'
                ? 'SERVICE_SUSPENDED_BY_RENEWAL_AUTOMATION'
                : 'SERVICE_UNSUSPENDED_AFTER_VERIFIED_PAYMENT',
            entityType: 'SERVICE',
            entityId: payload.serviceId,
            correlationId:
              'automationRunId' in payload
                ? payload.automationRunId
                : undefined,
            metadata: { invoiceId, operationId },
          },
        });
    });
  }

  private async completeSkipped(
    operationId: string,
    action: AutomationAction,
    payload: AutomationPayload,
  ): Promise<void> {
    await this.prisma.hostingPanelOperation.updateMany({
      where: { id: operationId, status: HostingPanelOperationStatus.RUNNING },
      data: {
        status: HostingPanelOperationStatus.SUCCEEDED,
        completedAt: this.clock.now(),
        resultMetadata: {
          skipped: 'NO_LONGER_ELIGIBLE',
          action,
          ...this.sourceMetadata(payload),
        },
      },
    });
  }

  private sourceMetadata(payload: AutomationPayload) {
    return 'invoiceId' in payload
      ? { invoiceId: payload.invoiceId }
      : { cancellationId: payload.cancellationId };
  }

  private async deferCancellation(
    tx: Prisma.TransactionClient,
    payload: HostingCancellationJob,
    outboxEventId: string,
    availableAt: Date,
  ) {
    await tx.outboxEvent.createMany({
      data: [
        {
          aggregateType: 'SERVICE',
          aggregateId: payload.serviceId,
          eventType: 'HOSTING_CANCELLATION_SUSPENSION_REQUESTED',
          availableAt,
          idempotencyKey: `hosting-cancellation-deferred:${outboxEventId}`,
          payload,
        },
      ],
      skipDuplicates: true,
    });
  }

  private async finishCancellation(
    tx: Prisma.TransactionClient,
    serviceId: string,
    cancellationId: string,
    now: Date,
  ) {
    const changed = await tx.hostingCancellationRequest.updateMany({
      where: { id: cancellationId, serviceId, status: 'OPEN' },
      data: { status: 'COMPLETED', resolvedAt: now },
    });
    if (changed.count !== 1) throw new Error('CANCELLATION_STATE_CHANGED');
    await tx.activityLog.create({
      data: {
        action: 'HOSTING_CANCELLATION_COMPLETED',
        entityType: 'SERVICE',
        entityId: serviceId,
        metadata: { cancellationId },
      },
    });
  }

  private async fail(
    operationId: string,
    attemptNumber: number,
    error: PanelAutomationError,
  ) {
    await this.prisma.hostingPanelOperation.updateMany({
      where: { id: operationId, status: HostingPanelOperationStatus.RUNNING },
      data: {
        status:
          error.kind === 'INCONSISTENT'
            ? HostingPanelOperationStatus.INCONSISTENT
            : HostingPanelOperationStatus.FAILED,
        retryable:
          error.kind === 'TEMPORARY' && attemptNumber < MAX_AUTOMATION_ATTEMPTS,
        errorKind: error.kind,
        errorCode: error.code,
        errorMessage: 'The automated hosting-panel operation did not complete.',
        completedAt: this.clock.now(),
      },
    });
  }

  private action(eventType: string): AutomationAction {
    if (
      eventType === 'HOSTING_SUSPENSION_REQUESTED' ||
      eventType === 'HOSTING_CANCELLATION_SUSPENSION_REQUESTED'
    )
      return 'SUSPEND';
    if (eventType === 'HOSTING_UNSUSPENSION_REQUESTED') return 'UNSUSPEND';
    throw new BackgroundJobError(
      'PERMANENT',
      'HOSTING_AUTOMATION_EVENT_UNSUPPORTED',
      'Hosting automation cannot be processed.',
    );
  }

  private jobError(
    kind: HostingPanelErrorKind,
    code: string,
  ): BackgroundJobError {
    return new BackgroundJobError(
      kind,
      code,
      'The automated hosting-panel operation did not complete.',
    );
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function whmSucceeded(value: unknown): boolean {
  if (!isObject(value) || !isObject(value.metadata)) return false;
  return value.metadata.result === 1 || value.metadata.result === '1';
}

function accountFromSummary(value: unknown): {
  username: string;
  domain: string;
  state: PanelState;
} | null {
  if (
    !isObject(value) ||
    !isObject(value.data) ||
    !Array.isArray(value.data.acct)
  ) {
    return null;
  }
  const first: unknown = value.data.acct[0];
  if (!isObject(first)) return null;
  const username = scalar(first.user);
  const domain = scalar(first.domain);
  if (!username || !domain) return null;
  const suspended = first.suspended;
  return {
    username,
    domain: domain.toLowerCase(),
    state:
      suspended === true || suspended === 1 || suspended === '1'
        ? 'SUSPENDED'
        : 'ACTIVE',
  };
}

function scalar(value: unknown): string | null {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : null;
}

function hasControlCharacters(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });
}
