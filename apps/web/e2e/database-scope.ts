import type { PrismaClient } from '@webhost-billing/database';

export function validateBrowserSchema(schema: string): void {
  if (!/^command26_e2e_[a-f0-9]{32}$/.test(schema)) {
    throw new Error(
      'Browser tests require a fresh, explicitly owned fictional schema.',
    );
  }
}

export function browserDatabaseUrl(
  configuredUrl: string,
  schema: string,
): string {
  validateBrowserSchema(schema);
  const url = new URL(configuredUrl);
  if (
    !['postgresql:', 'postgres:'].includes(url.protocol) ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
    !url.pathname ||
    url.pathname === '/'
  )
    throw new Error('Browser tests require a loopback PostgreSQL database.');
  // Do not allow libpq query parameters to override the checked connection target.
  const allowed = new Set([
    'schema',
    'options',
    'sslmode',
    'connection_limit',
    'pool_timeout',
  ]);
  for (const key of url.searchParams.keys()) {
    if (!allowed.has(key) || url.searchParams.getAll(key).length !== 1) {
      throw new Error(
        'Browser database connection contains an unsupported parameter.',
      );
    }
  }
  url.searchParams.set('schema', schema);
  url.searchParams.set('options', `-csearch_path=${schema}`);
  return url.toString();
}

export function validateBrowserDatabaseUrl(url: string, schema: string): void {
  if (browserDatabaseUrl(url, schema) !== url) {
    throw new Error(
      'Browser model schema and raw-SQL search path must match exactly.',
    );
  }
}

export async function assertBrowserDatabaseScope(
  prisma: PrismaClient,
  url: string,
  schema: string,
  requireMarker = true,
): Promise<void> {
  validateBrowserDatabaseUrl(url, schema);
  const rows = await prisma.$queryRaw<{ schema: string; path: string }[]>`
    SELECT current_schema() AS schema, current_setting('search_path') AS path
  `;
  if (
    rows.length !== 1 ||
    rows[0]?.schema !== schema ||
    rows[0]?.path !== schema
  ) {
    throw new Error('Browser database raw-SQL isolation is not verified.');
  }
  if (requireMarker) {
    const markers = await prisma.$queryRaw<{ owner: string }[]>`
      SELECT owner FROM __browser_e2e_scope
    `;
    if (markers.length !== 1 || markers[0]?.owner !== schema) {
      throw new Error('Browser database fictional ownership is not verified.');
    }
  }
  // The URL's validated model schema and the live unqualified query must agree.
  const modelCount = await prisma.user.count();
  const rawCounts = await prisma.$queryRaw<
    { count: bigint }[]
  >`SELECT count(*) FROM users`;
  if (BigInt(modelCount) !== rawCounts[0]?.count) {
    throw new Error(
      'Browser database model/raw-SQL agreement is not verified.',
    );
  }
}
