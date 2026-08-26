import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client';

export function createPrismaClient(databaseUrl: string): PrismaClient {
  const schema = new URL(databaseUrl).searchParams.get('schema') ?? undefined;
  const adapter = new PrismaPg({ connectionString: databaseUrl }, { schema });

  return new PrismaClient({ adapter });
}
