import { createPrismaClient } from '@webhost-billing/database';
import { assertBrowserDatabaseScope } from './database-scope';
import { E2E_DATABASE_URL, E2E_SCHEMA } from './environment';

export default async function checkScope(): Promise<void> {
  const prisma = createPrismaClient(E2E_DATABASE_URL);
  try {
    await assertBrowserDatabaseScope(prisma, E2E_DATABASE_URL, E2E_SCHEMA);
  } finally {
    await prisma.$disconnect();
  }
}
