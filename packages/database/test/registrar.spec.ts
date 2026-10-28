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
  ResellbizLiveRegistrar,
  ResellbizHttpsTransport,
  type ResellbizPath,
  type ResellbizTransport,
  type ResellbizPreparationStore,
  type ResellbizBinding,
} from '../src/registrar';
import {
  resellbizSetupSchema,
  registrarNameserversSchema,
} from '@webhost-billing/shared';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { IncomingMessage } from 'node:http';
import type { request as httpsRequest, RequestOptions } from 'node:https';
import type { Prisma } from '../src/index';
import { orderFulfillmentComplete } from '../src/fulfillment';

function fulfillmentTransaction(
  items: Array<{
    id: string;
    kind: 'HOSTING' | 'DOMAIN';
    service: { status: string } | null;
  }>,
  registered: number,
  events?: string[],
): Prisma.TransactionClient {
  return {
    $queryRaw: async () => {
      events?.push('lock order');
      return [];
    },
    orderItem: {
      findMany: async () => {
        events?.push('read items');
        return items;
      },
    },
    domain: {
      count: async () => {
        events?.push('read domains');
        return registered;
      },
    },
  } as unknown as Prisma.TransactionClient;
}

test('a combined order completes only after hosting and domain fulfillment', async () => {
  const pendingHosting = [
    { id: 'hosting', kind: 'HOSTING' as const, service: null },
    { id: 'domain', kind: 'DOMAIN' as const, service: null },
  ];
  assert.equal(
    await orderFulfillmentComplete(
      fulfillmentTransaction(pendingHosting, 1),
      'order',
    ),
    false,
  );
  const activeHosting = [
    { id: 'hosting', kind: 'HOSTING' as const, service: { status: 'ACTIVE' } },
    { id: 'domain', kind: 'DOMAIN' as const, service: null },
  ];
  const events: string[] = [];
  assert.equal(
    await orderFulfillmentComplete(
      fulfillmentTransaction(activeHosting, 0, events),
      'order',
    ),
    false,
  );
  assert.deepEqual(events, ['lock order', 'read items', 'read domains']);
  assert.equal(
    await orderFulfillmentComplete(
      fulfillmentTransaction(activeHosting, 1),
      'order',
    ),
    true,
  );
});

test('hosting-only and domain-only orders keep their completion rules', async () => {
  assert.equal(
    await orderFulfillmentComplete(fulfillmentTransaction([], 0), 'order'),
    false,
  );
  assert.equal(
    await orderFulfillmentComplete(
      fulfillmentTransaction(
        [{ id: 'hosting', kind: 'HOSTING', service: { status: 'ACTIVE' } }],
        0,
      ),
      'order',
    ),
    true,
  );
  assert.equal(
    await orderFulfillmentComplete(
      fulfillmentTransaction(
        [{ id: 'domain', kind: 'DOMAIN', service: null }],
        1,
      ),
      'order',
    ),
    true,
  );
});

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

