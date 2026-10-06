import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@webhost-billing/database';
import {
  assertBrowserDatabaseScope,
  browserDatabaseUrl,
  validateBrowserDatabaseUrl,
  validateBrowserSchema,
} from '../../e2e/database-scope';

const schema = `command26_e2e_${'a'.repeat(32)}`;
const url = browserDatabaseUrl(
  'postgresql://fictional:fictional@127.0.0.1:5432/fictional',
  schema,
);

describe('browser database boundary', () => {
  it('sets the same explicit schema for Prisma models and raw SQL', () => {
    const target = new URL(url);
    expect(target.searchParams.get('schema')).toBe(schema);
    expect(target.searchParams.get('options')).toBe(`-csearch_path=${schema}`);
    expect(() => validateBrowserDatabaseUrl(url, schema)).not.toThrow();
  });

  it.each([
    '',
    'public',
    'command26_e2e',
    `command26_e2e_${'A'.repeat(32)}`,
    'command26_e2e_x;DROP SCHEMA public',
  ])('rejects non-owned schema %s', (value) => {
    expect(() => validateBrowserSchema(value)).toThrow();
  });

  it.each([
    'postgresql://fictional@remote.invalid/fictional',
    'https://127.0.0.1/fictional',
    'postgresql://fictional@127.0.0.1/',
    'postgresql://fictional@127.0.0.1/fictional?host=remote.invalid',
    'postgresql://fictional@127.0.0.1/fictional?hostaddr=203.0.113.1',
    'postgresql://fictional@127.0.0.1/fictional?dbname=real',
    'postgresql://fictional@127.0.0.1/fictional?schema=a&schema=b',
  ])('rejects unsupported connection targets or overrides', (value) => {
    expect(() => browserDatabaseUrl(value, schema)).toThrow();
  });

  it.each([
    undefined,
    '-csearch_path=public',
    `-csearch_path=${schema},public`,
  ])(
    'rejects missing/mismatched raw-SQL isolation before connecting',
    async (options) => {
      const target = new URL(url);
      target.searchParams.delete('options');
      if (options) target.searchParams.set('options', options);
      const query = vi.fn();
      await expect(
        assertBrowserDatabaseScope(
          { $queryRaw: query } as unknown as PrismaClient,
          target.toString(),
          schema,
        ),
      ).rejects.toThrow();
      expect(query).not.toHaveBeenCalled();
    },
  );

  it.each([
    { rows: [] },
    { rows: [{ schema: 'public', path: 'public' }] },
    { rows: [{ schema, path: `${schema}, public` }] },
  ])(
    'fails before marker/model queries on an unsafe live search path',
    async ({ rows }) => {
      const query = vi.fn().mockResolvedValue(rows);
      const count = vi.fn();
      await expect(
        assertBrowserDatabaseScope(
          { $queryRaw: query, user: { count } } as unknown as PrismaClient,
          url,
          schema,
        ),
      ).rejects.toThrow('raw-SQL isolation');
      expect(query).toHaveBeenCalledTimes(1);
      expect(count).not.toHaveBeenCalled();
    },
  );

  it('rejects a foreign ownership marker before touching model records', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([{ schema, path: schema }])
      .mockResolvedValueOnce([{ owner: 'foreign' }]);
    const count = vi.fn();
    await expect(
      assertBrowserDatabaseScope(
        { $queryRaw: query, user: { count } } as unknown as PrismaClient,
        url,
        schema,
      ),
    ).rejects.toThrow('ownership');
    expect(count).not.toHaveBeenCalled();
  });

  it.each([true, false])(
    'verifies model/raw agreement (matching: %s)',
    async (matching) => {
      const query = vi
        .fn()
        .mockResolvedValueOnce([{ schema, path: schema }])
        .mockResolvedValueOnce([{ owner: schema }])
        .mockResolvedValueOnce([{ count: matching ? 3n : 4n }]);
      const client = {
        $queryRaw: query,
        user: { count: vi.fn().mockResolvedValue(3) },
      } as unknown as PrismaClient;
      if (matching)
        await expect(
          assertBrowserDatabaseScope(client, url, schema),
        ).resolves.toBeUndefined();
      else
        await expect(
          assertBrowserDatabaseScope(client, url, schema),
        ).rejects.toThrow('agreement');
    },
  );
});
