import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import type { PrismaClient } from '@webhost-billing/database';
import {
  notificationCatalog,
  type MetaWhatsAppConfiguration,
} from '@webhost-billing/shared';
import { MetaWhatsAppAdapter } from './meta-whatsapp.adapter';
import {
  MetaWhatsAppConfigurationCipher,
  META_WHATSAPP_KEY_VERSION,
} from './meta-whatsapp-configuration-cipher';
import {
  whatsAppTemplateBody,
  type WhatsAppNotificationMessage,
} from './whatsapp-message';

const secret = 'fictional-encryption-key-'.repeat(3);
const message: WhatsAppNotificationMessage = {
  id: '10000000-0000-4000-8000-000000000168',
  key: 'client-invoice-issued',
  recipient: '+8801700000168',
  text: 'Local preview only',
  brandName: 'Example hosting',
  reference: 'INV-TEST',
  detail: 'Balance due: BDT 3900.00; due 02/11/2026',
  publicWebUrl: 'https://billing.example.test',
};
const config: MetaWhatsAppConfiguration = {
  enabled: true,
  senderPhoneNumber: '+8801700000000',
  phoneNumberId: '10000000000168',
  apiVersion: 'v25.0',
  accessToken: 'fictional_meta_token_for_offline_tests',
  templates: {
    'client-invoice-issued': { name: 'invoice_issued', language: 'en_US' },
  },
};
function encrypt(value: unknown) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(
    'aes-256-gcm',
    createHash('sha256')
      .update('webhost-billing:meta-whatsapp-configuration:v1\0')
      .update(secret)
      .digest(),
    iv,
  );
  cipher.setAAD(Buffer.from(META_WHATSAPP_KEY_VERSION));
  const data = Buffer.concat([
    cipher.update(JSON.stringify(value), 'utf8'),
    cipher.final(),
  ]);
  return [
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    data.toString('base64url'),
  ].join('.');
}
function harness(value: unknown = config, enabled = true) {
  const read = jest.fn(() =>
    Promise.resolve({
      keyVersion: META_WHATSAPP_KEY_VERSION,
      ciphertext: encrypt(value),
    }),
  );
  const prisma = {
    integrationCredential: { findUnique: read },
  } as unknown as Pick<PrismaClient, 'integrationCredential'>;
  const request = jest
    .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
    .mockResolvedValue(
      new Response(
        JSON.stringify({
          messaging_product: 'whatsapp',
          contacts: [{ input: '8801700000168', wa_id: '8801700000168' }],
          messages: [{ id: 'wamid.fictional168' }],
        }),
      ),
    );
  request.mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        id: config.phoneNumberId,
        display_phone_number: config.senderPhoneNumber,
      }),
    ),
  );
  return {
    read,
    request,
    adapter: new MetaWhatsAppAdapter(prisma, secret, enabled, request),
  };
}