const liveContact = {
  name: 'Fictional registrant',
  company: 'Fictional company',
  address: '1 Test Street',
  city: 'Dhaka',
  region: 'Dhaka',
  postalCode: '1000',
  country: 'BD',
  email: 'fictional@example.test',
  phoneCountryCode: '880',
  phone: '1700000000',
};
const liveIntent: RegistrarIntent = {
  operationId: randomUUID(),
  accountId: randomUUID(),
  customerId: randomUUID(),
  domainName: 'fictional-live.com',
  nameservers: ['ns1.fictional-host.com', 'ns2.fictional-host.com'],
  contact: liveContact,
  costCeiling: 1099n,
};
const liveCredentials = {
  resellerId: '12345',
  apiKey: 'fake'.repeat(8),
};
function liveFixture() {
  const calls: {
    path: ResellbizPath;
    parameters: Readonly<Record<string, string | readonly string[]>>;
  }[] = [];
  let status = 'available';
  let modifier: (path: ResellbizPath, value: unknown) => unknown = (
    _path,
    value,
  ) => value;
  const transport: ResellbizTransport = {
    async request(path, parameters) {
      calls.push({ path, parameters });
      const values: Partial<Record<ResellbizPath, unknown>> = {
        '/api/domains/available.json': { [liveIntent.domainName]: { status } },
        '/api/products/reseller-cost-price.json': {
          domcno: { addnewdomain: { '1': '10.99' } },
        },
        '/api/customers/details-by-id.json': {
          customerid: '23456',
          resellerid: '12345',
          customerstatus: 'Active',
          username: liveContact.email,
          useremail: liveContact.email,
          name: liveContact.name,
          company: liveContact.company,
          address1: liveContact.address,
          city: liveContact.city,
          state: liveContact.region,
          zip: liveContact.postalCode,
          country: liveContact.country,
          telnocc: liveContact.phoneCountryCode,
          telno: liveContact.phone,
          pin: 'never-export-this',
        },
        '/api/customers/search.json': { recsonpage: '0', recsindb: '0' },
        '/api/customers/v2/signup.json': '23456',
        '/api/contacts/add.json': '34567',
        '/api/contacts/details.json': {
          entityid: '34567',
          customerid: '23456',
          type: 'Contact',
          currentstatus: 'Active',
          name: liveContact.name,
          company: liveContact.company,
          address1: liveContact.address,
          city: liveContact.city,
          state: liveContact.region,
          zip: liveContact.postalCode,
          country: liveContact.country,
          emailaddr: liveContact.email,
          telnocc: liveContact.phoneCountryCode,
          telno: liveContact.phone,
        },
        '/api/domains/register.json': {
          entityid: '45678',
          actionstatus: 'Pending',
        },
        '/api/domains/orderid.json': '45678',
        '/api/domains/details.json': {
          domainname: liveIntent.domainName,
          customerid: '23456',
          isImmediateReseller: 'true',
          currentstatus: 'Active',
          endtime: '1900000000',
          domainsecret: 'never-export-this',
          registrantcontactid: '34567',
          admincontactid: '34567',
          techcontactid: '34567',
          billingcontactid: '34567',
        },
      };
      return JSON.stringify(modifier(path, values[path]));
    },
  };
  return {
    calls,
    transport,
    setStatus(value: string) {
      status = value;
    },
    modify(value: typeof modifier) {
      modifier = value;
    },
    registrar: new ResellbizLiveRegistrar(liveCredentials, transport, {
      accountId: liveIntent.accountId,
      localCustomerId: liveIntent.customerId,
      remoteCustomerId: '23456',
      remoteContactId: '34567',
    }),
  };
}
test('live quote is exact, isolated from mock mode and rejects unsupported/premium/claims/unknown values', async () => {
  const fixture = liveFixture();
  assert.equal(
    (await fixture.registrar.quote(liveIntent.domainName)).costAmount,
    1099n,
  );
  assert.equal(
    (await fixture.registrar.quote(liveIntent.domainName)).simulated,
    false,
  );
  await assert.rejects(fixture.registrar.quote('fictional-live.net'));
  for (const extra of [
    { costHash: {} },
    { 'tm-claims-key': '' },
    { isPremium: true },
    { unknownFlag: true },
    { status: 'unknown' },
  ]) {
    fixture.modify((path, value) =>
      path === '/api/domains/available.json'
        ? { [liveIntent.domainName]: { status: 'available', ...extra } }
        : value,
    );
    await assert.rejects(fixture.registrar.quote(liveIntent.domainName));
  }
});
test('live availability accepts only the ordinary .com class key without changing registration status', async () => {
  for (const status of ['available', 'regthroughus', 'regthroughothers']) {
    const fixture = liveFixture();
    fixture.modify((path, value) =>
      path === '/api/domains/available.json'
        ? {
            [liveIntent.domainName]: {
              status,
              classkey: 'domcno',
              isPremium: false,
            },
          }
        : value,
    );
    const quote = await fixture.registrar.quote(liveIntent.domainName);
    assert.equal(quote.available, status === 'available');
    assert.deepEqual(
      fixture.calls.map(({ path }) => path),
      ['/api/domains/available.json', '/api/products/reseller-cost-price.json'],
    );
  }
  for (const extra of [
    { classkey: 'dotnet' },
    { classkey: 'DOMCNO' },
    { classkey: '' },
    { classkey: null },
    { classkey: 1 },
    { classkey: {} },
    { classkey: 'domcno', isPremium: 'true' },
    { classkey: 'domcno', unexpected: false },
    { classkey: 'domcno', status: 'unknown' },
  ]) {
    const fixture = liveFixture();
    fixture.modify((path, value) =>
      path === '/api/domains/available.json'
        ? { [liveIntent.domainName]: { status: 'available', ...extra } }
        : value,
    );
    await assert.rejects(fixture.registrar.quote(liveIntent.domainName));
    assert.equal(fixture.calls.length, 1);
  }
});

