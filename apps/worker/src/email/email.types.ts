import type { EmailTemplateKey } from '@webhost-billing/shared';

export interface EmailBranding {
  brandName: string;
  brandColor: string;
  fromAddress: string;
  fromName: string;
  replyToAddress?: string;
  publicWebUrl: string;
}

interface BaseTemplateModel {
  recipientName: string;
}

export type EmailTemplateModel =
  | (BaseTemplateModel & {
      key: 'email-verification' | 'password-reset';
      actionUrl: string;
      expiresAt: Date;
    })
  | (BaseTemplateModel & {
      key: 'order-received' | 'order-approved';
      orderNumber: string;
      productName: string;
      requestedDomain: string;
      total: bigint;
      currency: string;
      orderUrl: string;
    })
  | (BaseTemplateModel & {
      key: 'payment-received';
      invoiceNumber: string;
      amount: bigint;
      currency: string;
      balanceDue: bigint;
      invoiceUrl: string;
    })
  | (BaseTemplateModel & {
      key: 'invoice-created' | 'renewal-reminder' | 'overdue-notice';
      invoiceNumber: string;
      total: bigint;
      balanceDue: bigint;
      currency: string;
      dueAt: Date;
      invoiceUrl: string;
      reminderNumber?: number;
    })
  | (BaseTemplateModel & {
      key: 'service-provisioned' | 'service-suspended' | 'service-reactivated';
      productName: string;
      domain: string;
      serviceUrl: string;
      suspensionReason?: string;
    })
  | (BaseTemplateModel & {
      key: 'ticket-reply';
      ticketNumber: string;
      subject: string;
      replyExcerpt: string;
      ticketUrl: string;
    });

export interface ResolvedEmailMessage {
  templateKey: EmailTemplateKey;
  recipientEmail: string;
  subject: string;
  text: string;
  html: string;
  customerId?: string;
  invoiceId?: string;
  ticketId?: string;
}

export interface EmailSendRequest extends ResolvedEmailMessage {
  messageId: string;
}

export interface EmailSendResult {
  provider: string;
  providerMessageId: string;
}

export interface EmailAdapter {
  readonly key: string;
  send(message: EmailSendRequest): Promise<EmailSendResult>;
  close(): Promise<void>;
}
