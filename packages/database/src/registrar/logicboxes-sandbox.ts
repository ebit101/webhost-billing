import { domainNameSchema } from '@webhost-billing/shared';
import type {
  DomainRegistrar,
  RegistrarIntent,
  RegistrarObservation,
  RegistrarQuote,
} from './provider';

export interface MockLogicBoxesTransport {
  readonly kind: 'MOCK';
  request(input: {
    host: 'test.httpapi.com';
    path: string;
    method: 'GET' | 'POST';
    parameters: Readonly<Record<string, string | readonly string[]>>;
    timeoutMs: 10000;
    maxResponseBytes: 65536;
    followRedirects: false;
  }): Promise<{ status: number; body: string }>;
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid registrar response.');
  return value as Record<string, unknown>;
}
function id(value: unknown): string {
  if (typeof value !== 'string' || !/^[1-9][0-9]{0,18}$/.test(value))
    throw new Error('Invalid registrar identifier.');
  return value;
}
// Tokenize strings before numbers so prices never pass through a floating-point value.
export function losslessRegistrarJson(
  body: string,
  limits = { bytes: 65536, nodes: 4096 },
): unknown {
  if (Buffer.byteLength(body, 'utf8') > limits.bytes)
    throw new Error('Registrar response exceeds the limit.');
  try {
    // Validate shape before JSON.parse can silently overwrite duplicated fields.
    let position = 0;
    let nodes = 0;
    const whitespace = () => {
      while (/^[\t\n\r ]$/.test(body[position] ?? '')) position++;
    };
    const string = (): string => {
      const start = position++;
      while (position < body.length) {
        const character = body[position++];
        if (character === '\\') position++;
        else if (character === '"')
          return JSON.parse(body.slice(start, position)) as string;
      }
      throw new Error();
    };
    const value = (depth: number): void => {
      if (depth > 16 || ++nodes > limits.nodes) throw new Error();
      whitespace();
      const character = body[position];
      if (character === '"') {
        string();
        return;
      }
      if (character === '{' || character === '[') {
        const object = character === '{';
        const end = object ? '}' : ']';
        const keys = new Set<string>();
        position++;
        whitespace();
        if (body[position] === end) {
          position++;
          return;
        }
        for (;;) {
          if (object) {
            if (body[position] !== '"') throw new Error();
            const key = string();
            if (
              keys.has(key) ||
              ['__proto__', 'constructor', 'prototype'].includes(key)
            )
              throw new Error();
            keys.add(key);
            whitespace();
            if (body[position++] !== ':') throw new Error();
          }
          value(depth + 1);
          whitespace();
          const separator = body[position++];
          if (separator === end) return;
          if (separator !== ',') throw new Error();
          whitespace();
        }
      }
      const token =
        /^(?:true|false|null|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)/.exec(
          body.slice(position),
        );
      if (!token) throw new Error();
      position += token[0].length;
    };
    value(0);
    whitespace();
    if (position !== body.length) throw new Error();
    return JSON.parse(
      body.replace(
        /"(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g,
        (token) => (token.startsWith('"') ? token : JSON.stringify(token)),
      ),
    ) as unknown;
  } catch {
    throw new Error('Invalid registrar response.');
  }
}
export function registrarDecimalMinor(value: unknown): bigint {
  if (
    typeof value !== 'string' ||
    !/^(0|[1-9][0-9]{0,12})(\.[0-9]{1,2})?$/.test(value)
  )
    throw new Error('Registrar cost is unavailable.');
  const [whole, fraction = ''] = value.split('.');
  const amount = BigInt(whole ?? '0') * 100n + BigInt(fraction.padEnd(2, '0'));
  if (amount <= 0n) throw new Error('Registrar cost is unavailable.');
  return amount;
}

