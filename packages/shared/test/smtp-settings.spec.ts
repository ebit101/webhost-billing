import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  saveSmtpSettingsSchema,
  smtpActivationSchema,
  smtpHostSchema,
  smtpSettingsStatusSchema,
} from '../src';
const valid = {
  host: 'smtp.provider.com',
  connection: { security: 'STARTTLS', port: 587 },
  username: 'fictional-user',
  password: 'fake'.repeat(8),
  confirmation: 'SAVE_SMTP',
};
describe('SMTP settings contracts', () => {
  it('accepts only explicit encrypted connection pairs and exact confirmation', () => {
    assert.equal(saveSmtpSettingsSchema.safeParse(valid).success, true);
    assert.equal(
      saveSmtpSettingsSchema.safeParse({
        ...valid,
        connection: { security: 'TLS', port: 465 },
      }).success,
      true,
    );
    for (const connection of [
      { security: 'NONE', port: 25 },
      { security: 'TLS', port: 587 },
      { security: 'STARTTLS', port: 465 },
      { security: 'STARTTLS', port: '587' },
    ])
      assert.equal(
        saveSmtpSettingsSchema.safeParse({ ...valid, connection }).success,
        false,
      );
    for (const input of [
      { ...valid, confirmation: 'yes' },
      { ...valid, enabled: true },
      { ...valid, password: '' },
      { ...valid, password: 'secret\n' },
      { ...valid, username: 'user\npass' },
    ])
      assert.equal(saveSmtpSettingsSchema.safeParse(input).success, false);
  });
  it('rejects URLs, IPs, private hostnames and malformed DNS labels', () => {
    for (const host of [
      'localhost',
      'mail.internal',
      'localhost.com.local',
      '127.0.0.1',
      '[::1]',
      'https://smtp.provider.com',
      'smtp.provider.com:587',
      'user@smtp.provider.com',
      '-bad.provider.com',
      'smtp..provider.com',
      'smtp.example.test',
    ])
      assert.equal(smtpHostSchema.safeParse(host).success, false);
    assert.equal(
      smtpHostSchema.parse(' SMTP.Provider.com '),
      'smtp.provider.com',
    );
  });
  it('binds activation to a revision and forbids secrets in status responses', () => {
    const revision = 'a'.repeat(64);
    assert.equal(
      smtpActivationSchema.safeParse({
        enabled: true,
        confirmation: 'ENABLE_SMTP',
        revision,
      }).success,
      true,
    );
    assert.equal(
      smtpActivationSchema.safeParse({
        enabled: false,
        confirmation: 'USE_DEPLOYMENT_EMAIL',
        revision,
      }).success,
      true,
    );
    assert.equal(
      smtpActivationSchema.safeParse({
        enabled: true,
        confirmation: 'ENABLE_SMTP',
      }).success,
      false,
    );
    assert.equal(
      smtpActivationSchema.safeParse({
        enabled: false,
        confirmation: 'ENABLE_SMTP',
        revision,
      }).success,
      false,
    );
    const status = {
      configured: false,
      enabled: false,
      host: null,
      connection: null,
      maskedUsername: null,
      passwordConfigured: false,
      updatedAt: null,
      revision: null,
    };
    assert.equal(smtpSettingsStatusSchema.safeParse(status).success, true);
    assert.equal(
      smtpSettingsStatusSchema.safeParse({
        ...status,
        password: valid.password,
      }).success,
      false,
    );
  });
});
