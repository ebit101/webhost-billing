import { Inject, Injectable } from '@nestjs/common';
import {
  AutomationStatus,
  InvoiceStatus,
  OutboxStatus,
  ServiceStatus,
  type PrismaClient,
} from '@webhost-billing/database';
import { BackgroundJobError } from '@webhost-billing/queue';
import {
  PROJECT_NAME,
  businessIdentitySchema,
  hostingBillingPeriodSchema,
  hostingAutomationPayloadSchema,
  renewalCyclePayloadSchema,
  renewalPaymentPayloadSchema,
  type BackgroundJobData,
  type RenewalAutomationPolicy,
} from '@webhost-billing/shared';
import { WORKER_PRISMA } from '../infrastructure/database.module';
import { CLOCK, type Clock } from './clock';
import {
  addBillingPeriod,
  addBusinessDays,
  businessDate,
  isOnOrAfter,
} from './renewal-calendar';
import { allocateInvoiceNumber } from './invoice-number';

type Counters = { processed: number; succeeded: number; failed: number };

@Injectable()
export class RenewalProcessorService {
  constructor(
    @Inject(WORKER_PRISMA) private readonly prisma: PrismaClient,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async process(data: BackgroundJobData): Promise<void> {
    if (data.eventType === 'RENEWAL_INVOICE_GENERATION_REQUESTED') {
      await this.processCycle(data);
      return;
    }
    if (data.eventType === 'RENEWAL_PAYMENT_COMPLETED') {
      await this.processPayment(data);
      return;
    }
    throw permanent('RENEWAL_EVENT_UNSUPPORTED');
  }

  private async processCycle(data: BackgroundJobData): Promise<void> {
    const event = await this.publishedEvent(data);
    const parsed = renewalCyclePayloadSchema.safeParse(event.payload);
    if (!parsed.success || parsed.data.automationRunId !== data.aggregateId) {
      throw permanent('RENEWAL_CYCLE_PAYLOAD_INVALID');
    }
    const run = await this.prisma.automationRun.findUnique({
      where: { id: parsed.data.automationRunId },
    });
    if (!run) throw permanent('RENEWAL_RUN_UNAVAILABLE');
    if (
      run.status === AutomationStatus.SUCCEEDED ||
      run.status === AutomationStatus.SKIPPED
    ) {
      return;
    }
    const counters: Counters = { processed: 0, succeeded: 0, failed: 0 };
    try {
      await this.createDueInvoices(
        parsed.data.automationRunId,
        parsed.data.policy,
        counters,
      );
      await this.processOpenRenewals(
        parsed.data.automationRunId,
        parsed.data.policy,
        counters,
      );
    } catch {
      await this.prisma.automationRun.updateMany({
        where: { id: parsed.data.automationRunId },
        data: {
          status: AutomationStatus.FAILED,
          completedAt: this.clock.now(),
          processedCount: counters.processed,
          succeededCount: counters.succeeded,
          failedCount: Math.max(1, counters.failed),
          errorSummary: 'RENEWAL_CYCLE_TEMPORARILY_UNAVAILABLE',
        },
      });
      throw temporary('RENEWAL_CYCLE_TEMPORARILY_UNAVAILABLE');
    }
    await this.finishRun(parsed.data.automationRunId, counters);
    if (counters.failed > 0) {
      throw temporary('RENEWAL_ACTIONS_FAILED');
    }
  }

  private async createDueInvoices(
    automationRunId: string,
    policy: RenewalAutomationPolicy,
    counters: Counters,
  ): Promise<void> {
    const now = this.clock.now();
    const currentDate = businessDate(now, policy.timeZone);
    const broadCutoff = new Date(
      now.getTime() + (policy.invoiceLeadDays + 2) * 86_400_000,
    );
    const services = await this.prisma.service.findMany({
      where: {
        status: { in: [ServiceStatus.ACTIVE, ServiceStatus.SUSPENDED] },
        billingPeriod: { in: ['MONTHLY', 'QUARTERLY', 'ANNUAL'] },
        nextDueAt: { lte: broadCutoff },
      },
      select: { id: true, nextDueAt: true },
      orderBy: [{ nextDueAt: 'asc' }, { id: 'asc' }],
      take: 1_000,
    });
    for (const service of services) {
      const invoiceDate = addBusinessDays(
        businessDate(service.nextDueAt, policy.timeZone),
        -policy.invoiceLeadDays,
      );
      if (!isOnOrAfter(currentDate, invoiceDate)) continue;
      counters.processed += 1;
      try {
        if (await this.createRenewalInvoice(service.id, automationRunId, now)) {
          counters.succeeded += 1;
        }
      } catch {
        counters.failed += 1;
      }
    }
  }

  private async createRenewalInvoice(
    serviceId: string,
    automationRunId: string,
    now: Date,
  ): Promise<boolean> {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        await transaction.$queryRaw`
          SELECT "id" FROM "services"
          WHERE "id" = ${serviceId}::uuid FOR UPDATE
        `;
        const service = await transaction.service.findUnique({
          where: { id: serviceId },
          include: {
            customer: { include: { user: true } },
          },
        });
        if (
          !service ||
          (service.status !== ServiceStatus.ACTIVE &&
            service.status !== ServiceStatus.SUSPENDED) ||
          service.customer.deletedAt ||
          service.customer.user.deletedAt
        ) {
          return false;
        }
        const billingPeriod = hostingBillingPeriodSchema.parse(
          service.billingPeriod,
        );
        const periodStart = service.nextDueAt;
        const periodEnd = addBillingPeriod(periodStart, billingPeriod);
        const existing = await transaction.invoiceItem.findFirst({
          where: {
            serviceId,
            servicePeriodStart: periodStart,
            servicePeriodEnd: periodEnd,
          },
          select: { id: true },
        });
        if (existing) return false;
        const setting = await transaction.setting.findUnique({
          where: { key: 'business.identity' },
          select: { value: true },
        });
        const amount = service.recurringAmount;
        const paid = amount === 0n;
        const invoice = await transaction.invoice.create({
          data: {
            invoiceNumber: await allocateInvoiceNumber(transaction),
            submissionKey: `renewal:${service.id}:${periodStart.toISOString()}`,
            customerId: service.customerId,
            status: paid ? InvoiceStatus.PAID : InvoiceStatus.UNPAID,
            currency: service.currency,
            subtotal: amount,
            total: amount,
            amountPaid: 0n,
            balanceDue: amount,
            customerNameSnapshot:
              service.customer.companyName ??
              `${service.customer.firstName} ${service.customer.lastName}`,
            customerEmailSnapshot: service.customer.user.email,
            customerAddressSnapshot: {
              line1: service.customer.addressLine1,
              line2: service.customer.addressLine2,
              city: service.customer.city,
              region: service.customer.region,
              postalCode: service.customer.postalCode,
              countryCode: service.customer.countryCode,
            },
            businessIdentitySnapshot: normalizeBusinessIdentity(setting?.value),
            ...(service.customer.taxIdentifier
              ? {
                  taxIdentitySnapshot: {
                    taxIdentifier: service.customer.taxIdentifier,
                  },
                }
              : {}),
            issuedAt: now,
            dueAt: periodStart,
            ...(paid ? { paidAt: now } : {}),
            items: {
              create: {
                linePosition: 1,
                serviceId: service.id,
                descriptionSnapshot: `Renewal: ${service.productNameSnapshot}${service.domain ? ` (${service.domain})` : ''}`,
                currency: service.currency,
                quantity: 1,
                unitAmount: amount,
                lineTotal: amount,
                servicePeriodStart: periodStart,
                servicePeriodEnd: periodEnd,
              },
            },
          },
        });
        if (paid) {
          await transaction.service.update({
            where: { id: service.id },
            data: { nextDueAt: periodEnd },
          });
        }
        await transaction.outboxEvent.create({
          data: {
            aggregateType: 'INVOICE',
            aggregateId: invoice.id,
            eventType: 'EMAIL_INVOICE_CREATED',
            idempotencyKey: `email:invoice-created:${invoice.id}`,
            payload: { schemaVersion: 1, invoiceId: invoice.id },
          },
        });
        await transaction.activityLog.create({
          data: {
            action: 'RENEWAL_INVOICE_CREATED_BY_AUTOMATION',
            entityType: 'INVOICE',
            entityId: invoice.id,
            correlationId: automationRunId,
            metadata: {
              serviceId: service.id,
              periodStart: periodStart.toISOString(),
              periodEnd: periodEnd.toISOString(),
            },
          },
        });
        return true;
      });
    } catch (error) {
      if (isUniqueConstraint(error)) return false;
      throw error;
    }
  }

  private async processOpenRenewals(
    automationRunId: string,
    policy: RenewalAutomationPolicy,
    counters: Counters,
  ): Promise<void> {
    const now = this.clock.now();
    const invoices = await this.prisma.invoice.findMany({
      where: {
        status: { in: [InvoiceStatus.UNPAID, InvoiceStatus.OVERDUE] },
        balanceDue: { gt: 0n },
        items: { some: { serviceId: { not: null } } },
      },
      include: {
        items: {
          where: { serviceId: { not: null } },
          include: { service: true },
        },
      },
      orderBy: [{ dueAt: 'asc' }, { id: 'asc' }],
      take: 1_000,
    });
    for (const invoice of invoices) {
      if (invoice.status === InvoiceStatus.UNPAID) {
        await this.createReminders(invoice.id, invoice.dueAt, policy, counters);
      }
      if (
        businessDate(now, policy.timeZone) >
        businessDate(invoice.dueAt, policy.timeZone)
      ) {
        counters.processed += 1;
        try {
          if (await this.markOverdue(invoice.id, automationRunId, now)) {
            counters.succeeded += 1;
          }
        } catch {
          counters.failed += 1;
        }
      }
      const suspensionDate = addBusinessDays(
        businessDate(invoice.dueAt, policy.timeZone),
        policy.gracePeriodDays + 1,
      );
      const currentDate = businessDate(now, policy.timeZone);
      if (!isOnOrAfter(currentDate, suspensionDate)) continue;
      for (const item of invoice.items) {
        if (!item.service || item.service.status !== ServiceStatus.ACTIVE)
          continue;
        counters.processed += 1;
        try {
          if (
            await this.requestSuspension(
              item.service.id,
              invoice.id,
              automationRunId,
            )
          ) {
            counters.succeeded += 1;
          }
        } catch {
          counters.failed += 1;
        }
      }
    }
  }

  private async createReminders(
    invoiceId: string,
    dueAt: Date,
    policy: RenewalAutomationPolicy,
    counters: Counters,
  ): Promise<void> {
    const now = this.clock.now();
    const currentDate = businessDate(now, policy.timeZone);
    const dueDate = businessDate(dueAt, policy.timeZone);
    if (currentDate > dueDate) return;
    const reminders = [...policy.reminderDaysBeforeDue].sort((a, b) => b - a);
    for (const [index, days] of reminders.entries()) {
      if (!isOnOrAfter(currentDate, addBusinessDays(dueDate, -days))) continue;
      counters.processed += 1;
      try {
        const created = await this.prisma.outboxEvent.createMany({
          data: [
            {
              aggregateType: 'INVOICE',
              aggregateId: invoiceId,
              eventType: 'EMAIL_RENEWAL_REMINDER',
              idempotencyKey: `email:renewal-reminder:${invoiceId}:${days}`,
              payload: {
                schemaVersion: 1,
                invoiceId,
                reminderNumber: index + 1,
              },
            },
          ],
          skipDuplicates: true,
        });
        if (created.count === 1) counters.succeeded += 1;
      } catch {
        counters.failed += 1;
      }
    }
  }

  private async markOverdue(
    invoiceId: string,
    automationRunId: string,
    now: Date,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (transaction) => {
      const changed = await transaction.invoice.updateMany({
        where: {
          id: invoiceId,
          status: InvoiceStatus.UNPAID,
          balanceDue: { gt: 0n },
          dueAt: { lte: now },
        },
        data: { status: InvoiceStatus.OVERDUE },
      });
      if (changed.count === 0) return false;
      await transaction.outboxEvent.create({
        data: {
          aggregateType: 'INVOICE',
          aggregateId: invoiceId,
          eventType: 'EMAIL_OVERDUE_NOTICE',
          idempotencyKey: `email:overdue-notice:${invoiceId}`,
          payload: { schemaVersion: 1, invoiceId },
        },
      });
      await transaction.activityLog.create({
        data: {
          action: 'INVOICE_MARKED_OVERDUE_BY_AUTOMATION',
          entityType: 'INVOICE',
          entityId: invoiceId,
          correlationId: automationRunId,
        },
      });
      return true;
    });
  }

  private async requestSuspension(
    serviceId: string,
    invoiceId: string,
    automationRunId: string,
  ): Promise<boolean> {
    const result = await this.prisma.outboxEvent.createMany({
      data: [
        {
          aggregateType: 'SERVICE',
          aggregateId: serviceId,
          eventType: 'HOSTING_SUSPENSION_REQUESTED',
          idempotencyKey: `automation:suspend:${serviceId}:${invoiceId}`,
          payload: hostingAutomationPayloadSchema.parse({
            schemaVersion: 1,
            serviceId,
            invoiceId,
            automationRunId,
          }),
        },
      ],
      skipDuplicates: true,
    });
    return result.count === 1;
  }

  private async processPayment(data: BackgroundJobData): Promise<void> {
    const event = await this.publishedEvent(data);
    const payload = renewalPaymentPayloadSchema.safeParse(event.payload);
    if (!payload.success || payload.data.paymentId !== data.aggregateId) {
      throw permanent('RENEWAL_PAYMENT_PAYLOAD_INVALID');
    }
    const run = await this.prisma.automationRun.upsert({
      where: { idempotencyKey: `renewal-payment:${payload.data.paymentId}` },
      update: {},
      create: {
        jobName: 'renewal-payment',
        idempotencyKey: `renewal-payment:${payload.data.paymentId}`,
        metadata: { invoiceId: payload.data.invoiceId },
      },
    });
    if (run.status === AutomationStatus.SUCCEEDED) return;
    try {
      const processed = await this.applyRenewalPayment(
        payload.data.paymentId,
        payload.data.invoiceId,
        run.id,
      );
      await this.prisma.automationRun.update({
        where: { id: run.id },
        data: {
          status: AutomationStatus.SUCCEEDED,
          completedAt: this.clock.now(),
          processedCount: processed,
          succeededCount: processed,
          failedCount: 0,
          errorSummary: null,
        },
      });
    } catch {
      await this.prisma.automationRun.updateMany({
        where: { id: run.id },
        data: {
          status: AutomationStatus.FAILED,
          completedAt: this.clock.now(),
          processedCount: 1,
          failedCount: 1,
          errorSummary: 'RENEWAL_PAYMENT_TEMPORARILY_UNAVAILABLE',
        },
      });
      throw temporary('RENEWAL_PAYMENT_TEMPORARILY_UNAVAILABLE');
    }
  }

  private async applyRenewalPayment(
    paymentId: string,
    invoiceId: string,
    automationRunId: string,
  ): Promise<number> {
    return this.prisma.$transaction(async (transaction) => {
      const payment = await transaction.payment.findFirst({
        where: { id: paymentId, invoiceId, status: 'SUCCEEDED' },
        include: {
          invoice: {
            include: {
              items: { where: { serviceId: { not: null } } },
            },
          },
        },
      });
      if (
        !payment ||
        payment.invoice.status !== InvoiceStatus.PAID ||
        payment.invoice.balanceDue !== 0n
      ) {
        return 0;
      }
      let processed = 0;
      for (const item of payment.invoice.items) {
        if (!item.serviceId || !item.servicePeriodEnd) continue;
        await transaction.$queryRaw`
          SELECT "id" FROM "services"
          WHERE "id" = ${item.serviceId}::uuid FOR UPDATE
        `;
        const service = await transaction.service.findUnique({
          where: { id: item.serviceId },
        });
        if (!service) continue;
        let changed = false;
        if (service.nextDueAt < item.servicePeriodEnd) {
          await transaction.service.update({
            where: { id: service.id },
            data: { nextDueAt: item.servicePeriodEnd },
          });
          processed += 1;
          changed = true;
        }
        if (
          service.status === ServiceStatus.SUSPENDED &&
          service.suspensionInvoiceId === invoiceId
        ) {
          const requested = await transaction.outboxEvent.createMany({
            data: [
              {
                aggregateType: 'SERVICE',
                aggregateId: service.id,
                eventType: 'HOSTING_UNSUSPENSION_REQUESTED',
                idempotencyKey: `automation:unsuspend:${service.id}:${invoiceId}`,
                payload: hostingAutomationPayloadSchema.parse({
                  schemaVersion: 1,
                  serviceId: service.id,
                  invoiceId,
                  automationRunId,
                }),
              },
            ],
            skipDuplicates: true,
          });
          processed += requested.count;
          changed ||= requested.count === 1;
        }
        if (changed) {
          await transaction.activityLog.create({
            data: {
              action: 'SERVICE_RENEWAL_APPLIED_AFTER_PAYMENT',
              entityType: 'SERVICE',
              entityId: service.id,
              correlationId: automationRunId,
              metadata: { invoiceId, paymentId },
            },
          });
        }
      }
      return processed;
    });
  }

  private async publishedEvent(data: BackgroundJobData) {
    const event = await this.prisma.outboxEvent.findUnique({
      where: { id: data.outboxEventId },
    });
    if (
      !event ||
      event.status !== OutboxStatus.PUBLISHED ||
      event.eventType !== data.eventType ||
      event.aggregateType !== data.aggregateType ||
      event.aggregateId !== data.aggregateId
    ) {
      throw permanent('RENEWAL_OUTBOX_REFERENCE_INVALID');
    }
    return event;
  }

  private async finishRun(runId: string, counters: Counters): Promise<void> {
    const status =
      counters.failed === 0
        ? AutomationStatus.SUCCEEDED
        : counters.succeeded > 0
          ? AutomationStatus.PARTIALLY_SUCCEEDED
          : AutomationStatus.FAILED;
    await this.prisma.automationRun.update({
      where: { id: runId },
      data: {
        status,
        completedAt: this.clock.now(),
        processedCount: counters.processed,
        succeededCount: counters.succeeded,
        failedCount: counters.failed,
        errorSummary: counters.failed > 0 ? 'RENEWAL_ACTIONS_FAILED' : null,
      },
    });
  }
}

function normalizeBusinessIdentity(value: unknown) {
  const parsed = businessIdentitySchema.safeParse(value);
  if (parsed.success) return parsed.data;
  if (typeof value === 'object' && value !== null && 'name' in value) {
    const name = value.name;
    if (typeof name === 'string' && name.trim()) return { name: name.trim() };
  }
  return { name: PROJECT_NAME };
}

function isUniqueConstraint(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2002'
  );
}

function permanent(code: string): BackgroundJobError {
  return new BackgroundJobError(
    'PERMANENT',
    code,
    'Renewal work cannot be processed.',
  );
}

function temporary(code: string): BackgroundJobError {
  return new BackgroundJobError(
    'TEMPORARY',
    code,
    'Renewal work is temporarily unavailable.',
  );
}
