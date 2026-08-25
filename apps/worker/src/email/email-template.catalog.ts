import { Injectable } from '@nestjs/common';
import type { EmailBranding, EmailTemplateModel } from './email.types';

export interface RenderedTemplate {
  subject: string;
  text: string;
  html: string;
}

@Injectable()
export class EmailTemplateCatalog {
  render(model: EmailTemplateModel, branding: EmailBranding): RenderedTemplate {
    const content = this.content(model);
    return {
      subject: sanitizeSubject(content.subject),
      text: textLayout(branding, model.recipientName, content),
      html: htmlLayout(branding, model.recipientName, content),
    };
  }

  private content(model: EmailTemplateModel): TemplateContent {
    switch (model.key) {
      case 'email-verification':
        return actionContent(
          'Verify your email address',
          'Confirm your email address to activate your customer account.',
          'Verify email',
          model.actionUrl,
          `This link expires ${formatDateTime(model.expiresAt)}.`,
        );
      case 'password-reset':
        return actionContent(
          'Reset your password',
          'A password reset was requested for your account. If this was not you, you can ignore this message.',
          'Reset password',
          model.actionUrl,
          `This link expires ${formatDateTime(model.expiresAt)}.`,
        );
      case 'order-received':
        return actionContent(
          `Order ${model.orderNumber} received`,
          `We received your order for ${model.productName}.`,
          'View order',
          model.orderUrl,
          details([
            ['Domain', model.requestedDomain],
            ['Total', formatMoney(model.total, model.currency)],
          ]),
        );
      case 'order-approved':
        return actionContent(
          `Order ${model.orderNumber} approved`,
          `Your order for ${model.productName} has been approved and is moving to service setup.`,
          'View order',
          model.orderUrl,
          details([
            ['Domain', model.requestedDomain],
            ['Total', formatMoney(model.total, model.currency)],
          ]),
        );
      case 'payment-received':
        return actionContent(
          `Payment received for invoice ${model.invoiceNumber}`,
          'Your verified payment has been recorded.',
          'View invoice',
          model.invoiceUrl,
          details([
            ['Payment', formatMoney(model.amount, model.currency)],
            ['Balance due', formatMoney(model.balanceDue, model.currency)],
          ]),
        );
      case 'invoice-created':
        return invoiceContent(
          `Invoice ${model.invoiceNumber} created`,
          'A new invoice is ready for your review.',
          model,
        );
      case 'renewal-reminder':
        return invoiceContent(
          `Renewal reminder for invoice ${model.invoiceNumber}`,
          `This is renewal reminder ${model.reminderNumber ?? 1}.`,
          model,
        );
      case 'overdue-notice':
        return invoiceContent(
          `Invoice ${model.invoiceNumber} is overdue`,
          'Your invoice remains unpaid after its due date. Please review it to avoid service interruption.',
          model,
        );
      case 'service-provisioned':
        return serviceContent(
          `${model.productName} is ready`,
          'Your hosting service has been provisioned and is now active.',
          model,
        );
      case 'service-suspended':
        return serviceContent(
          `${model.productName} has been suspended`,
          'Your hosting service is currently suspended.',
          model,
          model.suspensionReason
            ? `Reason: ${model.suspensionReason}`
            : undefined,
        );
      case 'service-reactivated':
        return serviceContent(
          `${model.productName} has been reactivated`,
          'Your hosting service is active again.',
          model,
        );
      case 'ticket-reply':
        return actionContent(
          `New reply on ticket ${model.ticketNumber}`,
          `There is a new reply to “${model.subject}”.`,
          'View ticket',
          model.ticketUrl,
          model.replyExcerpt,
        );
    }
  }
}

interface TemplateContent {
  subject: string;
  lead: string;
  actionLabel?: string;
  actionUrl?: string;
  secondary?: string;
}

function actionContent(
  subject: string,
  lead: string,
  actionLabel: string,
  actionUrl: string,
  secondary?: string,
): TemplateContent {
  return { subject, lead, actionLabel, actionUrl, secondary };
}

function invoiceContent(
  subject: string,
  lead: string,
  model: Extract<
    EmailTemplateModel,
    { key: 'invoice-created' | 'renewal-reminder' | 'overdue-notice' }
  >,
): TemplateContent {
  return actionContent(
    subject,
    lead,
    'View invoice',
    model.invoiceUrl,
    details([
      ['Total', formatMoney(model.total, model.currency)],
      ['Balance due', formatMoney(model.balanceDue, model.currency)],
      ['Due date', formatDate(model.dueAt)],
    ]),
  );
}

