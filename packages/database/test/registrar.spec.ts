import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import {
  domainNameSchema,
  domainQuoteRequestSchema,
  domainQuoteSchema,
} from '@webhost-billing/shared';
import {
  RegistrarCipher,
  LogicBoxesSandboxRegistrar,
  losslessRegistrarJson,
  registrarDecimalMinor,
  type MockLogicBoxesTransport,
  type RegistrarIntent,
} from '../src/registrar';

test('ordinary names and consent fail closed', () => {
  assert.equal(domainNameSchema.parse('Example.COM'), 'example.com');
  for (const name of [
    'xn--test.com',
    'sub.example.com',
    'example.org',
    '-a.com',
    'a-.net',
    'é.com',
    'x.com/path',
  ])
    assert.equal(domainNameSchema.safeParse(name).success, false);
  assert.equal(
    domainQuoteRequestSchema.safeParse({ consent: false }).success,
    false,
  );
  const quote = {
    id: randomUUID(),
    domainName: 'fictional.com',
    sellingAmount: '100',
    currency: 'BDT',
    costAmount: '100',
    costCurrency: 'USD',
    expiresAt: new Date().toISOString(),
    simulated: true,
  };
  assert.equal(domainQuoteSchema.safeParse(quote).success, true);
  assert.equal(
    domainQuoteSchema.safeParse({ ...quote, costCurrency: undefined }).success,
    false,
  );
  assert.equal(
    domainQuoteSchema.safeParse({ ...quote, costAmount: '0' }).success,
    false,
  );
  assert.equal(
    domainQuoteSchema.safeParse({ ...quote, apiKey: 'must-not-escape' })
      .success,
    false,
  );
});
test('exact decimal tokens never round financial values', () => {
  assert.equal(registrarDecimalMinor('9007199254740.99'), 900719925474099n);
  assert.deepEqual(
    losslessRegistrarJson('{"cost":9007199254740.99,"text":"123.45"}'),
    { cost: '9007199254740.99', text: '123.45' },
  );
  for (const value of [10.99, '0', '1e3', '1.234', '-1', null])
    assert.throws(() => registrarDecimalMinor(value));
  assert.throws(() => losslessRegistrarJson(' '.repeat(65537)));
  assert.throws(() => losslessRegistrarJson('{broken'));
  assert.throws(() => losslessRegistrarJson('{"cost":1,"cost":2}'));
  assert.throws(() => losslessRegistrarJson('{"co\\u0073t":1,"cost":2}'));
  assert.throws(() =>
    losslessRegistrarJson('['.repeat(18) + '0' + ']'.repeat(18)),
  );
  assert.throws(() => losslessRegistrarJson('{"__proto__":{}}'));
});
test('encrypted data is bound to account, mode, purpose and version', () => {
  const cipher = new RegistrarCipher(
    'fictional encryption key for registrar unit tests',
  );
  const secret = cipher.encrypt('stargate:account:FAKE:credential:1', {
    key: 'fictional-private-value',
  });
  assert.equal(secret.includes('fictional-private-value'), false);
  assert.deepEqual(
    cipher.decrypt('stargate:account:FAKE:credential:1', secret),
    { key: 'fictional-private-value' },
  );
  for (const binding of [
    'stargate:another:FAKE:credential:1',
    'stargate:account:DEMO:credential:1',
    'stargate:account:FAKE:credential:2',
    'stargate:account:FAKE:contact:1',
  ])
    assert.throws(() => cipher.decrypt(binding, secret));
});
const config = {
  mode: 'HTTP_MOCK' as const,
  resellerId: '100',
  apiKey: 'fictional-mock-key',
  costCurrency: 'USD' as const,
  customerId: '200',
  contactId: '300',
  localCustomerId: randomUUID(),
  localAccountId: randomUUID(),
};
const intent: RegistrarIntent = {
  operationId: randomUUID(),
  accountId: config.localAccountId,
  customerId: config.localCustomerId,
  domainName: 'fictional-example.com',
  nameservers: ['ns1.example.test', 'ns2.example.test'],
  costCeiling: 1099n,
  contact: {
    name: 'Fictional registrant',
    company: 'Fictional business',
    address: '1 Test Street',
    city: 'Dhaka',
    region: 'Dhaka',
    postalCode: '1000',
    country: 'BD',
    email: 'fictional@example.test',
    phoneCountryCode: '880',
    phone: '1700000000',
  },
};
test('official HTTP mock uses POST NoInvoice, no renewal and independent ownership lookup', async () => {
  const calls: Parameters<MockLogicBoxesTransport['request']>[0][] = [];
  const transport: MockLogicBoxesTransport = {
    kind: 'MOCK',
    async request(input) {
      calls.push(input);
      const bodies: Record<string, string> = {
        '/api/domains/available.json':
          '{"fictional-example.com":{"status":"available"}}',
        '/api/products/reseller-cost-price.json':
          '{"domcno":{"addnewdomain":{"1":10.99}}}',
        '/api/domains/register.json':
          '{"entityid":400,"actionstatus":"Success","domsecret":"do-not-persist"}',
        '/api/domains/orderid.json': '400',
        '/api/customers/details-by-id.json':
          '{"customerid":200,"resellerid":100,"customerstatus":"Active","pin":"do-not-persist"}',
        '/api/contacts/details.json': JSON.stringify({
          entityid: '300',
          customerid: '200',
          type: 'Contact',
          currentstatus: 'Active',
          name: intent.contact.name,
          company: intent.contact.company,
          address1: intent.contact.address,
          city: intent.contact.city,
          state: intent.contact.region,
          zip: intent.contact.postalCode,
          country: intent.contact.country,
          emailaddr: intent.contact.email,
          telnocc: intent.contact.phoneCountryCode,
          telno: intent.contact.phone,
        }),
        '/api/domains/details.json': JSON.stringify({
          domainname: intent.domainName,
          customerid: '200',
          immediateresellerid: '100',
          currentstatus: 'Active',
          endtime: '2000000000',
          domsecret: 'do-not-persist',
        }),
      };
      return { status: 200, body: bodies[input.path] ?? '{}' };
    },
  };
  const provider = new LogicBoxesSandboxRegistrar(transport, config);
  await provider.ensureContacts(intent, 'a'.repeat(64));
  await provider.registerOnce(intent);
  const observation = await provider.lookup(intent);
  assert.equal(observation?.state, 'Active');
  assert.equal(JSON.stringify(observation).includes('do-not-persist'), false);
  const mutation = calls.find((call) => call.path.endsWith('register.json'));
  assert.equal(mutation?.method, 'POST');
  assert.equal(mutation?.parameters['invoice-option'], 'NoInvoice');
  assert.equal(mutation?.parameters['auto-renew'], 'false');
  assert.equal(
    calls.every(
      (call) => call.host === 'test.httpapi.com' && !call.followRedirects,
    ),
    true,
  );
  await assert.rejects(
    provider.registerOnce({ ...intent, accountId: randomUUID() }),
  );
  await assert.rejects(
    provider.registerOnce({ ...intent, costCeiling: 1000n }),
  );
  assert.equal(
    calls.filter((call) => call.path.endsWith('register.json')).length,
    1,
  );
});
test('mock-only transport rejects secrets and redacts failures', async () => {
  const transport: MockLogicBoxesTransport = {
    kind: 'MOCK',
    request: async () => {
      throw new Error('api-key=private-value; domsecret=private-value');
    },
  };
  assert.throws(
    () =>
      new LogicBoxesSandboxRegistrar(transport, {
        ...config,
        apiKey: 'real-credential-value',
      }),
  );
  const provider = new LogicBoxesSandboxRegistrar(transport, config);
  await assert.rejects(
    provider.quote(intent.domainName),
    (error) =>
      error instanceof Error && !error.message.includes('private-value'),
  );
  for (const body of [
    '{}',
    '{"fictional-example.com":{"status":"unknown"}}',
    '{"fictional-example.com":{"status":"available","isPremium":true}}',
    '{"fictional-example.com":{"status":"available","isPremium":"unknown"}}',
  ]) {
    const invalid = new LogicBoxesSandboxRegistrar(
      { kind: 'MOCK', request: async () => ({ status: 200, body }) },
      config,
    );
    await assert.rejects(invalid.quote(intent.domainName));
    await assert.rejects(invalid.ensureContacts(intent, 'a'.repeat(64)));
  }
});
test('unknown states and mismatched account ownership cannot confirm registration', async () => {
  for (const changes of [
    { currentstatus: 'Unknown' },
    { customerid: '999' },
    { immediateresellerid: '999' },
    { endtime: 'not-a-time' },
  ]) {
    const provider = new LogicBoxesSandboxRegistrar(
      {
        kind: 'MOCK',
        request: async (request) => ({
          status: 200,
          body: request.path.endsWith('orderid.json')
            ? '400'
            : JSON.stringify({
                domainname: intent.domainName,
                customerid: '200',
                immediateresellerid: '100',
                currentstatus: 'Active',
                endtime: '2000000000',
                ...changes,
              }),
        }),
      },
      config,
    );
    await assert.rejects(provider.lookup(intent));
  }
});
