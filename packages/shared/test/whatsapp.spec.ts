import assert from 'node:assert/strict';
import { it } from 'node:test';
import { metaWhatsAppConfigurationSchema } from '../src/contracts/whatsapp';

const config = {
  senderPhoneNumber: '+8801700000000',
  phoneNumberId: '10000000000168',
  apiVersion: 'v25.0',
  accessToken: 'fictional_token_for_contract_tests',
  templates: {},
};
it('keeps private Meta configuration inactive by default and permits only known template keys', () => {
  assert.equal(metaWhatsAppConfigurationSchema.parse(config).enabled, false);
  for (const value of [
    {
      ...config,
      templates: { 'arbitrary-event': { name: 'hello', language: 'en' } },
    },
    { ...config, phoneNumberId: '../messages' },
    { ...config, apiVersion: 'https://evil.example' },
    { ...config, accessToken: 'token with whitespace' },
    { ...config, senderPhoneNumber: '01700000000' },
    {
      ...config,
      templates: {
        'client-invoice-issued': { name: 'bad name', language: 'en' },
      },
    },
    { ...config, apiBaseUrl: 'https://evil.example' },
  ])
    assert.equal(
      metaWhatsAppConfigurationSchema.safeParse(value).success,
      false,
    );
});
