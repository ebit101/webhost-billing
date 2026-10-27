import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  notificationCatalog,
  normalizeNotificationPhone,
  notificationPreferencesRequestSchema,
  notificationListQuerySchema,
} from '../src/contracts/notifications';

describe('notification policy', () => {
  it('keeps WhatsApp on a closed important-event list including invoice issue and overdue', () => {
    const important = notificationCatalog
      .filter((item) => item.whatsApp)
      .map((item) => item.key);
    assert.deepEqual(
      [...important].sort(),
      [
        'admin-automation-failure',
        'admin-delivery-failure',
        'admin-domain-problem',
        'admin-payment-review',
        'admin-provisioning-problem',
        'admin-security-alert',
        'admin-urgent-support',
        'client-domain-expiry-warning',
        'client-final-warning',
        'client-invoice-issued',
        'client-overdue-notice',
        'client-service-restored',
        'client-service-suspended',
        'client-urgent-support',
      ].sort(),
    );
    for (const key of [
      'client-password-reset',
      'client-email-verification',
      'client-payment-receipt',
      'admin-daily-summary',
    ])
      assert(!important.includes(key as (typeof important)[number]));
    assert.equal(
      new Set(notificationCatalog.map((item) => item.key)).size,
      notificationCatalog.length,
    );
    assert(
      notificationCatalog.every((item) =>
        item.path.startsWith(item.audience === 'ADMIN' ? '/admin' : '/portal'),
      ),
    );
  });
  it('does not require opt-in and rejects recipient or event injection', () => {
    assert.deepEqual(
      notificationPreferencesRequestSchema.parse({ whatsAppEnabled: true }),
      { whatsAppEnabled: true },
    );
    assert.equal(
      notificationPreferencesRequestSchema.safeParse({
        whatsAppEnabled: true,
        userId: 'someone-else',
      }).success,
      false,
    );
    assert.equal(
      notificationPreferencesRequestSchema.safeParse({
        whatsAppEnabled: true,
        phone: '01700000001',
      }).success,
      false,
    );
    assert.equal(
      notificationListQuerySchema.safeParse({ page: 0 }).success,
      false,
    );
    assert.equal(
      notificationListQuerySchema.safeParse({ userId: 'someone-else' }).success,
      false,
    );
  });
  it('normalizes a Bangladesh account phone without guessing other country codes', () => {
    assert.equal(
      normalizeNotificationPhone('01700-000001', 'BD'),
      '+8801700000001',
    );
    assert.equal(
      normalizeNotificationPhone('+880 1700 000001'),
      '+8801700000001',
    );
    assert.equal(normalizeNotificationPhone('01700000001', 'US'), null);
    assert.equal(normalizeNotificationPhone('123'), null);
  });
});