test('live multi-product pricing keeps exact money within endpoint-specific parser limits', async () => {
  const prices = {
    domcno: { addnewdomain: { '1': '9007199254740.99' } },
    ...Object.fromEntries(
      Array.from({ length: 1800 }, (_, index) => [
        `fictional-product-${index}`,
        { addnewdomain: { '1': '10.99', '2': '21.98' } },
      ]),
    ),
  };
  assert.ok(Buffer.byteLength(JSON.stringify(prices)) > 65536);
  const fixture = liveFixture();
  fixture.modify((path, value) =>
    path === '/api/products/reseller-cost-price.json' ? prices : value,
  );
  assert.equal(
    (await fixture.registrar.quote(liveIntent.domainName)).costAmount,
    900719925474099n,
  );
  const rejectedBodies = [
    JSON.stringify({
      domcno: { addnewdomain: { '1': '10.99' } },
      padding: 'x'.repeat(262144),
    }),
    JSON.stringify({
      domcno: { addnewdomain: { '1': '10.99' } },
      values: Array(32768).fill(0),
    }),
    '{"domcno":{"addnewdomain":{"1":"10.99","1":"11.99"}}}',
    '{"domcno":{"addnewdomain":{"1":"10.99"}},"__proto__":{}}',
    '{"domcno":{"addnewdomain":{"1":"10.99"}},"nested":' +
      '['.repeat(18) +
      '0' +
      ']'.repeat(18) +
      '}',
    '{"domcno":{"addnewdomain":{"1":1e3}}}',
  ];
  for (const body of rejectedBodies) {
    const provider = new ResellbizLiveRegistrar(liveCredentials, {
      async request(path, parameters) {
        return path === '/api/products/reseller-cost-price.json'
          ? body
          : fixture.transport.request(path, parameters);
      },
    });
    await assert.rejects(provider.quote(liveIntent.domainName));
  }
  for (const padding of ['x'.repeat(65536), Array(4096).fill(0)]) {
    let availabilityCalls = 0;
    const body = JSON.stringify({
      [liveIntent.domainName]: { status: 'available', classkey: 'domcno' },
      padding,
    });
    const provider = new ResellbizLiveRegistrar(liveCredentials, {
      async request(path, parameters) {
        availabilityCalls++;
        return path === '/api/domains/available.json'
          ? body
          : fixture.transport.request(path, parameters);
      },
    });
    await assert.rejects(provider.quote(liveIntent.domainName));
    assert.equal(availabilityCalls, 1);
  }
});

