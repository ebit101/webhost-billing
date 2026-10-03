import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_BUSINESS_SETTINGS,
  businessSettingsSchema,
  formatInvoiceNumber,
  integrationCredentialUpdateSchema,
  updateBusinessSettingsRequestSchema,
  updatePaymentSettingsRequestSchema,
  PARTIAL_PAYMENT_POLICY_CONFIRMATION,
  settingsOverviewSchema,
} from '../src';

describe('settings contracts', () => {
  it('accepts unchanged requests without confirmation and strict confirmed transition requests', () => {
    for (const [schema, body] of [
      [updateBusinessSettingsRequestSchema, DEFAULT_BUSINESS_SETTINGS],
      [updatePaymentSettingsRequestSchema, { partialPaymentsEnabled: true }],
    ] as const) {
      assert.equal(schema.safeParse(body).success, true);
      assert.equal(
        schema.safeParse({
          ...body,
          partialPaymentPolicyConfirmation: PARTIAL_PAYMENT_POLICY_CONFIRMATION,
        }).success,
        true,
      );
      for (const confirmation of [
        'yes',
        ' CHANGE_PARTIAL_PAYMENT_POLICY ',
        true,
        null,
      ]) {
        assert.equal(
          schema.safeParse({
            ...body,
            partialPaymentPolicyConfirmation: confirmation,
          }).success,
          false,
        );
      }
      assert.equal(
        schema.safeParse({ ...body, approved: true }).success,
        false,
      );
    }
    assert.equal(
      settingsOverviewSchema.safeParse({
        ...DEFAULT_BUSINESS_SETTINGS,
        credentialStatuses: [],
        partialPaymentPolicyConfirmation: PARTIAL_PAYMENT_POLICY_CONFIRMATION,
      }).success,
      false,
    );
  });
  it('validates the complete safe settings document', () => {
    assert.deepEqual(
      businessSettingsSchema.parse(DEFAULT_BUSINESS_SETTINGS),
      DEFAULT_BUSINESS_SETTINGS,
    );
    assert.equal(
      formatInvoiceNumber({ prefix: 'INV', nextNumber: 42, padding: 6 }),
      'INV-000042',
    );
  });

  it('rejects unsafe numbering, timezone drift, and partial credentials', () => {
    assert.equal(
      businessSettingsSchema.safeParse({
        ...DEFAULT_BUSINESS_SETTINGS,
        invoiceNumbering: { prefix: '../INV', nextNumber: 1, padding: 4 },
      }).success,
      false,
    );
    assert.equal(
      businessSettingsSchema.safeParse({
        ...DEFAULT_BUSINESS_SETTINGS,
        renewalAutomation: {
          ...DEFAULT_BUSINESS_SETTINGS.renewalAutomation,
          timeZone: 'UTC',
        },
      }).success,
      false,
    );
    assert.equal(
      integrationCredentialUpdateSchema.safeParse({
        provider: 'bkash',
        confirmation: 'REPLACE_CREDENTIALS',
        credentials: { appKey: 'only-one-field' },
      }).success,
      false,
    );
  });
});
