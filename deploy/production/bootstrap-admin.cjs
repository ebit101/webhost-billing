'use strict';

const fs = require('node:fs');
const { createRequire } = require('node:module');

const appRequire = createRequire('/app/package.json');
const argon2 = appRequire('argon2');
const { createPrismaClient, Prisma } = appRequire('@webhost-billing/database');
const { normalizedEmailSchema, passwordSchema } = appRequire(
  '@webhost-billing/shared',
);

const CONFIRMATION = 'CREATE_FIRST_PRODUCTION_ADMIN';
const LOCK_NAME = 'webhost-billing:bootstrap-admin:v1';

class BootstrapRefusal extends Error {}

function requiredText(name, maximumLength) {
  const value = process.env[name]?.trim();
  if (!value || value.length > maximumLength || /[\r\n\0]/u.test(value)) {
    throw new BootstrapRefusal(`${name} is missing or invalid.`);
  }
  return value;
}

function readPassword(path) {
  if (!path) {
    throw new BootstrapRefusal('A protected password file path is required.');
  }
  const value = fs.readFileSync(path, 'utf8');
  if (/\r|\n|\0/u.test(value)) {
    throw new BootstrapRefusal(
      'The protected password file must contain one newline-free value.',
    );
  }
  const parsed = passwordSchema.safeParse(value);
  if (!parsed.success || value.length < 20) {
    throw new BootstrapRefusal(
      'The initial administrator password must contain 20 to 128 characters.',
    );
  }
  return parsed.data;
}

async function main() {
  if (process.env.ADMIN_BOOTSTRAP_CONFIRMATION !== CONFIRMATION) {
    throw new BootstrapRefusal(
      `Set ADMIN_BOOTSTRAP_CONFIRMATION=${CONFIRMATION}.`,
    );
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new BootstrapRefusal('DATABASE_URL was not loaded.');
  }

  const email = normalizedEmailSchema.parse(requiredText('ADMIN_EMAIL', 320));
  const displayName = requiredText('ADMIN_DISPLAY_NAME', 150);
  const jobTitle = process.env.ADMIN_JOB_TITLE?.trim() || null;
  if (jobTitle && (jobTitle.length > 100 || /[\r\n\0]/u.test(jobTitle))) {
    throw new BootstrapRefusal('ADMIN_JOB_TITLE is invalid.');
  }
  const password = readPassword(process.argv[2]);
  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
    hashLength: 32,
    raw: false,
  });

  const prisma = createPrismaClient(databaseUrl);
  try {
    await prisma.$transaction(
      async (transaction) => {
        const [lock] = await transaction.$queryRaw(
          Prisma.sql`SELECT pg_try_advisory_xact_lock(hashtext(${LOCK_NAME})) AS acquired`,
        );
        if (!lock?.acquired) {
          throw new BootstrapRefusal(
            'Administrator bootstrap refused because another bootstrap is running.',
          );
        }

        const administratorCount = await transaction.user.count({
          where: { role: 'ADMIN' },
        });
        const existingEmail = await transaction.user.findUnique({
          where: { email },
          select: { id: true },
        });
        if (administratorCount !== 0) {
          throw new BootstrapRefusal(
            'Administrator bootstrap refused because an administrator already exists.',
          );
        }
        if (existingEmail) {
          throw new BootstrapRefusal(
            'Administrator bootstrap refused because the email is already registered.',
          );
        }

        const user = await transaction.user.create({
          data: {
            email,
            passwordHash,
            role: 'ADMIN',
            status: 'ACTIVE',
            emailVerifiedAt: new Date(),
            adminProfile: {
              create: {
                displayName,
                jobTitle,
                isSuperAdmin: true,
              },
            },
          },
          select: { id: true },
        });
        await transaction.activityLog.create({
          data: {
            actorUserId: user.id,
            action: 'PRODUCTION_ADMIN_BOOTSTRAPPED',
            entityType: 'User',
            entityId: user.id,
            metadata: {
              method: 'one-time-confirmed-bootstrap',
            },
          },
        });
      },
      { isolationLevel: 'Serializable' },
    );
  } finally {
    await prisma.$disconnect();
  }

  process.stdout.write('Production administrator bootstrap: PASS\n');
}

main().catch((error) => {
  if (error instanceof BootstrapRefusal) {
    process.stderr.write(`${error.message}\n`);
  } else {
    const errorCode =
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      typeof error.code === 'string'
        ? error.code
        : error instanceof Error
          ? error.name
          : 'UNKNOWN';
    process.stderr.write(
      `Production administrator bootstrap failed (${errorCode}); inspect protected runtime evidence.\n`,
    );
  }
  process.exitCode = 1;
});