function memoryPreparation() {
  const claims = new Set<string>();
  let binding: ResellbizBinding | undefined;
  const store: ResellbizPreparationStore = {
    async load() {
      return binding;
    },
    async claim(_intent, _fingerprint, step) {
      if (claims.has(step)) throw new Error('Already claimed');
      claims.add(step);
    },
    async customer() {},
    async complete(intent, _fingerprint, customerId, contactId) {
      binding = {
        accountId: intent.accountId,
        localCustomerId: intent.customerId,
        remoteCustomerId: customerId,
        remoteContactId: contactId,
      };
    },
  };
  return { store, claims };
}
test('automatic preparation creates customer/contact once with independent random password and explicit non-marketing policy consent', async () => {
  const fixture = liveFixture(),
    preparation = memoryPreparation();
  const provider = new ResellbizLiveRegistrar(
    liveCredentials,
    fixture.transport,
    undefined,
    preparation.store,
  );
  await provider.ensureContacts(liveIntent, 'a'.repeat(64));
  await provider.ensureContacts(liveIntent, 'a'.repeat(64));
  assert.equal(
    fixture.calls.filter(
      (call) => call.path === '/api/customers/v2/signup.json',
    ).length,
    1,
  );
  assert.equal(
    fixture.calls.filter((call) => call.path === '/api/contacts/add.json')
      .length,
    1,
  );
  const signup = fixture.calls.find(
    (call) => call.path === '/api/customers/v2/signup.json',
  )!.parameters;
  const password = String(signup.passwd);
  assert.equal(password.length, 16);
  assert.match(password, /^[a-zA-Z0-9~*!@$#%_+.?:,{}]+$/);
  for (const pattern of [/[a-z]/, /[A-Z]/, /[0-9]/, /[~*!@$#%_+.?:,{}]/])
    assert.match(password, pattern);
  assert.equal(signup['accept-policy'], 'true');
  assert.equal(signup['marketing-email-consent'], 'false');
  assert.deepEqual([...preparation.claims], ['customer', 'contact']);
});
test('automatic preparation reuses only a fully matching directly owned customer', async () => {
  const fixture = liveFixture();
  fixture.modify((path, value) =>
    path === '/api/customers/search.json'
      ? {
          recsonpage: '1',
          recsindb: '1',
          '0': {
            'customer.customerid': '23456',
            'customer.username': liveContact.email,
            'customer.resellerid': liveCredentials.resellerId,
            'customer.customerstatus': 'Active',
          },
        }
      : value,
  );
  await new ResellbizLiveRegistrar(
    liveCredentials,
    fixture.transport,
    undefined,
    memoryPreparation().store,
  ).ensureContacts(liveIntent, 'a'.repeat(64));
  assert.equal(
    fixture.calls.some((call) => call.path.includes('signup')),
    false,
  );
  assert.equal(
    fixture.calls.filter((call) => call.path === '/api/contacts/add.json')
      .length,
    1,
  );
  fixture.modify((path, value) =>
    path === '/api/customers/search.json'
      ? {
          recsonpage: '1',
          recsindb: '1',
          '0': {
            'customer.customerid': '23456',
            'customer.username': liveContact.email,
            'customer.resellerid': '9999',
            'customer.customerstatus': 'Active',
          },
        }
      : value,
  );
  const before = fixture.calls.length;
  await assert.rejects(
    new ResellbizLiveRegistrar(
      liveCredentials,
      fixture.transport,
      undefined,
      memoryPreparation().store,
    ).ensureContacts(liveIntent, 'a'.repeat(64)),
  );
  assert.equal(
    fixture.calls
      .slice(before)
      .some(
        (call) => call.path.includes('signup') || call.path.includes('/add'),
      ),
    false,
  );
});
test('unknown/incomplete customer searches and lost creation responses never trigger duplicate creation', async () => {
  for (const search of [
    { status: 'ERROR', message: 'Not found' },
    {},
    { recsonpage: '0', recsindb: '1' },
    { recsonpage: '0', recsindb: '0', hidden: {} },
  ]) {
    const fixture = liveFixture();
    fixture.modify((path, value) =>
      path === '/api/customers/search.json' ? search : value,
    );
    await assert.rejects(
      new ResellbizLiveRegistrar(
        liveCredentials,
        fixture.transport,
        undefined,
        memoryPreparation().store,
      ).ensureContacts(liveIntent, 'a'.repeat(64)),
    );
    assert.equal(
      fixture.calls.some(
        (call) => call.path.includes('signup') || call.path.includes('/add'),
      ),
      false,
    );
  }
  for (const lostPath of [
    '/api/customers/v2/signup.json',
    '/api/contacts/add.json',
  ]) {
    const fixture = liveFixture(),
      preparation = memoryPreparation();
    fixture.modify((path, value) => {
      if (path === lostPath) throw new Error('secret lost response');
      return value;
    });
    for (let attempt = 0; attempt < 2; attempt++)
      await assert.rejects(
        new ResellbizLiveRegistrar(
          liveCredentials,
          fixture.transport,
          undefined,
          preparation.store,
        ).ensureContacts(liveIntent, 'a'.repeat(64)),
        (error: Error) => !error.message.includes('secret'),
      );
    assert.equal(
      fixture.calls.filter((call) => call.path === lostPath).length,
      1,
    );
  }
});
test('live contacts must match account ownership and every immutable registrant field', async () => {
  const fixture = liveFixture();
  await fixture.registrar.ensureContacts(liveIntent, 'a'.repeat(64));
  for (const path of [
    '/api/customers/details-by-id.json',
    '/api/contacts/details.json',
  ] as const) {
    fixture.modify((current, value) =>
      current === path
        ? {
            ...(value as object),
            ...(path.includes('customers')
              ? { resellerid: '99999' }
              : { emailaddr: 'other@example.test' }),
          }
        : value,
    );
    await assert.rejects(
      fixture.registrar.ensureContacts(liveIntent, 'a'.repeat(64)),
    );
  }
  assert.equal(
    fixture.calls.some(
      (call) => call.path.includes('signup') || call.path.includes('/add'),
    ),
    false,
  );
});
test('live registration uses POST projection and never treats a response as registered', async () => {
  const fixture = liveFixture();
  await fixture.registrar.registerOnce(liveIntent);
  const call = fixture.calls.find(
    (entry) => entry.path === '/api/domains/register.json',
  );
  assert.ok(call);
  assert.equal(call.parameters['invoice-option'], 'NoInvoice');
  assert.equal(call.parameters['auto-renew'], 'false');
  assert.equal(call.parameters.years, '1');
  assert.equal(call.parameters['customer-id'], '23456');
  assert.deepEqual(call.parameters.ns, liveIntent.nameservers);
  assert.equal(await fixture.registrar.lookup(liveIntent), null);
  fixture.setStatus('regthroughus');
  const observed = await fixture.registrar.lookup(liveIntent);
  assert.equal(observed?.state, 'Active');
  assert.equal(JSON.stringify(observed).includes('never-export-this'), false);
});
test('live price increases, wrong intents, malformed ownership and ambiguous errors deny without retry', async () => {
  const fixture = liveFixture();
  await assert.rejects(
    fixture.registrar.registerOnce({ ...liveIntent, costCeiling: 1098n }),
  );
  assert.equal(
    fixture.calls.some((call) => call.path === '/api/domains/register.json'),
    false,
  );
  await assert.rejects(
    fixture.registrar.registerOnce({ ...liveIntent, customerId: randomUUID() }),
  );
  fixture.setStatus('regthroughus');
  fixture.modify((path, value) =>
    path === '/api/domains/details.json'
      ? { ...(value as object), customerid: '99999' }
      : value,
  );
  await assert.rejects(fixture.registrar.lookup(liveIntent));
  fixture.modify(() => {
    throw new Error('api-key=fictional-secret-provider-url');
  });
  await assert.rejects(
    fixture.registrar.lookup(liveIntent),
    (error: Error) => !error.message.includes('fictional-secret'),
  );
});
test('live configuration requires independent native-unit confirmation and valid public nameservers', () => {
  const setup = {
    ...liveCredentials,
    confirmation: 'Configure live resell.biz',
    sellingAmount: '150000',
    nameservers: liveIntent.nameservers,
    agreementUrl: 'https://fictional-host.com/legal/domain-agreement',
    customerTermsUrl: 'https://fictional-host.com/legal/customer-terms',
    customerPrivacyUrl: 'https://fictional-host.com/legal/privacy',
    confirmNativeUsdCosts: true,
  };
  assert.equal(resellbizSetupSchema.safeParse(setup).success, true);
  assert.equal(
    resellbizSetupSchema.safeParse({ ...setup, confirmNativeUsdCosts: false })
      .success,
    false,
  );
  assert.equal(
    resellbizSetupSchema.safeParse({
      ...setup,
      endpoint: 'https://evil.example',
    }).success,
    false,
  );
  for (const names of [
    ['ns1.example.test', 'ns2.example.test'],
    ['127.0.0.1', 'ns1.fictional-host.com'],
    ['ns1.fictional-host.com', 'ns1.fictional-host.com'],
  ])
    assert.equal(registrarNameserversSchema.safeParse(names).success, false);
});
test('HTTPS transport pins host/verb/TLS, encodes arrays and rejects redirects and oversized responses', async () => {
  const captured: RequestOptions[] = [];
  const bodies: (string | undefined)[] = [];
  let status = 200,
    body = '{}',
    destroyed = 0;
  const send = ((
    options: RequestOptions,
    callback: (message: IncomingMessage) => void,
  ) => {
    captured.push(options);
    const req = Object.assign(new EventEmitter(), {
      destroy() {
        destroyed++;
      },
      end(value?: string) {
        bodies.push(value);
        queueMicrotask(() => {
          const response = Object.assign(new PassThrough(), {
            statusCode: status,
          });
          callback(response as unknown as IncomingMessage);
          response.end(body);
        });
      },
    });
    return req;
  }) as unknown as typeof httpsRequest;
  const transport = new ResellbizHttpsTransport(send);
  await transport.request('/api/domains/available.json', {
    'domain-name': 'fictional',
    tlds: 'com',
  });
  await transport.request('/api/domains/register.json', {
    ns: liveIntent.nameservers,
    'api-key': liveCredentials.apiKey,
  });
  assert.equal(captured[0]?.hostname, 'domaincheck.httpapi.com');
  assert.equal(captured[1]?.hostname, 'httpapi.com');
  assert.equal(captured[1]?.method, 'POST');
  assert.equal(captured[1]?.path, '/api/domains/register.json');
  assert.equal(captured[1]?.rejectUnauthorized, true);
  assert.equal(captured[1]?.family, 4);
  assert.deepEqual(
    new URLSearchParams(bodies[1]).getAll('ns'),
    liveIntent.nameservers,
  );
  status = 302;
  await assert.rejects(transport.request('/api/domains/register.json', {}));
  status = 200;
  body = 'x'.repeat(262145);
  await assert.rejects(transport.request('/api/contacts/details.json', {}));
  assert.equal(captured.length, 4);
  assert.equal(destroyed, 2);
  await assert.rejects(
    transport.request('/api/domains/delete.json' as ResellbizPath, {}),
  );
  assert.equal(captured.length, 4);
});

test('HTTPS total deadline destroys the request once and never exposes request errors', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  let destroyed = 0,
    calls = 0;
  const req = Object.assign(new EventEmitter(), {
    destroy() {
      destroyed++;
    },
    end() {},
  });
  const send = (() => {
    calls++;
    return req;
  }) as unknown as typeof httpsRequest;
  const transport = new ResellbizHttpsTransport(send);
  const pending = transport.request('/api/domains/register.json', {
    'api-key': liveCredentials.apiKey,
  });
  const rejected = assert.rejects(
    pending,
    (error: Error) => !error.message.includes(liveCredentials.apiKey),
  );
  context.mock.timers.tick(10000);
  await rejected;
  req.emit(
    'error',
    new Error(`private-provider-url?api-key=${liveCredentials.apiKey}`),
  );
  assert.equal(calls, 1);
  assert.equal(destroyed, 1);
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
