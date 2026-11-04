import { randomUUID } from 'node:crypto';
import { e2ePrisma } from './database';
import { assertBrowserDatabaseScope } from './database-scope';
import { E2E_DATABASE_URL, E2E_SCHEMA } from './environment';
import { E2E_HEALTHY_CUSTOMER } from './fixtures';

// Use separate accounts so purchase tests cannot change the healthy portal fixture
// or spend other scenarios' sign-in attempts.
export async function createPurchaseTestActors() {
  await assertBrowserDatabaseScope(e2ePrisma, E2E_DATABASE_URL, E2E_SCHEMA);
  const { passwordHash } = await e2ePrisma.user.findUniqueOrThrow({
    where: { id: E2E_HEALTHY_CUSTOMER.userId },
    select: { passwordHash: true },
  });
  const suffix = randomUUID();
  const email = 'purchase-' + suffix + '@example.test';
  const user = await e2ePrisma.user.create({
    data: {
      email,
      passwordHash,
      role: 'CUSTOMER',
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      customer: {
        create: {
          customerNumber: 'CUS-PURCHASE-' + suffix.slice(0, 12),
          firstName: 'Purchase',
          lastName: 'Customer',
          addressLine1: '204 Fictional Road',
          city: 'Dhaka',
          countryCode: 'BD',
        },
      },
    },
    include: { customer: true },
  });
  if (!user.customer)
    throw new Error('Fictional purchase customer was not created.');
  return {
    buyer: {
      email,
      password: E2E_HEALTHY_CUSTOMER.password,
      customerId: user.customer.id,
    },
    staff: await createIsolatedTestAdministrator('purchase'),
  };
}

// Give each rehearsal a separate rate-limit bucket without changing auth policy.
export async function createIsolatedTestAdministrator(
  scenario: 'purchase' | 'renewal',
) {
  await assertBrowserDatabaseScope(e2ePrisma, E2E_DATABASE_URL, E2E_SCHEMA);
  const { passwordHash } = await e2ePrisma.user.findUniqueOrThrow({
    where: { id: E2E_HEALTHY_CUSTOMER.userId },
    select: { passwordHash: true },
  });
  const email = scenario + '-admin-' + randomUUID() + '@example.test';
  const administrator = await e2ePrisma.user.create({
    data: {
      email,
      passwordHash,
      role: 'ADMIN',
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      adminProfile: {
        create: { displayName: 'Fictional Test Administrator' },
      },
    },
  });
  return {
    email,
    password: E2E_HEALTHY_CUSTOMER.password,
    userId: administrator.id,
  };
}
