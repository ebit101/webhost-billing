import { EmailTemplateCatalog } from './email-template.catalog';
import type { EmailBranding, EmailTemplateModel } from './email.types';

const branding: EmailBranding = {
  brandName: 'Webhost Billing',
  brandColor: '#0891b2',
  fromAddress: 'no-reply@example.test',
  fromName: 'Webhost Billing',
  replyToAddress: 'support@example.test',
  publicWebUrl: 'https://billing.example.test',
};

const common = { recipientName: 'Amina Rahman' };
const models: EmailTemplateModel[] = [
  {
    ...common,
    key: 'email-verification',
    actionUrl: 'https://billing.example.test/verify-email?token=test',
    expiresAt: new Date('2026-08-26T12:00:00.000Z'),
  },
  {
    ...common,
    key: 'password-reset',
    actionUrl: 'https://billing.example.test/reset-password?token=test',
    expiresAt: new Date('2026-08-26T12:00:00.000Z'),
  },
  ...(['order-received', 'order-approved'] as const).map((key) => ({
    ...common,
    key,
    orderNumber: 'ORD-1001',
    productName: 'Starter Hosting',
    requestedDomain: 'customer.example.test',
    total: 120_000n,
    currency: 'BDT',
    orderUrl: 'https://billing.example.test/portal/orders',
  })),
  {
    ...common,
    key: 'payment-received',
    invoiceNumber: 'INV-1001',
    amount: 120_000n,
    balanceDue: 0n,
    currency: 'BDT',
    invoiceUrl: 'https://billing.example.test/portal/invoices/test',
  },
  ...(['invoice-created', 'renewal-reminder', 'overdue-notice'] as const).map(
    (key) => ({
      ...common,
      key,
      invoiceNumber: 'INV-1001',
      total: 120_000n,
      balanceDue: 120_000n,
      currency: 'BDT',
      dueAt: new Date('2026-09-01T03:00:00.000Z'),
      invoiceUrl: 'https://billing.example.test/portal/invoices/test',
      ...(key === 'renewal-reminder' ? { reminderNumber: 1 } : {}),
    }),
  ),
  ...(
    ['service-provisioned', 'service-suspended', 'service-reactivated'] as const
  ).map((key) => ({
    ...common,
    key,
    productName: 'Starter Hosting',
    domain: 'customer.example.test',
    serviceUrl: 'https://billing.example.test/portal/services/test',
    ...(key === 'service-suspended'
      ? { suspensionReason: 'Invoice overdue' }
      : {}),
  })),
  {
    ...common,
    key: 'ticket-reply',
    ticketNumber: 'TKT-1001',
    subject: 'Help with DNS',
    replyExcerpt: 'We updated the record.',
    ticketUrl: 'https://billing.example.test/portal/support',
  },
];

describe('EmailTemplateCatalog', () => {
  const catalog = new EmailTemplateCatalog();

  it.each(models.map((model) => [model.key, model] as const))(
    'renders responsive HTML and a plain-text fallback for %s',
    (_key, model) => {
      const rendered = catalog.render(model, branding);

      expect(rendered.subject).toBeTruthy();
      expect(rendered.subject).not.toMatch(/[\r\n]/);
      expect(rendered.text).toContain('Webhost Billing');
      expect(rendered.text).toContain('Amina Rahman');
      expect(rendered.html).toContain('<meta name="viewport"');
      expect(rendered.html).toContain('@media(max-width:600px)');
      expect(rendered.html).toContain('Webhost Billing');
    },
  );

  it('escapes customer-controlled values in HTML and keeps them literal in text', () => {
    const rendered = catalog.render(
      {
        key: 'ticket-reply',
        recipientName: '<img src=x onerror=alert(1)>',
        ticketNumber: 'TKT-1002',
        subject: '<script>alert(1)</script>',
        replyExcerpt: '<a href="javascript:alert(1)">unsafe</a>',
        ticketUrl: 'https://billing.example.test/portal/support',
      },
      branding,
    );

    expect(rendered.html).not.toContain('<script>');
    expect(rendered.html).not.toContain('<img');
    expect(rendered.html).not.toContain('<a href="javascript:');
    expect(rendered.html).toContain('&lt;script&gt;');
    expect(rendered.text).toContain('<script>alert(1)</script>');
  });
});
