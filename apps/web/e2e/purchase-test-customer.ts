import { randomUUID } from 'node:crypto';
import { e2ePrisma } from './database';
import { assertBrowserDatabaseScope } from './database-scope';
import { E2E_DATABASE_URL, E2E_SCHEMA } from './environment';
import { E2E_HEALTHY_CUSTOMER } from './fixtures';

// Purchase and renewal tests must leave the healthy portal fixture untouched.
export async function createPurchaseTestCustomer() {
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
    email,
    password: E2E_HEALTHY_CUSTOMER.password,
    customerId: user.customer.id,
  };
}
