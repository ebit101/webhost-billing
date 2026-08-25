import { Inject, Injectable } from '@nestjs/common';
import type { WorkerEnvironment } from '@webhost-billing/config';
import { OutboxStatus, type PrismaClient } from '@webhost-billing/database';
import { BackgroundJobError } from '@webhost-billing/queue';
import {
  emailOutboxEventTypeSchema,
  parseEmailEventPayload,
  type BackgroundJobData,
  type EmailOutboxEventType,
} from '@webhost-billing/shared';
import { WORKER_PRISMA } from '../infrastructure/database.module';
import { WORKER_ENVIRONMENT } from '../infrastructure/environment.module';
import { DeliveryTokenCipher } from './delivery-token-cipher';
import { EmailTemplateCatalog } from './email-template.catalog';
import type {
  EmailBranding,
  EmailTemplateModel,
  ResolvedEmailMessage,
} from './email.types';

@Injectable()
export class EmailMessageResolver {
  private readonly branding: EmailBranding;
  private readonly tokenCipher: DeliveryTokenCipher;

  constructor(
    @Inject(WORKER_PRISMA) private readonly prisma: PrismaClient,
    @Inject(WORKER_ENVIRONMENT) environment: WorkerEnvironment,
    private readonly templates: EmailTemplateCatalog,
  ) {
    this.tokenCipher = new DeliveryTokenCipher(
      environment.CREDENTIAL_ENCRYPTION_KEY,
    );
    this.branding = {
      brandName: environment.EMAIL_BRAND_NAME,
      brandColor: environment.EMAIL_BRAND_COLOR,
      fromAddress: environment.EMAIL_FROM_ADDRESS,
      fromName: environment.EMAIL_FROM_NAME,
      ...(environment.EMAIL_REPLY_TO_ADDRESS
        ? { replyToAddress: environment.EMAIL_REPLY_TO_ADDRESS }
        : {}),
      publicWebUrl: environment.EMAIL_PUBLIC_WEB_URL,
    };
  }

  async resolve(data: BackgroundJobData): Promise<ResolvedEmailMessage> {
    const event = await this.prisma.outboxEvent.findUnique({
      where: { id: data.outboxEventId },
    });
    const eventType = emailOutboxEventTypeSchema.safeParse(data.eventType);
    if (
      !event ||
      !eventType.success ||
      event.status !== OutboxStatus.PUBLISHED ||
      event.eventType !== data.eventType ||
      event.aggregateId !== data.aggregateId ||
      event.aggregateType !== data.aggregateType
    ) {
      throw permanent('EMAIL_OUTBOX_REFERENCE_INVALID');
    }
    let payload: Record<string, unknown>;
    try {
      payload = parseEmailEventPayload(eventType.data, event.payload);
    } catch {
      throw permanent('EMAIL_EVENT_PAYLOAD_INVALID');
    }
    return this.resolveEvent(eventType.data, payload, data.aggregateId);
  }

  private async resolveEvent(
    eventType: EmailOutboxEventType,
    payload: Record<string, unknown>,
    aggregateId: string,
  ): Promise<ResolvedEmailMessage> {
    if (
      eventType === 'AUTH_EMAIL_VERIFICATION_REQUESTED' ||
      eventType === 'AUTH_PASSWORD_RESET_REQUESTED'
    ) {
      return this.resolveAuthentication(eventType, payload, aggregateId);
    }
    if (
      eventType === 'EMAIL_ORDER_RECEIVED' ||
      eventType === 'EMAIL_ORDER_APPROVED'
    ) {
      return this.resolveOrder(eventType, requiredUuid(payload, 'orderId'));
    }
    if (eventType === 'EMAIL_PAYMENT_RECEIVED') {
      return this.resolvePayment(
        requiredUuid(payload, 'paymentId'),
        requiredUuid(payload, 'invoiceId'),
      );
    }
    if (
      eventType === 'EMAIL_INVOICE_CREATED' ||
      eventType === 'EMAIL_RENEWAL_REMINDER' ||
      eventType === 'EMAIL_OVERDUE_NOTICE'
    ) {
      return this.resolveInvoice(eventType, payload);
    }
    if (
      eventType === 'EMAIL_SERVICE_PROVISIONED' ||
      eventType === 'EMAIL_SERVICE_SUSPENDED' ||
      eventType === 'EMAIL_SERVICE_REACTIVATED'
    ) {
      return this.resolveService(eventType, requiredUuid(payload, 'serviceId'));
    }
    return this.resolveTicket(
      requiredUuid(payload, 'ticketId'),
      requiredUuid(payload, 'messageId'),
    );
  }

