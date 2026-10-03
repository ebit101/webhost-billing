export const E2E_ADMIN = {
  userId: '26000000-0000-4000-8000-000000000001',
  profileId: '26000000-0000-4000-8000-000000000002',
  email: 'command26-admin@example.test',
  password: 'Command26-Admin-Password!',
} as const;

export const E2E_CUSTOMER = {
  email: 'command26-customer@example.test',
  password: 'Command26-Customer-Password!',
  firstName: 'Browser',
  lastName: 'Customer',
} as const;

export const E2E_HEALTHY_CUSTOMER = {
  userId: '26000000-0000-4000-8000-000000000006',
  customerId: '26000000-0000-4000-8000-000000000007',
  invoiceId: '26000000-0000-4000-8000-000000000008',
  email: 'command78-healthy@example.test',
  password: E2E_ADMIN.password,
  firstName: 'Healthy',
  lastName: 'Customer',
  invoiceNumber: 'INV-HEALTHY-0001',
} as const;

export const E2E_HISTORY_CUSTOMER = {
  userId: '81000000-0000-4000-8000-000000000010',
  customerId: '81000000-0000-4000-8000-000000000011',
  email: 'command81-history@example.test',
  password: E2E_ADMIN.password,
  oldestInvoiceId: '81000000-0000-4000-8000-000000000000',
  oldestInvoiceNumber: 'INV-HISTORY-0000',
} as const;

export const E2E_PRODUCT = {
  id: '26000000-0000-4000-8000-000000000003',
  priceId: '26000000-0000-4000-8000-000000000004',
  name: 'Command 26 Starter Hosting',
  domain: 'command26-customer.example.test',
} as const;

export const E2E_SERVER = {
  id: '26000000-0000-4000-8000-000000000005',
  name: 'Command 26 Fake Hosting Server',
} as const;
