'use strict';

const { createRequire } = require('node:module');

const appRequire = createRequire('/workspace/apps/api/package.json');
const argon2 = appRequire('argon2');
const { createPrismaClient } = appRequire('@webhost-billing/database');

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function demoPassword(name) {
  const value = required(name);
  if (value.length < 20) throw new Error(`${name} is too short`);
  return value;
}

const hashOptions = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
  hashLength: 32,
  raw: false,
};

async function main() {
  if (process.env.DEMO_MODE !== 'fictional-only') {
    throw new Error('Demo bootstrap refused outside fictional-only mode');
  }

  const databaseUrl = required('DATABASE_URL');
  const parsedDatabaseUrl = new URL(databaseUrl);
  if (
    parsedDatabaseUrl.hostname !== 'postgres' ||
    parsedDatabaseUrl.pathname !== '/webhost_billing_demo'
  ) {
    throw new Error('Demo bootstrap refused for a non-demo database');
  }

  const prisma = createPrismaClient(databaseUrl);
  try {
    const adminHash = await argon2.hash(
      demoPassword('DEMO_ADMIN_PASSWORD'),
      hashOptions,
    );
    const customerHash = await argon2.hash(
      demoPassword('DEMO_CUSTOMER_PASSWORD'),
      hashOptions,
    );

    await prisma.$transaction(async (transaction) => {
      const admin = await transaction.user.findUnique({
        where: { email: 'admin@example.test' },
      });
      const customer = await transaction.user.findUnique({
        where: { email: 'customer@example.test' },
      });
      if (!admin || admin.role !== 'ADMIN') {
        throw new Error('Fictional administrator seed record is missing');
      }
      if (!customer || customer.role !== 'CUSTOMER') {
        throw new Error('Fictional customer seed record is missing');
      }

      await transaction.user.update({
        where: { id: admin.id },
        data: { passwordHash: adminHash },
      });
      await transaction.user.update({
        where: { id: customer.id },
        data: { passwordHash: customerHash },
      });
    });
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then(() => process.stdout.write('Fictional demo users: PASS\n'))
  .catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : 'Demo bootstrap failed'}\n`,
    );
    process.exitCode = 1;
  });
