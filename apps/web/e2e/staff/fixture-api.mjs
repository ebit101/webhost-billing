import { createServer } from 'node:http';

// Fictional UI fixture only. No database, credentials, providers or writes.
const id = '92000000-0000-4000-8000-000000000001';
const accounts = [
  {
    id,
    email: 'owner@example.test',
    displayName: 'Fictional owner',
    staffRole: 'FULL_ADMINISTRATOR',
    status: 'ACTIVE',
    twoFactorEnabled: true,
  },
  {
    id: '92000000-0000-4000-8000-000000000002',
    email: 'support@example.test',
    displayName: 'Fictional support',
    staffRole: 'SUPPORT_OPERATOR',
    status: 'PENDING_VERIFICATION',
    twoFactorEnabled: false,
  },
];
createServer((request, response) => {
  response.setHeader('Access-Control-Allow-Origin', 'http://127.0.0.1:3300');
  response.setHeader('Access-Control-Allow-Credentials', 'true');
  response.setHeader('Content-Type', 'application/json');
  const url = new URL(request.url ?? '/', 'http://127.0.0.1:3301');
  const cookie = request.headers.cookie ?? '';
  const staffRole = cookie.includes('fictional-billing')
    ? 'BILLING_OPERATOR'
    : cookie.includes('fictional-support')
      ? 'SUPPORT_OPERATOR'
      : 'FULL_ADMINISTRATOR';
  const send = (data, pagination) =>
    response.end(
      JSON.stringify({
        success: true,
        data,
        ...(pagination ? { pagination } : {}),
      }),
    );
  if (request.method !== 'GET') {
    response.statusCode = 405;
    response.end('{}');
    return;
  }
  if (url.pathname === '/auth/csrf')
    return send({ csrfToken: 'fictional'.repeat(12) });
  if (url.pathname === '/auth/me')
    return send({
      userId: id,
      email: 'owner@example.test',
      role: 'ADMIN',
      adminProfileId: id,
      staffRole,
      twoFactorEnabled: !cookie.includes('unenrolled'),
    });
  if (url.pathname === '/staff') return send(accounts);
  if (url.pathname === '/invoices/settings/business-identity')
    return send({ name: 'Fictional billing business' });
  if (url.pathname === '/payments/settings')
    return send({ partialPaymentsEnabled: false });
  if (url.pathname === '/settings/presentation')
    return send({ timeZone: 'Asia/Dhaka' });
  if (url.pathname === '/tickets/setup-options') return send({ admins: [] });
  if (url.pathname === '/auth/sessions') return send([]);
  if (url.pathname === '/auth/two-factor')
    return send({
      enabled: false,
      pendingSetup: false,
      recoveryCodesRemaining: 0,
    });
  if (
    ['/invoices', '/payments', '/customers', '/tickets'].includes(url.pathname)
  )
    return send([], {
      page: Number(url.searchParams.get('page') ?? 1),
      pageSize: Number(url.searchParams.get('pageSize') ?? 20),
      totalItems: 0,
      totalPages: 0,
    });
  response.statusCode = 404;
  response.end('{}');
}).listen(3301, '127.0.0.1');
