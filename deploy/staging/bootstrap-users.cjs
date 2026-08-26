'use strict';

const fs = require('node:fs');
const { createRequire } = require('node:module');

const appRequire = createRequire('/app/package.json');
const argon2 = appRequire('argon2');
const { createPrismaClient } = appRequire('@webhost-billing/database');

const [adminPasswordPath, customerPasswordPath] = process.argv.slice(2);
if (!adminPasswordPath || !customerPasswordPath) {
  throw new Error('Both protected password file paths are required');
}

function readPassword(path) {
  const value = fs.readFileSync(path, 'utf8').trim();
  if (value.length < 20)
    throw new Error('Generated staging password is too short');
  return value;
}

const options = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
  hashLength: 32,
  raw: false,
};

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL was not loaded');

  const prisma = createPrismaClient(databaseUrl);
  try {
    const adminHash = await argon2.hash(
      readPassword(adminPasswordPath),
      options,
    );
    const customerHash = await argon2.hash(
      readPassword(customerPasswordPath),
      options,
    );

    const adminUserId = '31000000-0000-4000-8000-000000000001';
    const adminProfileId = '31000000-0000-4000-8000-000000000002';
    const customerUserId = '31000000-0000-4000-8000-000000000003';
    const customerId = '31000000-0000-4000-8000-000000000004';
    const verifiedAt = new Date();

    await prisma.$transaction(async (transaction) => {
      const adminUser = await transaction.user.upsert({
        where: { email: 'admin@example.test' },
        update: {
          passwordHash: adminHash,
          role: 'ADMIN',
          status: 'ACTIVE',
          emailVerifiedAt: verifiedAt,
        },
        create: {
          id: adminUserId,
          email: 'admin@example.test',
          passwordHash: adminHash,
          role: 'ADMIN',
          status: 'ACTIVE',
          emailVerifiedAt: verifiedAt,
        },
      });
      await transaction.adminProfile.upsert({
        where: { userId: adminUser.id },
        update: {
          displayName: 'Staging Administrator',
          jobTitle: 'Owner',
          isSuperAdmin: true,
        },
        create: {
          id: adminProfileId,
          userId: adminUser.id,
          displayName: 'Staging Administrator',
          jobTitle: 'Owner',
          isSuperAdmin: true,
        },
      });
      const customerUser = await transaction.user.upsert({
        where: { email: 'customer@example.test' },
        update: {
          passwordHash: customerHash,
          role: 'CUSTOMER',
          status: 'ACTIVE',
          emailVerifiedAt: verifiedAt,
        },
        create: {
          id: customerUserId,
          email: 'customer@example.test',
          passwordHash: customerHash,
          role: 'CUSTOMER',
          status: 'ACTIVE',
          emailVerifiedAt: verifiedAt,
        },
      });
      await transaction.customer.upsert({
        where: { userId: customerUser.id },
        update: {
          status: 'ACTIVE',
          firstName: 'Fictional',
          lastName: 'Customer',
        },
        create: {
          id: customerId,
          userId: customerUser.id,
          customerNumber: 'STAGE-CUST-0001',
          status: 'ACTIVE',
          firstName: 'Fictional',
          lastName: 'Customer',
          companyName: 'Example Staging Studio',
          phone: '+8801000000000',
          addressLine1: '1 Example Road',
          city: 'Dhaka',
          region: 'Dhaka',
          postalCode: '1000',
          countryCode: 'BD',
        },
      });
    });
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then(() => console.log('Staging user password bootstrap: PASS'))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : 'Bootstrap failed');
    process.exitCode = 1;
  });
