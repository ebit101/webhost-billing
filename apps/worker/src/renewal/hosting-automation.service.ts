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
  type PrismaClient,
} from '@webhost-billing/database';
import { BackgroundJobError } from '@webhost-billing/queue';
import {
  hostingAutomationPayloadSchema,
  type BackgroundJobData,
  type HostingAutomationPayload,
} from '@webhost-billing/shared';
import { WORKER_PRISMA } from '../infrastructure/database.module';
import { WORKER_ENVIRONMENT } from '../infrastructure/environment.module';
import { CLOCK, type Clock } from './clock';

type PanelState = 'ACTIVE' | 'SUSPENDED';
type AutomationAction = 'SUSPEND' | 'UNSUSPEND';
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
    const prepared = await this.prepare(action, payload);
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
      const account = await this.mutatePanel(action, payload.serviceId);
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

  private async payload(
    data: BackgroundJobData,
  ): Promise<HostingAutomationPayload> {
    const event = await this.prisma.outboxEvent.findUnique({
      where: { id: data.outboxEventId },
    });
    const parsed = hostingAutomationPayloadSchema.safeParse(event?.payload);
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
    payload: HostingAutomationPayload,
  ) {
    const idempotencyKey = `automation:${action.toLowerCase()}:${payload.serviceId}:${payload.invoiceId}`;
    const existing = await this.prisma.hostingPanelOperation.findFirst({
      where: { idempotencyKey: { startsWith: idempotencyKey } },
      orderBy: { attemptNumber: 'desc' },
    });
    if (
      existing?.status === HostingPanelOperationStatus.FAILED &&
      existing.errorKind === HostingPanelErrorKind.TEMPORARY &&
      existing.retryable &&
      existing.attemptNumber < MAX_AUTOMATION_ATTEMPTS
    ) {
      const retryKey = `${idempotencyKey}:retry:${existing.attemptNumber + 1}`;
      try {
        const operation = await this.prisma.hostingPanelOperation.create({
          data: {
            serviceId: existing.serviceId,
            serverId: existing.serverId,
            automationRunId: payload.automationRunId,
            retryOfOperationId: existing.id,
            type: existing.type,
            adapterKey: existing.adapterKey,
            idempotencyKey: retryKey,
            requestFingerprint: existing.requestFingerprint,
            attemptNumber: existing.attemptNumber + 1,
            requestMetadata: { invoiceId: payload.invoiceId },
          },
        });
        return { operation, fresh: true };
      } catch (error) {
        if (!isUniqueConstraint(error)) throw error;
        const operation = await this.prisma.hostingPanelOperation.findUnique({
          where: { idempotencyKey: retryKey },
        });
        return operation ? { operation, fresh: false } : null;
      }
    }
    if (existing) return { operation: existing, fresh: false };
    const service = await this.prisma.service.findUnique({
      where: { id: payload.serviceId },
      include: { server: true },
    });
    if (!service) {
      throw new BackgroundJobError(
        'PERMANENT',
        'HOSTING_AUTOMATION_SERVICE_UNAVAILABLE',
        'Hosting automation cannot be processed.',
      );
    }
    try {
      const operation = await this.prisma.hostingPanelOperation.create({
        data: {
          serviceId: service.id,
          serverId: service.serverId,
          automationRunId: payload.automationRunId,
          type:
            action === 'SUSPEND'
              ? HostingPanelOperationType.SUSPEND_ACCOUNT
              : HostingPanelOperationType.UNSUSPEND_ACCOUNT,
          adapterKey: service.server.adapterKey,
          idempotencyKey,
          requestFingerprint: createHash('sha256')
            .update(JSON.stringify(payload))
            .digest('hex'),
          requestMetadata: { invoiceId: payload.invoiceId },
        },
      });
      return { operation, fresh: true };
    } catch (error) {
      if (!isUniqueConstraint(error)) throw error;
      const operation = await this.prisma.hostingPanelOperation.findUnique({
        where: { idempotencyKey },
      });
      return operation ? { operation, fresh: false } : null;
    }
  }

  private async eligible(
    action: AutomationAction,
    payload: HostingAutomationPayload,
  ): Promise<boolean> {
    const service = await this.prisma.service.findUnique({
      where: { id: payload.serviceId },
    });
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
            reason: 'Renewal invoice overdue after grace period.',
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
    payload: HostingAutomationPayload,
    account: {
      username: string;
      domain: string;
      state: PanelState;
      externalAccountId: string;
    },
  ): Promise<void> {
    const now = this.clock.now();
    await this.prisma.$transaction(async (transaction) => {
      const changed = await transaction.service.updateMany({
        where:
          action === 'SUSPEND'
            ? { id: payload.serviceId, status: ServiceStatus.ACTIVE }
            : {
                id: payload.serviceId,
                status: ServiceStatus.SUSPENDED,
                suspensionInvoiceId: payload.invoiceId,
              },
        data:
          action === 'SUSPEND'
            ? {
                status: ServiceStatus.SUSPENDED,
                suspendedAt: now,
                suspensionReason: 'Renewal invoice overdue after grace period.',
                suspensionInvoiceId: payload.invoiceId,
              }
            : {
                status: ServiceStatus.ACTIVE,
                suspensionInvoiceId: null,
              },
      });
      if (changed.count !== 1) throw new Error('SERVICE_STATE_CHANGED');
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
      await transaction.activityLog.create({
        data: {
          action:
            action === 'SUSPEND'
              ? 'SERVICE_SUSPENDED_BY_RENEWAL_AUTOMATION'
              : 'SERVICE_UNSUSPENDED_AFTER_VERIFIED_PAYMENT',
          entityType: 'SERVICE',
          entityId: payload.serviceId,
          correlationId: payload.automationRunId,
          metadata: { invoiceId: payload.invoiceId, operationId },
        },
      });
    });
  }

  private async completeSkipped(
    operationId: string,
    action: AutomationAction,
    payload: HostingAutomationPayload,
  ): Promise<void> {
    await this.prisma.hostingPanelOperation.updateMany({
      where: { id: operationId, status: HostingPanelOperationStatus.RUNNING },
      data: {
        status: HostingPanelOperationStatus.SUCCEEDED,
        completedAt: this.clock.now(),
        resultMetadata: {
          skipped: 'NO_LONGER_ELIGIBLE',
          action,
          invoiceId: payload.invoiceId,
        },
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
    if (eventType === 'HOSTING_SUSPENSION_REQUESTED') return 'SUSPEND';
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

function isUniqueConstraint(error: unknown): boolean {
  return isObject(error) && error.code === 'P2002';
}
