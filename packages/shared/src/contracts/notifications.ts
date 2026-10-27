import { z } from 'zod';

export const notificationCatalog = [
  {
    key: 'client-email-verification',
    audience: 'CUSTOMER',
    label: 'Verify email',
    description: 'Confirm your email address before accessing your account.',
    path: '/portal',
    whatsApp: false,
    existingEmail: true,
  },
  {
    key: 'client-password-reset',
    audience: 'CUSTOMER',
    label: 'Password reset',
    description: 'Use the separately emailed secure reset link.',
    path: '/portal',
    whatsApp: false,
    existingEmail: true,
  },
  {
    key: 'client-welcome',
    audience: 'CUSTOMER',
    label: 'Welcome',
    description: 'Your email is verified and your account is ready.',
    path: '/portal',
    whatsApp: false,
    existingEmail: false,
  },
  {
    key: 'client-security-change',
    audience: 'CUSTOMER',
    label: 'Account security changed',
    description: 'Your account security settings changed. Review your account.',
    path: '/portal/profile',
    whatsApp: false,
    existingEmail: false,
  },
  {
    key: 'client-order-received',
    audience: 'CUSTOMER',
    label: 'Order received',
    description: 'Your order has been received.',
    path: '/portal/orders',
    whatsApp: false,
    existingEmail: true,
  },
  {
    key: 'client-order-approved',
    audience: 'CUSTOMER',
    label: 'Order approved',
    description: 'Your order is being processed.',
    path: '/portal/orders',
    whatsApp: false,
    existingEmail: true,
  },
  {
    key: 'client-invoice-issued',
    audience: 'CUSTOMER',
    label: 'Invoice issued',
    description: 'An invoice is available in your portal.',
    path: '/portal/invoices',
    whatsApp: true,
    existingEmail: true,
  },
  {
    key: 'client-renewal-reminder',
    audience: 'CUSTOMER',
    label: 'Renewal reminder',
    description: 'Review your upcoming renewal and invoice.',
    path: '/portal/invoices',
    whatsApp: false,
    existingEmail: true,
  },
  {
    key: 'client-overdue-notice',
    audience: 'CUSTOMER',
    label: 'Overdue notice',
    description: 'An invoice is overdue. Review the balance in your portal.',
    path: '/portal/invoices',
    whatsApp: true,
    existingEmail: true,
  },
  {
    key: 'client-final-warning',
    audience: 'CUSTOMER',
    label: 'Final suspension warning',
    description:
      'An unpaid hosting renewal is approaching its configured suspension deadline.',
    path: '/portal/invoices',
    whatsApp: true,
    existingEmail: false,
  },
  {
    key: 'client-payment-receipt',
    audience: 'CUSTOMER',
    label: 'Payment receipt',
    description: 'A verified payment has been recorded.',
    path: '/portal/invoices',
    whatsApp: false,
    existingEmail: true,
  },
  {
    key: 'client-hosting-ready',
    audience: 'CUSTOMER',
    label: 'Hosting ready',
    description: 'Your hosting service has been activated.',
    path: '/portal/services',
    whatsApp: false,
    existingEmail: true,
  },
  {
    key: 'client-service-suspended',
    audience: 'CUSTOMER',
    label: 'Service suspended',
    description:
      'Your service suspension is confirmed. Review the service in your portal.',
    path: '/portal/services',
    whatsApp: true,
    existingEmail: true,
  },
  {
    key: 'client-service-restored',
    audience: 'CUSTOMER',
    label: 'Service restored',
    description: 'Your service reactivation is confirmed.',
    path: '/portal/services',
    whatsApp: true,
    existingEmail: true,
  },
  {
    key: 'client-domain-registered',
    audience: 'CUSTOMER',
    label: 'Domain registered',
    description: 'Your domain registration has been confirmed.',
    path: '/portal/domains',
    whatsApp: false,
    existingEmail: false,
  },
  {
    key: 'client-domain-renewed',
    audience: 'CUSTOMER',
    label: 'Domain renewed',
    description: 'Your domain renewal has been confirmed.',
    path: '/portal/domains',
    whatsApp: false,
    existingEmail: false,
  },
  {
    key: 'client-domain-renewal-reminder',
    audience: 'CUSTOMER',
    label: 'Domain renewal reminder',
    description: 'Your domain expiry is approaching. Review renewal options.',
    path: '/portal/domains',
    whatsApp: false,
    existingEmail: false,
  },
  {
    key: 'client-domain-expiry-warning',
    audience: 'CUSTOMER',
    label: 'Final domain expiry warning',
    description: 'Your domain is approaching expiry. Review it promptly.',
    path: '/portal/domains',
    whatsApp: true,
    existingEmail: false,
  },
  {
    key: 'client-support-reply',
    audience: 'CUSTOMER',
    label: 'Support reply',
    description: 'A staff reply is available in your support ticket.',
    path: '/portal/support',
    whatsApp: false,
    existingEmail: true,
  },
  {
    key: 'client-urgent-support',
    audience: 'CUSTOMER',
    label: 'Urgent support update',
    description: 'An urgent support ticket needs your attention.',
    path: '/portal/support',
    whatsApp: true,
    existingEmail: true,
  },
  {
    key: 'client-payment-adjustment',
    audience: 'CUSTOMER',
    label: 'Refund or reversal recorded',
    description:
      'A payment adjustment was recorded. Review your invoice history.',
    path: '/portal/invoices',
    whatsApp: false,
    existingEmail: false,
  },
  {
    key: 'admin-customer-verified',
    audience: 'ADMIN',
    label: 'Customer verified',
    description: 'A customer has completed email verification.',
    path: '/admin/customers',
    whatsApp: false,
    existingEmail: false,
  },
  {
    key: 'admin-new-order',
    audience: 'ADMIN',
    label: 'New order',
    description: 'A new order needs review.',
    path: '/admin/orders',
    whatsApp: false,
    existingEmail: false,
  },
  {
    key: 'admin-payment-review',
    audience: 'ADMIN',
    label: 'Payment verification needed',
    description:
      'A manual-payment claim needs verification. It is not proof of payment.',
    path: '/admin/payments',
    whatsApp: true,
    existingEmail: false,
  },
  {
    key: 'admin-payment-confirmed',
    audience: 'ADMIN',
    label: 'Payment confirmed',
    description: 'A verified payment has been recorded.',
    path: '/admin/payments',
    whatsApp: false,
    existingEmail: false,
  },
  {
    key: 'admin-payment-adjustment',
    audience: 'ADMIN',
    label: 'Refund or reversal recorded',
    description: 'A payment adjustment was recorded.',
    path: '/admin/payments',
    whatsApp: false,
    existingEmail: false,
  },
  {
    key: 'admin-support-activity',
    audience: 'ADMIN',
    label: 'Support activity',
    description: 'A new ticket or customer reply needs attention.',
    path: '/admin/support',
    whatsApp: false,
    existingEmail: false,
  },
  {
    key: 'admin-urgent-support',
    audience: 'ADMIN',
    label: 'Urgent support update',
    description: 'An urgent support ticket needs attention.',
    path: '/admin/support',
    whatsApp: true,
    existingEmail: true,
  },
  {
    key: 'admin-provisioning-problem',
    audience: 'ADMIN',
    label: 'Hosting operation needs attention',
    description:
      'A hosting operation failed or has an uncertain outcome. Review before retrying.',
    path: '/admin/automation',
    whatsApp: true,
    existingEmail: false,
  },
  {
    key: 'admin-domain-problem',
    audience: 'ADMIN',
    label: 'Domain operation needs attention',
    description:
      'A domain operation failed or has an uncertain outcome. Review before retrying.',
    path: '/admin/domains',
    whatsApp: true,
    existingEmail: false,
  },
  {
    key: 'admin-security-alert',
    audience: 'ADMIN',
    label: 'Account security changed',
    description:
      'Your administrator account security changed. Review your account.',
    path: '/admin',
    whatsApp: true,
    existingEmail: false,
  },
  {
    key: 'admin-delivery-failure',
    audience: 'ADMIN',
    label: 'Notification delivery needs attention',
    description:
      'A notification failed or has an uncertain outcome. Review the failed background job.',
    path: '/admin/automation',
    whatsApp: true,
    existingEmail: false,
  },
  {
    key: 'admin-automation-failure',
    audience: 'ADMIN',
    label: 'Automation needs attention',
    description: 'A background operation failed or requires reconciliation.',
    path: '/admin/automation',
    whatsApp: true,
    existingEmail: false,
  },
  {
    key: 'admin-daily-summary',
    audience: 'ADMIN',
    label: 'Daily operations summary',
    description:
      'Review pending orders, overdue invoices, expiring domains and unresolved operations.',
    path: '/admin',
    whatsApp: false,
    existingEmail: false,
  },
] as const;