function serviceContent(
  subject: string,
  lead: string,
  model: Extract<
    EmailTemplateModel,
    {
      key: 'service-provisioned' | 'service-suspended' | 'service-reactivated';
    }
  >,
  note?: string,
): TemplateContent {
  return actionContent(
    subject,
    lead,
    'View service',
    model.serviceUrl,
    [details([['Domain', model.domain]]), note].filter(Boolean).join('\n'),
  );
}

function details(rows: readonly (readonly [string, string])[]): string {
  return rows.map(([label, value]) => `${label}: ${value}`).join('\n');
}

function textLayout(
  branding: EmailBranding,
  recipientName: string,
  content: TemplateContent,
): string {
  return [
    branding.brandName,
    '',
    `Hello ${recipientName},`,
    '',
    content.lead,
    content.secondary ? `\n${content.secondary}` : '',
    content.actionUrl && content.actionLabel
      ? `\n${content.actionLabel}: ${content.actionUrl}`
      : '',
    '',
    `Need help? Contact ${branding.replyToAddress ?? branding.fromAddress}.`,
    '',
    `— ${branding.brandName}`,
  ]
    .filter((line) => line !== undefined)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
}

function htmlLayout(
  branding: EmailBranding,
  recipientName: string,
  content: TemplateContent,
): string {
  const secondary = content.secondary
    ? `<div style="margin:20px 0;padding:16px;border-radius:12px;background:#f1f5f9;color:#334155;white-space:pre-line">${escapeHtml(content.secondary)}</div>`
    : '';
  const action =
    content.actionUrl && content.actionLabel
      ? `<p style="margin:24px 0"><a href="${escapeHtml(content.actionUrl)}" style="display:inline-block;border-radius:10px;background:${escapeHtml(branding.brandColor)};color:#ffffff;padding:12px 20px;text-decoration:none;font-weight:700">${escapeHtml(content.actionLabel)}</a></p><p style="font-size:12px;color:#64748b;word-break:break-all">${escapeHtml(content.actionUrl)}</p>`
      : '';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>@media(max-width:600px){.email-card{width:100%!important}.email-pad{padding:24px!important}}</style></head>
<body style="margin:0;background:#f1f5f9;color:#0f172a;font-family:Arial,sans-serif"><div style="display:none;max-height:0;overflow:hidden">${escapeHtml(content.lead)}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f1f5f9;padding:24px 12px"><tr><td align="center"><table role="presentation" width="600" class="email-card" cellspacing="0" cellpadding="0" style="width:600px;max-width:100%;background:#ffffff;border-radius:16px;overflow:hidden"><tr><td class="email-pad" style="padding:28px 36px;background:${escapeHtml(branding.brandColor)};color:#ffffff;font-size:20px;font-weight:700">${escapeHtml(branding.brandName)}</td></tr><tr><td class="email-pad" style="padding:36px;line-height:1.6"><h1 style="margin:0 0 20px;font-size:26px;line-height:1.25">${escapeHtml(content.subject)}</h1><p>Hello ${escapeHtml(recipientName)},</p><p>${escapeHtml(content.lead)}</p>${secondary}${action}<p style="margin-top:32px;color:#475569;font-size:14px">Need help? Contact <a href="mailto:${escapeHtml(branding.replyToAddress ?? branding.fromAddress)}">${escapeHtml(branding.replyToAddress ?? branding.fromAddress)}</a>.</p><p style="color:#475569">— ${escapeHtml(branding.brandName)}</p></td></tr></table></td></tr></table></body></html>`;
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[character] ?? character;
  });
}

function sanitizeSubject(value: string): string {
  return value
    .replace(/[\r\n]+/g, ' ')
    .trim()
    .slice(0, 255);
}

function formatMoney(amount: bigint, currency: string): string {
  const fractionDigits =
    new Intl.NumberFormat('en', {
      style: 'currency',
      currency,
    }).resolvedOptions().maximumFractionDigits ?? 2;
  const divisor = 10n ** BigInt(fractionDigits);
  const whole = amount / divisor;
  const fraction = (amount % divisor).toString().padStart(fractionDigits, '0');
  return `${currency} ${whole.toLocaleString('en-US')}${fractionDigits > 0 ? `.${fraction}` : ''}`;
}

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(value);
}

function formatDateTime(value: Date): string {
  return `${formatDate(value)} at ${new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: 'UTC',
  }).format(value)} UTC`;
}