describe('Meta WhatsApp Cloud API adapter (offline HTTP only)', () => {
  it('protects private settings with randomized authenticated encryption and a dedicated context', () => {
    const cipher = new MetaWhatsAppConfigurationCipher(secret);
    const ciphertext = cipher.encrypt(config);
    expect(ciphertext).not.toContain(config.accessToken);
    expect(ciphertext).not.toContain(config.senderPhoneNumber);
    expect(cipher.encrypt(config)).not.toBe(ciphertext);
    expect(cipher.decrypt(META_WHATSAPP_KEY_VERSION, ciphertext)).toEqual(
      config,
    );
    expect(cipher.decrypt(META_WHATSAPP_KEY_VERSION, encrypt(config))).toEqual(
      config,
    );
    for (const [version, value] of [
      ['wrong', ciphertext],
      [META_WHATSAPP_KEY_VERSION, ciphertext + 'x'],
      [META_WHATSAPP_KEY_VERSION, 'garbage'],
    ])
      expect(() => cipher.decrypt(version, value)).toThrow(
        'Protected WhatsApp configuration is unavailable.',
      );
    expect(() =>
      new MetaWhatsAppConfigurationCipher('different secret').decrypt(
        META_WHATSAPP_KEY_VERSION,
        ciphertext,
      ),
    ).toThrow();
  });
  it('refuses a phone-number ID bound to another sender before submitting a message', async () => {
    const h = harness();
    h.request.mockReset();
    h.request.mockResolvedValue(
      new Response(
        JSON.stringify({
          id: config.phoneNumberId,
          display_phone_number: '+8801700000999',
        }),
      ),
    );
    await expect(h.adapter.send(message)).rejects.toMatchObject({
      kind: 'CONFIGURATION',
    });
    expect(h.request).toHaveBeenCalledTimes(1);
    expect(h.request.mock.calls[0][1]?.method).toBe('GET');
  });
  it('does not read credentials or touch the network with the live gate off', async () => {
    const h = harness(config, false);
    expect(await h.adapter.send(message)).toEqual({ status: 'DISABLED' });
    expect(h.read).not.toHaveBeenCalled();
    expect(h.request).not.toHaveBeenCalled();
  });
  it('does not send from an inactive configuration or missing template', async () => {
    const inactive = harness({ ...config, enabled: false });
    expect(await inactive.adapter.send(message)).toEqual({
      status: 'DISABLED',
    });
    expect(inactive.request).not.toHaveBeenCalled();
    const missing = harness({ ...config, templates: {} });
    await expect(missing.adapter.send(message)).rejects.toMatchObject({
      kind: 'CONFIGURATION',
    });
    expect(missing.request).not.toHaveBeenCalled();
  });
  it('sends the approved template to the pinned graph host with private bearer auth and records acceptance only', async () => {
    const h = harness();
    expect(await h.adapter.send(message)).toEqual({
      status: 'ACCEPTED',
      providerMessageId: 'wamid.fictional168',
    });
    expect(h.request).toHaveBeenCalledTimes(2);
    const [url, init] = h.request.mock.calls[1];
    const requestBody = typeof init?.body === 'string' ? init.body : '';
    expect(url).toBe(
      'https://graph.facebook.com/v25.0/10000000000168/messages',
    );
    expect(init).toMatchObject({
      method: 'POST',
      redirect: 'error',
      headers: { Authorization: `Bearer ${config.accessToken}` },
    });
    expect(JSON.parse(requestBody)).toEqual({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: '8801700000168',
      type: 'template',
      template: {
        name: 'invoice_issued',
        language: { code: 'en_US' },
        components: [whatsAppTemplateBody(message).component],
      },
      biz_opaque_callback_data: message.id,
    });
    expect(requestBody).not.toContain(config.accessToken);
    expect(requestBody).not.toContain(config.senderPhoneNumber);
  });
  it.each([
    'client-password-reset',
    'client-email-verification',
    'admin-daily-summary',
  ] as const)('rejects non-important %s before networking', async (key) => {
    const h = harness({
      ...config,
      templates: { [key]: { name: 'not_allowed', language: 'en' } },
    });
    await expect(h.adapter.send({ ...message, key })).rejects.toMatchObject({
      kind: 'CONFIGURATION',
    });
    expect(h.request).not.toHaveBeenCalled();
  });
  it('builds a bounded authenticated destination for every important Admin and Client alert', () => {
    for (const item of notificationCatalog.filter((entry) => entry.whatsApp)) {
      const body = whatsAppTemplateBody({ ...message, key: item.key });
      expect(body.component.parameters[3].text).toBe(
        `https://billing.example.test${item.path}`,
      );
      expect(body.to).toBe('8801700000168');
    }
  });
  it.each([
    { publicWebUrl: 'https://billing.example.test@evil.example/path' },
    { publicWebUrl: 'http://public.example.test' },
    { publicWebUrl: 'not-a-url' },
    { detail: 'line\nbreak' },
    { recipient: '01700000168' },
  ])(
    'rejects malformed destination/content without leaking input or networking',
    async (overrides) => {
      const h = harness();
      await expect(
        h.adapter.send({ ...message, ...overrides }),
      ).rejects.toMatchObject({
        kind: 'CONFIGURATION',
        message: 'WhatsApp submission configuration.',
      });
      expect(h.request).not.toHaveBeenCalled();
    },
  );
  it('rejects corrupt encrypted settings and untrusted endpoint/phone-number identifiers', async () => {
    for (const value of [
      { ...config, apiVersion: '../../evil' },
      { ...config, phoneNumberId: 'https://evil.example' },
      { ...config, accessToken: 'token\r\nsecret' },
    ]) {
      const h = harness(value);
      await expect(h.adapter.send(message)).rejects.toMatchObject({
        kind: 'CONFIGURATION',
      });
      expect(h.request).not.toHaveBeenCalled();
    }
    const h = harness();
    h.read.mockResolvedValue({
      keyVersion: 'v1',
      ciphertext: 'corrupt-secret-do-not-log',
    });
    await expect(h.adapter.send(message)).rejects.toMatchObject({
      message: 'WhatsApp submission configuration.',
    });
  });
  it.each([400, 401, 403, 422])(
    'redacts a definite HTTP %s rejection',
    async (status) => {
      const h = harness();
      h.request.mockResolvedValue(
        new Response('raw sensitive provider error', { status }),
      );
      await expect(h.adapter.send(message)).rejects.toMatchObject({
        kind: 'REJECTED',
        message: 'WhatsApp submission rejected.',
      });
      expect(h.request).toHaveBeenCalledTimes(2);
    },
  );
  it('does not retry a timeout, 5xx, invalid JSON, oversized response or mismatched recipient', async () => {
    const cases = [
      new Response('provider unavailable', { status: 503 }),
      new Response('invalid JSON'),
      new Response('x'.repeat(16385)),
      new Response(
        JSON.stringify({
          messaging_product: 'whatsapp',
          contacts: [{ input: 'someone-else', wa_id: 'someone-else' }],
          messages: [{ id: 'wamid.other' }],
        }),
      ),
      new Response(
        JSON.stringify({
          messaging_product: 'whatsapp',
          contacts: [{ input: '8801700000168', wa_id: '8801700000168' }],
          messages: [],
        }),
      ),
    ];
    for (const response of cases) {
      const h = harness();
      h.request.mockResolvedValue(response);
      await expect(h.adapter.send(message)).rejects.toMatchObject({
        kind: 'UNKNOWN',
      });
      expect(h.request).toHaveBeenCalledTimes(2);
    }
    const h = harness();
    h.request.mockRejectedValue(new Error('secret provider timeout'));
    await expect(h.adapter.send(message)).rejects.toMatchObject({
      kind: 'UNKNOWN',
      message: 'WhatsApp submission unknown.',
    });
    expect(h.request).toHaveBeenCalledTimes(2);
  });
});