export type NotificationKey = (typeof notificationCatalog)[number]['key'];
export const notificationKeySchema = z.enum(
  notificationCatalog.map((item) => item.key),
);
export const notificationChannelSchema = z.enum(['EMAIL', 'WHATSAPP']);
export const notificationStatusSchema = z.enum([
  'DISABLED',
  'QUEUED',
  'PREVIEWED',
  'SUPPRESSED',
  'FAILED',
]);
export const notificationPreferencesRequestSchema = z
  .object({
    whatsAppEnabled: z.boolean(),
    phone: z
      .string()
      .regex(/^\+[1-9][0-9]{7,14}$/)
      .optional(),
  })
  .strict();
export type NotificationPreferencesRequest = z.infer<
  typeof notificationPreferencesRequestSchema
>;
export const notificationPreferencesSchema = z.object({
  whatsAppEnabled: z.boolean(),
  maskedPhone: z.string().nullable(),
  deliveryMode: z.enum(['disabled', 'preview']),
});
export type NotificationPreferences = z.infer<
  typeof notificationPreferencesSchema
>;
export const notificationListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(10000).default(1),
    channel: notificationChannelSchema.optional(),
  })
  .strict();
export type NotificationListQuery = z.infer<typeof notificationListQuerySchema>;
export const notificationEntrySchema = z.object({
  id: z.uuid(),
  key: notificationKeySchema,
  channel: notificationChannelSchema,
  status: notificationStatusSchema,
  createdAt: z.iso.datetime(),
  completedAt: z.iso.datetime().nullable(),
});
export type NotificationEntry = z.infer<typeof notificationEntrySchema>;

export function notificationDefinition(key: NotificationKey) {
  return notificationCatalog.find((item) => item.key === key)!;
}

export function normalizeNotificationPhone(
  phone: string | null | undefined,
  countryCode?: string,
): string | null {
  if (!phone) return null;
  let normalized = phone.replace(/[\s()-]/g, '');
  if (countryCode === 'BD' && /^01[0-9]{9}$/.test(normalized))
    normalized = '+880' + normalized.slice(1);
  return /^\+[1-9][0-9]{7,14}$/.test(normalized) ? normalized : null;
}