// Official request projections, exercised only with injected mocks. No network client,
// environment credentials, live mode, arbitrary host, redirect or retry exists here.
export class LogicBoxesSandboxRegistrar implements DomainRegistrar {
  constructor(
    private readonly transport: MockLogicBoxesTransport,
    private readonly config: {
      mode: 'HTTP_MOCK';
      resellerId: string;
      apiKey: string;
      costCurrency: 'USD';
      customerId: string;
      contactId: string;
      localCustomerId: string;
      localAccountId: string;
    },
  ) {
    if (
      transport.kind !== 'MOCK' ||
      config.mode !== 'HTTP_MOCK' ||
      config.costCurrency !== 'USD'
    )
      throw new Error('Credentialed registrar networking is disabled.');
    id(config.resellerId);
    id(config.customerId);
    id(config.contactId);
    if (config.apiKey !== 'fictional-mock-key')
      throw new Error('Real credentials are not accepted by the mock adapter.');
  }
  private async call(
    path: string,
    method: 'GET' | 'POST',
    parameters: Record<string, string | readonly string[]>,
  ): Promise<unknown> {
    let timer: NodeJS.Timeout | undefined;
    try {
      const response = await Promise.race([
        this.transport.request({
          host: 'test.httpapi.com',
          path,
          method,
          parameters: {
            ...parameters,
            'auth-userid': this.config.resellerId,
            'api-key': this.config.apiKey,
          },
          timeoutMs: 10000,
          maxResponseBytes: 65536,
          followRedirects: false,
        }),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error()), 10000);
        }),
      ]);
      if (response.status !== 200) throw new Error();
      return losslessRegistrarJson(response.body);
    } catch {
      throw new Error(
        'Registrar outcome is unavailable; reconcile without repeating the mutation.',
      );
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  async quote(domainName: string): Promise<RegistrarQuote> {
    const name = domainNameSchema.parse(domainName);
    const [label, tld] = name.split('.');
    const availability = record(
      record(
        await this.call('/api/domains/available.json', 'GET', {
          'domain-name': label ?? '',
          tlds: tld ?? '',
        }),
      )[name],
    );
    if (
      availability.status !== 'available' ||
      (availability.isPremium !== undefined &&
        availability.isPremium !== 'false' &&
        availability.isPremium !== false) ||
      availability.costHash ||
      availability.claims ||
      availability['trademark-claims']
    )
      throw new Error('Ordinary domain availability is not established.');
    const prices = record(
      await this.call('/api/products/reseller-cost-price.json', 'GET', {}),
    );
    const cost = record(record(prices['domcno'])['addnewdomain'])['1'];
    return {
      available: true,
      costAmount: registrarDecimalMinor(cost),
      costCurrency: this.config.costCurrency,
      observedAt: new Date(),
      simulated: true,
    };
  }
  private bind(intent: RegistrarIntent): void {
    domainNameSchema.parse(intent.domainName);
    if (
      intent.customerId !== this.config.localCustomerId ||
      intent.accountId !== this.config.localAccountId ||
      intent.nameservers.length !== 2 ||
      intent.costCeiling <= 0n
    )
      throw new Error('Registrar intent ownership mismatch.');
  }
  async ensureContacts(
    intent: RegistrarIntent,
    fingerprint: string,
  ): Promise<void> {
    this.bind(intent);
    if (!/^[a-f0-9]{64}$/.test(fingerprint))
      throw new Error('Contact snapshot unavailable.');
    // Only reconcile explicitly pre-bound mock IDs. An empty/ambiguous search
    // cannot authorize signup or repeated contact creation.
    const customer = record(
      await this.call('/api/customers/details-by-id.json', 'GET', {
        'customer-id': this.config.customerId,
      }),
    );
    const contact = record(
      await this.call('/api/contacts/details.json', 'GET', {
        'contact-id': this.config.contactId,
      }),
    );
    const expected: Record<string, string> = {
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
    };
    if (
      id(customer.customerid) !== this.config.customerId ||
      id(customer.resellerid) !== this.config.resellerId ||
      customer.customerstatus !== 'Active' ||
      id(contact.entityid) !== this.config.contactId ||
      id(contact.customerid) !== this.config.customerId ||
      contact.type !== 'Contact' ||
      contact.currentstatus !== 'Active' ||
      Object.entries(expected).some(([key, value]) => contact[key] !== value)
    )
      throw new Error('Bound customer/contact evidence is unavailable.');
  }
  async registerOnce(intent: RegistrarIntent): Promise<void> {
    this.bind(intent);
    const quote = await this.quote(intent.domainName);
    if (quote.costAmount > intent.costCeiling)
      throw new Error('Registrar cost ceiling exceeded.');
    // This preflight is NOT an atomic provider price cap. Real acceptance remains closed.
    const response = record(
      await this.call('/api/domains/register.json', 'POST', {
        'domain-name': intent.domainName,
        years: '1',
        ns: intent.nameservers,
        'customer-id': this.config.customerId,
        'reg-contact-id': this.config.contactId,
        'admin-contact-id': this.config.contactId,
        'tech-contact-id': this.config.contactId,
        'billing-contact-id': this.config.contactId,
        'invoice-option': 'NoInvoice',
        'auto-renew': 'false',
        'purchase-privacy': 'false',
        'protect-privacy': 'false',
      }),
    );
    id(response.entityid);
    // NoInvoice omits customer and cost. HTTP 200/actionstatus never proves registration.
  }
  async lookup(intent: RegistrarIntent): Promise<RegistrarObservation | null> {
    this.bind(intent);
    const orderId = id(
      await this.call('/api/domains/orderid.json', 'GET', {
        'domain-name': intent.domainName,
      }),
    );
    const result = record(
      await this.call('/api/domains/details.json', 'GET', {
        'order-id': orderId,
        options: ['OrderDetails'],
      }),
    );
    if (
      result.domainname !== intent.domainName ||
      id(result.customerid) !== this.config.customerId ||
      id(result.immediateresellerid) !== this.config.resellerId
    )
      throw new Error('Registrar order ownership mismatch.');
    const status = result.currentstatus;
    if (status !== 'Active' && status !== 'InActive')
      throw new Error('Registrar status is not supported.');
    const seconds = id(result.endtime);
    const milliseconds = BigInt(seconds) * 1000n;
    if (milliseconds > 8640000000000000n)
      throw new Error('Registrar expiry is invalid.');
    // The caller must also bind this lookup to its durable dispatch evidence.
    return {
      orderId,
      domainName: intent.domainName,
      customerId: intent.customerId,
      accountId: intent.accountId,
      operationId: intent.operationId,
      state: status,
      expiresAt: new Date(Number(milliseconds)),
      verification:
        result['raa-verification-status'] === 'Verified'
          ? 'Verified'
          : 'Pending',
    };
  }
}