  private async resolveAuthentication(
    eventType:
      'AUTH_EMAIL_VERIFICATION_REQUESTED' | 'AUTH_PASSWORD_RESET_REQUESTED',
    payload: Record<string, unknown>,
    userId: string,
  ): Promise<ResolvedEmailMessage> {
    const tokenRecordId = requiredUuid(payload, 'tokenRecordId');
    const recipientEmail = requiredString(payload, 'recipientEmail');
    const now = new Date();
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { customer: true },
    });
    if (!user || user.email !== recipientEmail || user.deletedAt) {
      throw permanent('EMAIL_RECIPIENT_UNAVAILABLE');
    }
    const tokenRecord =
      eventType === 'AUTH_EMAIL_VERIFICATION_REQUESTED'
        ? await this.prisma.emailVerificationToken.findFirst({
            where: {
              id: tokenRecordId,
              userId,
              usedAt: null,
              expiresAt: { gt: now },
            },
          })
        : await this.prisma.passwordResetToken.findFirst({
            where: {
              id: tokenRecordId,
              userId,
              usedAt: null,
              expiresAt: { gt: now },
            },
          });
    if (!tokenRecord) throw permanent('EMAIL_ACTION_TOKEN_UNAVAILABLE');
    let token: string;
    try {
      token = this.tokenCipher.decrypt(tokenRecord.deliveryCiphertext);
    } catch {
      throw permanent('EMAIL_ACTION_TOKEN_UNREADABLE');
    }
    const key =
      eventType === 'AUTH_EMAIL_VERIFICATION_REQUESTED'
        ? 'email-verification'
        : 'password-reset';
    const path =
      key === 'email-verification' ? '/verify-email' : '/reset-password';
    const actionUrl = this.url(path, { token });
    return this.render(
      recipientEmail,
      {
        key,
        recipientName: customerName(user.customer),
        actionUrl,
        expiresAt: tokenRecord.expiresAt,
      },
      user.customer?.id,
    );
  }

  private async resolveOrder(
    eventType: 'EMAIL_ORDER_RECEIVED' | 'EMAIL_ORDER_APPROVED',
    orderId: string,
  ): Promise<ResolvedEmailMessage> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { customer: true, items: { orderBy: { createdAt: 'asc' } } },
    });
    const item = order?.items[0];
    if (!order || !item?.requestedDomain)
      throw permanent('EMAIL_ORDER_UNAVAILABLE');
    return this.render(
      order.customerEmailSnapshot,
      {
        key:
          eventType === 'EMAIL_ORDER_RECEIVED'
            ? 'order-received'
            : 'order-approved',
        recipientName: customerName(order.customer),
        orderNumber: order.orderNumber,
        productName: item.productNameSnapshot,
        requestedDomain: item.requestedDomain,
        total: order.total,
        currency: order.currency,
        orderUrl: this.url('/portal/orders'),
      },
      order.customerId,
    );
  }

  private async resolvePayment(
    paymentId: string,
    invoiceId: string,
  ): Promise<ResolvedEmailMessage> {
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, invoiceId },
      include: { invoice: { include: { customer: true } } },
    });
    if (!payment) throw permanent('EMAIL_PAYMENT_UNAVAILABLE');
    const invoice = payment.invoice;
    return this.render(
      invoice.customerEmailSnapshot,
      {
        key: 'payment-received',
        recipientName: invoice.customerNameSnapshot,
        invoiceNumber: invoice.invoiceNumber,
        amount: payment.amount,
        currency: payment.currency,
        balanceDue: invoice.balanceDue,
        invoiceUrl: this.url(`/portal/invoices/${invoice.id}`),
      },
      invoice.customerId,
      invoice.id,
    );
  }

  private async resolveInvoice(
    eventType:
      | 'EMAIL_INVOICE_CREATED'
      | 'EMAIL_RENEWAL_REMINDER'
      | 'EMAIL_OVERDUE_NOTICE',
    payload: Record<string, unknown>,
  ): Promise<ResolvedEmailMessage> {
    const invoiceId = requiredUuid(payload, 'invoiceId');
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
    });
    if (!invoice) throw permanent('EMAIL_INVOICE_UNAVAILABLE');
    const key =
      eventType === 'EMAIL_INVOICE_CREATED'
        ? 'invoice-created'
        : eventType === 'EMAIL_RENEWAL_REMINDER'
          ? 'renewal-reminder'
          : 'overdue-notice';
    return this.render(
      invoice.customerEmailSnapshot,
      {
        key,
        recipientName: invoice.customerNameSnapshot,
        invoiceNumber: invoice.invoiceNumber,
        total: invoice.total,
        balanceDue: invoice.balanceDue,
        currency: invoice.currency,
        dueAt: invoice.dueAt,
        invoiceUrl: this.url(`/portal/invoices/${invoice.id}`),
        ...(key === 'renewal-reminder'
          ? { reminderNumber: requiredNumber(payload, 'reminderNumber') }
          : {}),
      },
      invoice.customerId,
      invoice.id,
    );
  }

  private async resolveService(
    eventType:
      | 'EMAIL_SERVICE_PROVISIONED'
      | 'EMAIL_SERVICE_SUSPENDED'
      | 'EMAIL_SERVICE_REACTIVATED',
    serviceId: string,
  ): Promise<ResolvedEmailMessage> {
    const service = await this.prisma.service.findUnique({
      where: { id: serviceId },
      include: { customer: { include: { user: true } } },
    });
    if (!service?.domain) throw permanent('EMAIL_SERVICE_UNAVAILABLE');
    const key =
      eventType === 'EMAIL_SERVICE_PROVISIONED'
        ? 'service-provisioned'
        : eventType === 'EMAIL_SERVICE_SUSPENDED'
          ? 'service-suspended'
          : 'service-reactivated';
    return this.render(
      service.customer.user.email,
      {
        key,
        recipientName: customerName(service.customer),
        productName: service.productNameSnapshot,
        domain: service.domain,
        serviceUrl: this.url(`/portal/services/${service.id}`),
        ...(key === 'service-suspended' && service.suspensionReason
          ? { suspensionReason: service.suspensionReason }
          : {}),
      },
      service.customerId,
    );
  }

  private async resolveTicket(
    ticketId: string,
    messageId: string,
  ): Promise<ResolvedEmailMessage> {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      include: {
        customer: { include: { user: true } },
        messages: { where: { id: messageId }, take: 1 },
      },
    });
    const message = ticket?.messages[0];
    if (!ticket || !message) throw permanent('EMAIL_TICKET_REPLY_UNAVAILABLE');
    return this.render(
      ticket.customer.user.email,
      {
        key: 'ticket-reply',
        recipientName: customerName(ticket.customer),
        ticketNumber: ticket.ticketNumber,
        subject: ticket.subject,
        replyExcerpt: message.body.slice(0, 500),
        ticketUrl: this.url('/portal/support'),
      },
      ticket.customerId,
      undefined,
      ticket.id,
    );
  }

  private render(
    recipientEmail: string,
    model: EmailTemplateModel,
    customerId?: string,
    invoiceId?: string,
    ticketId?: string,
  ): ResolvedEmailMessage {
    const rendered = this.templates.render(model, this.branding);
    return {
      templateKey: model.key,
      recipientEmail,
      ...rendered,
      ...(customerId ? { customerId } : {}),
      ...(invoiceId ? { invoiceId } : {}),
      ...(ticketId ? { ticketId } : {}),
    };
  }

  private url(path: string, query?: Record<string, string>): string {
    const base = this.branding.publicWebUrl.endsWith('/')
      ? this.branding.publicWebUrl
      : `${this.branding.publicWebUrl}/`;
    const url = new URL(path.replace(/^\//, ''), base);
    for (const [key, value] of Object.entries(query ?? {})) {
      url.searchParams.set(key, value);
    }
    return url.toString();
  }
}

function customerName(
  customer: {
    firstName: string;
    lastName: string;
    companyName: string | null;
  } | null,
): string {
  if (!customer) return 'there';
  return customer.companyName ?? `${customer.firstName} ${customer.lastName}`;
}

function requiredString(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  if (typeof value !== 'string') throw permanent('EMAIL_EVENT_PAYLOAD_INVALID');
  return value;
}

function requiredUuid(payload: Record<string, unknown>, key: string): string {
  return requiredString(payload, key);
}

function requiredNumber(payload: Record<string, unknown>, key: string): number {
  const value = payload[key];
  if (typeof value !== 'number') throw permanent('EMAIL_EVENT_PAYLOAD_INVALID');
  return value;
}

function permanent(code: string): BackgroundJobError {
  return new BackgroundJobError(
    'PERMANENT',
    code,
    'Email message cannot be resolved.',
  );
}
