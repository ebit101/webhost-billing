import { request as httpsRequest } from 'node:https';
import { randomInt } from 'node:crypto';
import {
  domainNameSchema,
  resellbizCredentialSchema,
  registrarNameserversSchema,
  resellbizContactSchema,
  domainManagementSchema,
  type DomainManagement,
} from '@webhost-billing/shared';
import type {
  DomainRegistrar,
  RegistrarIntent,
  RegistrarObservation,
  RegistrarQuote,
} from './provider';
import {
  losslessRegistrarJson,
  registrarDecimalMinor,
} from './logicboxes-sandbox';

const paths = {
  '/api/domains/available.json': ['domaincheck.httpapi.com', 'GET'],
  '/api/products/reseller-cost-price.json': ['httpapi.com', 'GET'],
  '/api/customers/details-by-id.json': ['httpapi.com', 'GET'],
  '/api/customers/search.json': ['httpapi.com', 'GET'],
  '/api/customers/v2/signup.json': ['httpapi.com', 'POST'],
  '/api/contacts/add.json': ['httpapi.com', 'POST'],
  '/api/contacts/details.json': ['httpapi.com', 'GET'],
  '/api/domains/orderid.json': ['httpapi.com', 'GET'],
  '/api/domains/details.json': ['httpapi.com', 'GET'],
  '/api/domains/register.json': ['httpapi.com', 'POST'],
  '/api/domains/modify-ns.json': ['httpapi.com', 'POST'],
  '/api/domains/modify-contact.json': ['httpapi.com', 'POST'],
  '/api/domains/enable-theft-protection.json': ['httpapi.com', 'POST'],
  '/api/domains/disable-theft-protection.json': ['httpapi.com', 'POST'],
  '/api/domains/locks.json': ['httpapi.com', 'GET'],
  '/api/domains/renew.json': ['httpapi.com', 'POST'],
} as const;
export type ResellbizPath = keyof typeof paths;
export interface ResellbizTransport {
  request(
    path: ResellbizPath,
    parameters: Readonly<Record<string, string | readonly string[]>>,
  ): Promise<string>;
}
// Server-only, pinned HTTPS destinations/verbs. No proxy, custom URL, redirect or retry.
export class ResellbizHttpsTransport implements ResellbizTransport {
  constructor(private readonly send: typeof httpsRequest = httpsRequest) {}
  async request(
    path: ResellbizPath,
    parameters: Readonly<Record<string, string | readonly string[]>>,
  ): Promise<string> {
    if (!Object.hasOwn(paths, path))
      throw new Error('Registrar endpoint is not supported.');
    const [hostname, method] = paths[path];
    const data = new URLSearchParams();
    for (const [key, values] of Object.entries(parameters)) {
      for (const value of typeof values === 'string' ? [values] : values)
        data.append(key, value);
    }
    const encoded = data.toString();
    return new Promise((resolve, reject) => {
      let finished = false;
      let timer: NodeJS.Timeout | undefined;
      let req: ReturnType<typeof httpsRequest> | undefined;
      const fail = () => {
        if (finished) return;
        finished = true;
        if (timer) clearTimeout(timer);
        req?.destroy();
        reject(
          new Error(
            'Registrar response unavailable. Do not repeat a registration; reconcile its outcome.',
          ),
        );
      };
      timer = setTimeout(fail, 10000);
      try {
        req = this.send(
          {
            protocol: 'https:',
            hostname,
            port: 443,
            family: 4,
            path: method === 'GET' ? `${path}?${encoded}` : path,
            method,
            rejectUnauthorized: true,
            agent: false,
            headers: {
              Accept: 'application/json',
              ...(method === 'POST'
                ? {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Content-Length': Buffer.byteLength(encoded),
                  }
                : {}),
            },
          },
          (response) => {
            if (finished || response.statusCode !== 200) {
              response.destroy();
              fail();
              return;
            }
            const chunks: Buffer[] = [];
            let bytes = 0;
            response.on('data', (chunk: Buffer) => {
              bytes += chunk.length;
              if (bytes > 262144) {
                response.destroy();
                fail();
                return;
              }
              chunks.push(chunk);
            });
            response.once('error', fail);
            response.once('aborted', fail);
            response.once('end', () => {
              if (finished) return;
              finished = true;
              if (timer) clearTimeout(timer);
              resolve(Buffer.concat(chunks).toString('utf8'));
            });
          },
        );
        req.once('error', fail);
        req.end(method === 'POST' ? encoded : undefined);
      } catch {
        fail();
      }
    });
  }
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Registrar evidence is unavailable.');
  return value as Record<string, unknown>;
}
function identifier(value: unknown): string {
  if (typeof value !== 'string' || !/^[1-9][0-9]{0,18}$/.test(value))
    throw new Error('Registrar identity is unavailable.');
  return value;
}
function independentCustomerPassword(): string {
  const alphabet =
    'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789~*!@$#%_+.?:,{}';
  for (let attempt = 0; attempt < 64; attempt++) {
    const value = Array.from(
      { length: 16 },
      () => alphabet[randomInt(alphabet.length)],
    ).join('');
    if (
      /[a-z]/.test(value) &&
      /[A-Z]/.test(value) &&
      /[0-9]/.test(value) &&
      /[~*!@$#%_+.?:,{}]/.test(value)
    )
      return value;
  }
  throw new Error('A registrar customer credential could not be prepared.');
}
export interface ResellbizBinding {
  accountId: string;
  localCustomerId: string;
  remoteCustomerId: string;
  remoteContactId: string;
}
export interface ResellbizPreparationStore {
  load(
    intent: RegistrarIntent,
    fingerprint: string,
  ): Promise<ResellbizBinding | undefined>;
  claim(
    intent: RegistrarIntent,
    fingerprint: string,
    step: 'customer' | 'contact',
  ): Promise<void>;
  customer(
    intent: RegistrarIntent,
    fingerprint: string,
    remoteId: string,
  ): Promise<void>;
  complete(
    intent: RegistrarIntent,
    fingerprint: string,
    customerId: string,
    contactId: string,
  ): Promise<void>;
}
export interface ResellbizManagedState extends DomainManagement {
  orderId: string;
  contactIds: readonly string[];
}
type RegistrarManagedIntent = Pick<
  RegistrarIntent,
  'accountId' | 'customerId' | 'domainName' | 'nameservers'
>;
export class ResellbizLiveRegistrar implements DomainRegistrar {
  private readonly credentials: { resellerId: string; apiKey: string };
  constructor(
    credentials: unknown,
    private readonly transport: ResellbizTransport = new ResellbizHttpsTransport(),
    private binding?: ResellbizBinding,
    private readonly preparation?: ResellbizPreparationStore,
  ) {
    this.credentials = resellbizCredentialSchema.parse(credentials);
  }
  private async call(
    path: ResellbizPath,
    parameters: Record<string, string | readonly string[]>,
  ): Promise<unknown> {
    try {
      return losslessRegistrarJson(
        await this.transport.request(path, {
          ...parameters,
          'auth-userid': this.credentials.resellerId,
          'api-key': this.credentials.apiKey,
        }),
        path === '/api/products/reseller-cost-price.json'
          ? { bytes: 262144, nodes: 32768 }
          : undefined,
      );
    } catch {
      throw new Error(
        'Registrar evidence is unavailable. Reconcile without repeating a registration.',
      );
    }
  }
  private domain(name: string): string {
    const canonical = domainNameSchema.parse(name);
    if (!canonical.endsWith('.com'))
      throw new Error(
        'Only ordinary one-year .com registrations are supported in the live pilot.',
      );
    return canonical;
  }
  private async available(name: string): Promise<boolean> {
    const result = record(
      record(
        await this.call('/api/domains/available.json', {
          'domain-name': name.slice(0, -4),
          tlds: 'com',
        }),
      )[name],
    );
    if (
      Object.keys(result).some(
        (key) => !['status', 'isPremium', 'classkey'].includes(key),
      ) ||
      (Object.hasOwn(result, 'classkey') && result.classkey !== 'domcno') ||
      (result.isPremium !== undefined &&
        result.isPremium !== false &&
        result.isPremium !== 'false')
    )
      throw new Error('Ordinary domain eligibility is not established.');
    if (
      !['available', 'regthroughus', 'regthroughothers'].includes(
        String(result.status),
      )
    )
      throw new Error('Domain availability is unknown.');
    return result.status === 'available';
  }
  async quote(name: string): Promise<RegistrarQuote> {
    name = this.domain(name);
    const available = await this.available(name);
    const prices = record(
      await this.call('/api/products/reseller-cost-price.json', {}),
    );
    const cost = record(record(prices.domcno).addnewdomain)['1'];
    return {
      available,
      costAmount: registrarDecimalMinor(cost),
      costCurrency: 'USD',
      observedAt: new Date(),
      simulated: false,
    };
  }
  private bind(
    intent: RegistrarManagedIntent & { costCeiling?: bigint },
  ): ResellbizBinding {
    this.domain(intent.domainName);
    registrarNameserversSchema.parse(intent.nameservers);
    if (
      !this.binding ||
      intent.accountId !== this.binding.accountId ||
      intent.customerId !== this.binding.localCustomerId ||
      (intent.costCeiling ?? 0n) < 0n
    )
      throw new Error('Registrar ownership is unavailable.');
    identifier(this.binding.remoteCustomerId);
    identifier(this.binding.remoteContactId);
    return this.binding;
  }
  async ensureContacts(
    intent: RegistrarIntent,
    fingerprint: string,
  ): Promise<void> {
    if (intent.costCeiling <= 0n)
      throw new Error('Registration cost approval is required.');
    const contactSnapshot = resellbizContactSchema.parse(intent.contact);
    if (!/^[a-f0-9]{64}$/.test(fingerprint))
      throw new Error('Registrar contact evidence is unavailable.');
    this.binding ??= await this.preparation?.load(intent, fingerprint);
    if (!this.binding) {
      if (!this.preparation)
        throw new Error('Registrar preparation is unavailable.');
      const search = record(
        await this.call('/api/customers/search.json', {
          username: contactSnapshot.email,
          'no-of-records': '10',
          'page-no': '1',
        }),
      );
      const rows = Object.entries(search).filter(([key]) =>
        /^[0-9]+$/.test(key),
      );
      if (
        Object.keys(search).some(
          (key) =>
            !['recsonpage', 'recsindb'].includes(key) && !/^[0-9]+$/.test(key),
        ) ||
        !['0', '1'].includes(String(search.recsonpage)) ||
        search.recsonpage !== search.recsindb ||
        rows.length !== Number(search.recsonpage)
      )
        throw new Error(
          'Registrar customer search is incomplete or ambiguous.',
        );
      let remoteCustomerId: string;
      if (rows.length === 1) {
        const found = record(rows[0]![1]);
        if (
          found['customer.username'] !== contactSnapshot.email ||
          found['customer.resellerid'] !== this.credentials.resellerId ||
          found['customer.customerstatus'] !== 'Active'
        )
          throw new Error('Registrar customer identity does not match.');
        remoteCustomerId = identifier(found['customer.customerid']);
      } else {
        await this.preparation.claim(intent, fingerprint, 'customer');
        remoteCustomerId = identifier(
          await this.call('/api/customers/v2/signup.json', {
            ...this.contactParameters(intent),
            username: contactSnapshot.email,
            // Independent random credential, never the portal password or an operator secret.
            passwd: independentCustomerPassword(),
            'lang-pref': 'en',
            'accept-policy': 'true',
            'marketing-email-consent': 'false',
            'sms-consent': 'false',
          }),
        );
      }
      const customer = record(
        await this.call('/api/customers/details-by-id.json', {
          'customer-id': remoteCustomerId,
        }),
      );
      const expected = this.contactEvidence(intent);
      if (
        identifier(customer.customerid) !== remoteCustomerId ||
        identifier(customer.resellerid) !== this.credentials.resellerId ||
        customer.customerstatus !== 'Active' ||
        customer.username !== contactSnapshot.email ||
        Object.entries(expected).some(
          ([key, value]) =>
            customer[key === 'emailaddr' ? 'useremail' : key] !== value,
        )
      )
        throw new Error(
          'Registrar customer ownership or identity does not match.',
        );
      await this.preparation.customer(intent, fingerprint, remoteCustomerId);
      await this.preparation.claim(intent, fingerprint, 'contact');
      const remoteContactId = identifier(
        await this.call('/api/contacts/add.json', {
          ...this.contactParameters(intent),
          email: contactSnapshot.email,
          'customer-id': remoteCustomerId,
          type: 'Contact',
        }),
      );
      this.binding = {
        accountId: intent.accountId,
        localCustomerId: intent.customerId,
        remoteCustomerId,
        remoteContactId,
      };
      await this.verifyContacts(intent);
      await this.preparation.complete(
        intent,
        fingerprint,
        remoteCustomerId,
        remoteContactId,
      );
      return;
    }
    await this.verifyContacts(intent);
  }
  private contactParameters(intent: RegistrarIntent): Record<string, string> {
    const contact = resellbizContactSchema.parse(intent.contact);
    return {
      name: contact.name,
      company: contact.company,
      'address-line-1': contact.address,
      ...(contact.addressLine2
        ? { 'address-line-2': contact.addressLine2 }
        : {}),
      city: contact.city,
      state: contact.region,
      country: contact.country,
      zipcode: contact.postalCode,
      'phone-cc': contact.phoneCountryCode,
      phone: contact.phone,
    };
  }
  private contactEvidence(intent: RegistrarIntent): Record<string, string> {
    return {
      name: intent.contact.name,
      company: intent.contact.company,
      address1: intent.contact.address,
      ...(intent.contact.addressLine2
        ? { address2: intent.contact.addressLine2 }
        : {}),
      city: intent.contact.city,
      state: intent.contact.region,
      zip: intent.contact.postalCode,
      country: intent.contact.country,
      emailaddr: intent.contact.email,
      telnocc: intent.contact.phoneCountryCode,
      telno: intent.contact.phone,
    };
  }
  private async verifyContacts(intent: RegistrarIntent): Promise<void> {
    const binding = this.bind(intent);
    const customer = record(
      await this.call('/api/customers/details-by-id.json', {
        'customer-id': binding.remoteCustomerId,
      }),
    );
    const contact = record(
      await this.call('/api/contacts/details.json', {
        'contact-id': binding.remoteContactId,
      }),
    );
    const expected = this.contactEvidence(intent);
    if (
      identifier(customer.customerid) !== binding.remoteCustomerId ||
      identifier(customer.resellerid) !== this.credentials.resellerId ||
      customer.customerstatus !== 'Active' ||
      identifier(contact.entityid) !== binding.remoteContactId ||
      identifier(contact.customerid) !== binding.remoteCustomerId ||
      contact.type !== 'Contact' ||
      contact.currentstatus !== 'Active' ||
      Object.entries(expected).some(([key, value]) => contact[key] !== value)
    )
      throw new Error(
        'Registrar customer/contact ownership or snapshot does not match.',
      );
  }
  async registerOnce(intent: RegistrarIntent): Promise<void> {
    if (intent.costCeiling <= 0n)
      throw new Error('Registration cost approval is required.');
    const binding = this.bind(intent);
    // The processor persists a claim first. No provider idempotency or atomic cost cap is assumed.
    const quote = await this.quote(intent.domainName);
    if (!quote.available || quote.costAmount > intent.costCeiling)
      throw new Error(
        'Fresh registrar price or availability exceeds approval.',
      );
    const response = record(
      await this.call('/api/domains/register.json', {
        'domain-name': intent.domainName,
        years: '1',
        ns: intent.nameservers,
        'customer-id': binding.remoteCustomerId,
        'reg-contact-id': binding.remoteContactId,
        'admin-contact-id': binding.remoteContactId,
        'tech-contact-id': binding.remoteContactId,
        'billing-contact-id': binding.remoteContactId,
        'invoice-option': 'NoInvoice',
        'auto-renew': 'false',
        'purchase-privacy': 'false',
        'protect-privacy': 'false',
        'attr-name1': 'tnc',
        'attr-value1': 'Y',
        'attr-name2': 'registrant-org-consent',
        'attr-value2':
          intent.contact.publishOrganization === true ? 'true' : 'false',
      }),
    );
    identifier(response.entityid);
  }
  async management(
    intent: RegistrarManagedIntent,
    orderId: string,
  ): Promise<ResellbizManagedState> {
    const binding = this.bind(intent);
    const customer = record(
      await this.call('/api/customers/details-by-id.json', {
        'customer-id': binding.remoteCustomerId,
      }),
    );
    if (
      identifier(customer.customerid) !== binding.remoteCustomerId ||
      identifier(customer.resellerid) !== this.credentials.resellerId ||
      customer.customerstatus !== 'Active'
    )
      throw new Error('Registrar account ownership is not confirmed.');
    const result = record(
      await this.call('/api/domains/details.json', {
        'order-id': identifier(orderId),
        options: 'All',
      }),
    );
    if (
      identifier(result.entityid) !== orderId ||
      result.domainname !== intent.domainName ||
      identifier(result.customerid) !== binding.remoteCustomerId ||
      (result.isImmediateReseller !== true &&
        result.isImmediateReseller !== 'true') ||
      result.currentstatus !== 'Active'
    )
      throw new Error(
        'Registrar ownership or manageable state is not confirmed.',
      );
    const count = Number(result.noOfNameServers);
    if (!Number.isInteger(count) || count < 2 || count > 5)
      throw new Error('Registrar nameserver evidence is unavailable.');
    const ns = Array.from(
      { length: count },
      (_, index) => result[`ns${index + 1}`],
    );
    const locks = record(
      await this.call('/api/domains/locks.json', { 'order-id': orderId }),
    );
    if (
      locks.status !== undefined ||
      (locks.transferlock !== undefined &&
        ![true, false, 'true', 'false'].includes(
          locks.transferlock as boolean | string,
        ))
    )
      throw new Error('Registrar lock evidence is unavailable.');
    const epoch = BigInt(identifier(result.endtime)) * 1000n;
    if (epoch > 8640000000000000n)
      throw new Error('Registrar expiry is unavailable.');
    const projected = domainManagementSchema.parse({
      nameservers: ns,
      locked: locks.transferlock === true || locks.transferlock === 'true',
      observedAt: new Date().toISOString(),
      expiresAt: new Date(Number(epoch)).toISOString(),
      verification:
        result.raaVerificationStatus === 'Verified' ? 'Verified' : 'Pending',
    });
    const contactIds = [
      'registrantcontactid',
      'admincontactid',
      'techcontactid',
      'billingcontactid',
    ].map((key) => identifier(result[key]));
    const currentContact = record(
      await this.call('/api/contacts/details.json', {
        'contact-id': contactIds[0]!,
      }),
    );
    if (
      identifier(currentContact.entityid) !== contactIds[0] ||
      identifier(currentContact.customerid) !== binding.remoteCustomerId ||
      currentContact.type !== 'Contact' ||
      currentContact.currentstatus !== 'Active'
    )
      throw new Error('Current registrar contact ownership is unavailable.');
    const contact = resellbizContactSchema.parse({
      name: currentContact.name,
      company: currentContact.company,
      email: currentContact.emailaddr,
      address: currentContact.address1,
      ...(typeof currentContact.address2 === 'string'
        ? { addressLine2: currentContact.address2 }
        : {}),
      city: currentContact.city,
      region: currentContact.state,
      postalCode: currentContact.zip,
      country: currentContact.country,
      phoneCountryCode: currentContact.telnocc,
      phone: currentContact.telno,
    });
    return {
      ...projected,
      contact,
      orderId,
      contactIds,
    };
  }
  async inspectExisting(input: {
    accountId: string;
    customerId: string;
    domainName: string;
  }) {
    const domainName = this.domain(input.domainName);
    const orderId = identifier(
      await this.call('/api/domains/orderid.json', {
        'domain-name': domainName,
      }),
    );
    const result = record(
      await this.call('/api/domains/details.json', {
        'order-id': orderId,
        options: 'All',
      }),
    );
    if (
      identifier(result.entityid) !== orderId ||
      result.domainname !== domainName ||
      ![true, 'true'].includes(
        result.isImmediateReseller as boolean | string,
      ) ||
      result.currentstatus !== 'Active'
    )
      throw new Error('Existing domain ownership is not confirmed.');
    const remoteCustomerId = identifier(result.customerid);
    const remoteContactId = identifier(result.registrantcontactid);
    // Only an authenticated direct reseller/customer binding establishes ownership.
    // Availability, public DNS and caller-supplied remote IDs are never evidence.
    const bound = new ResellbizLiveRegistrar(this.credentials, this.transport, {
      accountId: input.accountId,
      localCustomerId: input.customerId,
      remoteCustomerId,
      remoteContactId,
    });
    const count = Number(result.noOfNameServers);
    if (!Number.isInteger(count) || count < 2 || count > 5)
      throw new Error('Existing nameserver evidence is unavailable.');
    const nameservers = registrarNameserversSchema.parse(
      Array.from({ length: count }, (_, index) => result[`ns${index + 1}`]),
    );
    const intent: RegistrarManagedIntent = {
      ...input,
      domainName,
      nameservers,
    };
    const observed = await bound.management(intent, orderId);
    if (!observed.contact || new Date(observed.expiresAt) <= new Date())
      throw new Error('An active unexpired domain is required.');
    return { remoteCustomerId, remoteContactId, observed };
  }
  async authorizationCode(
    intent: RegistrarIntent,
    orderId: string,
  ): Promise<string> {
    this.bind(intent);
    const result = record(
      await this.call('/api/domains/details.json', {
        'order-id': identifier(orderId),
        options: 'All',
      }),
    );
    if (
      identifier(result.entityid) !== orderId ||
      result.domainname !== intent.domainName ||
      identifier(result.customerid) !== this.binding!.remoteCustomerId ||
      (result.isImmediateReseller !== true &&
        result.isImmediateReseller !== 'true') ||
      result.currentstatus !== 'Active' ||
      typeof result.domsecret !== 'string' ||
      result.domsecret.length < 1 ||
      result.domsecret.length > 256
    )
      throw new Error('Registrar authorization code is unavailable.');
    return result.domsecret;
  }
  async changeNameservers(
    intent: RegistrarIntent,
    orderId: string,
    nameservers: readonly string[],
    claimSubmission: () => Promise<void> = async () => {},
  ): Promise<void> {
    this.bind(intent);
    registrarNameserversSchema.parse(nameservers);
    await claimSubmission();
    const result = record(
      await this.call('/api/domains/modify-ns.json', {
        'order-id': identifier(orderId),
        ns: nameservers,
      }),
    );
    if (identifier(result.entityid) !== orderId)
      throw new Error('Nameserver outcome needs reconciliation.');
  }
  async changeLock(
    intent: RegistrarIntent,
    orderId: string,
    locked: boolean,
    claimSubmission: () => Promise<void> = async () => {},
  ): Promise<void> {
    this.bind(intent);
    await claimSubmission();
    const result = record(
      await this.call(
        locked
          ? '/api/domains/enable-theft-protection.json'
          : '/api/domains/disable-theft-protection.json',
        { 'order-id': identifier(orderId) },
      ),
    );
    if (identifier(result.entityid) !== orderId)
      throw new Error('Lock outcome needs reconciliation.');
  }
  async replacementContact(intent: RegistrarIntent): Promise<string> {
    const binding = this.bind(intent);
    const id = identifier(
      await this.call('/api/contacts/add.json', {
        ...this.contactParameters(intent),
        email: intent.contact.email,
        'customer-id': binding.remoteCustomerId,
        type: 'Contact',
      }),
    );
    // A replacement is scoped to this domain. Never mutate a shared provider contact in place.
    await this.verifyReplacementContact(intent, id);
    return id;
  }
  async verifyReplacementContact(
    intent: RegistrarIntent,
    contactId: string,
  ): Promise<void> {
    const binding = this.bind(intent);
    const verifier = new ResellbizLiveRegistrar(
      this.credentials,
      this.transport,
      { ...binding, remoteContactId: identifier(contactId) },
    );
    await verifier.verifyContacts(intent);
  }
  async changeContacts(
    intent: RegistrarIntent,
    orderId: string,
    contactId: string,
    claimSubmission: () => Promise<void> = async () => {},
  ): Promise<void> {
    this.bind(intent);
    const id = identifier(contactId);
    await claimSubmission();
    const response = record(
      await this.call('/api/domains/modify-contact.json', {
        'order-id': identifier(orderId),
        'reg-contact-id': id,
        'admin-contact-id': id,
        'tech-contact-id': id,
        'billing-contact-id': id,
        'designated-agent': 'false',
        'sixty-day-lock-optout': 'false',
        'attr-name1': 'registrant-org-consent',
        'attr-value1':
          intent.contact.publishOrganization === true ? 'true' : 'false',
      }),
    );
    if (identifier(response.entityid) !== orderId)
      throw new Error('Contact change needs reconciliation.');
    // IRTP/verification messages are not copied into logs or interpreted as completed consent.
  }
  async renewalCost(): Promise<bigint> {
    const result = record(
      await this.call('/api/products/reseller-cost-price.json', {}),
    );
    const cost = registrarDecimalMinor(
      record(record(result.domcno).renewdomain)['1'],
    );
    if (cost <= 0n) throw new Error('Renewal price is not established.');
    return cost;
  }
  async renew(
    intent: RegistrarIntent,
    orderId: string,
    previousExpiry: Date,
    claimSubmission: () => Promise<void> = async () => {},
  ): Promise<void> {
    if (intent.costCeiling <= 0n)
      throw new Error('Renewal cost approval is required.');
    this.bind(intent);
    if (
      !Number.isFinite(previousExpiry.getTime()) ||
      previousExpiry.getTime() % 1000 !== 0 ||
      (await this.renewalCost()) > intent.costCeiling
    )
      throw new Error('Renewal cost or expiry preflight did not match.');
    await claimSubmission();
    const result = record(
      await this.call('/api/domains/renew.json', {
        'order-id': identifier(orderId),
        years: '1',
        'exp-date': String(previousExpiry.getTime() / 1000),
        'invoice-option': 'NoInvoice',
        'auto-renew': 'false',
        'purchase-privacy': 'false',
      }),
    );
    if (identifier(result.entityid) !== orderId)
      throw new Error('Renewal needs reconciliation.');
  }
  async lookup(intent: RegistrarIntent): Promise<RegistrarObservation | null> {
    // Availability is the only conclusive absence used here, never a generic 500 or empty search.
    if (await this.available(intent.domainName)) return null;
    const binding = this.bind(intent);
    const orderId = identifier(
      await this.call('/api/domains/orderid.json', {
        'domain-name': intent.domainName,
      }),
    );
    const result = record(
      await this.call('/api/domains/details.json', {
        'order-id': orderId,
        options: 'All',
      }),
    );
    if (
      result.domainname !== intent.domainName ||
      identifier(result.customerid) !== binding.remoteCustomerId ||
      (result.isImmediateReseller !== 'true' &&
        result.isImmediateReseller !== true) ||
      [
        'registrantcontactid',
        'admincontactid',
        'techcontactid',
        'billingcontactid',
      ].some((key) => identifier(result[key]) !== binding.remoteContactId) ||
      !['Active', 'InActive'].includes(String(result.currentstatus))
    )
      throw new Error('Registrar order ownership is unavailable.');
    const milliseconds = BigInt(identifier(result.endtime)) * 1000n;
    if (milliseconds > 8640000000000000n)
      throw new Error('Registrar expiry is invalid.');
    return {
      orderId,
      accountId: intent.accountId,
      customerId: intent.customerId,
      operationId: intent.operationId,
      domainName: intent.domainName,
      state: result.currentstatus === 'Active' ? 'Active' : 'InActive',
      expiresAt: new Date(Number(milliseconds)),
      verification:
        result.raaVerificationStatus === 'Verified' ? 'Verified' : 'Pending',
    };
  }
}
