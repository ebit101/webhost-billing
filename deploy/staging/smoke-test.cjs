'use strict';

const fs = require('node:fs');

const [baseUrl, adminPasswordPath, customerPasswordPath] =
  process.argv.slice(2);
if (!baseUrl || !adminPasswordPath || !customerPasswordPath) {
  throw new Error('URL and both protected password file paths are required');
}

class Session {
  constructor() {
    this.cookies = new Map();
  }

  absorb(response) {
    for (const value of response.headers.getSetCookie()) {
      const pair = value.split(';', 1)[0];
      const separator = pair.indexOf('=');
      if (separator > 0) {
        this.cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
      }
    }
  }

  cookieHeader() {
    return [...this.cookies]
      .map(([key, value]) => `${key}=${value}`)
      .join('; ');
  }

  async request(path, options = {}) {
    const headers = new Headers(options.headers);
    const cookie = this.cookieHeader();
    if (cookie) headers.set('Cookie', cookie);
    const response = await fetch(`${baseUrl}${path}`, {
      redirect: 'manual',
      ...options,
      headers,
    });
    this.absorb(response);
    return response;
  }

  async csrf() {
    const response = await this.request('/auth/csrf');
    expectStatus(response, 200, 'CSRF token');
    const body = await response.json();
    const token = body?.data?.csrfToken;
    if (typeof token !== 'string' || token.length < 32) {
      throw new Error('CSRF token response was invalid');
    }
    return token;
  }

  async jsonMutation(path, method, body) {
    const csrf = await this.csrf();
    return this.request(path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrf,
      },
      body: JSON.stringify(body),
    });
  }
}

function password(path) {
  const value = fs.readFileSync(path, 'utf8').trim();
  if (value.length < 20) throw new Error('Protected password was invalid');
  return value;
}

function expectStatus(response, expected, label) {
  if (response.status !== expected) {
    throw new Error(
      `${label}: expected ${expected}, received ${response.status}`,
    );
  }
  console.log(`${label}: PASS (${response.status})`);
}

async function login(email, passwordPath, role) {
  const session = new Session();
  const response = await session.jsonMutation('/auth/login', 'POST', {
    email,
    password: password(passwordPath),
  });
  expectStatus(response, 200, `${role} login`);
  const body = await response.json();
  if (body?.data?.identity?.role !== role) {
    throw new Error(`${role} identity response was invalid`);
  }
  return session;
}

async function main() {
  const admin = await login('admin@example.test', adminPasswordPath, 'ADMIN');
  const customer = await login(
    'customer@example.test',
    customerPasswordPath,
    'CUSTOMER',
  );

  expectStatus(await admin.request('/admin'), 200, 'Admin dashboard page');
  expectStatus(await customer.request('/portal'), 200, 'Customer portal page');
  expectStatus(await admin.request('/dashboard'), 200, 'Admin dashboard API');
  expectStatus(await admin.request('/customers'), 200, 'Admin customer list');
  expectStatus(
    await customer.request('/customers'),
    403,
    'Customer denied admin customer list',
  );
  const invoicePath = '/invoices/10000000-0000-4000-8000-000000000011';
  const invoiceResponse = await customer.request(invoicePath);
  expectStatus(invoiceResponse, 200, 'Customer invoice detail');
  const invoice = (await invoiceResponse.json())?.data;
  const pdfResponse = await customer.request(`${invoicePath}/pdf`);
  if (pdfResponse.status !== 200) {
    try {
      const {
        renderInvoicePdf,
      } = require('/app/dist/modules/invoices/invoice-pdf.service.js');
      await renderInvoicePdf(invoice);
    } catch (error) {
      console.error(
        `Local PDF diagnostic: ${error instanceof Error ? error.stack : error}`,
      );
    }
  }
  expectStatus(pdfResponse, 200, 'Customer invoice PDF');
  expectStatus(
    await customer.request('/tickets/10000000-0000-4000-8000-000000000015'),
    200,
    'Customer support ticket',
  );

  const gatewayResponse = await admin.request('/payment-gateways');
  expectStatus(gatewayResponse, 200, 'Payment adapter list');
  const gatewayBody = await gatewayResponse.json();
  if (
    JSON.stringify(gatewayBody).includes('bkash') ||
    JSON.stringify(gatewayBody).includes('sslcommerz')
  ) {
    throw new Error(
      'Credentialed payment gateways must remain disabled in staging',
    );
  }
  console.log('Credentialed payment gateways disabled: PASS');

  expectStatus(
    await admin.request('/hosting-panel/operations'),
    200,
    'Hosting-panel operations API',
  );

  const anonymous = new Session();
  const resetResponse = await anonymous.jsonMutation(
    '/auth/password-reset/request',
    'POST',
    { email: 'customer@example.test' },
  );
  expectStatus(resetResponse, 202, 'Password-reset email queued');

  expectStatus(
    await admin.jsonMutation('/auth/logout', 'POST', {}),
    200,
    'Admin logout',
  );
  expectStatus(
    await admin.request('/auth/me'),
    401,
    'Logged-out session rejected',
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Smoke test failed');
  process.exitCode = 1;
});
