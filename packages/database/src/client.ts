import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client';

export function createPrismaClient(databaseUrl: string): PrismaClient {
  const connection = new URL(databaseUrl);
  const schema = connection.searchParams.get('schema') ?? undefined;
  // adapter-pg normalizes timestamptz offsets to +00:00 without adjusting the
  // wall clock. Request UTC at connection startup, including every pooled
  // connection, so database-generated timestamps retain their actual instant.
  // Preserve caller options (especially the isolated test search_path); the
  // final timezone option takes precedence over a conflicting server/URL default.
  const options = connection.searchParams.get('options') ?? '';
  connection.searchParams.set('options', `${options} -c timezone=UTC`.trim());
  const adapter = new PrismaPg(
    { connectionString: connection.toString() },
    { schema },
  );

  return new PrismaClient({ adapter });
}
